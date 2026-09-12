"""Independent regressions for preserving scope attestations during preparation."""

from copy import deepcopy

from app.company_demo import identity, scenario_input
from app.monthly.contract import DraftContent
from app.monthly.preparation import invalidate_draft


def test_removing_a_workload_requires_company_scope_review_again():
    body, _ = scenario_input(5)
    original = DraftContent.model_validate(
        body.model_dump(mode="json", exclude={"schema_version"})
    ).model_dump(mode="json")
    edited = deepcopy(original)
    edited["workloads"] = [
        item for item in edited["workloads"]
        if item["workload_id"] != identity("support")
    ]
    updated, _ = invalidate_draft(edited, original)
    # Removing $6,700 of included support costs must not inherit the previous
    # company-wide completeness attestation from the five-workload report.
    assert updated["company_scope_complete"] is False
    assert updated["step"] == "reconcile"
