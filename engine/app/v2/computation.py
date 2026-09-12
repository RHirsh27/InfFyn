"""One calculation path for saved workspaces and the stateless hosted review."""

import json
from fastapi import HTTPException
from .economics import AuditError, calculate, report, sensitivity


def compute(body):
    try:
        result = calculate(body)
        result["sensitivity"] = sensitivity(body, result)
        unstable = {
            item["feature"]
            for item in result["sensitivity"].get("features", [])
            if item["classification"] == "method-dependent"
        }
        for finding in result["findings"]:
            if (
                finding.get("dimension") == "feature"
                and finding.get("name") in unstable
            ):
                finding["detail"] = (
                    "Method-dependent finding: the conclusion changes materially across tested allocation methods. Confirm attribution before changing pricing or the product."
                )
        if (
            len(
                json.dumps(
                    {"result": result, "report": report(result)}, ensure_ascii=False
                ).encode("utf-8")
            )
            > 3_800_000
        ):
            raise AuditError(
                "result_too_large",
                "The audit evidence and result exceed the current export limit. Reduce the period or aggregate usage while preserving customer and workflow dimensions.",
            )
        return result
    except AuditError as error:
        raise HTTPException(422, {"code": error.code, "message": str(error)}) from None
