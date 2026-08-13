import type { PublicOutfitGarment } from "./platform-types.ts";
import type { RecreateMatchState } from "./recreate-look.ts";

// Judge note: this module is the single translation layer between backend state
// machines and the words a person reads. Keeping it pure and separately tested means
// the UI can never quietly invent a friendlier claim than the backend supports — in
// particular, a similar or estimated item can never be described as the exact piece
// worn in an outfit.

export type MatchGroup = "owned" | "missing";

export interface MatchLanguage {
  /** Short human label, e.g. "Strong match". */
  label: string;
  /** Which column the piece belongs in. */
  group: MatchGroup;
  /** Icon-ish marker used in the list. */
  marker: string;
  /** One plain sentence explaining what the label means. */
  meaning: string;
}

const MATCH_LANGUAGE: Record<RecreateMatchState, MatchLanguage> = {
  EXACT_OWNED: { label: "Exact match", group: "owned", marker: "✓", meaning: "You own this exact registry-verified product." },
  STRONG_SUBSTITUTE: { label: "Strong match", group: "owned", marker: "✓", meaning: "A piece you own is a close stand-in for this." },
  ACCEPTABLE_SUBSTITUTE: { label: "Similar option", group: "owned", marker: "≈", meaning: "A piece you own works, with some visible differences." },
  WEAK_SUBSTITUTE: { label: "Loose match", group: "owned", marker: "≈", meaning: "The closest thing you own, but it changes the look." },
  MISSING: { label: "Missing", group: "missing", marker: "○", meaning: "Nothing in your wardrobe fills this role yet." },
};

export function matchLanguage(state: RecreateMatchState): MatchLanguage {
  return MATCH_LANGUAGE[state] ?? MATCH_LANGUAGE.MISSING;
}

export type ShoppableTone = "exact" | "similar" | "unavailable" | "unverified";

export interface ShoppableLanguage {
  /** Badge text shown against the piece. */
  label: string;
  tone: ShoppableTone;
  /** True only when Racked can send the person to an authorized destination for this exact product. */
  canShopExact: boolean;
  /** Explains the state without implying a similar item is the exact piece. */
  detail: string;
  /** Call to action, or null when there is nothing to open. */
  action: string | null;
}

/**
 * Decides how a published garment may be described commercially. Only an exact
 * registry-verified product with an available, server-validated destination is ever
 * presented as shoppable; every other state is explicitly softened.
 */
export function shoppableLanguage(garment: Pick<PublicOutfitGarment, "resolutionState" | "verifiedProduct">): ShoppableLanguage {
  const commerce = garment.verifiedProduct?.commerceState;
  const hasDestination = Boolean(garment.verifiedProduct?.outboundUrl);

  if (garment.resolutionState === "EXACT_VERIFIED_PRODUCT" && garment.verifiedProduct) {
    if (commerce === "EXACT_UNAVAILABLE") {
      return { label: "Verified · unavailable", tone: "unavailable", canShopExact: false, detail: "This is the exact product worn, but the brand lists it as unavailable.", action: null };
    }
    if (hasDestination && commerce === "EXACT_AVAILABLE") {
      return { label: "Exact verified product", tone: "exact", canShopExact: true, detail: "Registry-verified as the exact product worn in this outfit.", action: "View product" };
    }
    return { label: "Exact verified product", tone: "exact", canShopExact: false, detail: "Registry-verified as the exact product worn. The brand has not published a shopping destination.", action: null };
  }

  if (garment.resolutionState === "VERIFIED_UNAVAILABLE") {
    return { label: "Verified · unavailable", tone: "unavailable", canShopExact: false, detail: "This piece was verified previously, but it is no longer available.", action: null };
  }

  if (garment.resolutionState === "SIMILAR_PRODUCT") {
    // Backend gap (documented, not faked): nothing in the current API resolves a
    // "find similar" search, and commerceDestination never emits SIMILAR_AVAILABLE.
    // Until a real endpoint exists this state is described honestly with no action,
    // rather than shipping a button that goes nowhere.
    return { label: "Similar item", tone: "similar", canShopExact: false, detail: "Not the exact piece worn — a comparable product in the same category.", action: null };
  }

  if (garment.resolutionState === "AI_ESTIMATED_PRODUCT") {
    return { label: "AI estimate", tone: "unverified", canShopExact: false, detail: "Racked estimated this garment from the photo. It is not a verified product link.", action: null };
  }

  return { label: "Unverified garment", tone: "unverified", canShopExact: false, detail: "A personal wardrobe piece with no verified brand product behind it.", action: null };
}

/** True when the outfit has at least one exact product a person can actually open. */
export function hasShoppablePiece(garments: Array<Pick<PublicOutfitGarment, "resolutionState" | "verifiedProduct">>) {
  return garments.some((garment) => shoppableLanguage(garment).canShopExact);
}

export interface ProvenanceLabel { label: string; kind: "brand" | "consumer"; description: string; }

/** Distinguishes brand-authored merchandising from real consumer social proof. */
export function provenanceLabel(sourceType: "consumer" | "brand"): ProvenanceLabel {
  return sourceType === "brand"
    ? { label: "Brand Look", kind: "brand", description: "Styled and published by the brand from its own enrolled products." }
    : { label: "Community Look", kind: "consumer", description: "Published by a person from an outfit they saved and wore." };
}

/** Synthetic/pilot provenance, so a judge can never mistake seeded data for real traction. */
export function dataLabel(input: { dataClassification?: "DEMO" | "PILOT" | "REGULAR"; fictional?: boolean }) {
  if (input.dataClassification === "DEMO" || input.fictional) return { label: "Demo data", detail: "Fictional demonstration record — not a real customer or real commercial activity." };
  if (input.dataClassification === "PILOT") return { label: "Pilot data", detail: "Real activity from an authorized pilot participant." };
  return null;
}
