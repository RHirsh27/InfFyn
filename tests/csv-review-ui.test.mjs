// Real React events in a disposable DOM, with an explicitly synthetic API store.
// This proves UI recovery behavior, not hosted authentication or database access.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://synthetic.example/app/monthly",
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
});
const require = createRequire(import.meta.url);
const React = require("react");
const { createRoot } = require("react-dom/client");
const { act } = React;
const app = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../app",
);
const cache = new Map();
function load(file) {
  let absolute = path.resolve(app, file);
  if (!existsSync(absolute))
    absolute += existsSync(absolute + ".ts") ? ".ts" : ".tsx";
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const module = { exports: {} };
  cache.set(absolute, module);
  const source = ts.transpileModule(readFileSync(absolute, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  vm.runInNewContext(
    source,
    {
      module,
      exports: module.exports,
      require: (name) =>
        name.endsWith(".css")
          ? {}
          : name === "next/link"
            ? ({ onNavigate, ...props }) =>
                React.createElement("a", { ...props, onClick: onNavigate })
            : name.startsWith("@/")
              ? load(name.slice(2))
              : name.startsWith(".")
                ? load(path.resolve(path.dirname(absolute), name))
                : require(name),
      window: dom.window,
      document: dom.window.document,
      URL,
      Blob,
      TextEncoder,
      atob,
      btoa,
      Uint8Array,
      setTimeout,
      console,
      Error,
      TypeError,
      fetch: (...args) => globalThis.fetch(...args),
    },
    { filename: absolute },
  );
  return module.exports;
}
const { ImportReviewPanel } = load("components/monthly/import-review.tsx");
const { WorkspaceRequestError } = load("lib/revisioned-save.ts");
const { defaultRules } = load("lib/reviewed-import.ts");
const { MonthlyWorkspace } = load("components/monthly/workspace.tsx");
const { evidenceFor } = load("lib/monthly.ts");
const { emptyAudit } = load("lib/audit-v2.ts");
dom.window.matchMedia = () => ({
  addEventListener() {},
  removeEventListener() {},
});
let root;
test("complimentary access remains visible while financial intake is paused", async () => {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    assert.equal(String(url), "/api/v2/billing");
    return Response.json({
      entitled: true,
      access_source: "complimentary",
      is_access_admin: true,
      monthly_available: false,
    });
  };
  const div = document.createElement("div");
  document.body.append(div);
  root = createRoot(div);
  await act(async () =>
    root.render(React.createElement(MonthlyWorkspace, { privateAlpha: true })),
  );
  assert.match(document.body.textContent, /Your company access is active/);
  assert.match(document.body.textContent, /Financial uploads are paused/);
  assert.doesNotMatch(
    document.body.textContent,
    /needs a complimentary company access grant/,
  );
  assert.ok(document.querySelector('a[href="/app/admin/access"]'));
  await click("Monthly Review");
  assert.equal(calls.length, 1);
  await click("Check activation status");
  assert.equal(calls.length, 2);
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  document.body.replaceChildren();
});

function store() {
  let review = {
    source: {
      id: "source-synthetic",
      month: "2026-08",
      revision: 1,
      filename: "costs.csv",
      kind: "costs_csv",
      account: "Synthetic ledger",
      expires_at: "2026-12-01T00:00:00Z",
    },
    rules: { ...defaultRules(), mapping: { amount: "amount" } },
    decisions: [],
    confirmation: null,
    profile: {
      fields: ["amount", "category"],
      headers: ["amount", "category"],
      missing_mapping: [],
      suggested_mapping: { amount: "amount" },
      schema_hash: "schema",
      canonical_hash: "canonical",
      ready: true,
      counts: { included: 1 },
      controls: { included: "12000.00" },
      controls_by_currency: { USD: { included: "12000.00" } },
      unknown_source_amount_rows: 0,
      issues: {},
      limitations: [],
    },
  };
  let failure = null,
    writes = 0,
    attachments = [];
  const activity = [];
  const api = async (request, method = "GET", body) => {
    if (request.startsWith("monthly/import-reviews?"))
      return { sources: [structuredClone(review.source)] };
    if (request === "monthly/import-recipes") return { recipes: [] };
    if (request.includes("/rows")) {
      assert.equal(
        new URL(request, "https://synthetic.example").searchParams.get(
          "expected_revision",
        ),
        String(review.source.revision),
      );
      return {
        rows: [
          {
            row: 2,
            source: { amount: "12000" },
            normalized: { amount: "12000.00" },
            disposition: "included",
            issues: [],
          },
        ],
        next_cursor: null,
      };
    }
    if (request.endsWith("/revision") && method === "PUT") {
      writes++;
      if (body.expected_revision !== review.source.revision)
        throw new WorkspaceRequestError("Revision conflict", 409);
      if (failure === "before") {
        failure = null;
        throw new TypeError("Offline; retry your save.");
      }
      review = {
        ...review,
        source: { ...review.source, revision: review.source.revision + 1 },
        rules: structuredClone(body.rules),
        decisions: structuredClone(body.decisions),
        confirmation: null,
      };
      if (failure === "after") {
        failure = null;
        throw new WorkspaceRequestError(
          "Response interrupted; retry your save.",
          504,
        );
      }
      return structuredClone(review);
    }
    if (request === "monthly/import-reviews/source-synthetic")
      return structuredClone(review);
    throw new Error(
      "Unexpected synthetic API request: " + method + " " + request,
    );
  };
  return {
    api,
    activity,
    attachments,
    get review() {
      return review;
    },
    set review(value) {
      review = value;
    },
    set failure(value) {
      failure = value;
    },
    get writes() {
      return writes;
    },
    props: {
      month: "2026-08",
      workloads: [{ id: "workload-synthetic", name: "Support resolution" }],
      api,
      disabled: false,
      onActivityChange: (value) => activity.push(value),
      attach: async (...args) => attachments.push(args),
    },
  };
}
function control(label, selector = "input,select") {
  const aria = document.querySelector(`[aria-label="${label}"]`);
  if (aria) return aria;
  const wrapper = [...document.querySelectorAll("label")].find((el) =>
    el.textContent.includes(label),
  );
  assert.ok(wrapper, label + " exists");
  return wrapper.querySelector(selector);
}
function button(label) {
  const found = [...document.querySelectorAll("button")].find(
    (el) => el.textContent.trim() === label,
  );
  assert.ok(found, label + " exists");
  return found;
}
async function change(el, value) {
  await act(async () => {
    const prototype =
      el.tagName === "SELECT"
        ? dom.window.HTMLSelectElement.prototype
        : dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(el, value);
    el.dispatchEvent(
      new dom.window.Event(el.tagName === "SELECT" ? "change" : "input", {
        bubbles: true,
      }),
    );
  });
}
async function click(label) {
  await act(async () => button(label).click());
}
async function open(f) {
  const div = document.createElement("div");
  document.body.append(div);
  root = createRoot(div);
  await act(async () =>
    root.render(React.createElement(ImportReviewPanel, f.props)),
  );
  await change(
    control("Resume a retained import", "select"),
    "source-synthetic",
  );
}

test("saved confirmation is restored on a new mount and assigned without reconfirming", async () => {
  const f = store();
  f.review = {
    ...f.review,
    confirmation: {
      id: "confirmed-synthetic",
      created_at: "2026-09-01T00:00:00Z",
    },
  };
  await open(f);
  assert.match(document.body.textContent, /already confirmed and retained/);
  assert.equal(button("Use this reviewed dataset").disabled, true);
  await change(control("Assign to workload", "select"), "workload-synthetic");
  await click("Assign approved evidence");
  assert.deepEqual(f.attachments, [
    ["confirmed-synthetic", "workload-synthetic"],
  ]);
  assert.equal(f.writes, 0);
});

test("unsaved interpretation guards navigation and source replacement; discard is explicit", async () => {
  const f = store();
  await open(f);
  await change(control("Constant category"), "other");
  assert.equal(f.activity.at(-1), true);
  assert.equal(control("Resume a retained import").disabled, true);
  const event = new dom.window.Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  window.confirm = () => false;
  await click("Reload saved review");
  assert.equal(control("Constant category").value, "other");
  window.confirm = () => true;
  await click("Reload saved review");
  assert.equal(control("Constant category").value, "");
  assert.equal(f.activity.at(-1), false);
});

for (const failure of ["before", "after"])
  test(`UI retains edits and recovers a connection failure ${failure} the database save`, async () => {
    const f = store();
    await open(f);
    await change(control("Constant category"), "other");
    f.failure = failure;
    await click("Save interpretation and check");
    assert.match(
      document.querySelector('[role="alert"]').textContent,
      /retry your save/,
    );
    assert.equal(control("Constant category").value, "other");
    assert.equal(button("Save interpretation and check").disabled, false);
    await click("Save interpretation and check");
    assert.equal(f.review.source.revision, 2);
    assert.equal(f.writes, failure === "after" ? 1 : 2);
    assert.match(
      document.body.textContent,
      /Interpretation saved to your company workspace/,
    );
    assert.equal(f.activity.at(-1), false);
    assert.equal(window.localStorage.length, 0);
  });

test("concurrent interpretation changes leave local corrections visible until reload", async () => {
  const f = store();
  await open(f);
  await change(control("Constant category"), "other");
  f.review = {
    ...f.review,
    source: { ...f.review.source, revision: 2 },
    rules: { ...f.review.rules, constants: { category: "compute" } },
  };
  await click("Save interpretation and check");
  assert.match(
    document.querySelector('[role="alert"]').textContent,
    /saved version changed/,
  );
  assert.equal(control("Constant category").value, "other");
  assert.equal(button("Save interpretation and check").disabled, true);
  assert.equal(f.review.rules.constants.category, "compute");
  assert.ok(button("Export interpretation edits"));
});

async function openWorkspace(failure, retainedImport) {
  const month = emptyAudit().period_start.slice(0, 7);
  const workload = {
    id: "workload-synthetic",
    name: "Support resolution",
    kind: "internal",
    outcome_unit: "accepted ticket",
    cost_scope: "Synthetic expenses",
    acceptance_definition: "Reviewed ticket",
    unallocated: false,
    mappings: {},
  };
  let saved = {
    revision: 1,
    month,
    updated_at: new Date().toISOString(),
    content: {
      month,
      workloads: [evidenceFor(workload, month)],
      company_scope_complete: false,
      import_ids: [],
      cost_assignments: [],
      invoice_allocations: [],
      step: "import",
    },
  };
  let writes = 0;
  if (retainedImport) retainedImport.review.source.month = month;
  globalThis.fetch = async (url, options) => {
    const route = String(url).replace("/api/v2/", "");
    const json = (value, status = 200) => Response.json(value, { status });
    if (route === "monthly/workloads") return json({ workloads: [workload] });
    if (route === "billing")
      return json({ entitled: true, access_source: "complimentary" });
    if (route === "monthly/reports")
      return json({ reports: [], selections: [] });
    if (route === "monthly/performance") return json({ months: [] });
    if (route === "monthly/connections") return json({ connections: [] });
    if (route === "monthly/imports") return json({ imports: [] });
    if (
      retainedImport &&
      (route.startsWith("monthly/import-reviews") ||
        route === "monthly/import-recipes")
    )
      return json(
        await retainedImport.api(
          route,
          options.method,
          options.body ? JSON.parse(options.body) : undefined,
        ),
      );
    if (route.startsWith("monthly/import-reviews?"))
      return json({ sources: [] });
    if (route === "monthly/import-recipes") return json({ recipes: [] });
    if (route === `monthly/drafts/${month}`) {
      if (options.method === "PUT") {
        writes++;
        const body = JSON.parse(options.body);
        if (failure === "before") {
          failure = null;
          throw new TypeError("Connection interrupted");
        }
        if (body.expected_revision !== saved.revision)
          return json({ detail: "Revision changed" }, 409);
        saved = {
          ...saved,
          revision: saved.revision + 1,
          content: body.content,
        };
        if (failure === "after") {
          failure = null;
          return json({ detail: "Connection interrupted" }, 503);
        }
      }
      return json({ draft: saved });
    }
    throw new Error("Unexpected synthetic workspace request: " + route);
  };
  const div = document.createElement("div");
  document.body.append(div);
  root = createRoot(div);
  await act(async () =>
    root.render(React.createElement(MonthlyWorkspace, { privateAlpha: true })),
  );
  await click("Monthly Review");
  return {
    get saved() {
      return saved;
    },
    get writes() {
      return writes;
    },
  };
}

for (const failure of ["before", "after"])
  test(`monthly progress recovers a lost save ${failure} commit through the visible retry action`, async () => {
    const f = await openWorkspace(failure);
    // Guided preparation steps are persisted along with the evidence.
    const step = [
      ...document.querySelectorAll(
        '[aria-label="Monthly review progress"] button',
      ),
    ].find((el) => el.textContent.includes("Assign"));
    assert.ok(step, "Assignment step is available");
    await act(async () => step.click());
    await click("Save progress");
    assert.match(
      document.body.textContent,
      /Preparation has not finished saving/,
    );
    assert.equal(button("Retry save").disabled, false);
    await click("Retry save");
    assert.equal(f.saved.content.step, "assign");
    assert.equal(f.saved.revision, 2);
    assert.equal(f.writes, failure === "after" ? 1 : 2);
    assert.doesNotMatch(
      document.body.textContent,
      /Preparation has not finished saving/,
    );
  });

test("the company shell blocks tab, month, link and sign-out navigation while CSV edits are unsaved", async () => {
  const f = store();
  await openWorkspace(null, f);
  await change(control("Resume a retained import"), "source-synthetic");
  await change(control("Constant category"), "other");
  await click("Workloads");
  assert.equal(
    document.querySelector('[aria-label="Workspace"] [aria-current="page"]')
      .textContent,
    "Monthly Review",
  );
  assert.equal(document.querySelector('input[type="month"]').disabled, true);
  const link = [...document.querySelectorAll("a")].find((a) =>
    a.textContent.includes("How the numbers work"),
  );
  const navigate = new dom.window.MouseEvent("click", {
    bubbles: true,
    cancelable: true,
  });
  await act(async () => link.dispatchEvent(navigate));
  assert.equal(navigate.defaultPrevented, true);
  const submit = new dom.window.Event("submit", {
    bubbles: true,
    cancelable: true,
  });
  await act(async () =>
    document
      .querySelector('form[action="/auth/signout"]')
      .dispatchEvent(submit),
  );
  assert.equal(submit.defaultPrevented, true);
  await click("Save interpretation and check");
  await click("Workloads");
  assert.equal(
    document.querySelector('[aria-label="Workspace"] [aria-current="page"]')
      .textContent,
    "Workloads",
  );
});
