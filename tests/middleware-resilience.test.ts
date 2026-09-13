/**
 * E-fix: Middleware resilience gate.
 *
 * Proves the asymmetric failure contract with the Supabase env ABSENT:
 *   - Public routes (`/`, `/login`, `/api/health`) fail OPEN → serve (200), no 5xx.
 *   - Protected pages redirect to /login; protected APIs return 401 JSON,
 *     never 5xx and never serve protected content.
 *
 * No live Supabase needed: env is removed so the middleware short-circuits
 * before any network call. Run: npm run test:middleware
 */

// Remove Supabase config BEFORE the middleware runs (tryGetEnv reads live).
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

import { NextRequest } from "next/server";
import { proxy as middleware } from "../app/proxy";

type Outcome = {
  status: number;
  isServe: boolean;
  redirectPath: string | null;
};

async function run(pathname: string): Promise<Outcome> {
  const request = new NextRequest(new URL(`https://example.com${pathname}`));
  const res = await middleware(request);
  const location = res.headers.get("location");
  return {
    status: res.status,
    isServe: res.headers.get("x-middleware-next") === "1",
    redirectPath: location ? new URL(location).pathname : null,
  };
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log("Middleware resilience (Supabase env ABSENT)\n");

  // ── Public routes must fail OPEN (serve, never 5xx) ───────────────────────
  for (const path of [
    "/",
    "/login",
    "/audit",
    "/api/v2/preview",
    "/api/v2/status",
  ]) {
    const r = await run(path);
    assert(r.status < 500, `${path}: 5xx with env absent (status ${r.status})`);
    assert(
      r.status === 200 && r.isServe,
      `${path}: expected serve(200), got ${r.status} redirect=${r.redirectPath}`,
    );
    console.log(`  public ${path}: PASS — serves 200, no 5xx`);
  }

  // /api/health stays a plain 200 (also excluded from the matcher in prod).
  {
    const r = await run("/api/health");
    assert(
      r.status === 200 && r.isServe,
      `/api/health: expected 200 serve, got ${r.status}`,
    );
    console.log("  public /api/health: PASS — 200");
  }

  // ── Protected routes must fail CLOSED (redirect, never serve/5xx) ──────────
  {
    const r = await run("/app");
    assert(r.status < 500, `/app: 5xx with env absent (status ${r.status})`);
    assert(
      !r.isServe,
      "/app: served protected content with env absent (SECURITY REGRESSION)",
    );
    assert(
      r.redirectPath === "/login",
      `/app: expected redirect to /login, got ${r.redirectPath} (status ${r.status})`,
    );
    console.log(
      `  protected /app: PASS — redirects to /login (${r.status}), does not serve`,
    );
  }

  {
    const r = await run("/api/tenant/create");
    assert(
      r.status < 500,
      `/api/tenant/create: 5xx with env absent (status ${r.status})`,
    );
    assert(
      !r.isServe,
      "/api/tenant/create: served protected API with env absent (SECURITY REGRESSION)",
    );
    assert(
      r.status === 401 && r.redirectPath === null,
      `/api/tenant/create: expected 401 without a redirect, got ${r.status}`,
    );
    console.log(
      "  protected /api/tenant/create: PASS — refuses with 401, does not redirect",
    );
  }

  console.log("\n✓ All middleware resilience assertions passed");
}

main().catch((err) => {
  console.error("\n✗", err?.message ?? err);
  process.exit(1);
});
