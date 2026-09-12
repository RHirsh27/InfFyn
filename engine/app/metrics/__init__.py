"""E4 metrics engine.

A registry of metrics that read ONLY from canonical event tables + reference
pricing (never a raw CSV or Stripe payload). Adding a metric is a definition,
not a pipeline change. Everything is tenant-scoped via the loaded TenantData.
"""

from app.metrics.data import TenantData, load_tenant_data
from app.metrics.registry import Metric, MetricRegistry, registry

# Importing definitions registers all v1 metrics as a side effect.
from app.metrics import definitions as _definitions  # noqa: E402,F401

__all__ = [
    "TenantData",
    "load_tenant_data",
    "Metric",
    "MetricRegistry",
    "registry",
]
