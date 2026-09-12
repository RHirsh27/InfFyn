import assert from "node:assert/strict";
import test from "node:test";
import {
  TARGETS,
  configurationReceipt,
  parseEnvironmentNames,
  runConfigurationPreflight,
} from "../scripts/hosted-config-preflight.mjs";

function listing(
  rows = " ENGINE_URL                 Encrypted           Production          3d ago",
  project = "inffyn-preview",
) {
  return `Vercel CLI 48.2.9\n> Environment Variables found for test-team/${project} [123ms]\n\n name                       value               environments        created\n${rows}\n`;
}

test("offline mode never reads project links or invokes Vercel", () => {
  const result = runConfigurationPreflight({
    readLink() {
      throw Error("must not read");
    },
    listNames() {
      throw Error("must not call");
    },
  });
  assert.equal(result.mode, "offline");
  assert.equal(result.release_ready, false);
  assert.ok(
    Object.values(result.groups).every(
      (item) => item.status === "pending" && !item.missing_names.length,
    ),
  );
});

test("both authorized project links are checked before any metadata request", () => {
  let requests = 0;
  assert.throws(
    () =>
      runConfigurationPreflight({
        live: true,
        readLink: (target) => ({
          ...target,
          projectId:
            target === TARGETS.engine ? "unexpected" : target.projectId,
        }),
        listNames: () => {
          requests++;
          return [];
        },
      }),
    /unexpected_vercel_project/,
  );
  assert.equal(requests, 0);
});

test("table parser returns names only and discards all other columns", () => {
  const names = parseEnvironmentNames(
    listing(
      " ENGINE_URL                 PRIVATE_VALUE_NEVER_OUTPUT           Production          3d ago\n AUDIT_PROXY_SECRET         Encrypted           Production          3d ago",
    ),
    "inffyn-preview",
  );
  assert.deepEqual(names, ["AUDIT_PROXY_SECRET", "ENGINE_URL"]);
  assert.ok(
    !JSON.stringify(
      configurationReceipt({ app: names }, "live_metadata_only"),
    ).includes("PRIVATE_VALUE_NEVER_OUTPUT"),
  );
});

test("unrecognized, mismatched, duplicate, and malformed inventories fail closed", () => {
  for (const output of [
    "PRIVATE_DIAGNOSTIC_VALUE",
    listing(undefined, "other"),
    listing(
      " ENGINE_URL                 Encrypted           Production          3d ago\n ENGINE_URL                 Encrypted           Production          3d ago",
    ),
    listing(" ENGINE_URL=value"),
    listing(
      " ENGINE_URL                 Encrypted           Preview          3d ago",
    ),
  ])
    assert.throws(() => parseEnvironmentNames(output, "inffyn-preview"));
});

test("live names show core CSV gaps separately from provider and billing gaps", () => {
  const result = runConfigurationPreflight({
    live: true,
    readLink: (target) => target,
    listNames: (target) =>
      target === TARGETS.app
        ? ["ENGINE_URL", "AUDIT_PROXY_SECRET", "INFFYN_PREVIEW_MODE"]
        : ["AUDIT_PROXY_SECRET", "INFFYN_PREVIEW_MODE"],
  });
  assert.equal(result.mode, "live_metadata_only");
  assert.equal(result.release_ready, false);
  assert.equal(result.mutations_performed, false);
  assert.deepEqual(result.groups.core_csv_app.missing_names, [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ]);
  assert.ok(
    result.groups.core_csv_engine.missing_names.includes(
      "SUPABASE_SERVICE_ROLE_KEY",
    ),
  );
  assert.ok(
    !result.groups.core_csv_engine.required_names.includes(
      "PROVIDER_TOKEN_ENC_KEY",
    ),
  );
  assert.ok(
    result.groups.openai_import.required_names.includes(
      "PROVIDER_TOKEN_ENC_KEY",
    ),
  );
  assert.equal(result.preview_switches.app[0].presence, "present");
  assert.equal(result.preview_switches.app[0].value_verified, false);
});

test("complete names never imply approved values or hosted acceptance", () => {
  const template = configurationReceipt();
  const inventory = { app: [], engine: [] };
  for (const group of Object.values(template.groups))
    inventory[group.service].push(...group.required_names);
  inventory.app.push("NEXT_PUBLIC_SENTRY_DSN");
  const result = configurationReceipt(inventory, "live_metadata_only");
  assert.ok(
    Object.values(result.groups).every(
      (group) => group.status === "names_present_values_unverified",
    ),
  );
  assert.equal(result.release_ready, false);
  assert.ok(
    result.pending_checks.includes(
      "authenticated_csv_save_return_and_company_isolation",
    ),
  );
});
