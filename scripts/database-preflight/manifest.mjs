import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { CATALOG_QUERIES, PROJECT_REF } from "./catalog.mjs";

export const MIGRATIONS_DIRECTORY = new URL(
  "../../supabase/migrations/",
  import.meta.url,
);
const digest = (algorithm, text) =>
  createHash(algorithm).update(text).digest("hex");

export async function localMigrations(directory = MIGRATIONS_DIRECTORY) {
  const files = (await readdir(directory))
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort();
  const migrations = [];
  for (const file of files) {
    const sql = (await readFile(new URL(file, directory), "utf8")).replaceAll(
      "\r\n",
      "\n",
    );
    const [, version, name] = /^(\d+)_(.+)\.sql$/.exec(file);
    migrations.push({
      file,
      version,
      name,
      sha256: digest("sha256", sql),
      statements_md5: digest("md5", sql),
      sql,
    });
  }
  if (
    !migrations.length ||
    new Set(migrations.map((m) => m.version)).size !== migrations.length
  )
    throw new Error("Local migration versions must be present and unique.");
  return migrations;
}

export async function buildManifest(migrations) {
  migrations ??= await localMigrations();
  // These DDL statements run exclusively in disposable, in-process PostgreSQL.
  // The live transport imports catalog.mjs only and cannot execute this setup.
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
      create table storage.objects(id uuid primary key,name text,bucket_id text);
      alter table storage.objects enable row level security;
      create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
    `);
    for (const migration of migrations) await db.exec(migration.sql);
    await db.exec("BEGIN READ ONLY");
    const expected = {};
    for (const [section, sql] of Object.entries(CATALOG_QUERIES))
      expected[section] = (await db.query(sql)).rows;
    await db.exec("ROLLBACK");
    return {
      format: "inffyn-database-preflight-1.0",
      project_ref: PROJECT_REF,
      generated_at: new Date().toISOString(),
      basis:
        "Disposable PostgreSQL replay with Supabase auth/storage stubs; not a hosted database.",
      migration_count: migrations.length,
      migrations: migrations.map(({ sql: _sql, ...safe }) => safe),
      expected,
    };
  } finally {
    await db.close();
  }
}
