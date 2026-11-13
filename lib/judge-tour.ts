/**
 * The judge guide: a short, step-by-step path through the two demo flows, shown only inside a
 * "Try the demo" session (lib/demo-session.ts) and never to a real account.
 *
 * It follows the README's two flows, then one step each into the commercial loop:
 * - **Wardrobe:** scan a photo and confirm the pieces, ask Hanger for an outfit, then browse
 *   Community and buy a fictional piece from a look through the $0.00 demo bag.
 * - **Brand:** a product below the 25-owner threshold, one above it, Brand Hanger, then write a
 *   Brand Look and post it as a preview. Demo brands cannot publish to the live Community feed
 *   (lib/demo-session.ts), so the post is shown, labelled, and never saved (owner decision 2026-11-13).
 *
 * The brand steps open exactly two products on purpose: the one below the 25-owner threshold and the
 * one above it, which together make the privacy argument. Demo brands are exempt from the product
 * enumeration budget (enumerationBudgetExempt in lib/demo-session.ts), so judges may open any others.
 *
 * The guide never reads or writes account data. It talks to the dashboards through two window
 * events: a request ("open the scanner", "open this product", "open Hanger") going out, and a
 * progress signal ("pieces confirmed", "Hanger replied") coming back. Progress lives in the
 * visitor's own browser, keyed to the demo session's expiry, so a new demo starts the guide afresh.
 */
import type { DemoKind } from "./demo-session.ts";

/** The two seeded demo-brand products the guide opens (scripts/seed-judge-accounts.mjs). */
export const JUDGE_TOUR_PRODUCTS = {
  suppressed: { id: "judge-product-suppressed", name: "Judge Limited Overshirt" },
  released: { id: "judge-product-released", name: "Judge Signature Tee" },
} as const;

export type JudgeTourStepId =
  | "scan"
  | "hanger-outfit"
  | "suppressed"
  | "released"
  | "brand-hanger"
  | "community"
  | "community-purchase"
  | "brand-post";

/** The only pages the guide will send a judge to. Fixed strings, never input. */
export const JUDGE_TOUR_PATHS = ["/community"] as const;
export type JudgeTourPath = (typeof JUDGE_TOUR_PATHS)[number];

/** What the guide asks a dashboard to do. */
export type JudgeTourRequest =
  | { action: "open-scanner" }
  | { action: "open-hanger" }
  | { action: "open-product"; productId: string; thenHanger?: boolean }
  | { action: "open-looks" }
  | { action: "go"; href: JudgeTourPath };

export interface JudgeTourStep {
  id: JudgeTourStepId;
  title: string;
  detail: string;
  /** The button that takes the judge straight to this step. */
  cta: string;
  /**
   * The element the guide spotlights for this step: whatever carries `data-tour="<target>"` on the page
   * (the Add button, the Hanger button, a product card). The step's button still works without it.
   */
  target: string;
  request: JudgeTourRequest;
}

export interface JudgeTour {
  kind: DemoKind;
  heading: string;
  intro: string;
  steps: JudgeTourStep[];
  /** The other half of the demo, opened with one more click. */
  switchTo: { kind: "judge-consumer" | "judge-brand"; label: string };
}

export const JUDGE_TOURS: Readonly<Record<DemoKind, JudgeTour>> = {
  consumer: {
    kind: "consumer",
    heading: "The wardrobe side",
    intro: "Four steps, about four minutes. A person photographs their clothes, confirms what the AI found, gets an outfit from what they already own, then shops a look from Community.",
    steps: [
      {
        id: "scan",
        title: "Scan a photo and confirm the pieces",
        detail: "Use any photo of an outfit or a flat lay. The AI proposes each piece; nothing is saved until you confirm it.",
        cta: "Open the scanner",
        target: "scan",
        request: { action: "open-scanner" },
      },
      {
        id: "hanger-outfit",
        title: "Ask Hanger for an outfit",
        detail: "Tap a suggested question. Code picks the pieces from this wardrobe; the AI only explains the choice.",
        cta: "Open Hanger",
        target: "hanger",
        request: { action: "open-hanger" },
      },
      {
        id: "community",
        title: "Browse Community",
        detail: "Outfits people chose to publish, and Looks brands styled from their own products. Nothing is public until its owner presses Publish.",
        cta: "Open Community",
        target: "community",
        request: { action: "go", href: "/community" },
      },
      {
        id: "community-purchase",
        title: "Buy a piece from a look",
        detail: "On a look marked Demo, tap Shop the look, then a piece. The fictional store opens: Add to demo bag, then Complete demo purchase — $0.00. No card, and it shows the 8% commission Racked would earn.",
        cta: "Open Community",
        target: "community-shop",
        request: { action: "go", href: "/community" },
      },
    ],
    switchTo: { kind: "judge-brand", label: "See the brand side" },
  },
  brand: {
    kind: "brand",
    heading: "The brand side",
    intro: "Four steps, about three minutes. A brand sees how its products are worn, but only as totals from 25 or more owners who opted in, and styles its own Looks for Community.",
    steps: [
      {
        id: "suppressed",
        title: `Open ${JUDGE_TOUR_PRODUCTS.suppressed.name}`,
        detail: "4 opted-in owners, below the threshold of 25, so the brand sees nothing: not zeroes, not even the count.",
        cta: "Open this product",
        target: `product-${JUDGE_TOUR_PRODUCTS.suppressed.id}`,
        request: { action: "open-product", productId: JUDGE_TOUR_PRODUCTS.suppressed.id },
      },
      {
        id: "released",
        title: `Open ${JUDGE_TOUR_PRODUCTS.released.name}`,
        detail: "50 opted-in owners, so totals are released: an eight-week wear chart, repeat wear and what it is worn with. Never a name, photo or wardrobe.",
        cta: "Open this product",
        target: `product-${JUDGE_TOUR_PRODUCTS.released.id}`,
        request: { action: "open-product", productId: JUDGE_TOUR_PRODUCTS.released.id },
      },
      {
        id: "brand-hanger",
        title: "Ask Brand Hanger for a campaign angle",
        detail: "Tap “Which metric should lead our campaign?”. Hanger sees only the released totals.",
        cta: "Open Brand Hanger",
        target: "hanger",
        request: { action: "open-product", productId: JUDGE_TOUR_PRODUCTS.released.id, thenHanger: true },
      },
      {
        id: "brand-post",
        title: "Write and post a Brand Look",
        detail: "Pick pieces, give the Look a title and a styling story, and tap Post. The demo shows it exactly as Community would, labelled as a preview: nothing is published or saved.",
        cta: "Open Brand Looks",
        target: "brand-looks",
        request: { action: "open-looks" },
      },
    ],
    switchTo: { kind: "judge-consumer", label: "See the wardrobe side" },
  },
};

/** Window events between the guide and the dashboards. Names are namespaced so nothing else answers them. */
export const JUDGE_TOUR_REQUEST_EVENT = "racked:judge-tour-request";
export const JUDGE_TOUR_PROGRESS_EVENT = "racked:judge-tour-progress";

const STEP_IDS: ReadonlySet<string> = new Set<JudgeTourStepId>(["scan", "hanger-outfit", "community", "community-purchase", "suppressed", "released", "brand-hanger", "brand-post"]);

export function isJudgeTourStepId(value: unknown): value is JudgeTourStepId {
  return typeof value === "string" && STEP_IDS.has(value);
}

/** Which step, if any, opening a product completes. */
export function stepForOpenedProduct(productId: string): JudgeTourStepId | null {
  if (productId === JUDGE_TOUR_PRODUCTS.suppressed.id) return "suppressed";
  if (productId === JUDGE_TOUR_PRODUCTS.released.id) return "released";
  return null;
}

function isJudgeTourPath(value: unknown): value is JudgeTourPath {
  return typeof value === "string" && (JUDGE_TOUR_PATHS as readonly string[]).includes(value);
}

/** Reads a request event's detail, refusing anything that is not one of the guide's own requests. */
export function readJudgeTourRequest(detail: unknown): JudgeTourRequest | null {
  if (!detail || typeof detail !== "object") return null;
  const value = detail as Record<string, unknown>;
  if (value.action === "open-scanner" || value.action === "open-hanger" || value.action === "open-looks") return { action: value.action };
  if (value.action === "go") return isJudgeTourPath(value.href) ? { action: "go", href: value.href } : null;
  if (value.action === "open-product" && typeof value.productId === "string" && stepForOpenedProduct(value.productId)) {
    return { action: "open-product", productId: value.productId, ...(value.thenHanger === true ? { thenHanger: true } : {}) };
  }
  return null;
}

/**
 * Tells the guide a step happened. Safe to call anywhere: on the server, or with no guide on the
 * page, it does nothing. Real accounts have no guide, so nothing listens.
 */
export function signalJudgeTourProgress(step: JudgeTourStepId) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(JUDGE_TOUR_PROGRESS_EVENT, { detail: { step } }));
}

export function requestJudgeTour(request: JudgeTourRequest) {
  if (typeof window === "undefined") return;
  // A step on another page navigates there; on that page already, the spotlight shows the way.
  if (request.action === "go") {
    if (isJudgeTourPath(request.href) && window.location.pathname !== request.href) window.location.assign(request.href);
    return;
  }
  window.dispatchEvent(new CustomEvent(JUDGE_TOUR_REQUEST_EVENT, { detail: request }));
}

/** The browser key a demo session's progress is kept under. The expiry is per session and not a secret. */
export function judgeTourStorageKey(kind: DemoKind, sessionExpiresAt: number) {
  return `racked.judgeTour.${kind}.${sessionExpiresAt}`;
}

export interface JudgeTourState { done: JudgeTourStepId[]; collapsed: boolean }

/** Parses stored progress, keeping only known step ids that belong to this tour, in tour order. */
export function readJudgeTourState(raw: string | null, tour: JudgeTour): JudgeTourState {
  const empty: JudgeTourState = { done: [], collapsed: false };
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as { done?: unknown; collapsed?: unknown };
    const stored = Array.isArray(parsed.done) ? parsed.done.filter(isJudgeTourStepId) : [];
    return { done: tour.steps.map((step) => step.id).filter((id) => stored.includes(id)), collapsed: parsed.collapsed === true };
  } catch {
    return empty;
  }
}

/** Marks a step done, ignoring a step from the other tour and keeping the tour's order. */
export function completeJudgeTourStep(state: JudgeTourState, tour: JudgeTour, step: JudgeTourStepId): JudgeTourState {
  if (!tour.steps.some((entry) => entry.id === step) || state.done.includes(step)) return state;
  const done = new Set([...state.done, step]);
  return { ...state, done: tour.steps.map((entry) => entry.id).filter((id) => done.has(id)) };
}

/** The step to point at next, or null when every step is done. */
export function nextJudgeTourStep(state: JudgeTourState, tour: JudgeTour): JudgeTourStep | null {
  return tour.steps.find((step) => !state.done.includes(step.id)) ?? null;
}

/** The CSS selector for a step's spotlight target. Targets are fixed strings from this file, never user input. */
export function judgeTourTargetSelector(target: string) {
  return `[data-tour="${target}"]`;
}
