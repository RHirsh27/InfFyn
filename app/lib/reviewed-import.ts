export const reviewedImportPaths: Record<string, RegExp> = {
  GET: /^monthly\/(import-reviews(?:\/[0-9a-f-]+(?:\/rows|\/export|\/original)?)?|import-recipes)$/,
  POST: /^monthly\/(import-reviews(?:\/[0-9a-f-]+\/confirm)?|import-recipes|drafts\/\d{4}-(?:0[1-9]|1[0-2])\/attach-reviewed-import)$/,
  PUT: /^monthly\/import-reviews\/[0-9a-f-]+\/revision$/,
};
export type ImportRules = {
  delimiter: "," | ";" | "\t";
  header_row: number;
  mapping: Record<string, string>;
  constants: Record<string, string>;
  date_format: "%Y-%m-%d" | "%m/%d/%Y" | "%d/%m/%Y";
  number_format: "plain" | "us" | "eu";
  amount_unit: "dollars" | "cents";
};
export const defaultRules = (): ImportRules => ({
  delimiter: ",",
  header_row: 1,
  mapping: {},
  constants: {},
  date_format: "%Y-%m-%d",
  number_format: "plain",
  amount_unit: "dollars",
});
export type ImportDecision = {
  row: number;
  action: "exclude" | "duplicate" | "structure" | "amend";
  reason: string;
  field: string;
  value: string;
};
export type ImportSource = {
  id: string;
  revision: number;
  filename: string;
  kind: "usage_csv" | "costs_csv" | "revenue_csv";
  account: string;
  month: string;
  expires_at?: string;
};
export type ImportProfile = {
  headers: string[];
  fields: string[];
  missing_mapping: string[];
  suggested_mapping: Record<string, string>;
  schema_hash: string;
  canonical_hash: string;
  counts: Record<string, number>;
  issues: Record<string, number>;
  controls: Record<string, string>;
  controls_by_currency: Record<string, Record<string, string>>;
  unknown_source_amount_rows: number;
  ready: boolean;
  limitations: string[];
};
export type ImportReview = {
  source: ImportSource;
  rules: ImportRules;
  decisions: ImportDecision[];
  profile: ImportProfile;
  confirmation?: { id: string; created_at: string } | null;
};
export type ImportRow = {
  row: number;
  source: Record<string, string>;
  normalized: Record<string, string>;
  disposition: string;
  issues: string[];
};
export type ImportRecipe = {
  id: string;
  name: string;
  account: string;
  kind: string;
  schema_hash: string;
  rules: ImportRules;
};
