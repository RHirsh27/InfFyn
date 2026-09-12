import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { proxy } from "../app/proxy";
import { POST } from "../app/app/api/review/calculate/route";

delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
delete process.env.INFFYN_PREVIEW_MODE;
delete process.env.INFFYN_PREVIEW_STORAGE;
delete process.env.AUDIT_PROXY_SECRET;
delete process.env.ENGINE_URL;
const origin = "https://review.example";
const request = (source = origin, body = "{}") =>
  new NextRequest(origin + "/api/review/calculate", {
    method: "POST",
    headers: {
      host: "review.example",
      origin: source,
      "content-type": "application/json",
    },
    body,
  });

async function main() {
  assert.equal((await POST(request())).status, 404);
  assert.equal(
    (await proxy(new NextRequest(origin + "/review"))).headers.get(
      "x-middleware-next",
    ),
    null,
  );
  process.env.INFFYN_PREVIEW_MODE = "true";
  process.env.INFFYN_PREVIEW_STORAGE = "browser";
  assert.equal(
    (await proxy(new NextRequest(origin + "/review"))).headers.get(
      "x-middleware-next",
    ),
    "1",
  );
  for (const path of ["/app", "/login", "/audit"]) {
    assert.equal(
      new URL(
        (await proxy(new NextRequest(origin + path))).headers.get("location")!,
      ).pathname,
      "/review",
    );
  }
  assert.equal((await POST(request("https://untrusted.example"))).status, 403);
  assert.equal((await POST(request())).status, 503);
  process.env.AUDIT_PROXY_SECRET =
    "synthetic-review-secret-for-unit-tests-only";
  process.env.ENGINE_URL = "https://engine.example";
  process.env.VERCEL = "0";
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, "https://engine.example/v2/review/calculate");
    assert.equal(options?.body, '{"kind":"product"}');
    const headers = new Headers(options?.headers);
    const expected = createHmac("sha256", process.env.AUDIT_PROXY_SECRET!)
      .update(
        headers.get("x-inffyn-time") + ":" + headers.get("x-inffyn-visitor"),
      )
      .digest("hex");
    assert.equal(headers.get("x-inffyn-signature"), expected);
    return Response.json({ id: "synthetic-report" });
  };
  const result = await POST(request(origin, '{"kind":"product"}'));
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.deepEqual(await result.json(), { id: "synthetic-report" });
  assert.equal(
    (await POST(request(origin, "x".repeat(4_000_001)))).status,
    413,
  );
  process.env.VERCEL = "1";
  assert.equal((await POST(request())).status, 503); // Trusted edge identity must be present.
  assert.equal(calls, 1);
  console.log(
    "PASS review route gates, origin checks, signed server forwarding, size limit and missing trusted identity",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
