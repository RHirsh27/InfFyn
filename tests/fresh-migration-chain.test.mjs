// Empty PostgreSQL replay. Supabase-managed auth/storage schemas are represented by stubs.
// This proves our migration ordering, not hosted Storage/Auth behavior.
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
const directory = new URL("../supabase/migrations/", import.meta.url);
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
  const migrations = (await readdir(directory))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of migrations) {
    try {
      await db.exec(await readFile(new URL(file, directory), "utf8"));
    } catch (error) {
      throw new Error(`Migration ${file}: ${error.message}`);
    }
  }
  const { rows } = await db.query(
    "select count(*)::int as n from pg_class where relname in ('inffyn_workloads','inffyn_monthly_reports','inffyn_monthly_selections','inffyn_selection_events','inffyn_provider_connections','inffyn_provider_imports','inffyn_monthly_drafts') and relrowsecurity and relforcerowsecurity",
  );
  assert.equal(rows[0].n, 7);
  console.log(
    `PASS all ${migrations.length} migrations replay on empty PostgreSQL with Supabase schema stubs; all seven monthly tables force RLS`,
  );
} finally {
  await db.close();
}
