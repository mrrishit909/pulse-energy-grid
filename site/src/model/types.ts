/** Field subsets of the published artifacts this site reads (data/contracts/*.schema.json). */
export type BA = "CISO" | "ERCO";
export const BAS: BA[] = ["CISO", "ERCO"];

export interface DClass {
  id: string; label: string; kind: "dispatchable" | "renewable"; group: string;
  capacity_mw: number; marginal_cost_usd_mwh: number; ramp_frac_per_h: number; pmin_frac: number;
  heat_rate_mmbtu_mwh: number; co2_kg_mmbtu: number;
}
export interface Battery { power_mw: number; energy_mwh: number; hours: number; round_trip_eff: number; soc0_frac: number; soc_min_frac: number; wear_cost_usd_mwh: number }
export interface RangeControl { id: string; label: string; unit: string; kind: "range"; min: number; max: number; step: number; default: number }
export interface EnumControl { id: string; label: string; unit: string; kind: "enum"; options: string[]; default: string }
export type Control = RangeControl | EnumControl;
export interface Day {
  id: string; label: string; date: string; season: string; intro: boolean;
  demand_mw: number[]; net_imports_mw: number[]; fixed_other_mw: number[];
  avail_mw: { solar: number[]; wind: number[] }; hydro_energy_mwh: number; temp_c: number[];
  observed_gen_mw: Record<string, number[]>; observed_interchange_mw: number[];
}
export interface Params {
  renewables_scale: number; demand_growth_pct: number; heat_wave_c: number;
  battery_power_mw: number; battery_hours: number; outage_class: string; outage_pct: number;
}
export interface BAModel {
  classes: DClass[]; battery: Battery; voll_usd_mwh: number; days: Day[];
  heat_wave: { cool_base_c: number; b_cool_mw_per_c_by_hour: number[] };
  display_order: string[]; controls: Control[];
  scenarios: { id: string; label: string; description: string; params: Params }[];
}
export interface DispatchModel {
  bas: Record<BA, BAModel>;
  reference_lp: { ba: BA; day: string; scenario: string; objective_usd: number; cplex_lp: string };
  assumptions: { id: string; value: unknown; unit: string; basis: string }[];
  scenarios: { id: string; label: string; description: string }[];
  solver_versions: Record<string, string>;
  tags: Record<string, string>;
}

export interface DispatchResult {
  objective_usd: number;
  cost_breakdown_usd: Record<string, number>;
  dispatch_mw: Record<string, number[]>;
  renewable_used_mw: { solar: number[]; wind: number[] };
  curtailment_mw: number[];
  unserved_mw: number[];
  battery: { charge_mw: number[]; discharge_mw: number[]; soc_mwh: number[] };
  price_usd_mwh: number[];
  marginal_class: string[];
  co2_t: number;
  renewable_share_pct: number;
  unserved_mwh: number;
  curtailed_mwh: number;
}
export interface DispatchResults { bas: Record<BA, { days: Record<string, Record<string, DispatchResult>> }> }

export interface Vector {
  ba: BA; day: string; scenario: string; kind: string; params: Params; lp_text_sha256: string;
  expected: {
    objective_usd: number; cost_breakdown_usd: Record<string, number>; unserved_mwh: number; co2_t: number;
    price_usd_mwh: number[]; price_comparable: boolean; curtailed_mwh: number;
  };
}
export interface TestVectors { tolerance_rel: number; tolerance_abs: number; tolerance_price_usd_mwh: number; vectors: Vector[] }

export interface Facts {
  bas: Record<BA, Record<string, unknown> & { peak_demand_mw: number }>;
  global: Record<string, unknown>;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
/** Trust-boundary guards: shallow structural checks of the fields the site reads. */
export const isDispatchModel = (v: unknown): v is DispatchModel =>
  isObj(v) && isObj(v.bas) && isObj(v.reference_lp) &&
  BAS.every((b) => { const m = (v.bas as Record<string, unknown>)[b]; return isObj(m) && Array.isArray(m.classes) && Array.isArray(m.days) && Array.isArray(m.display_order) && Array.isArray(m.controls); });
export const isDispatchResults = (v: unknown): v is DispatchResults =>
  isObj(v) && isObj(v.bas) && BAS.every((b) => isObj((v.bas as Record<string, unknown>)[b]));
export const isTestVectors = (v: unknown): v is TestVectors =>
  isObj(v) && Array.isArray(v.vectors) && v.vectors.length > 0 && v.vectors.every((x) => isObj(x) && typeof x.lp_text_sha256 === "string" && isObj(x.expected));
export const isFacts = (v: unknown): v is Facts =>
  isObj(v) && isObj(v.bas) && BAS.every((b) => isObj((v.bas as Record<string, unknown>)[b]) && typeof ((v.bas as Record<string, Record<string, unknown>>)[b]!.peak_demand_mw) === "number");

// ---------------------------------------------------------------- Stage B artifacts (field subsets)
type Arr = (number | null)[];
export interface FuelMix { bas: Record<BA, {
  fuels: string[]; annual_share_pct: Record<string, number>;
  month_hour_mean_mw: Record<string, Arr>;
  month_hour_mean_mw_by_year: Record<string, { demand: Arr; SUN: Arr; WND: Arr; months_present: number }>;
  evening_ramp: { definition: string; mean_mw_per_h: number };
}> }
export interface DemandProfile { bas: Record<BA, { month_hour_mean_mw: Arr }> }
export interface Week {
  label: string; reason: string; hours: number; start_utc: string; ts_local: string[];
  actual_mw: Arr; eia_mw: Arr; naive_mw: Arr; gbm_mw: Arr; best_mw: Arr;
  gbm_p10_mw: Arr; gbm_p90_mw: Arr; gbm_p10_cqr_mw: Arr; gbm_p90_cqr_mw: Arr;
}
export interface ForecastSamples { bas: Record<BA, { best_model: string; cqr_offset_mw: number; weeks: Week[];
  daily_test: { date: string[]; mape_gbm: Arr; mape_eia: Arr; mape_naive: Arr } }> }
export interface ModelEval { label: string; mape_pct: number; mae_mw: number; rmse_mw: number; bias_mw: number; mape_peak5_pct: number; available_at_forecast_time: boolean; tag: string }
export interface Comparison { model: string; baseline: string; mape_diff_pp: number; ci95: [number, number]; significant: boolean; statement: string }
export interface ForecastEval { bas: Record<BA, {
  common_test_hours: number; n_test: number;
  models: Record<string, ModelEval>;
  intervals: Record<string, { raw_coverage_pct: number; cqr_coverage_pct: number; nominal_pct: number; mean_width_mw: number; cqr_mean_width_mw: number }>;
  comparison_vs_eia: { beats_eia: boolean; best_model: string; mape_diff_pp: number; mape_diff_ci95: [number, number]; statement: string; ci_method: string };
  comparisons: Comparison[];
  features: Record<string, string[]>;
}> }
export interface LedgerRow { ba: BA; kind: string; fuel: string; grid_slots: number; raw_rows: number; missing_slots: number; null_value: number; flagged_outlier: number; kept: number; imputed_short_gap?: number }
export interface Reconciliation {
  ledger: LedgerRow[];
  balance: Record<BA, { definition: string; mean_abs_resid_mw: number; mean_resid_mw: number; p99_abs_resid_mw: number; n_hours: number }>;
  generation_vs_total: Record<BA, { definition: string; hours_gt_2pct: number; mean_abs_resid_pct: number; p99_abs_resid_pct: number; n_hours: number }>;
}
export interface Quality {
  dst: Record<BA, { days_23h: number; days_25h: number; local_days: number }>;
  spike_examples: Record<BA, { series: string; ts_utc: string; value: number; reference: number; rule: string }[]>;
}
export interface WeatherRelation { bas: Record<BA, {
  binned: { temp_c: number[]; mean_mw: number[]; p10_mw: number[]; p90_mw: number[]; n: number[] };
  cool_base_c: number; pct_demand_per_c_above_base: number; pct_ci: [number, number]; n: number; r2: number;
  b_cool_mw_per_c_by_hour: number[]; intercept_mw_by_hour: number[];
}> }
export interface Meta { pipeline_version: string; generated_at: string; attribution: string[]; bas: Record<BA, { name: string; stations: { id: string; name: string; weight: number }[] }> }
export interface Topology { tag: string; illustrative: boolean; label: string; license: string; buses: { id: number; type: number; pd_mw: number }[]; branches: { from: number; to: number }[]; generators: { bus: number }[] }
const bas = (v: unknown) => isObj(v) && isObj(v.bas) && BAS.every((b) => isObj((v.bas as Record<string, unknown>)[b]));
export const isFuelMix = (v: unknown): v is FuelMix => bas(v) && BAS.every((b) => isObj(((v as FuelMix).bas[b] as unknown as Record<string, unknown>).month_hour_mean_mw));
export const isDemandProfile = (v: unknown): v is DemandProfile => bas(v) && BAS.every((b) => Array.isArray((v as DemandProfile).bas[b].month_hour_mean_mw));
export const isForecastSamples = (v: unknown): v is ForecastSamples => bas(v) && BAS.every((b) => Array.isArray((v as ForecastSamples).bas[b].weeks));
export const isForecastEval = (v: unknown): v is ForecastEval => bas(v) && BAS.every((b) => isObj((v as ForecastEval).bas[b].models));
export const isReconciliation = (v: unknown): v is Reconciliation => isObj(v) && Array.isArray(v.ledger) && isObj(v.balance);
export const isQuality = (v: unknown): v is Quality => isObj(v) && isObj(v.dst);
export const isWeatherRelation = (v: unknown): v is WeatherRelation => bas(v);
export const isMeta = (v: unknown): v is Meta => isObj(v) && typeof v.generated_at === "string";
export const isTopology = (v: unknown): v is Topology => isObj(v) && Array.isArray(v.buses) && Array.isArray(v.branches);
