/**
 * The judge guide: a short, step-by-step path through the two demo flows, shown only inside a
 * "Try the demo" session (lib/demo-session.ts) and never to a real account.
 *
 * It follows the README's two flows and nothing else:
 * - **Wardrobe:** scan a photo and confirm the pieces, then ask Hanger for an outfit.
 * - **Brand:** a product below the 25-owner threshold, one above it, then Brand Hanger.
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
  | "brand-hanger";

/** What the guide asks a dashboard to do. */
export type JudgeTourRequest =
  | { action: "open-scanner" }
  | { action: "open-hanger" }
  | { action: "open-product"; productId: string; thenHanger?: boolean };

export interface JudgeTourStep {
  id: JudgeTourStepId;
  title: string;
  detail: string;
  /** The button that takes the judge straight to this step. */
  cta: string;
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
    intro: "Two steps, about two minutes. A person photographs their clothes, confirms what the AI found, and gets an outfit from what they already own.",
    steps: [
      {
        id: "scan",
        title: "Scan a photo and confirm the pieces",
        detail: "Use any photo of an outfit or a flat lay. The AI proposes each piece; nothing is saved until you confirm it.",
        cta: "Open the scanner",
        request: { action: "open-scanner" },
      },
      {
        id: "hanger-outfit",
        title: "Ask Hanger for an outfit",
        detail: "Tap a suggested question. Code picks the pieces from this wardrobe; the AI only explains the choice.",
        cta: "Open Hanger",
        request: { action: "open-hanger" },
      },
    ],
    switchTo: { kind: "judge-brand", label: "See the brand side" },
  },
  brand: {
    kind: "brand",
    heading: "The brand side",
    intro: "Three steps, about two minutes. A brand sees how its products are worn, but only as totals from 25 or more owners who opted in.",
    steps: [
      {
        id: "suppressed",
        title: `Open ${JUDGE_TOUR_PRODUCTS.suppressed.name}`,
        detail: "4 opted-in owners, below the threshold of 25, so the brand sees nothing: not zeroes, not even the count.",
        cta: "Open this product",
        request: { action: "open-product", productId: JUDGE_TOUR_PRODUCTS.suppressed.id },
      },
      {
        id: "released",
        title: `Open ${JUDGE_TOUR_PRODUCTS.released.name}`,
        detail: "50 opted-in owners, so totals are released: an eight-week wear chart, repeat wear and what it is worn with. Never a name, photo or wardrobe.",
        cta: "Open this product",
        request: { action: "open-product", productId: JUDGE_TOUR_PRODUCTS.released.id },
      },
      {
        id: "brand-hanger",
        title: "Ask Brand Hanger for a campaign angle",
        detail: "Tap “Which metric should lead our campaign?”. Hanger sees only the released totals.",
        cta: "Open Brand Hanger",
        request: { action: "open-product", productId: JUDGE_TOUR_PRODUCTS.released.id, thenHanger: true },
      },
    ],
    switchTo: { kind: "judge-consumer", label: "See the wardrobe side" },
  },
};

/** Window events between the guide and the dashboards. Names are namespaced so nothing else answers them. */
export const JUDGE_TOUR_REQUEST_EVENT = "racked:judge-tour-request";
export const JUDGE_TOUR_PROGRESS_EVENT = "racked:judge-tour-progress";

const STEP_IDS: ReadonlySet<string> = new Set<JudgeTourStepId>(["scan", "hanger-outfit", "suppressed", "released", "brand-hanger"]);

export function isJudgeTourStepId(value: unknown): value is JudgeTourStepId {
  return typeof value === "string" && STEP_IDS.has(value);
}

/** Which step, if any, opening a product completes. */
export function stepForOpenedProduct(productId: string): JudgeTourStepId | null {
  if (productId === JUDGE_TOUR_PRODUCTS.suppressed.id) return "suppressed";
  if (productId === JUDGE_TOUR_PRODUCTS.released.id) return "released";
  return null;
}

/** Reads a request event's detail, refusing anything that is not one of the three requests. */
export function readJudgeTourRequest(detail: unknown): JudgeTourRequest | null {
  if (!detail || typeof detail !== "object") return null;
  const value = detail as Record<string, unknown>;
  if (value.action === "open-scanner" || value.action === "open-hanger") return { action: value.action };
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
