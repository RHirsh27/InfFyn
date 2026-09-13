// In-memory coordination only. Financial evidence is persisted by the authenticated API,
// never by localStorage. Each instance belongs to one company resource and revision.
export class WorkspaceRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "WorkspaceRequestError";
  }
}

export class RevisionConflictError extends Error {
  constructor() {
    super(
      "The saved version changed. Your edits remain in this tab. Export them, then reload and review the saved version.",
    );
    this.name = "RevisionConflictError";
  }
}

export function stableSnapshot(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
}

type Transport<Value, Record> = {
  revision: number;
  read: () => Promise<Record | null>;
  write: (revision: number, value: Value) => Promise<Record>;
  revisionOf: (record: Record) => number;
  valueOf: (record: Record) => Value;
  onSaved: (record: Record, submitted: Value) => void;
};

/** Serializes writes and resolves a lost response before attempting another write.
 * A changed server revision is adopted only when its content matches the submission.
 * Otherwise it is a conflict: we never silently merge financial evidence.
 */
export class RevisionedSaver<Value, Record> {
  private pending: { revision: number; value: Value } | null = null;
  private running = false;
  private version: number;

  constructor(private transport: Transport<Value, Record>) {
    this.version = transport.revision;
  }

  private acknowledge(record: Record, submitted: Value) {
    this.version = this.transport.revisionOf(record);
    this.pending = null;
    this.transport.onSaved(record, submitted);
  }

  private async reconcile(): Promise<Record | null> {
    const pending = this.pending;
    if (!pending) return null;
    const record = await this.transport.read();
    if (
      record &&
      stableSnapshot(this.transport.valueOf(record)) ===
        stableSnapshot(pending.value)
    ) {
      this.acknowledge(record, pending.value);
      return record;
    }
    if ((record ? this.transport.revisionOf(record) : 0) !== pending.revision)
      throw new RevisionConflictError();
    // The previous request did not commit. Its revision still protects the retry.
    this.pending = null;
    return null;
  }

  async save(value: Value): Promise<Record> {
    if (this.running)
      throw new Error(
        "A save is already in progress. Wait for it to finish before retrying.",
      );
    this.running = true;
    // Snapshot inputs so later edits cannot change the meaning of an in-flight write.
    const submitted: Value = JSON.parse(JSON.stringify(value));
    try {
      const recovered = await this.reconcile();
      if (
        recovered &&
        stableSnapshot(this.transport.valueOf(recovered)) ===
          stableSnapshot(submitted)
      )
        return recovered;
      this.pending = { revision: this.version, value: submitted };
      let record: Record;
      try {
        record = await this.transport.write(this.version, submitted);
      } catch (error) {
        if (error instanceof WorkspaceRequestError && error.status === 409) {
          const recoveredConflict = await this.reconcile();
          if (recoveredConflict) return recoveredConflict;
          throw new RevisionConflictError();
        }
        // Definite client rejection did not commit. Network/timeout/server errors
        // retain the pending submission because the database may have saved it.
        if (
          error instanceof WorkspaceRequestError &&
          error.status >= 400 &&
          error.status < 500 &&
          error.status !== 408
        )
          this.pending = null;
        throw error;
      }
      this.acknowledge(record, submitted);
      return record;
    } finally {
      this.running = false;
    }
  }
}
