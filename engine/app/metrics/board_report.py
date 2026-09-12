"""Board Report — an honest, board-ready narrative of an AuditResult.

The whole point of this module: the honesty layer must SURVIVE the trip through the
LLM. An LLM writing prose will naturally smooth over uncertainty and state modeled
estimates as facts. That is exactly the failure mode InfFyn exists to prevent.

So the LLM is the WRITER, never the analyst:

  1. `build_findings()`  — deterministically extracts the findings from the AuditResult,
     CARRYING the existing provenance (Actual/Modeled) and sensitivity (stable/volatile)
     labels. It does not recompute or reinterpret them.
  2. `SYSTEM_PROMPT`     — strict rules: state Actual plainly, mark Modeled as estimates,
     hedge volatile conclusions, never invent numbers or causes.
  3. `validate_report()` — a deterministic post-generation guard that rejects any draft
     that fabricates a figure, states a modeled number as fact, or asserts a volatile
     conclusion as settled.
  4. `render_fallback()` — an honest, templated report built straight from the findings.
     It ships if the LLM is unavailable OR fails validation — so the report a user sees
     can never violate the honesty discipline, no matter what the model does.

No audit/allocation/provenance logic is changed here; this module only reads the result.
"""

from __future__ import annotations

import json
import re
from typing import Any

import httpx

# ── System prompt: the honesty contract the writer must obey ──────────────────
SYSTEM_PROMPT = """You are a financial writer for InfFyn. You turn PRE-COMPUTED, honesty-labeled audit findings into a short, board-ready report for a CFO. You are the writer, not the analyst — the analysis is already done and is authoritative. Your only job is to phrase the provided facts faithfully.

HARD RULES (a violation makes the report worthless):

1. USE ONLY THE PROVIDED FACTS. Never invent or infer numbers, features, customers, trends, percentages, or causes. If a figure or cause is not in the facts, it does not exist. Do not say "this is because…" unless the cause is given.

2. RESPECT EACH FIGURE'S BASIS.
   - basis = ACTUAL → you may state it plainly as fact.
       e.g. "Enterprise Search API earns $76.80 per 1M tokens."
   - basis = MODELED → you MUST mark it as an estimate in the words themselves. Use "estimated", "modeled", "roughly", or "~". Never present a MODELED figure as a hard fact.
       ALLOWED:   "Doc Summarization is estimated to earn ~$3.20 per 1M tokens (modeled)."
       FORBIDDEN: "Doc Summarization earns $3.20 per 1M tokens."

3. RESPECT EACH CONCLUSION'S STABILITY.
   - stability = STABLE → you may state it with confidence.
   - stability = VOLATILE → you MUST hedge. Say it depends on how shared revenue is allocated and could move.
       ALLOWED:   "Depending on how shared revenue is allocated, Free-tier Autocomplete may be underwater — worth investigating."
       FORBIDDEN: "Free-tier Autocomplete loses money."  (when it is VOLATILE)

4. RECOMMENDATIONS INHERIT CONFIDENCE. Be direct where the data is ACTUAL and STABLE ("reprice this"). Be tentative where it is MODELED or VOLATILE ("worth investigating", not "you are definitely losing money").

5. Do not restate a number with different precision. Copy figures as given.

6. REVENUE COVERAGE — the facts include coverage_state. This governs the whole framing:
   - "none" → NO revenue is connected. With no revenue, a "profit" number is just negative cost, so you MUST frame this as a COST-ONLY picture. Present cost per 1M tokens per feature (the cost_ranked facts — these are real). You may NOT use any profit/loss verdict word: no "underwater", "losing money", "loses money", "above water", "unprofitable", "below break-even". Do not say features make or lose money. Lead by stating no revenue is connected yet, and end by inviting them to connect Stripe (read-only) to see actual profit.
   - "partial" → profit is known only for the matched share. State that explicitly ("profit shown for the X% of revenue matched; the rest is cost-only") and do not extrapolate a whole-book verdict.
   - "full" → give the profit findings normally.

7. THE HEADLINE MUST MATCH THE FINDINGS. Never say "above water" when any feature is underwater, or "underwater" when none are. The opening line cannot contradict the data beneath it. When coverage_state is "none", the headline is about cost, never profit/loss.

Write in plain, calm, board-appropriate language. Structure: a one-line Headline, a short findings list, a "what's solid vs. uncertain" split (omit when cost-only), and Recommendations. Keep it under ~350 words. No preamble or sign-off."""


def _basis(label: str) -> str:
    # Carry the engine's provenance label through unchanged. Only "Actual" is actual;
    # every "Modeled (...)" label is modeled.
    return "ACTUAL" if label == "Actual" else "MODELED"


def build_findings(result: dict[str, Any]) -> dict[str, Any]:
    """Deterministically extract honesty-labeled findings from an AuditResult dict.
    Provenance and sensitivity are READ from the result, never recomputed."""
    methods = result.get("allocation", {}).get("methods", {})
    default = result.get("default_method")
    if default not in methods:
        default = next(iter(methods), None)
    by_feature = methods.get(default, {}).get("by_feature", {}) if default else {}
    volatile = set(result.get("sensitivity", {}).get("volatile_features", []))

    features: list[dict[str, Any]] = []
    for name in result.get("allocation", {}).get("features", []):
        cell = by_feature.get(name)
        if not cell or cell.get("gpp1m") is None:
            continue
        features.append(
            {
                "name": name,
                "gpp1m": round(cell["gpp1m"], 2),
                "basis": _basis((cell.get("provenance") or {}).get("label", "Modeled")),
                "stability": "VOLATILE" if name in volatile else "STABLE",
            }
        )
    features.sort(key=lambda f: f["gpp1m"], reverse=True)

    total_rev = result.get("gpp1m_by_model", {}).get("total_revenue", 0) or 0
    total_cost = result.get("cost_by_model", {}).get("total_cost", 0) or 0
    total_tokens = result.get("gpp1m_by_model", {}).get("total_tokens", 0) or 0
    blended = round((total_rev - total_cost) / total_tokens * 1e6, 2) if total_tokens else None

    # Real cost per 1M tokens per feature (independent of revenue) — used for the
    # cost-only framing when no revenue is connected. Carried from allocation, not recomputed.
    alloc = result.get("allocation", {})
    feat_cost = alloc.get("feature_cost", {}) or {}
    feat_tokens = alloc.get("feature_tokens", {}) or {}
    for f in features:
        tok = feat_tokens.get(f["name"]) or 0
        f["cost_per_1m"] = round((feat_cost.get(f["name"], 0.0) / tok) * 1e6, 2) if tok else None

    cov = result.get("per_customer_profit", {}).get("coverage", {})
    rev_pct_raw = cov.get("revenue_matched_pct", 0) or 0  # percent, 0–100 (0 when no revenue)
    customers = cov.get("customers_matched", 0) or 0

    # Coverage state drives the whole framing. With no matched revenue, a "profit"
    # figure is just negative cost — we must NOT present it as a profit/loss verdict.
    if customers == 0 or rev_pct_raw < 1.0:
        coverage_state = "none"
    elif rev_pct_raw >= 80.0:
        coverage_state = "full"
    else:
        coverage_state = "partial"

    underwater = [f for f in features if f["gpp1m"] < 0]
    underwater_stable = all(f["stability"] == "STABLE" for f in underwater)
    best = features[0] if features else None
    worst = features[-1] if features else None
    # Cost ranking for the cost-only framing (most expensive first).
    by_cost = sorted(
        [f for f in features if f.get("cost_per_1m") is not None],
        key=lambda f: f["cost_per_1m"],
        reverse=True,
    )

    recs: list[dict[str, str]] = []
    if coverage_state == "none":
        # Cost/efficiency recommendations only — NO profit/loss language.
        if by_cost:
            top = by_cost[0]
            recs.append(
                {
                    "confidence": "confident",
                    "text": f"Your most token-expensive feature is {top['name']} at ${top['cost_per_1m']:.2f} per 1M tokens — confirm it earns enough to justify that spend.",
                }
            )
        recs.append(
            {
                "confidence": "confident",
                "text": "Connect Stripe (read-only) to turn this cost view into an actual profit view — which features and customers make money, and which don't.",
            }
        )
    else:
        # Deterministic profit recommendations, each carrying the confidence its basis warrants.
        for f in underwater:
            if f["basis"] == "ACTUAL" and f["stability"] == "STABLE":
                recs.append(
                    {
                        "confidence": "confident",
                        "text": f"{f['name']} runs at a loss of ${abs(f['gpp1m']):.2f} per 1M tokens on observed data — reprice, cap, or restrict it.",
                    }
                )
            else:
                why = "modeled" if f["basis"] == "MODELED" else "method-dependent"
                recs.append(
                    {
                        "confidence": "hedged",
                        "text": f"{f['name']} may be running underwater (estimated ${abs(f['gpp1m']):.2f} per 1M tokens, {why}) — worth investigating before acting.",
                    }
                )
        if best and best["gpp1m"] > 0 and best["basis"] == "ACTUAL" and best["stability"] == "STABLE":
            recs.append(
                {
                    "confidence": "confident",
                    "text": f"{best['name']} is your strongest margin driver at ${best['gpp1m']:.2f} per 1M tokens (observed) — protect and expand it.",
                }
            )

    allowed: set[str] = {f"{abs(f['gpp1m']):.2f}" for f in features}
    allowed |= {f"{f['cost_per_1m']:.2f}" for f in features if f.get("cost_per_1m") is not None}
    if blended is not None:
        allowed.add(f"{abs(blended):.2f}")

    return {
        "default_method": default,
        "coverage_state": coverage_state,
        "blended_margin_per_1m": {"value": blended, "basis": "ACTUAL", "stability": "STABLE"},
        "revenue_matched_pct": round(rev_pct_raw),
        "customers_matched": customers,
        "feature_count": len(features),
        "underwater_count": len(underwater),
        "underwater_stable": underwater_stable,
        "best": best,
        "worst": worst,
        "features": features,
        "cost_ranked": [{"name": f["name"], "cost_per_1m": f["cost_per_1m"]} for f in by_cost],
        "recommendations": recs,
        "_allowed_numbers": sorted(allowed),
    }


def build_user_payload(facts: dict[str, Any]) -> str:
    slim = {k: v for k, v in facts.items() if not k.startswith("_")}
    return (
        "Render these pre-computed, honesty-labeled audit findings into a board report. "
        "Use ONLY these facts and figures, and follow every rule in the system prompt "
        "(ACTUAL plainly, MODELED as estimates, VOLATILE hedged, invent nothing).\n\n"
        + json.dumps(slim, indent=2)
    )


# ── Deterministic honest renderer (fallback + honesty ground truth) ───────────
def _phrase(f: dict[str, Any]) -> str:
    v = f["gpp1m"]
    amt = f"${abs(v):.2f} per 1M tokens"
    verb = "lose" if v < 0 else "earn"
    if f["basis"] == "MODELED":
        return f"is estimated to {verb} ~{amt} (modeled)"
    return f"{verb}s {amt}"


def _render_cost_only(facts: dict[str, Any]) -> str:
    """Coverage = none: NO revenue connected. Frame as cost-only. Never profit/loss."""
    lines: list[str] = ["## Board report — cost per 1M tokens", ""]
    ranked = facts["cost_ranked"]
    top = ranked[0] if ranked else None
    lead = (
        f" Your most token-expensive feature is {top['name']} at ${top['cost_per_1m']:.2f} per 1M tokens."
        if top
        else ""
    )
    lines.append(
        "**No revenue is connected yet, so this reflects cost only — not profit.** "
        "We can't show profit or loss per feature until your revenue is connected." + lead
    )

    lines += ["", "### Cost per 1M tokens, by feature"]
    for f in ranked:
        lines.append(f"- {f['name']}: ${f['cost_per_1m']:.2f} per 1M tokens.")

    lines += [
        "",
        "### What this shows",
        "This is your cost and efficiency picture — real, observed spend per feature. It is not a profit or loss verdict; that requires your revenue.",
    ]

    lines += ["", "### Recommendations"]
    for r in facts["recommendations"]:
        lines.append(f"- {r['text']}")

    lines += ["", "*Cost uses reference pricing. Connect Stripe (read-only) to see profit per feature and per customer.*"]
    return "\n".join(lines)


def render_fallback(facts: dict[str, Any]) -> str:
    if facts.get("coverage_state") == "none":
        return _render_cost_only(facts)

    lines: list[str] = ["## Board report — profit per 1M tokens", ""]

    best, worst = facts["best"], facts["worst"]
    bl = facts["blended_margin_per_1m"]["value"]
    uw = facts["underwater_count"]
    n = facts["feature_count"]

    # Headline MUST match the findings. "Above water" only when nothing is underwater.
    if best and worst and best["gpp1m"] > 0 and worst["gpp1m"] < 0:
        hedge = " (method-dependent — see below)" if worst["stability"] == "VOLATILE" else ""
        lines.append(
            f"**Headline.** {best['name']} {_phrase(best)}, while {worst['name']} {_phrase(worst)}{hedge}. "
            f"{uw} of {n} features are underwater."
        )
    elif uw == 0 and best and best["gpp1m"] > 0:
        lines.append(f"**Headline.** All {n} features are above water; {best['name']} leads ({_phrase(best)}).")
    elif uw == n and n > 0:
        lines.append(f"**Headline.** All {n} features are underwater — every one is below break-even on the current split.")
    else:
        lines.append(f"**Headline.** {uw} of {n} features are underwater.")

    if bl is not None:
        cov_note = "" if facts["coverage_state"] == "full" else " Profit is shown only for the matched share; the rest is cost-only."
        lines.append("")
        lines.append(
            f"Blended margin across all features is ${bl:.2f} per 1M tokens, with revenue matched to Stripe for "
            f"{facts['revenue_matched_pct']}% of your book ({facts['customers_matched']} customers).{cov_note}"
        )

    lines += ["", "### Key findings"]
    for f in facts["features"]:
        tag = "Actual" if f["basis"] == "ACTUAL" else "modeled estimate"
        stab = "stable across methods" if f["stability"] == "STABLE" else "method-dependent"
        bullet = f"- {f['name']} {_phrase(f)}. ({tag} · {stab}.)"
        if f["stability"] == "VOLATILE":
            bullet += " Depending on how shared revenue is allocated, this figure could move materially — treat it as directional, not settled."
        lines.append(bullet)

    solid = [f["name"] for f in facts["features"] if f["basis"] == "ACTUAL" and f["stability"] == "STABLE"]
    soft = [f["name"] for f in facts["features"] if f["basis"] != "ACTUAL" or f["stability"] != "STABLE"]
    lines += ["", "### What's solid vs. what's uncertain"]
    lines.append(f"Solid (observed and stable): {', '.join(solid) if solid else 'none yet'}.")
    lines.append(f"Directional (modeled or method-dependent — treat as estimates): {', '.join(soft) if soft else 'none'}.")

    lines += ["", "### Recommendations"]
    for r in facts["recommendations"]:
        lines.append(f"- {r['text']}")
    if not facts["recommendations"]:
        lines.append("- No action indicated by the current data.")

    lines += [
        "",
        "*Figures marked (modeled) are estimates from how shared revenue is allocated; cost uses reference pricing. Volatile figures move depending on the allocation method.*",
    ]
    return "\n".join(lines)


# ── Post-generation validator: reject any draft that breaks the discipline ────
_TWO_DEC = re.compile(r"\$?\s*(\d[\d,]*\.\d{2})")
_ESTIMATE = re.compile(r"(estimat|modeled|~|approx|roughly|about|may\b|could\b|depend)", re.I)
_HEDGE = re.compile(r"(depend|range|method-dependent|investigat|may\b|could\b|uncertain|directional|not settled)", re.I)
_ABOVE_WATER = re.compile(r"above water", re.I)
# Profit/loss VERDICT language — forbidden when there is no revenue to back it.
_PROFIT_VERDICT = re.compile(
    r"(underwater|losing money|loses money|\blose[s]? money\b|above water|in the red|unprofitable|\bprofitable\b|below break-even)",
    re.I,
)


def validate_report(text: str, facts: dict[str, Any]) -> list[str]:
    """Return a list of honesty violations. Empty list = the draft is safe to ship."""
    violations: list[str] = []
    allowed = set(facts["_allowed_numbers"])

    # 0a. The headline/summary must not contradict the findings: never "above water"
    #     while any feature is underwater.
    if facts.get("underwater_count", 0) > 0 and _ABOVE_WATER.search(text):
        violations.append("claims 'above water' while features are underwater (headline contradicts findings)")

    # 0b. No profit/loss verdict language when there is no revenue connected. Cost-only
    #     is not a profit/loss verdict — "underwater"/"above water"/"losing money" are.
    if facts.get("coverage_state") == "none":
        m = _PROFIT_VERDICT.search(text)
        if m:
            violations.append(
                f"profit/loss verdict language ('{m.group(0)}') used with zero revenue coverage — this is cost-only"
            )

    # 1. No fabricated dollar figures — every 2-decimal number must be a real audit figure.
    for raw in _TWO_DEC.findall(text):
        norm = raw.replace(",", "")
        if norm not in allowed:
            violations.append(f"fabricated figure ${norm} (not in the audit's numbers)")

    # Rules 2 & 3 apply only when a PROFIT figure is being claimed. In the cost-only
    # (coverage="none") framing there is no profit claim — the figures are real cost —
    # so the modeled/volatile-profit checks don't apply (rule 0b governs there instead).
    if facts.get("coverage_state") != "none":
        # 2. Modeled figures must never appear as bare facts.
        for f in facts["features"]:
            if f["basis"] != "MODELED":
                continue
            key = f"{abs(f['gpp1m']):.2f}"
            for mo in re.finditer(re.escape(key), text):
                window = text[max(0, mo.start() - 90) : mo.end() + 90]
                if not _ESTIMATE.search(window):
                    violations.append(f"modeled figure {f['name']} (${key}) stated without an estimate marker")
                    break

        # 3. Volatile conclusions must be hedged wherever the figure is asserted. Keyed
        #    off the figure (a concrete claim), not a bare name mention.
        for f in facts["features"]:
            if f["stability"] != "VOLATILE":
                continue
            key = f"{abs(f['gpp1m']):.2f}"
            for mo in re.finditer(re.escape(key), text):
                window = text[max(0, mo.start() - 90) : mo.end() + 120]
                if not _HEDGE.search(window):
                    violations.append(f"volatile conclusion for {f['name']} (${key}) stated without hedging")
                    break

    return violations


def _call_anthropic(system: str, user: str, api_key: str, model: str, max_tokens: int = 1400) -> str:
    resp = httpx.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": model,
            "max_tokens": max_tokens,
            "system": system,
            "messages": [{"role": "user", "content": user}],
        },
        timeout=60.0,
    )
    resp.raise_for_status()
    data = resp.json()
    return "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text").strip()


def generate_board_report(result: dict[str, Any], api_key: str | None, model: str) -> dict[str, Any]:
    """Produce an honest board report. The deterministic fallback is the safety net:
    if the LLM is unconfigured, errors, or fails the honesty validator, the user gets
    the verified baseline report instead of a draft that might lie."""
    facts = build_findings(result)
    fallback = render_fallback(facts)

    if not api_key:
        return {"report": fallback, "source": "baseline", "notice": "AI writer not configured — showing the verified baseline report."}

    try:
        draft = _call_anthropic(SYSTEM_PROMPT, build_user_payload(facts), api_key, model)
    except Exception:
        return {"report": fallback, "source": "baseline", "notice": "The AI writer was unavailable — showing the verified baseline report (same figures, same honesty rules)."}

    violations = validate_report(draft, facts)
    if violations:
        # The draft broke the discipline — never ship it. The baseline is honest by construction.
        return {"report": fallback, "source": "baseline", "notice": "The AI draft failed the honesty check, so we're showing the verified baseline report."}

    return {"report": draft, "source": "ai", "notice": None}
