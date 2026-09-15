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
