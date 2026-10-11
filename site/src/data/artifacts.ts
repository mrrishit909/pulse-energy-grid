/** Artifact specs (one store per file, shared by every scene). Guards are the trust boundary. */
import type { ArtifactSpec } from "./loader";
import { isDispatchModel, isDispatchResults, isFacts, isTestVectors, type DispatchModel, type DispatchResults, type Facts, type TestVectors } from "../model/types";

export const FACTS: ArtifactSpec<Facts> = { file: "facts.json", guard: isFacts };
export const MODEL: ArtifactSpec<DispatchModel> = { file: "dispatch_model.json", guard: isDispatchModel };
export const RESULTS: ArtifactSpec<DispatchResults> = { file: "dispatch_results.json", guard: isDispatchResults };
export const VECTORS: ArtifactSpec<TestVectors> = { file: "dispatch_test_vectors.json", guard: isTestVectors };
import {
  isDemandProfile, isForecastEval, isForecastSamples, isFuelMix, isMeta, isQuality, isReconciliation, isTopology, isWeatherRelation,
  type DemandProfile, type ForecastEval, type ForecastSamples, type FuelMix, type Meta, type Quality, type Reconciliation, type Topology, type WeatherRelation,
} from "../model/types";
export const FUEL_MIX: ArtifactSpec<FuelMix> = { file: "fuel_mix.json", guard: isFuelMix };
export const DEMAND: ArtifactSpec<DemandProfile> = { file: "demand_profile.json", guard: isDemandProfile };
export const SAMPLES: ArtifactSpec<ForecastSamples> = { file: "forecast_samples.json", guard: isForecastSamples };
export const EVAL: ArtifactSpec<ForecastEval> = { file: "forecast_eval.json", guard: isForecastEval };
export const RECON: ArtifactSpec<Reconciliation> = { file: "reconciliation.json", guard: isReconciliation };
export const QUALITY: ArtifactSpec<Quality> = { file: "quality.json", guard: isQuality };
export const WEATHER: ArtifactSpec<WeatherRelation> = { file: "weather_relation.json", guard: isWeatherRelation };
export const META: ArtifactSpec<Meta> = { file: "meta.json", guard: isMeta };
export const TOPOLOGY: ArtifactSpec<Topology> = { file: "grid_topology.json", guard: isTopology };
