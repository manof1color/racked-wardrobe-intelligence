/**
 * Where a Back button should go. It returns to the previous page when that page is on Racked, which
 * keeps the feed's scroll position. Someone who arrived from another site or on a shared link has
 * nothing on Racked to return to, so they go to the fallback page instead of leaving the app.
 */
export function backDestination(input: { referrer: string; origin: string; historyLength: number }): "history" | "fallback" {
  if (input.historyLength <= 1) return "fallback";
  if (!input.referrer) return "history";
  try {
    return new URL(input.referrer).origin === input.origin ? "history" : "fallback";
  } catch {
    return "fallback";
  }
}
