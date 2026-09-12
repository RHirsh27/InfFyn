from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class AuditInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schema_version: Literal["2.0"] = "2.0"
    title: str = Field(default="Monthly AI economics", min_length=1, max_length=120)
    kind: Literal["product", "internal"]
    period_start: date
    period_end: date
    currency: Literal["USD"] = "USD"
    usage_csv: str = Field(min_length=1, max_length=4_000_000)
    costs_csv: str = Field(default="", max_length=1_000_000)
    rates_csv: str = Field(default="", max_length=500_000)
    revenue_csv: str = Field(default="", max_length=1_000_000)
    outcomes_csv: str = Field(default="", max_length=1_000_000)
    revenue_source: Literal["none", "reviewed_file", "stripe_reviewed"] = "none"
    revenue_basis: Literal["unavailable", "recognized", "collections"] = "unavailable"
    revenue_reviewed: bool = False
    cost_scope_complete: bool = False
    outcome_cohort_complete: bool = False
    feature_allocation: Literal["none", "requests", "equal"] = "none"

    @model_validator(mode="after")
    def validate_period(self):
        if (
            self.period_end < self.period_start
            or (self.period_end - self.period_start).days > 366
        ):
            raise ValueError("Choose an inclusive period of at most 367 days.")
        if self.kind == "internal" and (
            self.revenue_csv.strip() or self.revenue_source != "none"
        ):
            raise ValueError("Internal workflow audits do not use revenue.")
        if self.revenue_csv.strip() and (
            not self.revenue_reviewed
            or self.revenue_source == "none"
            or self.revenue_basis == "unavailable"
        ):
            raise ValueError(
                "Review the revenue period, source and basis before calculating."
            )
        return self
