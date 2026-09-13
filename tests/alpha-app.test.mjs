import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
const require = createRequire(import.meta.url);
const app = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../app",
);
const { NextRequest } = require("next/server");
const id = "11111111-1111-4111-8111-111111111111";
const outsider = "22222222-2222-4222-8222-222222222222";
const verified = {
  id,
  is_anonymous: false,
  email_confirmed_at: "2026-09-11T00:00:00Z",
};

// Load server modules with isolated synthetic configuration and explicit mocks.
// server-only is Next's build-time marker; no deployment credentials are loaded.
function loader(env = {}, mocks = {}) {
  const cache = new Map();
  function load(file) {
    const absolute = path.resolve(app, file);
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const mod = { exports: {} };
    cache.set(absolute, mod);
    const source = ts.transpileModule(readFileSync(absolute, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;
    function localRequire(name) {
      if (name in mocks) return mocks[name];
      if (name === "server-only") return {};
      if (name.startsWith("@/") || name.startsWith(".")) {
        let resolved = name.startsWith("@/")
          ? path.join(app, name.slice(2))
          : path.resolve(path.dirname(absolute), name);
        if (resolved.endsWith(".css")) return {};
        for (const ext of ["", ".ts", ".tsx"]) {
          if (existsSync(resolved + ext)) return load(resolved + ext);
        }
        throw new Error("Unresolved app module: " + name);
      }
      return require(name);
    }
    vm.runInNewContext(
      source,
      {
        module: mod,
        exports: mod.exports,
        require: localRequire,
        process: { env },
        console: mocks.console || console,
        URL,
        Headers,
        Request,
        Response,
        TextEncoder,
        Buffer,
        AbortSignal,
        fetch:
          mocks.fetch ||
          (() => {
            throw new Error("Unexpected network request");
          }),
      },
      { filename: absolute },
    );
    return mod.exports;
  }
  return load;
}
const alphaEnv = { INFFYN_PRIVATE_ALPHA: "true", INFFYN_ALPHA_USER_IDS: id };
const policy = loader()("lib/alpha-policy.ts");

test("maintenance rejects uncredentialed calls and never forwards credentials to an unexpected alpha host", async () => {
  const env = {
    CRON_SECRET: "a".repeat(40),
    MAINTENANCE_SECRET: "b".repeat(40),
    ENGINE_URL: "https://inffyn-engine-alpha.onrender.com",
    INFFYN_RELEASE_STAGE: "private_alpha",
  };
  const mocks = {
    "@sentry/nextjs": {},
    fetch() {
      throw new Error("No network expected");
    },
  };
  const request = (authorization = "") =>
    new NextRequest("https://alpha.example/api/maintenance", {
      method: "POST",
      headers: { authorization, "x-inffyn-maintenance-action": "retention" },
    });
  for (const cron of [undefined, "short", env.CRON_SECRET]) {
    const route = loader(
      { ...env, CRON_SECRET: cron },
      mocks,
    )("app/api/maintenance/route.ts");
    assert.equal((await route.POST(request("Bearer invalid"))).status, 401);
  }
  for (const engine of [
    "https://other.example",
    "https://inffyn-engine-alpha.onrender.com?token=bad",
    "https://user:password@inffyn-engine-alpha.onrender.com",
    "https://inffyn-engine-alpha.onrender.com/path",
  ]) {
    const route = loader(
      { ...env, ENGINE_URL: engine },
      mocks,
    )("app/api/maintenance/route.ts");
    assert.equal(
      (await route.POST(request("Bearer " + env.CRON_SECRET))).status,
      503,
    );
  }
});

test("maintenance monitoring sends only fixed scrubbed events and does not invent external delivery", async () => {
  const logs = [],
    sends = [],
    requests = [];
  const env = {
    CRON_SECRET: "a".repeat(40),
    MAINTENANCE_SECRET: "b".repeat(40),
    ENGINE_URL: "https://inffyn-engine-alpha.onrender.com",
    INFFYN_RELEASE_STAGE: "private_alpha",
    SENTRY_DSN: "synthetic-config-only",
  };
  const route = loader(env, {
    console: {
      error(...parts) {
        logs.push(parts);
      },
    },
    "@sentry/nextjs": {
      captureEvent(e) {
        sends.push(e);
      },
      async flush() {},
    },
    async fetch(url, options) {
      requests.push({ url, options });
      return Response.json({
        event_id: "1".repeat(32),
        external_delivery_verified: false,
      });
    },
  })("app/api/maintenance/route.ts");
  const request = new NextRequest("https://alpha.example/api/maintenance", {
    method: "POST",
    headers: {
      authorization: "Bearer " + env.CRON_SECRET,
      "x-inffyn-maintenance-action": "monitoring",
    },
    body: "caller-private-data",
  });
  const response = await route.POST(request);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.app.external_monitor_configured, true);
  assert.equal(data.app.external_delivery_verified, false);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(requests[0].url, env.ENGINE_URL + "/v2/maintenance/check");
  assert.equal(requests[0].options.redirect, "error");
  assert.equal(
    requests[0].options.headers.get("Authorization"),
    "Bearer " + env.MAINTENANCE_SECRET,
  );
  assert.equal(sends.length, 1);
  assert.doesNotMatch(
    JSON.stringify({ logs, sends }),
    /SYNTHETIC_PRIVATE_EVIDENCE|caller-private-data/,
  );
});

test("maintenance failure responses hide upstream errors and remain retryable", async () => {
  const env = {
    CRON_SECRET: "a".repeat(40),
    MAINTENANCE_SECRET: "b".repeat(40),
    ENGINE_URL: "https://inffyn-engine-alpha.onrender.com",
  };
  const route = loader(env, {
    "@sentry/nextjs": {},
    console: { error() {} },
    async fetch() {
      return Response.json(
        { secret: "provider-private-value" },
        { status: 503 },
      );
    },
  })("app/api/maintenance/route.ts");
  const response = await route.GET(
    new NextRequest("https://alpha.example/api/maintenance", {
      headers: { authorization: "Bearer " + env.CRON_SECRET },
    }),
  );
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.doesNotMatch(await response.text(), /provider-private-value/);
});

test("alpha admits only a confirmed, nonanonymous allowed UUID; malformed configuration denies", () => {
  const parsed = policy.parseAlphaPolicy("true", id.toUpperCase());
  assert.equal(policy.alphaUserAllowed(parsed, verified), true);
  for (const user of [
    null,
    { ...verified, id: outsider },
    { ...verified, is_anonymous: true },
    { ...verified, is_anonymous: undefined },
    { ...verified, email_confirmed_at: "" },
  ])
    assert.equal(policy.alphaUserAllowed(parsed, user), false);
  for (const [flag, ids] of [
    ["true", ""],
    ["true", id + ","],
    ["true", id + ",wrong"],
    ["TRUE", id],
    ["yes", id],
  ]) {
    const invalid = policy.parseAlphaPolicy(flag, ids);
    assert.equal(invalid.enabled, true);
    assert.equal(policy.alphaUserAllowed(invalid, verified), false);
  }
  assert.equal(policy.parseAlphaPolicy(undefined, undefined).enabled, false);
  assert.equal(policy.parseAlphaPolicy("false", undefined).enabled, false);
  for (const flag of [undefined, "", "false"]) {
    const missing = policy.parseAlphaPolicy(flag, id, "private_alpha");
    assert.equal(missing.enabled, true);
    assert.equal(policy.alphaUserAllowed(missing, verified), false);
  }
  assert.equal(
    policy.alphaUserAllowed(
      policy.parseAlphaPolicy("true", id, "unknown"),
      verified,
    ),
    false,
  );
});

test("alpha allows monthly CSV review and blocks financial paths outside the approved flow", () => {
  for (const [method, p] of [
    ["GET", "status"],
    ["GET", "billing"],
    ["GET", "monthly/connections"],
    ["GET", "monthly/imports"],
    ["PUT", "monthly/drafts/2026-09"],
    ["POST", "monthly/prepare"],
    ["POST", "monthly/reports"],
    ["GET", "monthly/reports/" + id + "/evidence"],
    ["POST", "access/redeem"],
  ])
    assert.equal(
      policy.alphaV2ActionAllowed(p, method),
      true,
      method + " " + p,
    );
  for (const [method, p] of [
    ["POST", "preview"],
    ["POST", "audits"],
    ["POST", "previews/claim"],
    ["POST", "monthly/adopt"],
    ["POST", "billing/checkout"],
    ["POST", "billing/portal"],
    ["DELETE", "monthly/connections/openai"],
    ["POST", "monthly/imports/openai"],
    ["GET", "monthly/imports/" + id + "/evidence"],
    ["POST", "monthly/imports/" + id + "/advance"],
    ["GET", "future/endpoint"],
  ])
    assert.equal(
      policy.alphaV2ActionAllowed(p, method),
      false,
      method + " " + p,
    );
});

test("proxy blocks alpha intake before touching Auth and preserves the fixed demonstration", async () => {
  const load = loader({ ...alphaEnv, INFFYN_PREVIEW_MODE: "true" });
  const { proxy } = load("proxy.ts");
  for (const p of [
    "/api/v2/preview",
    "/api/stripe/connect",
    "/api/ingest/csv",
    "/api/review/start",
    "/api/validation/monthly/reports",
  ]) {
    const response = await proxy(
      new NextRequest("https://alpha.example" + p, { method: "POST" }),
    );
    assert.equal(response.status, 403, p);
  }
  for (const p of ["/demo/monthly", "/api/demo/company"]) {
    const response = await proxy(new NextRequest("https://alpha.example" + p));
    assert.equal(response.headers.get("x-middleware-next"), "1");
  }
  const response = await proxy(
    new NextRequest("https://alpha.example/app/monthly"),
  );
  assert.equal(new URL(response.headers.get("location")).pathname, "/login");
});

test("proxy checks verified user admission independently of existing session cookies", async () => {
  for (const user of [
    verified,
    { ...verified, id: outsider },
    { ...verified, is_anonymous: true },
  ]) {
    const load = loader(
      {
        ...alphaEnv,
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-public-key",
      },
      {
        "@supabase/ssr": {
          createServerClient: () => ({
            auth: { getUser: async () => ({ data: { user } }) },
          }),
        },
      },
    );
    const response = await load("proxy.ts").proxy(
      new NextRequest("https://alpha.example/api/v2/monthly/reports"),
    );
    assert.equal(response.status, user === verified ? 200 : 403);
  }
});

test("legacy handlers reject alpha actions before storage, Auth or provider access", async () => {
  const load = loader(alphaEnv);
  for (const p of [
    "stripe/connect",
    "stripe/disconnect",
    "stripe/sync",
    "ingest/csv",
    "audit/run",
    "board-report",
    "review/start",
    "review/calculate",
  ]) {
    const response = await load("app/api/" + p + "/route.ts").POST(
      new NextRequest("https://alpha.example/api/" + p, { method: "POST" }),
    );
    assert.equal(response.status, 403, p);
  }
  const response = await load("app/api/v2/[...path]/route.ts").POST(
    new NextRequest("https://alpha.example/api/v2/billing/checkout", {
      method: "POST",
    }),
    { params: Promise.resolve({ path: ["billing", "checkout"] }) },
  );
  assert.equal(response.status, 403);
});

test("tenant provisioning rejects disallowed identity before executing RPC; permitted identity keeps authenticated RPC", async () => {
  for (const user of [verified, { ...verified, id: outsider }]) {
    let rpcCalls = 0,
      cookieWrites = 0;
    const supabase = {
      auth: { getUser: async () => ({ data: { user } }) },
      rpc: async (name) => {
        assert.equal(name, "ensure_inffyn_workspace");
        rpcCalls++;
        return { data: "33333333-3333-4333-8333-333333333333" };
      },
    };
    const load = loader(alphaEnv, {
      "next/headers": { cookies: async () => ({ set: () => cookieWrites++ }) },
      "./supabase/server": { createClient: async () => supabase },
    });
    const call = load("lib/tenant.ts").provisionTenant(
      supabase,
      "Synthetic company",
    );
    if (user === verified) await call;
    else await assert.rejects(call, /private-alpha access/);
    assert.equal(rpcCalls, user === verified ? 1 : 0);
    assert.equal(cookieWrites, rpcCalls);
  }
});

test("engine forwarding rejects nonallowed verified identity before reading raw session or sending request", async () => {
  let sessionReads = 0;
  const load = loader(alphaEnv, {
    "@/lib/supabase/server": {
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { ...verified, id: outsider } },
          }),
          getSession: async () => {
            sessionReads++;
            throw new Error("Must not read session");
          },
        },
      }),
    },
  });
  await assert.rejects(
    load("lib/engine.ts").engineFetch("/v2/monthly/reports"),
    /private-alpha access/,
  );
  assert.equal(sessionReads, 0);
});

test("status reveals release stage only; no allowlist configuration leaks", async () => {
  const response = await loader(alphaEnv)("app/api/health/route.ts").GET();
  assert.deepEqual(await response.json(), {
    status: "ok",
    release_stage: "private_alpha",
  });
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("auth callback verifies identity after code exchange and removes only the rejected browser session", async () => {
  for (const user of [verified, { ...verified, id: outsider }]) {
    let signedOut = 0;
    const load = loader(alphaEnv, {
      "@/lib/supabase/server": {
        createClient: async () => ({
          auth: {
            exchangeCodeForSession: async () => ({ error: null }),
            getUser: async () => ({ data: { user }, error: null }),
            signOut: async (options) => {
              assert.equal(options.scope, "local");
              signedOut++;
            },
          },
        }),
      },
    });
    const result = await load("app/auth/callback/route.ts").GET(
      new Request(
        "https://alpha.example/auth/callback?code=synthetic-code&next=/app/monthly",
      ),
    );
    const location = new URL(result.headers.get("location"));
    assert.equal(
      location.pathname,
      user === verified ? "/app/monthly" : "/login",
    );
    assert.equal(signedOut, user === verified ? 0 : 1);
  }
});

test("engine deployment protection credential is server owned, optional, and kept out of public metadata", () => {
  const plain = loader()("lib/engine-transport.ts").engineServiceHeaders({
    "x-vercel-protection-bypass": "caller-value",
    Accept: "application/json",
  });
  assert.equal(plain.has("x-vercel-protection-bypass"), false);
  assert.equal(plain.get("Accept"), "application/json");
  const protectedHeaders = loader({
    ENGINE_PROTECTION_BYPASS: "synthetic-server-credential",
  })("lib/engine-transport.ts").engineServiceHeaders({
    "x-vercel-protection-bypass": "caller-value",
  });
  assert.equal(
    protectedHeaders.get("x-vercel-protection-bypass"),
    "synthetic-server-credential",
  );
});

test("new alpha reports retain their release label in print markup; older reports keep existing meaning", () => {
  const { renderToStaticMarkup } = require("react-dom/server");
  const { createElement } = require("react");
  const { ExecutiveReport } = loader()("components/monthly/executive.tsx");
  const report = {
    id,
    month: "2026-09",
    result: {
      summary: { known_cost: "21000", unallocated_cost: "0" },
      workloads: [],
      company_scope_complete: false,
    },
  };
  const older = renderToStaticMarkup(
    createElement(ExecutiveReport, {
      report,
      performance: [],
      company: "Example company",
    }),
  );
  const alpha = renderToStaticMarkup(
    createElement(ExecutiveReport, {
      report: {
        ...report,
        result: {
          ...report.result,
          release_context: { stage: "private_alpha" },
        },
      },
      performance: [],
      company: "Example company",
    }),
  );
  assert.doesNotMatch(older, /Private alpha report/);
  assert.match(alpha, /Private alpha report/);
  assert.match(alpha, /\$21,000/);
  assert.doesNotMatch(alpha, /synthetic/i);
});
