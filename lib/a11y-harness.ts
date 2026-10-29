/**
 * The accessibility harness renders signed-in screens with fixture data so automated checks can
 * reach them without an account. It exists only when RACKED_A11Y_HARNESS is exactly "1", which
 * the accessibility CI job sets for its local `next start` and production never does: anywhere
 * else the route answers 404. The screens it renders still call the real API routes, which keep
 * refusing a request without a session; the checks answer those calls in the browser instead.
 */
export const A11Y_HARNESS_FLAG = "RACKED_A11Y_HARNESS";

export function a11yHarnessEnabled(environment: Record<string, string | undefined>) {
  return environment[A11Y_HARNESS_FLAG] === "1";
}

export const A11Y_HARNESS_SCREENS = {
  consumer: ["home", "looks", "closet", "outfits"],
  brand: ["overview", "catalog", "looks"],
} as const;

export type A11yHarnessRole = keyof typeof A11Y_HARNESS_SCREENS;

/** Reads the harness query string, falling back to each role's landing view. */
export function harnessScreen(role: string | undefined, view: string | undefined) {
  const chosenRole: A11yHarnessRole = role === "brand" ? "brand" : "consumer";
  const views: readonly string[] = A11Y_HARNESS_SCREENS[chosenRole];
  return { role: chosenRole, view: view && views.includes(view) ? view : views[0] };
}
