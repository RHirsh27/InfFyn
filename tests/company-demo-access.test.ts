import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET } from "../app/app/api/demo/company/route";
import { proxy } from "../app/proxy";

async function main() {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.ENGINE_URL;
  Object.assign(process.env, { NODE_ENV: "production" });
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error("Unexpected request");
  };
  for (const path of [
    "/demo/monthly",
    "/api/demo/company",
    "/examples/InfFyn-Northstar-August-2026.pdf",
    "/examples/InfFyn-normalized-CSV-examples.zip",
    "/examples/CSV-IMPORT-GUIDE.txt",
  ]) {
    const response = await proxy(
      new NextRequest("https://example.test" + path),
    );
    assert.equal(response.headers.get("x-middleware-next"), "1");
  }
  for (const path of [
    "/app/monthly",
    "/api/v2/monthly/drafts/2026-08",
    "/demo/private",
    "/api/demo/company/tenant",
    "/examples/private.pdf",
    "/examples/other.zip",
    "/examples/CSV-IMPORT-GUIDE.txt/private",
  ]) {
    const response = await proxy(
      new NextRequest("https://example.test" + path),
    );
    assert.equal(response.headers.get("x-middleware-next"), null);
  }
  assert.equal(calls, 0, "Public demo must not resolve a customer session");
  assert.equal((await GET()).status, 503);
  process.env.ENGINE_URL = "http://engine.example";
  assert.equal((await GET()).status, 503);
  assert.equal(calls, 0, "An insecure production target must not be called");
  process.env.ENGINE_URL = "https://engine.example";
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), "https://engine.example/demo/company");
    assert.equal(options?.redirect, "error");
    assert.equal(options?.body, undefined);
    const headers = new Headers(options?.headers);
    assert.equal(headers.get("Authorization"), null);
    assert.equal(headers.get("Cookie"), null);
    assert.equal(headers.get("X-Tenant-Id"), null);
    return Response.json({
      synthetic: true,
      company: { name: "Synthetic test" },
    });
  };
  const valid = await GET();
  assert.equal(valid.status, 200);
  assert.equal((await valid.json()).synthetic, true);
  assert.equal(valid.headers.get("set-cookie"), null);
  globalThis.fetch = async () =>
    Response.json({ synthetic: false, customer: "must not escape" });
  const wrong = await GET();
  assert.equal(wrong.status, 503);
  assert.ok(!(await wrong.text()).includes("must not escape"));
  globalThis.fetch = async () =>
    new Response("private upstream error", { status: 500 });
  const failed = await GET();
  assert.equal(failed.status, 503);
  assert.ok(!(await failed.text()).includes("private upstream error"));
  globalThis.fetch = async () => new Response("x".repeat(3_800_001));
  assert.equal((await GET()).status, 503);
  console.log(
    "PASS company demo isolation, fixed upstream, no session forwarding, bounded response and protected workspace routes",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
