import assert from "node:assert/strict";
import test from "node:test";
import {
  RevisionedSaver,
  RevisionConflictError,
  WorkspaceRequestError,
} from "../app/lib/revisioned-save";

type Value = { amount: string; reviewed: boolean };
type Record = { revision: number; content: Value };
const initial: Value = { amount: "12000.00", reviewed: false };
const edited: Value = { amount: "12500.00", reviewed: false };
function fixture() {
  let stored: Record | null = {
    revision: 1,
    content: structuredClone(initial),
  };
  let calls = 0,
    reads = 0;
  let failWrite: "before" | "after" | number | null = null;
  let failRead = false;
  let waitWrite: Promise<void> | null = null;
  const commits: { record: Record; submitted: Value }[] = [];
  const saver = new RevisionedSaver<Value, Record>({
    revision: 1,
    read: async () => {
      reads++;
      if (failRead) throw new WorkspaceRequestError("Sign in again", 401);
      return structuredClone(stored);
    },
    write: async (revision, value) => {
      calls++;
      if (waitWrite) await waitWrite;
      const failure = failWrite;
      failWrite = null;
      if (failure === "before") throw new TypeError("Connection interrupted");
      if (typeof failure === "number")
        throw new WorkspaceRequestError("Request rejected", failure);
      if ((stored?.revision || 0) !== revision)
        throw new WorkspaceRequestError("Stale revision", 409);
      stored = { revision: revision + 1, content: structuredClone(value) };
      if (failure === "after")
        throw new WorkspaceRequestError("Gateway timed out after commit", 504);
      return structuredClone(stored);
    },
    revisionOf: (r) => r.revision,
    valueOf: (r) => r.content,
    onSaved: (record, submitted) =>
      commits.push(structuredClone({ record, submitted })),
  });
  return {
    saver,
    commits,
    get calls() {
      return calls;
    },
    get reads() {
      return reads;
    },
    get stored() {
      return stored;
    },
    set stored(r) {
      stored = r;
    },
    set failWrite(f: typeof failWrite) {
      failWrite = f;
    },
    set failRead(f: boolean) {
      failRead = f;
    },
    set waitWrite(p: Promise<void>) {
      waitWrite = p;
    },
  };
}

test("successive edits use the acknowledged revision, even without a UI render", async () => {
  const f = fixture();
  await f.saver.save(edited);
  const result = await f.saver.save({ ...edited, reviewed: true });
  assert.equal(result.revision, 3);
  assert.equal(f.reads, 0);
  assert.equal(f.commits.length, 2);
});

test("a network failure before commit remains retryable and preserves the requested amount", async () => {
  const f = fixture();
  f.failWrite = "before";
  await assert.rejects(f.saver.save(edited), TypeError);
  assert.deepEqual(f.stored?.content, initial);
  assert.equal((await f.saver.save(edited)).revision, 2);
  assert.equal(f.reads, 1);
  assert.equal(f.calls, 2);
});

test("a lost successful response is acknowledged on retry without a duplicate revision", async () => {
  const f = fixture();
  f.failWrite = "after";
  await assert.rejects(f.saver.save(edited));
  assert.equal(f.stored?.revision, 2);
  assert.equal((await f.saver.save(edited)).revision, 2);
  assert.equal(f.calls, 1);
  assert.equal(f.commits.length, 1);
});

test("edits made after a lost response are saved against the recovered revision", async () => {
  const f = fixture();
  f.failWrite = "after";
  await assert.rejects(f.saver.save(edited));
  const newer = { ...edited, amount: "13000.00" };
  const result = await f.saver.save(newer);
  assert.equal(result.revision, 3);
  assert.deepEqual(result.content, newer);
  assert.deepEqual(
    f.commits.map((c) => c.submitted.amount),
    ["12500.00", "13000.00"],
  );
});

test("another person's edit after an interrupted save cannot be overwritten", async () => {
  const f = fixture();
  f.failWrite = "after";
  await assert.rejects(f.saver.save(edited));
  const colleague: Record = {
    revision: 3,
    content: { ...initial, amount: "14000.00" },
  };
  f.stored = colleague;
  await assert.rejects(f.saver.save(edited), RevisionConflictError);
  assert.deepEqual(f.stored, colleague);
  assert.equal(f.calls, 1);
  assert.equal(f.commits.length, 0);
});

test("a normal stale edit is a conflict and retains the other version", async () => {
  const f = fixture();
  f.stored = { revision: 2, content: { ...initial, amount: "15000.00" } };
  await assert.rejects(f.saver.save(edited), RevisionConflictError);
  assert.equal(f.stored.content.amount, "15000.00");
});

test("identical content saved elsewhere can be acknowledged without a rewrite", async () => {
  const f = fixture();
  f.stored = { revision: 2, content: structuredClone(edited) };
  assert.equal((await f.saver.save(edited)).revision, 2);
  assert.equal(f.calls, 1);
});

test("expiry after a lost save is a conflict, never silent recreation", async () => {
  const f = fixture();
  f.failWrite = "after";
  await assert.rejects(f.saver.save(edited));
  f.stored = null;
  await assert.rejects(f.saver.save(edited), RevisionConflictError);
  assert.equal(f.calls, 1);
});

test("a fresh draft can recover a failed first write without inventing persistence", async () => {
  let record: Record | null = null,
    failed = false;
  const saver = new RevisionedSaver<Value, Record>({
    revision: 0,
    read: async () => record,
    write: async (revision, value) => {
      assert.equal(revision, 0);
      if (!failed) {
        failed = true;
        throw new TypeError("Offline");
      }
      return (record = { revision: 1, content: value });
    },
    revisionOf: (r) => r.revision,
    valueOf: (r) => r.content,
    onSaved: () => {},
  });
  await assert.rejects(saver.save(edited));
  assert.equal(record, null);
  assert.equal((await saver.save(edited)).revision, 1);
});

for (const status of [401, 403, 413, 422, 429])
  test(`HTTP ${status} is retryable after correction, not an edit conflict`, async () => {
    const f = fixture();
    f.failWrite = status;
    await assert.rejects(
      f.saver.save(edited),
      (error: unknown) =>
        error instanceof WorkspaceRequestError && error.status === status,
    );
    await f.saver.save(edited);
    assert.equal(f.reads, 0);
    assert.deepEqual(f.stored?.content, edited);
  });

test("reauthentication failure does not discard an unresolved successful save", async () => {
  const f = fixture();
  f.failWrite = "after";
  await assert.rejects(f.saver.save(edited));
  f.failRead = true;
  await assert.rejects(f.saver.save(edited), WorkspaceRequestError);
  f.failRead = false;
  assert.equal((await f.saver.save(edited)).revision, 2);
  assert.equal(f.calls, 1);
});

test("an in-flight write snapshots the submitted content and rejects a duplicate click", async () => {
  const f = fixture();
  let release!: () => void;
  f.waitWrite = new Promise<void>((resolve) => {
    release = resolve;
  });
  const input = structuredClone(edited);
  const first = f.saver.save(input);
  input.amount = "99999.00";
  await assert.rejects(f.saver.save(input), /already in progress/);
  release();
  assert.equal((await first).content.amount, "12500.00");
  assert.equal(f.commits[0].submitted.amount, "12500.00");
});

test("server-cleared financial confirmations are never silently treated as reviewed", async () => {
  const f = fixture();
  f.failWrite = "after";
  await assert.rejects(f.saver.save({ ...edited, reviewed: true }));
  f.stored = { revision: 2, content: { ...edited, reviewed: false } };
  await assert.rejects(
    f.saver.save({ ...edited, reviewed: true }),
    RevisionConflictError,
  );
  assert.equal(f.stored.content.reviewed, false);
});
