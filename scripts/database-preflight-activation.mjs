#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { localMigrations } from "./database-preflight/manifest.mjs";
import { buildActivationPlan } from "./database-preflight/activation.mjs";

export function parseActivationArguments(args) {
  if (args.length === 1 && args[0] === "--help") return { help: true };
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = { "--metadata": "metadata", "--columns": "columns" }[args[i]];
    if (!key || options[key] || !args[i + 1] || !/\.json$/i.test(args[i + 1]))
      throw new Error(
        "Use --metadata and --columns with sanitized JSON receipt paths.",
      );
    options[key] = args[i + 1];
  }
  if (!options.metadata || !options.columns)
    throw new Error("Two metadata receipts are required.");
  return options;
}

export async function main(args = process.argv.slice(2)) {
  const options = parseActivationArguments(args);
  if (options.help) {
    console.log(
      "InfFyn offline activation review plan. No network, credential loading, migration execution or ledger repair.\nnode scripts/database-preflight-activation.mjs --metadata <sanitized-metadata.json> --columns <sanitized-columns.json>\nExit 0 means a review plan was generated; every plan remains blocked pending live catalog and recovery verification.",
    );
    return;
  }
  const metadata = JSON.parse(await readFile(options.metadata, "utf8"));
  const columns = JSON.parse(await readFile(options.columns, "utf8"));
  const plan = buildActivationPlan(await localMigrations(), metadata, columns);
  console.log(JSON.stringify(plan, null, 2));
  if (!plan.metadata_baseline_matches) process.exitCode = 2;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(() => {
    console.error(
      JSON.stringify({
        status: "PLAN_NOT_GENERATED",
        release_ready: false,
        message:
          "Check sanitized receipt paths, expected project and local migration files. No connection or database change was attempted.",
      }),
    );
    process.exitCode = 1;
  });
}
