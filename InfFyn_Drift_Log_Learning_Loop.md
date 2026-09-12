# InfFyn — Drift Log & Learning Loop

*The mechanism that makes the guardrails COMPOUND. Every time Cursor (or any executor)
produces something wrong, drifted, or off-scope, it gets logged here and converted into a
permanent rule in `.cursorrules`. Quality improves over time instead of decaying. This is
the same instinct that already turned the 0010 migration drift into the "db push only"
rule — now formalized.*

---

## HOW THE LOOP WORKS

1. **Something goes wrong** — Cursor edits outside scope, rewrites working code, claims
   "done" without verifying, misstates a literal, breaks a convention, drifts on honesty,
   etc.
2. **Log it below** — one line: what happened, what the correct behavior was.
3. **Ask the key question:** *"What rule, had it existed, would have prevented this?"*
4. **Add that rule to `.cursorrules`** (or sharpen an existing one).
5. **Note the rule added**, so the log shows the fix landed.

Result: every miss becomes a permanent guardrail. The ruleset gets stronger every week.

**Review cadence:** skim this weekly. Patterns of repeated misses = a rule that's too weak
or missing. If the same category recurs, the rule needs to be more forceful or more specific.

---

## WHAT COUNTS AS "DRIFT" (log any of these)

- **Scope violation** — touched/changed a file or code outside the named scope.
- **Unrequested rewrite** — refactored/"improved"/"cleaned up" working code not in scope.
- **Scope creep** — added a feature/behavior not asked for.
- **False done** — claimed done/verified on something only compiled, not actually run/live.
- **Ungrounded literal** — used a column/enum/ID/header from memory or index instead of
  the real file, and got it wrong.
- **Honesty breach** — presented modeled as fact, volatile as settled, fabricated a
  number/cause, or any generated text that violated the provenance discipline.
- **Security/isolation slip** — weakened RLS/tenant-scoping, put a secret in the app,
  touched RelayHitch, or acted on the wrong Supabase ref.
- **Migration slip** — loose ALTER, applied outside `db push`, rollback that doesn't reverse.
- **Convention drift** — broke a naming/structure/style convention over a long session.

---

## THE LOG

*Format: `[DATE] — WHAT WENT WRONG → CORRECT BEHAVIOR → RULE ADDED/SHARPENED`*

### Seed entries (lessons already learned this project — the loop's starting state)

- **[pre-switch] Migration applied outside the flow (0010 drift)** → a migration reached
  the DB without a repo file, causing drift. → Correct: apply ONLY via `supabase db push`,
  numbered + rollback, repo is source of truth. → **Rule:** in `.cursorrules` "MIGRATIONS"
  section (db push only, MCP read-only).

- **[pre-switch] Rollback duplicated the forward SQL (0010)** → the `.down.sql` repeated
  the migration instead of reversing it. → Correct: rollback must actually reverse. →
  **Rule:** `.cursorrules` "the rollback must ACTUALLY REVERSE the migration."

- **[pre-switch] Sandbox claimed build errors / screenshots that were artifacts** → the
  executor's environment truncated files, so "build failed" and screenshots were
  unreliable. → Correct: verify on the real repo / live app, never trust the executor's
  own success claim. → **Rule:** `.cursorrules` "DONENESS CHAIN" + Phase 3 verify.

- **[pre-switch] "I believe it's covered" (grain/substrate) was wrong** → an assumption
  about schema support didn't hold against the actual schema. → Correct: verify every
  literal against the real file, cite file:line. → **Rule:** `.cursorrules` "Phase 1 —
  ground every literal against the ACTUAL current file."

- **[pre-switch] Board Report headline contradicted its findings** ("above water" over
  underwater features) → generated text stated something the data contradicted. →
  Correct: generated output must be consistent with and validated against the data. →
  **Rule:** `.cursorrules` "HONESTY DISCIPLINE" (a beautiful output that lies is a failed
  build).

### New entries (add as they happen)

- [DATE] — [what went wrong] → [correct behavior] → [rule added/sharpened]
-
-

---

## WHEN A RULE IS ADDED

Keep `.cursorrules` the single home for executor rules. When you add one from this log:
- Put it in the right section (scope / workflow / honesty / migration / security / stack).
- Make it specific and forceful — a vague rule doesn't prevent drift.
- If it's a repeat offense, make it MORE prominent (move up, bold, add an example of the
  wrong behavior so the executor sees exactly what NOT to do).

*The goal: the executor gets more disciplined every week, and when you migrate from Cursor
to Claude Code later, the same `.cursorrules` + this log carry all the hard-won discipline
across with zero loss.*
