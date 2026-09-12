"use client";

import { useEffect, useRef, useState } from "react";
import { download } from "@/lib/audit-v2";
import { Workload } from "@/lib/monthly";
import {
  defaultRules,
  ImportDecision,
  ImportRecipe,
  ImportReview,
  ImportRow,
  ImportRules,
  ImportSource,
} from "@/lib/reviewed-import";

type Props = {
  month: string;
  workloads: Workload[];
  api: (path: string, method?: string, body?: unknown) => Promise<any>;
  attach: (confirmation: string, workload: string) => Promise<void>;
  disabled: boolean;
};

export function ImportReviewPanel({
  month,
  workloads,
  api,
  attach,
  disabled,
}: Props) {
  const [sources, setSources] = useState<ImportSource[]>([]);
  const [recipes, setRecipes] = useState<ImportRecipe[]>([]);
  const [review, setReview] = useState<ImportReview | null>(null);
  const [rules, setRules] = useState<ImportRules>(defaultRules);
  const [decisions, setDecisions] = useState<ImportDecision[]>([]);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [kind, setKind] = useState<ImportSource["kind"]>("costs_csv");
  const [account, setAccount] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [workload, setWorkload] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [reason, setReason] = useState("");
  const [issueGroup, setIssueGroup] = useState("");
  const [amendField, setAmendField] = useState("");
  const [amendValue, setAmendValue] = useState("");
  const started = useRef(Date.now());
  const generation = useRef(0);
  const apiRef = useRef(api);
  apiRef.current = api;
  const dirty =
    !!review &&
    (JSON.stringify(rules) !== JSON.stringify(review.rules) ||
      JSON.stringify(decisions) !== JSON.stringify(review.decisions));

  useEffect(() => {
    const current = ++generation.current;
    setReview(null);
    setConfirmed("");
    setRows([]);
    setError("");
    setMessage("");
    started.current = Date.now();
    Promise.all([
      apiRef.current(
        `monthly/import-reviews?month=${encodeURIComponent(month)}`,
      ),
      apiRef.current("monthly/import-recipes"),
    ])
      .then(([s, r]) => {
        if (current === generation.current) {
          setSources(s.sources);
          setRecipes(r.recipes);
        }
      })
      .catch((e) => {
        if (current === generation.current) setError(e.message);
      });
    return () => {
      generation.current++;
    };
  }, [month]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import could not complete.");
    } finally {
      setBusy(false);
    }
  }
  async function show(value: ImportReview) {
    setReview(value);
    setRules(value.rules);
    setDecisions(value.decisions);
    setConfirmed("");
    setAccepted(false);
    setSelected([]);
    const page = await api(`monthly/import-reviews/${value.source.id}/rows`);
    setRows(page.rows);
    setCursor(page.next_cursor);
  }
  async function upload(file: File) {
    if (file.size > 2_000_000)
      throw new Error(
        "Use a CSV under 2 MB. Aggregate by date and business dimensions; no rows will be truncated.",
      );
    if (!account.trim())
      throw new Error(
        "Name the source account so overlapping exports can be detected.",
      );
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    const value = await api("monthly/import-reviews", "POST", {
      month,
      kind,
      account: account.trim(),
      filename: file.name,
      original_base64: btoa(binary),
      rules: { ...rules, mapping: {}, constants: {} },
    });
    await show(value);
    setSources((await api(`monthly/import-reviews?month=${month}`)).sources);
    setMessage(
      "Original retained. Review the column interpretation before calculating.",
    );
  }
  function decide(action: ImportDecision["action"]) {
    if (reason.trim().length < 3 || !selected.length) {
      setError("Select source rows and explain this decision.");
      return;
    }
    if (action === "amend" && !amendField) {
      setError("Choose a field to correct.");
      return;
    }
    setDecisions((old) => [
      ...old.filter(
        (d) =>
          !selected.includes(d.row) ||
          (action === "amend"
            ? d.action !== "amend" || d.field !== amendField
            : d.action === "amend"),
      ),
      ...selected.map((row) => ({
        row,
        action,
        reason,
        field: action === "amend" ? amendField : "",
        value: action === "amend" ? amendValue : "",
      })),
    ]);
    setSelected([]);
    setAccepted(false);
    setConfirmed("");
  }

  return (
    <section
      className="monthly-panel import-review"
      aria-labelledby="import-review-title"
    >
      <div className="monthly-actions">
        <div>
          <span className="import-eyebrow">REVIEWED COMPANY EVIDENCE</span>
          <h2 id="import-review-title">
            Organize once. Review the changes next month.
          </h2>
        </div>
      </div>
      <p>
        Bring a supported usage, cost or revenue CSV. Keep the original, review
        the interpretation, then use the approved version in your monthly
        calculation.
      </p>
      <p className="import-limit">
        USD · UTF-8 CSV · 2 MB per original · 20,000 rows maximum. Rates and
        outcomes remain available in the existing evidence editor.
      </p>
      {error && (
        <p role="alert" className="import-error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <fieldset disabled={busy || disabled} className="import-controls">
        <legend>1. Source and interpretation</legend>
        <label>
          Evidence type
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            <option value="costs_csv">
              Supporting costs / provider totals
            </option>
            <option value="usage_csv">Usage events</option>
            <option value="revenue_csv">Revenue / collections</option>
          </select>
        </label>
        <label>
          Source account
          <input
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            placeholder="Company provider account or ledger"
            maxLength={200}
          />
        </label>
        <label>
          Delimiter
          <select
            value={rules.delimiter}
            onChange={(e) =>
              setRules({
                ...rules,
                delimiter: e.target.value as ImportRules["delimiter"],
              })
            }
          >
            <option value=",">Comma</option>
            <option value=";">Semicolon</option>
            <option value={"\t"}>Tab</option>
          </select>
        </label>
        <label>
          Header row
          <input
            type="number"
            min={1}
            max={20}
            value={rules.header_row}
            onChange={(e) =>
              setRules({ ...rules, header_row: Number(e.target.value) })
            }
          />
        </label>
        <label>
          Date format
          <select
            value={rules.date_format}
            onChange={(e) =>
              setRules({
                ...rules,
                date_format: e.target.value as ImportRules["date_format"],
              })
            }
          >
            <option value="%Y-%m-%d">YYYY-MM-DD</option>
            <option value="%m/%d/%Y">MM/DD/YYYY</option>
            <option value="%d/%m/%Y">DD/MM/YYYY</option>
          </select>
        </label>
        <label>
          Number format
          <select
            value={rules.number_format}
            onChange={(e) =>
              setRules({
                ...rules,
                number_format: e.target.value as ImportRules["number_format"],
              })
            }
          >
            <option value="plain">1234.56 · no grouping</option>
            <option value="us">1,234.56</option>
            <option value="eu">1.234,56</option>
          </select>
        </label>
        <label>
          Monetary source unit
          <select
            value={rules.amount_unit}
            onChange={(e) =>
              setRules({
                ...rules,
                amount_unit: e.target.value as ImportRules["amount_unit"],
              })
            }
          >
            <option value="dollars">Dollars</option>
            <option value="cents">Cents — divide amounts by 100</option>
          </select>
        </label>
        <label>
          Upload original CSV
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void run(() => upload(file));
            }}
          />
        </label>
        <label>
          Resume a retained import
          <select
            value={review?.source.id || ""}
            onChange={(e) => {
              if (e.target.value)
                void run(async () =>
                  show(await api(`monthly/import-reviews/${e.target.value}`)),
                );
            }}
          >
            <option value="">Choose a source</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.filename} · {s.account} · revision {s.revision}
              </option>
            ))}
          </select>
        </label>
      </fieldset>
      {review && (
        <fieldset disabled={busy || disabled} className="import-details">
          <legend>2. Organize and resolve</legend>
          <button
            onClick={() =>
              void run(async () => {
                const original = await api(
                  `monthly/import-reviews/${review.source.id}/original`,
                );
                const bytes = Uint8Array.from(
                  atob(original.original_base64),
                  (c) => c.charCodeAt(0),
                );
                const url = URL.createObjectURL(
                  new Blob([bytes], { type: "text/csv" }),
                );
                const link = document.createElement("a");
                link.href = url;
                link.download = original.filename;
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              })
            }
          >
            Download unchanged original
          </button>
          <p>
            <strong>{review.source.filename}</strong> · {review.source.account}{" "}
            · {review.source.month} · revision {review.source.revision}
          </p>
          <label>
            Reuse reviewed rules
            <select
              defaultValue=""
              onChange={(e) => {
                const r = recipes.find((r) => r.id === e.target.value);
                if (!r) return;
                if (
                  r.account !== review.source.account ||
                  r.kind !== review.source.kind
                ) {
                  setError(
                    "Recipe belongs to a different source account or evidence type.",
                  );
                  return;
                }
                setRules(r.rules);
                setDecisions([]);
                setConfirmed("");
                setAccepted(false);
                setMessage(
                  r.schema_hash === review.profile.schema_hash
                    ? "Recipe staged. Review units, identifiers and this month's scope before confirming."
                    : "Source headers changed. Review and correct the recipe mappings before confirmation.",
                );
              }}
            >
              <option value="">Choose a company recipe</option>
              {recipes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · {r.account}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() =>
              setRules({
                ...rules,
                mapping: review.profile.suggested_mapping,
                constants: {},
              })
            }
          >
            Stage matching column names
          </button>
          <div
            className="import-table"
            tabIndex={0}
            aria-label="Column mapping"
          >
            <table>
              <thead>
                <tr>
                  <th>Calculation field</th>
                  <th>Source column</th>
                  <th>Explicit constant</th>
                </tr>
              </thead>
              <tbody>
                {review.profile.fields.map((f) => (
                  <tr key={f}>
                    <th scope="row">
                      {f}
                      {review.profile.missing_mapping.includes(f)
                        ? " · required"
                        : ""}
                    </th>
                    <td>
                      <select
                        aria-label={`Source column for ${f}`}
                        value={rules.mapping[f] || ""}
                        onChange={(e) => {
                          const mapping = { ...rules.mapping },
                            constants = { ...rules.constants };
                          if (e.target.value) {
                            mapping[f] = e.target.value;
                            delete constants[f];
                          } else delete mapping[f];
                          setRules({ ...rules, mapping, constants });
                        }}
                      >
                        <option value="">Not supplied</option>
                        {review.profile.headers.map((h) => (
                          <option key={h}>{h}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {[
                        "currency",
                        "provider",
                        "category",
                        "method",
                        "cost_source",
                      ].includes(f) && (
                        <input
                          aria-label={`Constant ${f}`}
                          maxLength={100}
                          value={rules.constants[f] || ""}
                          onChange={(e) => {
                            const constants = { ...rules.constants },
                              mapping = { ...rules.mapping };
                            if (e.target.value) {
                              constants[f] = e.target.value;
                              delete mapping[f];
                            } else delete constants[f];
                            setRules({ ...rules, mapping, constants });
                          }}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="import-metrics">
            {Object.entries(review.profile.counts).map(([k, v]) => (
              <div key={k}>
                <span>{k}</span>
                <strong>{v.toLocaleString()}</strong>
              </div>
            ))}
            <div>
              <span>Included monetary amount</span>
              <strong>{review.profile.controls.included}</strong>
            </div>
            <div>
              <span>Unknown source amounts</span>
              <strong>{review.profile.unknown_source_amount_rows}</strong>
            </div>
          </div>
          {dirty && (
            <p role="status">
              Changes are staged locally. Save and check them to update the
              preview and retain your work.
            </p>
          )}
          <ul>
            {Object.entries(review.profile.issues).map(([issue, count]) => (
              <li key={issue}>
                {issue}: {count} rows
              </li>
            ))}
          </ul>
          <div
            className="import-table"
            tabIndex={0}
            aria-label="Original and normalized source rows"
          >
            <table>
              <thead>
                <tr>
                  <th>Select</th>
                  <th>Source row</th>
                  <th>Original</th>
                  <th>Organized</th>
                  <th>Disposition / issues</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.row}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select source row ${r.row}`}
                        checked={selected.includes(r.row)}
                        onChange={(e) =>
                          setSelected((old) =>
                            e.target.checked
                              ? [...old, r.row]
                              : old.filter((n) => n !== r.row),
                          )
                        }
                      />
                    </td>
                    <th scope="row">{r.row}</th>
                    <td>
                      <pre>{JSON.stringify(r.source, null, 2)}</pre>
                    </td>
                    <td>
                      <pre>{JSON.stringify(r.normalized, null, 2)}</pre>
                    </td>
                    <td>
                      {r.disposition}
                      <br />
                      {r.issues.join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            onClick={() =>
              setSelected(
                rows
                  .filter((r) => r.disposition === "quarantined")
                  .map((r) => r.row),
              )
            }
          >
            Select exceptions on this page
          </button>
          {cursor !== null && (
            <button
              onClick={() =>
                void run(async () => {
                  const page = await api(
                    `monthly/import-reviews/${review.source.id}/rows?cursor=${cursor}`,
                  );
                  setRows(page.rows);
                  setCursor(page.next_cursor);
                  setSelected([]);
                })
              }
            >
              Next 50 source rows
            </button>
          )}
          <label>
            Explanation for selected rows
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
            />
          </label>
          <div className="monthly-actions">
            <button onClick={() => decide("exclude")}>
              Exclude with explanation
            </button>
            <button onClick={() => decide("structure")}>
              Mark subtotal / structure
            </button>
            <button onClick={() => decide("duplicate")}>
              Confirm duplicate
            </button>
            <button
              onClick={() =>
                setDecisions((old) =>
                  old.filter((d) => !selected.includes(d.row)),
                )
              }
            >
              Clear selected decisions
            </button>
          </div>
          <label>
            Resolve a repeated issue across the complete source
            <select
              value={issueGroup}
              onChange={(e) => setIssueGroup(e.target.value)}
            >
              <option value="">Choose exception group</option>
              {Object.entries(review.profile.issues).map(([issue, count]) => (
                <option key={issue} value={issue}>
                  {issue} · {count} rows
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={dirty || !issueGroup || reason.trim().length < 3}
            onClick={() =>
              void run(async () => {
                await show(
                  await api(
                    `monthly/import-reviews/${review.source.id}/revision`,
                    "PUT",
                    {
                      expected_revision: review.source.revision,
                      rules,
                      decisions,
                      bulk: [
                        {
                          issue: issueGroup,
                          expected_count: review.profile.issues[issueGroup],
                          action: "exclude",
                          reason,
                        },
                      ],
                    },
                  ),
                );
                setIssueGroup("");
                setMessage(
                  "Exception group excluded with its explanation. Review the retained amounts and limitations before confirmation.",
                );
              })
            }
          >
            Exclude all {review.profile.issues[issueGroup] || "matching"} group
            rows with explanation
          </button>
          <label>
            Correct a field
            <select
              value={amendField}
              onChange={(e) => setAmendField(e.target.value)}
            >
              <option value="">Choose field</option>
              {review.profile.fields
                .filter(
                  (f) =>
                    ![
                      "event_id",
                      "cost_id",
                      "revenue_id",
                      "customer_id",
                      "run_id",
                      "currency",
                    ].includes(f),
                )
                .map((f) => (
                  <option key={f}>{f}</option>
                ))}
            </select>
          </label>
          <label>
            Replacement source value
            <input
              value={amendValue}
              onChange={(e) => setAmendValue(e.target.value)}
              maxLength={2000}
            />
          </label>
          <button onClick={() => decide("amend")}>
            Stage correction for selected rows
          </button>
          <button
            className="primary"
            onClick={() =>
              void run(async () => {
                await show(
                  await api(
                    `monthly/import-reviews/${review.source.id}/revision`,
                    "PUT",
                    {
                      expected_revision: review.source.revision,
                      rules,
                      decisions,
                    },
                  ),
                );
                setMessage(
                  "Interpretation saved. Inspect the updated controls and remaining exceptions.",
                );
              })
            }
          >
            Save interpretation and check
          </button>
          <button
            onClick={() =>
              void run(async () =>
                show(await api(`monthly/import-reviews/${review.source.id}`)),
              )
            }
          >
            Reload saved review
          </button>
          <h3>3. Confirm this version</h3>
          <p>
            Approval covers the organized dataset, not its financial
            completeness or causal attribution. Review revenue basis and
            workload scope in Monthly Review.
          </p>
          <details>
            <summary>Controls and limitations</summary>
            <pre>
              {JSON.stringify(review.profile.controls_by_currency, null, 2)}
            </pre>
            <ul>
              {review.profile.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </details>
          <label>
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />{" "}
            I reviewed the period, source scope, exclusions, unknowns and
            limitations.
          </label>
          <button
            disabled={!accepted || dirty || !review.profile.ready}
            onClick={() =>
              void run(async () => {
                const c = await api(
                  `monthly/import-reviews/${review.source.id}/confirm`,
                  "POST",
                  {
                    expected_revision: review.source.revision,
                    canonical_hash: review.profile.canonical_hash,
                    accepted_limitations: true,
                  },
                );
                setConfirmed(c.id);
                setMessage(
                  `Dataset confirmed. Session elapsed: ${Math.round((Date.now() - started.current) / 60000)} minutes, including idle time; not a measured active-work benchmark.`,
                );
              })
            }
          >
            Use this reviewed dataset
          </button>
          {confirmed && !dirty && (
            <>
              <label>
                Assign to workload
                <select
                  value={workload}
                  onChange={(e) => setWorkload(e.target.value)}
                >
                  <option value="">Choose workload</option>
                  {workloads.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                disabled={!workload}
                onClick={() =>
                  void run(async () => {
                    await attach(confirmed, workload);
                    setMessage(
                      "Evidence assigned to the saved monthly draft. Review financial scope before calculating.",
                    );
                  })
                }
              >
                Assign approved evidence
              </button>
              <button
                onClick={() =>
                  void run(async () => {
                    const result = await api(
                      `monthly/import-reviews/${review.source.id}/export?confirmation_id=${confirmed}`,
                    );
                    download(
                      `inffyn-${month}-reviewed-evidence.json`,
                      JSON.stringify(result, null, 2),
                    );
                  })
                }
              >
                Download evidence package
              </button>
              <button
                onClick={() =>
                  void run(async () => {
                    const result = await api(
                      `monthly/import-reviews/${review.source.id}/export?confirmation_id=${confirmed}`,
                    );
                    download(
                      `inffyn-${month}-reviewed-spreadsheet.csv`,
                      result.spreadsheet_csv,
                      "text/csv;charset=utf-8",
                    );
                  })
                }
              >
                Download spreadsheet-safe CSV
              </button>
              <button
                onClick={() =>
                  void run(async () => {
                    await api("monthly/import-recipes", "POST", {
                      source_id: review.source.id,
                      expected_revision: review.source.revision,
                      name: `${review.source.account} ${review.source.kind}`.slice(
                        0,
                        100,
                      ),
                    });
                    setRecipes((await api("monthly/import-recipes")).recipes);
                    setMessage(
                      "Company recipe saved. Next month's source still requires review and confirmation.",
                    );
                  })
                }
              >
                Save recipe for next month
              </button>
            </>
          )}
        </fieldset>
      )}
    </section>
  );
}
