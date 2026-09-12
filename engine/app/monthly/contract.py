from calendar import monthrange
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, SecretStr, model_validator

from app.v2.contract import AuditInput


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Workload(Strict):
    name: str = Field(min_length=1, max_length=100)
    kind: Literal["product", "internal"]
    purpose: str = Field(default="", max_length=1000)
    responsible_team: str = Field(default="", max_length=100)
    outcome_unit: str = Field(default="", max_length=100)
    cost_scope: str = Field(min_length=3, max_length=1000)
    acceptance_definition: str = Field(default="", max_length=1000)
    unallocated: bool = False
    # Exact provider project/workspace identifiers. These are not API secrets.
    mappings: dict[str, list[str]] = Field(default_factory=dict)

    @model_validator(mode="after")
    def mapping_limits(self):
        if set(self.mappings) - {"openai", "anthropic"} or any(
            len(v) > 100 or any(not x or len(x) > 200 for x in v)
            for v in self.mappings.values()
        ):
            raise ValueError("Use at most 100 exact project identifiers per provider.")
        return self


class MonthlyAudit(AuditInput):
    usage_csv: str = Field(default="", max_length=4_000_000)
    # Aggregate provider charges have no invented request or token denominator.
    cost_basis: Literal["events", "provider_totals", "expenses"] = "events"


class Review(Strict):
    source_note: str = Field(default="", max_length=1000)
    method_reviewed: bool = False
    revenue_scope_complete: bool = False
    outcome_method_reviewed: bool = False
    control_cost: Decimal | None = Field(
        default=None, allow_inf_nan=False, max_digits=26, decimal_places=8
    )
    control_source: str = Field(default="", max_length=1000)
    control_revenue: Decimal | None = Field(
        default=None, allow_inf_nan=False, max_digits=26, decimal_places=8
    )
    revenue_control_source: str = Field(default="", max_length=1000)
    expected_runs: int | None = Field(default=None, ge=0, le=100_000_000)


class WorkloadEvidence(Strict):
    workload_id: UUID
    audit: MonthlyAudit
    review: Review = Field(default_factory=Review)
    import_ids: list[UUID] = Field(default_factory=list, max_length=20)
    reviewed_imports: dict[Literal["usage_csv", "costs_csv", "revenue_csv"], UUID] = Field(default_factory=dict, max_length=3)


class InvoicePortion(Strict):
    workload_id: UUID
    amount: Decimal = Field(gt=0, allow_inf_nan=False, max_digits=20, decimal_places=2)
    explanation: str = Field(min_length=3, max_length=1000)


class InvoiceAllocation(Strict):
    import_id: UUID
    revenue_id: str = Field(min_length=1, max_length=200)
    allocations: list[InvoicePortion] = Field(default_factory=list, max_length=30)
    reviewed: bool = False


class CostAssignment(Strict):
    provider: Literal["openai", "anthropic"]
    project_id: str = Field(max_length=200)
    workload_id: UUID


class Preparation(Strict):
    month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    import_ids: list[UUID] = Field(default_factory=list, max_length=20)
    cost_assignments: list[CostAssignment] = Field(default_factory=list, max_length=200)
    invoice_allocations: list[InvoiceAllocation] = Field(
        default_factory=list, max_length=2000
    )

    @model_validator(mode="after")
    def current_or_historical_month(self):
        if date.fromisoformat(self.month + "-01") > datetime.now(UTC).date().replace(
            day=1
        ):
            raise ValueError("Choose the current month or a historical month.")
        return self


class MonthlyInput(Strict):
    schema_version: Literal["monthly-1.0"] = "monthly-1.0"
    month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    company_scope_complete: bool = False
    workloads: list[WorkloadEvidence] = Field(min_length=1, max_length=30)
    import_ids: list[UUID] = Field(default_factory=list, max_length=20)
    invoice_allocations: list[InvoiceAllocation] = Field(
        default_factory=list, max_length=2000
    )
    cost_assignments: list[CostAssignment] = Field(default_factory=list, max_length=200)

    @model_validator(mode="after")
    def validate_month(self):
        start = date.fromisoformat(self.month + "-01")
        end = date(start.year, start.month, monthrange(start.year, start.month)[1])
        if start > datetime.now(UTC).date().replace(day=1):
            raise ValueError("Future reporting months are not supported.")
        if len({x.workload_id for x in self.workloads}) != len(self.workloads):
            raise ValueError("Include each workload once per report.")
        for item in self.workloads:
            if item.audit.period_start != start or item.audit.period_end != end:
                raise ValueError(
                    "Each workload must cover the selected calendar month."
                )
            if item.audit.cost_basis != "events" and item.audit.usage_csv.strip():
                raise ValueError(
                    "Aggregate provider totals or expenses cannot also add event costs. Choose one cost basis."
                )
        return self


class DraftAudit(MonthlyAudit):
    # A durable draft may contain unreviewed revenue. Final calculation still uses
    # MonthlyAudit and requires the completed review and reporting basis.
    @model_validator(mode="after")
    def validate_period(self):
        return self


class DraftWorkloadEvidence(WorkloadEvidence):
    audit: DraftAudit


class DraftInvoicePortion(Strict):
    workload_id: UUID | Literal[""] = ""
    amount: str = Field(default="", max_length=100)
    explanation: str = Field(default="", max_length=1000)


class DraftInvoiceAllocation(Strict):
    import_id: UUID
    revenue_id: str = Field(min_length=1, max_length=200)
    allocations: list[DraftInvoicePortion] = Field(default_factory=list, max_length=30)
    reviewed: bool = False


class DraftContent(Preparation):
    company_scope_complete: bool = False
    workloads: list[DraftWorkloadEvidence] = Field(default_factory=list, max_length=30)
    invoice_allocations: list[DraftInvoiceAllocation] = Field(
        default_factory=list, max_length=2000
    )
    step: Literal["import", "assign", "reconcile", "review", "save"] = "import"


class DraftWrite(Strict):
    expected_revision: int = Field(ge=0)
    content: DraftContent


class Selection(Strict):
    report_id: UUID
    expected_report_id: UUID | None = None
    reason: str = Field(min_length=3, max_length=500)


class Adoption(Strict):
    audit_id: UUID
    workload_id: UUID


class Credential(Strict):
    credential: SecretStr = Field(min_length=20, max_length=512)
    label: str = Field(min_length=1, max_length=100)


class ImportRequest(Strict):
    month: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    request_id: UUID

    @model_validator(mode="after")
    def month_range(self):
        if date.fromisoformat(self.month + "-01") > datetime.now(UTC).date().replace(
            day=1
        ):
            raise ValueError("Choose the current month or a historical month.")
        return self
