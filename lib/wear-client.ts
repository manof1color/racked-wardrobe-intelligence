import { awardNotice } from "./wear-points";

/** The browser's own calendar date, which the server accepts only if it is a real date somewhere now. */
export function localDay(now = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, "0"), day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** The body of a wear request: a fresh request id, so a retry is recognised, and today's local date. */
export function wearRequestBody(fields: { itemId?: string; itemIds?: string[]; outfitId?: string }) {
  return JSON.stringify({ ...fields, requestId: crypto.randomUUID(), localDate: localDay() });
}

/** The points sentence to add after a recorded wear, or "" when the response carries none. */
export function wearPointsNotice(data: { points?: { awarded: number; rediscovered: number; capped: boolean; repeat: boolean; streak?: number; streakGrew?: boolean } }) {
  return data.points ? awardNotice({ points: data.points.awarded, rediscovered: data.points.rediscovered, capped: data.points.capped, repeat: data.points.repeat, streak: data.points.streak, streakGrew: data.points.streakGrew }) : "";
}
