// Live acceptance uses only repository synthetic fixtures and requires no local credentials.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
const origin = process.argv[2];
if (!origin || new URL(origin).protocol !== "https:")
  throw new Error("Provide the exact HTTPS review origin.");
const checks = [];
const check = (name, actual, expected) => {
  assert.deepEqual(actual, expected, name);
  checks.push({ name, passed: true });
};
const send = (body, source = origin) =>
  fetch(origin + "/api/review/calculate", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: source },
    body: JSON.stringify(body),
    redirect: "manual",
    signal: AbortSignal.timeout(60000),
  });
const page = await fetch(origin + "/review", { redirect: "manual" });
check("Public review loads without account or Vercel login", page.status, 200);
const html = await page.text();
check(
  "Browser storage limitation visible",
  html.includes("cloud storage is not connected yet"),
  true,
);
check(
  "Review pages request no search indexing",
  html.includes('content="noindex, nofollow"'),
  true,
);
const fixture = JSON.parse(
  await readFile(
    new URL("../fixtures/v2/product.json", import.meta.url),
    "utf8",
  ),
);
check(
  "Foreign origin rejected",
  (await send(fixture, "https://untrusted.example")).status,
  403,
);
const response = await send(fixture);
check("Hosted product calculation", response.status, 200);
check(
  "Calculation is not cached",
  response.headers.get("cache-control"),
  "no-store",
);
const product = await response.json();
check("Included cost", product.result.summary.known_cost, "175");
check("Reviewed revenue", product.result.summary.revenue, "380");
check("Contribution", product.result.summary.contribution, "205");
check(
  "Report references exact facts",
  product.report.facts_fingerprint,
  product.fingerprint,
);
const repeat = await (await send(fixture)).json();
check(
  "Identical evidence retains fingerprint",
  repeat.fingerprint,
  product.fingerprint,
);
const internalInput = JSON.parse(
  await readFile(
    new URL("../fixtures/v2/internal.json", import.meta.url),
    "utf8",
  ),
);
const internalResponse = await send(internalInput);
check("Hosted internal calculation", internalResponse.status, 200);
const internal = await internalResponse.json();
check("Internal revenue is unavailable", internal.result.summary.revenue, null);
check(
  "Whole internal workflow includes failed work",
  internal.result.summary.known_cost,
  "175",
);
check("Accepted result count", internal.result.outcomes.accepted_quantity, "3");
const unknown = await (
  await send({
    ...fixture,
    usage_csv: fixture.usage_csv.replace(
      ",74,synthetic provider export",
      ",,synthetic provider export",
    ),
  })
).json();
check(
  "Unpriced usage prevents a complete contribution",
  unknown.result.summary.contribution,
  null,
);
const invalid = await send({ ...fixture, usage_csv: "invalid,headers\n1,2" });
check("Malformed upload rejected", invalid.status, 422);
check(
  "Specific upload error returned",
  (await invalid.json()).detail.code,
  "invalid_headers",
);
const protectedRoute = await fetch(origin + "/api/v2/audits", {
  redirect: "manual",
});
check(
  "Database workspace stays protected without identity",
  protectedRoute.status,
  307,
);
await mkdir(new URL("../.validation/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../.validation/hosted-review-checks.json", import.meta.url),
  JSON.stringify(
    {
      origin,
      verified_at: new Date().toISOString(),
      evidence: "synthetic repository fixtures only",
      checks,
      product: product.result.summary,
      internal: internal.result.outcomes,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `PASS ${checks.length} live review checks against ${origin}; synthetic fixtures only`,
);
