// Read-only public checks; never accepts credentials or accesses company records.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const base = process.argv[2] || "https://inffyn-preview.vercel.app";
assert.ok(
  ["https://inffyn-preview.vercel.app", "http://127.0.0.1:3012"].includes(base),
  "Only the authorized public review or loopback validation origin is allowed",
);
let count = 0;
async function check(name, work) {
  await work();
  count++;
  console.log(`PASS ${name}`);
}
async function get(path) {
  const response = await fetch(base + path, {
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(response.status, 200, path);
  return response;
}
let html;
await check(
  "methodology and explanations render without client-side evidence",
  async () => {
    html = await (await get("/methodology")).text();
    assert.match(html, /A financial conclusion/);
    for (const id of [
      "costs",
      "value",
      "allocations",
      "confidence",
      "outcomes",
      "comparisons",
      "record",
    ])
      assert.ok(html.includes(`id="${id}"`), id);
    assert.match(html, /Skip to methodology/);
    assert.match(html, /not automatically recognized revenue/);
    assert.match(html, /Hosted tenant isolation/);
  },
);
await check(
  "review preview links lead to accessible demo and evidence",
  async () => {
    assert.ok(html.includes('href="/demo/monthly"'));
    assert.ok(
      html.includes('href="/examples/InfFyn-normalized-CSV-examples.zip"'),
    );
    if (base.startsWith("https:"))
      assert.ok(
        !html.includes('href="/app/monthly"'),
        "Preview CTA must not point to a gated workspace",
      );
  },
);
for (const file of [
  "InfFyn-Northstar-August-2026.pdf",
  "InfFyn-normalized-CSV-examples.zip",
  "CSV-IMPORT-GUIDE.txt",
]) {
  await check(
    `published ${file} exactly matches the checked artifact`,
    async () => {
      const response = await get(`/examples/${file}`);
      const actual = Buffer.from(await response.arrayBuffer());
      const expected = await readFile(
        new URL(`../app/public/examples/${file}`, import.meta.url),
      );
      const hash = (value) => createHash("sha256").update(value).digest("hex");
      assert.equal(hash(actual), hash(expected));
      if (file.endsWith(".pdf"))
        assert.equal(actual.subarray(0, 5).toString(), "%PDF-");
    },
  );
}
await check(
  "methodology's existing synthetic source still supplies the audited example",
  async () => {
    const bundle = await (await get("/api/demo/company")).json();
    assert.equal(bundle.synthetic, true);
    assert.equal(bundle.read_only, true);
    const report = bundle.reports.find((x) => x.month === "2026-08");
    assert.equal(
      report.fingerprint,
      "3fb69317960b729f7578f41813de2f436ec413ef5ea6908133702cb9a4b61e01",
    );
    const invoice = report.result.invoice_allocations[0];
    assert.equal(invoice.original_amount, "64000");
    assert.equal(invoice.source_verified, false);
  },
);
console.log(
  `${count} public methodology checks passed. Browser visual checks and hosted company/provider acceptance are separate.`,
);
