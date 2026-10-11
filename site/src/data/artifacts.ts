/** Artifact specs (one store per file, shared by every scene). Guards are the trust boundary. */
import type { ArtifactSpec } from "./loader";
import { isDispatchModel, isDispatchResults, isFacts, isTestVectors, type DispatchModel, type DispatchResults, type Facts, type TestVectors } from "../model/types";

export const FACTS: ArtifactSpec<Facts> = { file: "facts.json", guard: isFacts };
export const MODEL: ArtifactSpec<DispatchModel> = { file: "dispatch_model.json", guard: isDispatchModel };
export const RESULTS: ArtifactSpec<DispatchResults> = { file: "dispatch_results.json", guard: isDispatchResults };
export const VECTORS: ArtifactSpec<TestVectors> = { file: "dispatch_test_vectors.json", guard: isTestVectors };
