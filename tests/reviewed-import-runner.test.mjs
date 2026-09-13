import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
const runner = new URL(
  "../scripts/acceptance/run-reviewed-import.mjs",
  import.meta.url,
).href;
function run(execute = false, engine = "https://unapproved.example") {
  const code = `globalThis.fetch = () => { throw new Error('UNEXPECTED_NETWORK_REQUEST'); }; ${execute ? "process.argv.push('--execute', '--synthetic-companies-only');" : ""} await import(${JSON.stringify(runner)});`;
  return spawnSync(process.execPath, ["--input-type=module", "-e", code], {
    encoding: "utf8",
    timeout: 10000,
    env: {
      SystemRoot: process.env.SystemRoot,
      INFFYN_ACCEPTANCE_ENGINE_URL: engine,
    },
  });
}
test("default reviewed-import acceptance performs no requests and reports pending", () => {
  const result = run();
  assert.equal(result.status, 0);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.status, "PENDING_HOSTED_ACCEPTANCE");
  assert.equal(receipt.mutated, false);
  assert.ok(receipt.separate_checks.includes("Browser login/session return"));
});
for (const target of [
  "https://unapproved.example",
  "https://inffyn-engine-alpha.onrender.com/extra",
  "http://inffyn-engine-alpha.onrender.com",
])
  test(`unapproved target is refused before any request: ${target}`, () => {
    const result = run(true, target);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(
      result.stderr + result.stdout,
      /UNEXPECTED_NETWORK_REQUEST/,
    );
  });
