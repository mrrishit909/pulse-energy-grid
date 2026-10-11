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
