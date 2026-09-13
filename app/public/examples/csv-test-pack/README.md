# InfFyn CSV comparison pack

**All data is synthetic. August 2026. USD.** This is an invented company with $43,200 of included monthly costs across a revenue-producing research workload and an internal support workload. No customer data, credentials or provider exports appear here.

Start with **02-decent** if you want a realistic first attempt, then try **03-messy** and **04-very-messy**. Use **01-clean-control** to compare results. These four folders contain alternative representations of the **same month and economic records**; never add them together or assign one variant to a second workload in the same report.

| Folder | What makes it different | Expected behavior after selecting the documented mapping |
|---|---|---|
| 01-clean-control | Normalized headers, ISO dates, signed decimal dollars, legitimate credits and failed work | Ready for your review; no row corrections |
| 02-decent | Human-readable headers, UTF-8 BOM, Windows line endings, semicolons, US dates, grouped amounts **in cents**, ignored analyst notes | Ready after explicit format, unit and column mapping |
| 03-messy | Two preamble records, European dates/numbers **still denominated in USD**, inconsistent category/method labels, short dates, missing allocation explanation, overlapping duplicate, July record, subtotal and blank separator | Blocked until you correct or classify the relevant rows |
| 04-very-messy | All the structural problems above, US number/date format, dollar symbols, parentheses credits, blank/pending/NaN/malformed amounts, missing source, unrelated EUR appendix repeated twice | Blocked; requires documented source corrections and explained dispositions. EUR never becomes USD |
| 05-edge-cases | Eleven focused problem files, including broken quoting, missing IDs, unknown costs, mixed currencies, schema drift and an invalid outcome | Some reject the whole file, some quarantine rows, some parse but cannot support financial conclusions. See the answer key |

Each comparison folder contains `research-costs.csv`, `support-costs.csv` and `research-collections.csv`. The two outcome files are under `shared/`. Signed credits and refunds are valid economic records: keep them. The clean control includes imperfect business performance, rather than assuming all work succeeds.

## Try the workflow

1. Extract the ZIP. Use a **designated synthetic test company**, separate from company evidence. This pack changes no workspace by itself. The fixed demonstration is read-only; editable company imports require authenticated Monthly Review and enabled financial intake. Download availability does not mean that intake or hosted acceptance is complete.
2. Create the two workloads described in `reference/workloads.json`. Choose **Product** for research and **Internal** for support. Enter the stated outcome unit, acceptance definition and cost scope. The UUIDs in that file are offline test identifiers, not IDs to enter into your company.
3. Select **August 2026**. In preparation, choose cost basis **Other AI expenses / subscriptions** for both workloads. These files already include inference charges as expenses; leave Usage and Rates empty. Do not add reference ledger totals as extra costs.
4. In the reviewed CSV organizer, name the source account `SYNTHETIC Northstar CSV test ledger`. Choose **Costs** for each costs file and **Revenue** for research collections. Set delimiter/header/date/number/unit options below, then map the columns. The direct normalized CSV fields do not perform the organizer's cleanup.
5. Select **Save interpretation and check**. Inspect the source controls, quarantined records and before/after values. Use `answer-key/row-decisions.csv` for corrections, with the stated explanations. Row numbers are parsed **CSV record numbers**, including preamble/header records; they need not match a text editor's lines when quoted fields contain newlines.
6. Confirm the reviewed version and assign costs and collections to the matching workload. Assignment does not prove that scope is complete. Supply `shared/research-outcomes.csv` and `shared/support-outcomes.csv` through each workload's direct **Outcomes** CSV field; outcomes currently do not use the reviewed organizer.
7. Choose **Reviewed file** and **Collections** for research. Its $50,000 allocation minus a $2,000 refund is $48,000. This is a management allocation of collected cash, not recognized revenue, live Stripe verification or proof that AI caused the sales. Internal support has no revenue.
8. Compare to the synthetic controls below. Review the defined USD scope, cost basis, all 50 batches per workload and the acceptance method before marking checklists complete. After matching, calculate and save a report. Reopen it in a fresh session to test persistence when hosted intake is available.
9. For another variant, export your current evidence, then explicitly clear/replace the relevant evidence slots and re-review. Never add the variant on top of its original. Retain earlier reports; do not delete customer data for this exercise. Save/reload checks are manual hosted acceptance, not something these files automatically establish.

The `.review.json` files, `settings-reference.json`, `expected-results.json`, mapping answer key and control ledgers are **references**, not files to upload into financial inputs. The UI does not currently import a JSON recipe file; use its values in the interpretation controls.

## Format settings

| Setting | Clean control | Decent | Messy | Very messy |
|---|---|---|---|---|
| Delimiter | Comma | Semicolon | Semicolon | Semicolon |
| Header record | 1 | 1 | 3 | 3 |
| Date | YYYY-MM-DD | MM/DD/YYYY | DD/MM/YYYY | MM/DD/YYYY |
| Numbers | Plain | US grouping | European grouping | US grouping |
| Amount unit | Dollars | **Cents** | Dollars | Dollars |
| Currency | USD | USD | USD; no implied FX conversion | USD; EUR appendix kept separate |

`answer-key/column-mapping.csv` gives every source-to-target mapping. Mapping and number format apply to the whole file. If a row disagrees, review its source-backed correction rather than changing the global format until a misleading total looks right.

## Expected financial comparison

| Measure | Research product | Internal support |
|---|---:|---:|
| Inference before credit | $25,000 | $7,500 |
| Inference credit | ($500) | ($300) |
| Human review | $7,500 | $4,000 |
| Total included cost | **$32,000** | **$11,200** |
| Allocated collections net of refund | $48,000 | Not applicable |
| Contribution on included-cost / collections basis | $16,000 | Not applicable |
| Contribution percentage on that basis | 33.33% | Not applicable |
| Accepted batches / reviewed batches | 40 / 50 | 40 / 50 |
| Acceptance rate (batches) | 80% | 80% |
| Accepted business units | 4,000 briefs | 8,000 resolutions |
| Cost per accepted business unit | **$8.00** | **$1.40** |

Each workload has 101 genuine cost rows: two charges for each of 50 batches and one credit linked to an existing batch. All failed/rejected batch costs remain included. Five batches fail, five are rejected and 40 succeed. Accepted business units are distinct from batch counts.

All four corrected variants must reconcile to these figures. Raw parseable totals can be higher because of duplicates/subtotals, lower because of unreadable amounts, or split across currencies. `expected-results.json` records those actual engine controls before and after the supplied decisions. Control partitions must balance per currency:

`source parseable + amendments = included + quarantined + excluded + duplicate + structure`

Original unreadable-amount counts remain recorded even after a source-supported correction. The blank structural separator also contributes to that count. This count is not a count of unresolved charges. Do not hide it or interpret review readiness as full evidence coverage.

The very-messy corrections use the separately authored `reference/cost-control.csv` and `reference/collection-control.csv` as the exercise's source evidence. In real work, obtain the equivalent supporting evidence; never copy a guessed value just to match a control. Its EUR rows are explicitly an unrelated appendix. The **mixed-currencies edge case**, by contrast, includes an in-scope EUR charge and cannot honestly be called complete USD company spend by dropping that charge.

Evidence scores are checklist completion only. Even a full checklist in this authored exercise is not independent verification, a probability, a performance grade, proof of cash savings or provider acceptance. No token or GP-per-million metric can be inferred from these expense-only inputs.

## Edge-case answer key

| File in 05-edge-cases | Expected result and corrective action |
|---|---|
| duplicate-headers.csv | Reject: `headers`. Obtain an export with unique headers |
| broken-quoting.csv | Reject: `invalid_csv`. Re-export valid quoting |
| ragged-record.csv | Quarantine: `column_count`. Repair the extra cell at the source |
| missing-business-id.csv | Quarantine: `missing:cost_id`. Obtain its stable ID; IDs cannot be fabricated in the editor |
| unknown-amount.csv | Quarantine: `invalid:amount`; amount remains unknown. Obtain evidence; do not turn it into zero |
| mixed-currencies.csv | USD 500 included; EUR 275.25 quarantined separately. No automatic FX conversion |
| whitespace-business-id.csv | Quarantine: `identifier_whitespace_or_length:cost_id`. Resolve the source ID deliberately |
| harmless-formula-text.csv | Parser-ready arithmetic text `=1+1`; canonical export preserves it and spreadsheet-safe export escapes it. It is not a satisfactory evidence reference. There is no command or external link |
| changed-schema.csv | Saved mapping fails with `mapping`; review the new amount column. A fresh upload instead needs its missing mapping resolved |
| unpriced-usage.csv | Organizer can review structure; calculation has one unpriced row and withholds contribution and accepted-outcome cost. Use event cost basis and no invented rate; do not combine with the comparison expenses |
| failed-outcome-with-quantity.csv | Replace shared research outcomes with this file in the direct Outcomes input. Calculation rejects `invalid_outcome` because a failed batch claims accepted units |

Keep these exercises separate from the comparison scenarios. A useful failure is an explicit, correct refusal to calculate unsupported economics.

## Reproduce and inspect

From the repository root, using the installed engine environment:

```powershell
.\engine\.venv\Scripts\python.exe scripts/export-csv-test-pack.py
.\engine\.venv\Scripts\python.exe -m pytest engine/tests/test_csv_test_pack.py -q
```

The generator uses the actual reviewed-import and monthly economics engines. The tests pin expected totals independently, replay the public ZIP, check currency conservation, unknown costs, invalid files, exports and reproducibility. They use synthetic data and no database or provider calls. GitHub Actions runs them with the normal engine suite; passing them does not establish hosted login, retention, recovery, tenant isolation or customer value.
