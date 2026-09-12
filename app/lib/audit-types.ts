import type { TenantTier } from "@inffyn/types";

export type Provenance = { method: string; label: string };

export type FreeProjection = {
  spend_per_1m_by_model: Record<string, number | null>;
  headline_finding: string;
  flagged_count: number;
};

export type ModelGpp1m = {
  total_tokens: number;
  revenue_attributable: number;
  cost: number | null;
  cost_source: string;
  gross_profit: number | null;
  gpp1m: number | null;
  provenance: Provenance;
};

export type FeatureGpp1m = {
  allocated_revenue: number;
  cost: number;
  gross_profit: number;
  gpp1m: number | null;
  provenance: Provenance;
};

export type AllocationMethod = {
  allocation: Record<string, number>;
  by_feature: Record<string, FeatureGpp1m>;
  coverage_pct?: number;
};

export type SensitivityFeature = {
  allocation_by_method: Record<string, number>;
  gpp1m_by_method: Record<string, number | null>;
  rank_by_method: Record<string, number>;
  rank_range: number;
  stability_class: "stable" | "volatile";
};

export type CustomerProfit = {
  revenue: number;
  attributed_cost: number;
  profit: number;
  provenance: Provenance;
};

export type AuditResult = {
  generated_at: string;
  default_method: string;
  cost_by_model: {
    by_model: Record<
      string,
      { input_tokens: number; output_tokens: number; total_tokens: number; cost: number | null; cost_source: string }
    >;
    total_cost: number;
    unpriced_models: string[];
  };
  gpp1m_by_model: {
    by_model: Record<string, ModelGpp1m>;
    total_revenue: number;
    total_tokens: number;
  };
  per_customer_profit: {
    by_customer: Record<string, CustomerProfit>;
    coverage: {
      customers_matched: number;
      customers_revenue_only: number;
      customers_usage_only: number;
      revenue_matched_pct: number;
      usage_matched_pct: number;
    };
  };
  allocation: {
    features: string[];
    total_revenue: number;
    feature_tokens: Record<string, number>;
    feature_cost: Record<string, number>;
    methods: Record<string, AllocationMethod>;
  };
  sensitivity: {
    methods_compared: string[];
    per_feature: Record<string, SensitivityFeature>;
    volatile_features: string[];
    stable_features: string[];
    verdict: string;
  };
  methodology: string;
};

export type HistoryEntry = { id: string; created_at: string; default_method: string };

export type AuditResultResponse = {
  tier: TenantTier;
  paid: boolean;
  has_run: boolean;
  run_id?: string;
  created_at?: string;
  default_method?: string;
  free?: FreeProjection;
  result?: AuditResult;
  coverage?: Record<string, unknown>;
  history?: HistoryEntry[];
  error?: string;
};
