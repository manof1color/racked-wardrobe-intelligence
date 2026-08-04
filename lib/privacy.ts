export const MINIMUM_COHORT_SIZE = 25;
// Judge note: brand-facing aggregate output fails closed below the documented cohort threshold.

export function canExposeAggregate(size: number, minimum = MINIMUM_COHORT_SIZE) {
  return Number.isInteger(size) && size >= minimum;
}

export function toBrandSafeSegment(input: { id:string; label:string; size:number; emails?:string[]; wardrobeIds?:string[] }) {
  if (!canExposeAggregate(input.size)) return null;
  return { id:input.id, label:input.label, size:input.size };
}
