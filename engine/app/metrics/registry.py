"""Metric registry (E4.1).

A metric is a pure definition: (name, inputs, compute_fn, output_shape). It
reads only from the canonical datasets named in `inputs` (plus reference
pricing), all carried on TenantData. Registering a new metric never touches
the run pipeline.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Callable

if TYPE_CHECKING:
    from app.metrics.data import TenantData

# Canonical inputs a metric is allowed to declare. The engine reads ONLY these
# normalized tables — never a raw source payload (Q7).
ALLOWED_INPUTS = frozenset(
    {"usage_events", "revenue_events", "cost_events", "reference_pricing"}
)

ComputeFn = Callable[["TenantData"], Any]


@dataclass(frozen=True)
class Metric:
    name: str
    inputs: tuple[str, ...]
    compute_fn: ComputeFn
    output_shape: str

    def __post_init__(self) -> None:
        bad = [i for i in self.inputs if i not in ALLOWED_INPUTS]
        if bad:
            raise ValueError(
                f"metric {self.name!r} declares non-canonical inputs: {bad}. "
                f"Allowed: {sorted(ALLOWED_INPUTS)}"
            )


@dataclass
class MetricRegistry:
    _metrics: dict[str, Metric] = field(default_factory=dict)

    def register(self, metric: Metric) -> Metric:
        if metric.name in self._metrics:
            raise ValueError(f"metric {metric.name!r} already registered")
        self._metrics[metric.name] = metric
        return metric

    def metric(
        self, name: str, inputs: tuple[str, ...], output_shape: str
    ) -> Callable[[ComputeFn], ComputeFn]:
        """Decorator form: register a compute_fn as a named metric."""

        def decorator(fn: ComputeFn) -> ComputeFn:
            self.register(Metric(name=name, inputs=inputs, compute_fn=fn, output_shape=output_shape))
            return fn

        return decorator

    def get(self, name: str) -> Metric:
        if name not in self._metrics:
            raise KeyError(f"unknown metric: {name!r}")
        return self._metrics[name]

    def names(self) -> list[str]:
        return sorted(self._metrics)

    def compute(self, name: str, data: "TenantData") -> Any:
        return self.get(name).compute_fn(data)

    def compute_all(self, data: "TenantData") -> dict[str, Any]:
        return {name: self._metrics[name].compute_fn(data) for name in self.names()}


registry = MetricRegistry()
