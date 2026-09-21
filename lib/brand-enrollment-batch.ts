/**
 * Enrolling several products from several photos.
 *
 * A brand photographing its range takes one picture per product, so asking it to walk the whole
 * enrollment form once per photo is the slowest possible way in. A batch turns each photo into a
 * draft: recognition proposes what the product looks like, the brand supplies what only it knows —
 * the style code — and the drafts are enrolled one after another.
 *
 * Drafts are bounded for the same reason the consumer batch is: each photo is a metered recognition
 * call, and a form with twenty cards on it is not something anyone checks properly.
 */
export const MAX_ENROLL_DRAFTS = 6;

export interface EnrollmentBatchPlan<T> {
  accepted: T[];
  skipped: number;
}

export function planEnrollmentBatch<T>(files: readonly T[], limit = MAX_ENROLL_DRAFTS): EnrollmentBatchPlan<T> {
  const accepted = files.slice(0, Math.max(0, limit));
  return { accepted, skipped: Math.max(0, files.length - accepted.length) };
}

/** What a draft still needs before it can be enrolled. Identity is the brand's to supply. */
export function draftBlockers(form: { name?: string; sku?: string; category?: string }) {
  return [
    ...(form.name?.trim() ? [] : ["a name"]),
    ...(form.sku?.trim() ? [] : ["a style code"]),
    ...(form.category?.trim() ? [] : ["a category"]),
  ];
}

export function draftReady(form: { name?: string; sku?: string; category?: string }) {
  return draftBlockers(form).length === 0;
}

/** Two drafts cannot carry the same style code: the registry would refuse the second anyway. */
export function duplicateSkusInBatch(forms: Array<{ sku?: string }>) {
  const seen = new Map<string, number>();
  for (const form of forms) {
    const sku = (form.sku ?? "").trim().toUpperCase();
    if (!sku) continue;
    seen.set(sku, (seen.get(sku) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, count]) => count > 1).map(([sku]) => sku);
}

export interface EnrollmentOutcome {
  total: number;
  enrolled: number;
  failed: number;
  skippedPhotos?: number;
}

/** What a batch of enrolments actually did, including the half that did not work. */
export function enrollmentSummary({ total, enrolled, failed, skippedPhotos = 0 }: EnrollmentOutcome) {
  const parts: string[] = [];
  if (enrolled > 0) parts.push(`${enrolled} of ${total} product${total === 1 ? "" : "s"} enrolled.`);
  if (enrolled === 0) parts.push(`No products were enrolled.`);
  if (failed > 0) parts.push(`${failed} still need${failed === 1 ? "s" : ""} attention below — nothing was stored for ${failed === 1 ? "it" : "them"}.`);
  if (skippedPhotos > 0) parts.push(`${skippedPhotos} photo${skippedPhotos === 1 ? "" : "s"} were left for a second batch — ${MAX_ENROLL_DRAFTS} at a time.`);
  return parts.join(" ");
}
