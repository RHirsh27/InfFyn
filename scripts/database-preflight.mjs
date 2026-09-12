#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { buildManifest } from "./database-preflight/manifest.mjs";
import { compareInventory } from "./database-preflight/compare.mjs";
import { inspectLive, validateTarget } from "./database-preflight/live.mjs";
import { PROJECT_REF } from "./database-preflight/catalog.mjs";

export function parseArguments(args) {
  const options = { live: false, manifest: false };
  const values = {
    "--project-ref": "projectRef",
    "--host": "host",
    "--user": "user",
    "--port": "port",
    "--pgpass-file": "pgpassFile",
    "--ssl-root-cert": "sslRootCert",
    "--psql": "psql",
  };
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (seen.has(arg))
      throw new Error("Duplicate command-line options are not accepted.");
    seen.add(arg);
    if (arg === "--help") options.help = true;
    else if (arg === "--live") options.live = true;
    else if (arg === "--manifest") options.manifest = true;
    else if (values[arg] && args[i + 1] && !args[i + 1].startsWith("--"))
      options[values[arg]] = args[++i];
    else
      throw new Error(
        "Unknown or incomplete option. Run --help. Passwords, SQL and connection URLs are not accepted as arguments.",
      );
  }
  if (options.projectRef && options.projectRef !== PROJECT_REF)
    throw new Error("Only the existing InfFyn project is permitted.");
  if (
    !options.live &&
    Object.keys(values).some(
      (flag) => flag !== "--project-ref" && seen.has(flag),
    )
  )
    throw new Error("Connection options require explicit --live mode.");
  return options;
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  if (options.help) {
    console.log(`InfFyn database preflight (read-only; never applies migrations)
Offline, no credentials: node scripts/database-preflight.mjs [--manifest]
Live, approved target only: node scripts/database-preflight.mjs --live --project-ref ${PROJECT_REF} --host <verified-host> --user <database-role> --pgpass-file <absolute-password-file> --ssl-root-cert <absolute-root-certificate> [--psql <absolute-executable>]
Direct or session-pooler port 5432 only. Credentials remain in libpq's password file. No .env is loaded. Output is JSON metadata. Exit 0 means inspection completed; it never means production readiness.`);
    return;
  }
  if (options.live) validateTarget(options); // reject destination before any work or connection
  const manifest = await buildManifest();
  if (!options.live) {
    console.log(
      JSON.stringify(
        {
          status: "OFFLINE_PREPARED_HOSTED_UNVERIFIED",
          release_ready: false,
          project_ref: PROJECT_REF,
          basis: manifest.basis,
          migration_count: manifest.migration_count,
          migrations: manifest.migrations,
          expected_counts: Object.fromEntries(
            Object.entries(manifest.expected).map(([k, v]) => [k, v.length]),
          ),
          hosted_catalog: "UNKNOWN",
          backup: "UNKNOWN",
          restore: "UNKNOWN",
          ...(options.manifest ? { manifest } : {}),
        },
        null,
        2,
      ),
    );
    return;
  }
  const live = await inspectLive(options);
  const report = compareInventory(
    manifest,
    live.inventory,
    live.ledger,
    "live-read-only",
  );
  report.migration_ledger_access = live.ledger_probe;
  console.log(JSON.stringify(report, null, 2));
  if (report.status === "REVIEW_REQUIRED") process.exitCode = 2;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(() => {
    // Fail closed without echoing unknown driver messages, arguments or secrets.
    console.error(
      JSON.stringify({
        status: "INSPECTION_FAILED",
        release_ready: false,
        project_ref: PROJECT_REF,
        message:
          "Preflight did not complete. Check --help, target metadata, local migration validity and the private operator connection configuration. No migration or database write was attempted.",
      }),
    );
    process.exitCode = 1;
  });
}
