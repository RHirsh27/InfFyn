# InfFyn — Cursor Build-Prompt Template

*This is the structure for every build prompt handed to Cursor. Blueprint (the strategy
partner) writes the prompt from locked decisions + grounded literals; Ryan pastes it into
Cursor. The `.cursorrules` file enforces the discipline; this template ensures every task
is well-formed. Fill each section. Delete guidance in brackets.*

---

## TASK: [one-line what this build does]

**Priority / why now:** [what this unblocks, or why it's the current task]

**Is this on the critical path or polish?** [so Cursor knows how careful to be]

---

## PHASE 1 — AUDIT FIRST (read-only, no edits)

Before editing, investigate and report:
- [What to read: which files, schema, types, existing behavior]
- Ground these exact literals against the real files (cite file:line):
  [list the columns / enums / IDs / CSV headers / provenance labels / component names
  this task depends on]
- Report what you found and what you propose to change — scoped to below — BEFORE editing.

---

## SCOPE (the contract — touch ONLY this)

**Files/areas in scope:**
- [exact files or components to change]

**Explicitly OUT of scope (do NOT touch):**
- [name the things nearby that must stay untouched — engine logic, provenance,
  other components, working code]

**What to build:**
- [precise description of the change]

**What's REAL vs PLACEHOLDER:**
- Real: [what must be wired to actual data/logic]
- Placeholder: [what's intentionally a stub/locked/coming-soon — do NOT make it real]

---

## CONSTRAINTS (task-specific, on top of .cursorrules)

- [e.g. presentation only — no engine/logic changes]
- [e.g. preserve provenance logic / semantic color / honesty lines]
- [e.g. tenant-scoped, RLS preserved]
- [e.g. secrets engine-only]
- Smallest diff. No scope creep. No refactoring unrequested things.

---

## OUTPUT REQUIRED

1. The audit (Phase 1) — what you found, file:line, proposed changes — before edits.
2. The changes — exactly which files, the diff/what changed.
3. Real vs placeholder confirmation.
4. Verification — what you checked; what still needs LIVE confirmation by Ryan
   (build-green/compile is NOT verification).
5. Confirmations — scope respected, nothing else touched, [honesty/security/migration]
   rules intact as applicable.

---

## ACCEPTANCE CRITERIA (how we know it's right)

- [specific, checkable outcomes — e.g. "the X shows Y", "test Z passes", "no change to W"]

---

*Reminder baked into .cursorrules but worth restating per task: audit before editing,
touch only the named scope, never rewrite what works, verify honestly at the end, and if
something outside scope needs changing — STOP and say so, don't act on it.*
