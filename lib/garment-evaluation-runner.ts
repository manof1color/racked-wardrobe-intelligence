import type { GarmentAnalysis } from "./platform-types.ts";
import type { EvaluationPrediction } from "./evaluation-dataset.ts";

/**
 * Converts the real production analyzer's result into the deliberately small,
 * non-identifying benchmark contract. A fallback is a provider failure, not a
 * guessed prediction, and label text can never become verification evidence here.
 */
export function evaluationPredictionFromAnalysis(externalId:string,analysis:GarmentAnalysis):EvaluationPrediction {
  if(analysis.fallback||analysis.provider==="manual-review")return {externalId,providerStatus:"failed",verified:false};
  return {
    externalId,
    providerStatus:"ok",
    category:analysis.garment.category,
    subtype:analysis.garment.subtype,
    brandLabel:analysis.label.brand==="Brand not verified"||analysis.label.brand==="Unmatched label"?undefined:analysis.label.brand,
    confidence:analysis.confidence,
    // The independent research benchmark is never passed to the brand registry.
    // Even a correct OCR reading therefore remains an unverified suggestion.
    verified:false,
  };
}
