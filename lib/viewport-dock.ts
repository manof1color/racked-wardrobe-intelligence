/**
 * Keeps fixed bottom controls — the mobile tab bar and the Hanger button — on the bottom
 * edge a person can actually see.
 *
 * `position: fixed` is measured against the layout viewport. On iPhone, and especially in
 * a home-screen web app, that viewport can fall out of step with the visible screen after
 * the on-screen keyboard closes: the visual viewport stays scrolled below it, or
 * `innerHeight` keeps its keyboard-shortened value. Either way a bar pinned to `bottom`
 * is drawn part-way up the screen with page content showing underneath it. Both states
 * mean the visible bottom edge lies below the layout bottom edge, so the bar is moved down
 * by exactly that difference and by nothing otherwise.
 */
export function dockShift(layoutHeight: number, visualTop: number, visualHeight: number): number {
  if (![layoutHeight, visualTop, visualHeight].every(Number.isFinite) || layoutHeight <= 0) return 0;
  const shift = Math.round(visualTop + visualHeight - layoutHeight);
  // Only ever downwards, and never by a screen or more: a value that large is a
  // measurement glitch rather than a real offset.
  return shift > 1 && shift < layoutHeight ? shift : 0;
}

const NON_TEXT_INPUTS = new Set(["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"]);

/** Whether focusing this element raises the on-screen keyboard (or the iOS picker). */
export function isTextEntry(element: { tagName?: string; type?: string; isContentEditable?: boolean } | null | undefined): boolean {
  if (!element?.tagName) return false;
  if (element.isContentEditable) return true;
  const tag = element.tagName.toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  return !NON_TEXT_INPUTS.has((element.type || "text").toLowerCase());
}

/**
 * The other stranded state: after the keyboard closes, or after the app is left and resumed, iOS can
 * keep reporting a keyboard-shortened height for BOTH the layout and the visual viewport. `dockShift`
 * then sees two viewports that agree and moves nothing, so the tab bar and the dock above it sit a
 * keyboard's height up the screen and travel with the page. `baseline` is the tallest height this
 * screen has reported while nobody was typing (kept per width, so rotation and split view reset it).
 * A shortfall of a keyboard's size with no keyboard up is that stale state, and the dock is moved
 * down by it. Smaller differences are browser toolbars showing and hiding, and are left alone.
 */
export const STALE_VIEWPORT_MIN_GAP = 150;

export function staleViewportShift(visibleBottom: number, baseline: number, typing: boolean): number {
  if (typing || ![visibleBottom, baseline].every(Number.isFinite) || visibleBottom <= 0 || baseline <= 0) return 0;
  const gap = Math.round(baseline - visibleBottom);
  return gap >= STALE_VIEWPORT_MIN_GAP && gap < baseline ? gap : 0;
}
