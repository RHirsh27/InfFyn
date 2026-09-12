import { headers } from "@/lib/audit-v2";
import {
  Workload,
  WorkloadEvidence,
  csvFrom,
  evidenceFor,
} from "@/lib/monthly";

export function readEvidenceCsv(text: string): Record<string, string>[] {
  if (!text.trim()) return [];
  if (text.includes("\0"))
    throw new Error(
      "CSV evidence contains an invalid null character. Correct it before preparing imports.",
    );
  const input = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    touched = false;
  let state: "start" | "unquoted" | "quoted" | "closed" = "start";
  const finishRow = () => {
    // Physical blank lines may be ignored. Delimited or explicitly quoted empty
    // records must survive so downstream validation can identify their errors.
    if (touched || row.length || field.length) rows.push([...row, field]);
    row = [];
    field = "";
    touched = false;
    state = "start";
  };
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (state === "quoted") {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else state = "closed";
      } else field += c;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      touched = true;
      state = "start";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && input[i + 1] === "\n") i++;
      finishRow();
    } else if (c === '"' && state === "start") {
      touched = true;
      state = "quoted";
    } else if (c === '"' || state === "closed") {
      throw new Error(
        "CSV quoting is malformed. Quote the entire field and escape embedded quotes before preparing imports.",
      );
    } else {
      field += c;
      touched = true;
      state = "unquoted";
    }
  }
  if (state === "quoted")
    throw new Error(
      "A CSV field has an unclosed quote. Correct it before preparing imported evidence.",
    );
  finishRow();
  const names = rows.shift() || [];
  if (
    names.some((name) => !name.trim()) ||
    new Set(names).size !== names.length
  ) {
    throw new Error(
      "CSV headers must be nonempty and unique. Correct them before preparing imported evidence.",
    );
  }
  if (rows.some((r) => r.length !== names.length))
    throw new Error(
      "CSV columns do not match the header. Correct the evidence before preparing imports.",
    );
  return rows.map((values) =>
    Object.fromEntries(names.map((key, i) => [key, values[i]])),
  );
}

function writeRows(rows: Record<string, string>[], fallback: string) {
  if (!rows.length) return "";
  const columns = [
    ...new Set([
      ...fallback.split(","),
      ...rows.flatMap((row) => Object.keys(row)),
    ]),
  ];
  return csvFrom(rows, columns);
}

/** Replace only retained-provider records; preserve independently uploaded evidence. */
export function mergePreparedEvidence(
  existing: WorkloadEvidence[],
  prepared: Partial<WorkloadEvidence>[],
  definitions: Workload[],
  month: string,
  oldProviderCostIds: Set<string>,
  selectedImportIds: string[],
) {
  const result: WorkloadEvidence[] = [];
  const ids = new Set([
    ...existing.map((x) => x.workload_id),
    ...prepared.map((x) => x.workload_id!),
  ]);
  for (const id of ids) {
    const definition = definitions.find((w) => w.id === id);
    if (!definition)
      throw new Error(
        "A workload definition is no longer available. Reload the workspace before preparing.",
      );
    const old =
      existing.find((x) => x.workload_id === id) ||
      evidenceFor(definition, month);
    const incoming = prepared.find((x) => x.workload_id === id);
    const incomingCosts = readEvidenceCsv(incoming?.audit?.costs_csv || "");
    const oldCosts = readEvidenceCsv(old.audit.costs_csv).filter(
      (row) => !oldProviderCostIds.has(row.cost_id),
    );
    if (incomingCosts.length && old.audit.usage_csv.trim())
      throw new Error(
        `${definition.name} already contains event costs. Reconcile or remove that cost basis before assigning aggregate provider costs. Your current evidence has been preserved.`,
      );
    const costIds = new Set(oldCosts.map((r) => r.cost_id));
    if (incomingCosts.some((r) => costIds.has(r.cost_id)))
      throw new Error(
        `${definition.name} has an existing cost row with the same identity. Review the duplicate before preparing.`,
      );
    const manualRevenue = readEvidenceCsv(old.audit.revenue_csv).filter(
      (row) => !row.revenue_id?.startsWith("stripe-allocation:"),
    );
    const newRevenue = readEvidenceCsv(incoming?.audit?.revenue_csv || "");
    if (
      newRevenue.length &&
      manualRevenue.length &&
      old.audit.revenue_basis !== "collections"
    )
      throw new Error(
        `${definition.name} already uses a different revenue basis. Review it before combining Stripe collections.`,
      );
    if (
      newRevenue.length &&
      manualRevenue.length &&
      old.audit.revenue_source !== "stripe_reviewed"
    )
      throw new Error(
        `${definition.name} contains separately supplied revenue. Keep that evidence separate or replace it with reviewed Stripe evidence before combining collections; its source cannot be changed automatically.`,
      );
    const audit = {
      ...old.audit,
      costs_csv: writeRows([...oldCosts, ...incomingCosts], headers.costs_csv),
      revenue_csv: writeRows(
        [...manualRevenue, ...newRevenue],
        headers.revenue_csv,
      ),
      ...(incomingCosts.length
        ? { cost_basis: "provider_totals" as const }
        : {}),
      ...(newRevenue.length
        ? {
            revenue_source: "stripe_reviewed" as const,
            revenue_basis: "collections" as const,
          }
        : {}),
      cost_scope_complete: false,
      revenue_reviewed: false,
    };
    if (
      !audit.usage_csv.trim() &&
      !audit.costs_csv.trim() &&
      !audit.revenue_csv.trim() &&
      !audit.outcomes_csv.trim()
    )
      continue;
    const incomingNote = incoming?.review?.source_note || "";
    const sourceNote =
      !incomingNote || old.review.source_note.includes(incomingNote)
        ? old.review.source_note
        : [old.review.source_note, incomingNote]
            .filter(Boolean)
            .join(" ")
            .slice(0, 1000);
    result.push({
      ...old,
      audit,
      import_ids: [
        ...new Set([
          ...(old.import_ids || []).filter((x) =>
            selectedImportIds.includes(x),
          ),
          ...(incoming?.import_ids || []),
        ]),
      ],
      review: {
        ...old.review,
        source_note: sourceNote,
        method_reviewed: false,
        revenue_scope_complete: false,
        outcome_method_reviewed: false,
      },
    });
  }
  return result;
}
