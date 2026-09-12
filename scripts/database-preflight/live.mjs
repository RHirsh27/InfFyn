import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { isAbsolute, basename } from "node:path";
import {
  CATALOG_QUERIES,
  LEDGER_PROBE,
  LEDGER_QUERY,
  PROJECT_REF,
  readOnlyBatch,
} from "./catalog.mjs";

export function validateTarget(options) {
  if (options.live !== true || options.projectRef !== PROJECT_REF)
    throw new Error(
      "Live inspection requires --live and the exact existing InfFyn --project-ref.",
    );
  const direct = options.host === `db.${PROJECT_REF}.supabase.co`;
  const pooler = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(options.host || "");
  const role = /^[a-z_][a-z0-9_]*$/;
  if (!direct && !pooler)
    throw new Error(
      "The connection host is not an approved InfFyn direct endpoint or Supabase session pooler.",
    );
  if (direct && !role.test(options.user || ""))
    throw new Error("Direct connections require an unqualified database role.");
  if (
    pooler &&
    (!options.user?.endsWith(`.${PROJECT_REF}`) ||
      !role.test(options.user.slice(0, -PROJECT_REF.length - 1)))
  )
    throw new Error(
      "The session pooler username must identify the existing InfFyn project.",
    );
  if (options.port !== undefined && String(options.port) !== "5432")
    throw new Error(
      "Only direct/session connections on port 5432 are supported.",
    );
  if (
    !options.pgpassFile ||
    !isAbsolute(options.pgpassFile) ||
    /^\.env(?:\.|$)/i.test(basename(options.pgpassFile))
  )
    throw new Error(
      "Provide an absolute dedicated PostgreSQL password-file path; .env files are not accepted.",
    );
  if (!options.sslRootCert || !isAbsolute(options.sslRootCert))
    throw new Error(
      "Provide an absolute trusted PostgreSQL root certificate path for verify-full TLS.",
    );
  if (
    options.psql &&
    (!isAbsolute(options.psql) ||
      !/^psql(?:\.exe)?$/i.test(basename(options.psql)))
  )
    throw new Error(
      "An explicit psql executable must be an absolute path to the native psql client.",
    );
  return {
    host: options.host,
    user: options.user,
    port: "5432",
    projectRef: PROJECT_REF,
  };
}

export function childEnvironment(options, parent = process.env) {
  validateTarget(options);
  const env = {};
  for (const key of [
    "PATH",
    "Path",
    "SystemRoot",
    "SYSTEMROOT",
    "WINDIR",
    "TEMP",
    "TMP",
    "LANG",
    "LC_ALL",
  ])
    if (parent[key]) env[key] = parent[key];
  return {
    ...env,
    PGHOST: options.host,
    PGUSER: options.user,
    PGPORT: "5432",
    PGDATABASE: "postgres",
    PGPASSFILE: options.pgpassFile,
    PGSSLMODE: "verify-full",
    PGSSLROOTCERT: options.sslRootCert,
    PGCONNECT_TIMEOUT: "10",
    PGAPPNAME: "inffyn-readonly-preflight",
    PGOPTIONS:
      "-c default_transaction_read_only=on -c statement_timeout=10000 -c lock_timeout=2000 -c search_path=pg_catalog",
  };
}

export async function runPsql(options, queries, spawnProcess = spawn) {
  const env = childEnvironment(options);
  // Metadata-only filesystem checks. libpq alone reads the credential file.
  for (const path of [options.pgpassFile, options.sslRootCert])
    if (!(await stat(path)).isFile())
      throw new Error(
        "The configured PostgreSQL support file is not a regular file.",
      );
  const sql = readOnlyBatch(queries);
  return new Promise((resolve, reject) => {
    const child = spawnProcess(
      options.psql || "psql",
      ["-X", "-q", "-A", "-t", "-w", "-v", "ON_ERROR_STOP=1", "--file=-"],
      { env, shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
    );
    let output = "",
      size = 0,
      finished = false;
    const finish = (error, value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      error ? reject(error) : resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(
        new Error(
          "Read-only inspection timed out. No migration or write was attempted.",
        ),
      );
    }, 45_000);
    child.on("error", () =>
      finish(
        new Error(
          "PostgreSQL client could not start. Install a trusted psql client or supply its absolute path.",
        ),
      ),
    );
    child.stderr.on("data", () => {}); // Do not echo connection details or SQL server errors.
    child.stdout.on("data", (chunk) => {
      size += chunk.length;
      if (size > 8_000_000) {
        child.kill();
        finish(
          new Error("Catalog response exceeded the bounded inspection limit."),
        );
      } else output += chunk.toString("utf8");
    });
    child.on("close", (code) => {
      if (code !== 0)
        return finish(
          new Error(
            "Read-only PostgreSQL inspection failed. Verify project access, password-file settings, TLS certificate and catalog permissions. No write was attempted.",
          ),
        );
      try {
        const result = {};
        for (const line of output.trim().split(/\r?\n/).filter(Boolean)) {
          const item = JSON.parse(line);
          if (
            !Object.hasOwn(queries, item.section) ||
            !Array.isArray(item.rows) ||
            Object.hasOwn(result, item.section)
          )
            throw new Error();
          result[item.section] = item.rows;
        }
        if (Object.keys(result).length !== Object.keys(queries).length)
          throw new Error();
        finish(null, result);
      } catch {
        finish(
          new Error(
            "The PostgreSQL client did not return a complete structured catalog response.",
          ),
        );
      }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(sql);
  });
}

export async function inspectLive(options, query = runPsql) {
  validateTarget(options);
  const probe = await query(options, { ledger_probe: LEDGER_PROBE });
  const p = probe.ledger_probe?.[0];
  const queries = {
    ...CATALOG_QUERIES,
    ...(p?.ledger_exists && p?.ledger_readable && p?.ledger_base_table
      ? { migration_ledger: LEDGER_QUERY }
      : {}),
  };
  const inventory = await query(options, queries);
  const rows = inventory.migration_ledger;
  delete inventory.migration_ledger;
  return {
    inventory: { ...inventory, project_ref: PROJECT_REF },
    ledger: rows ? { rows } : null,
    ledger_probe: {
      exists: p?.ledger_exists === true,
      readable: p?.ledger_readable === true,
      base_table: p?.ledger_base_table === true,
    },
  };
}
