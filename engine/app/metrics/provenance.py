"""The single authority for provenance labels (Actual vs Modeled).

This is the ONE place that decides whether an emitted number is labeled
"Actual" or "Modeled(<method>)". No other module may construct an
"Actual"/"Modeled" label string — every emission path (feature axis, model
axis, per-customer) routes through `make_provenance`.

The rule: a number is "Actual" only when it is fully observed — real on every
axis it depends on (e.g. a direct revenue split, or exact revenue AND an actual
cost). Any modeled component — revenue OR cost — means "Modeled(<method>)",
never bare "Actual". The caller determines actuality for its own axes; the
label string is decided only here.
"""

from __future__ import annotations


def make_provenance(method: str, *, actual: bool) -> dict[str, str]:
    """Return the provenance tag `{method, label}` for an emitted number.

    Args:
        method: the computation method name (e.g. "direct", "even_split",
            "usage_weighted_token_share", "exact_customer_join").
        actual: the caller's determination that the number is real on every
            axis it depends on. True -> "Actual"; False -> "Modeled(<method>)".
    """
    return {"method": method, "label": "Actual" if actual else f"Modeled({method})"}
