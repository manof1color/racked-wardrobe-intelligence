/**
 * Deterministic dialogue planning for Consumer Hanger.
 *
 * Bedrock may explain a choice, but it never decides which private wardrobe IDs a pronoun such as
 * "those" or a revision such as "keep the shoes" refers to. This planner resolves those phrases
 * only against the latest owned outfit saved in the account's Hanger state.
 */
import type { HangerActiveOutfit } from "./hanger-memory.ts";
import {
  MAX_OUTFIT_PIECES,
  asksForOutfitSuggestion,
  explicitlyExcludedWardrobeItems,
  explicitlyRequestedWardrobeItems,
  readOutfitIntent,
  requestedOutfitPieceCount,
  type OutfitIntent,
} from "./outfit-ranking.ts";
import type { WardrobeItem } from "./types.ts";

export type HangerTurnMode = "create" | "revise" | "explain" | "save-confirm" | "wear-confirm" | "advice" | "clarify";

export interface HangerTurnPlan {
  mode: HangerTurnMode;
  intent: OutfitIntent;
  activeItemIds: string[];
  requiredItemIds: string[];
  excludedItemIds: string[];
  maxPieces: number;
  rotatePriorSuggestions: boolean;
  contextUsed: boolean;
  clarification?: string;
}

/** The customer may request a new look while explicitly declining Save or Record. */
export function allowedOutfitActions(mode: HangerTurnMode, message: string): "both" | "save" | "record" | "none" {
  if (mode === "create" || mode === "revise") {
    const declineSave = /\b(?:do not|don['’]?t|never|not|no)\s+save\b|\b(?:do not|don['’]?t|never|not|no)\s+(?:record|log|mark)\s+(?:or|and)\s+save\b/i.test(message);
    const declineWear = /\b(?:do not|don['’]?t|never|not|no)\s+(?:record|log|mark)\b|\b(?:do not|don['’]?t|never|not|no)\s+save\s+(?:or|and)\s+(?:record|log|mark)\b/i.test(message);
    return declineSave && declineWear ? "none" : declineSave ? "record" : declineWear ? "save" : "both";
  }
  return mode === "save-confirm" ? "save" : mode === "wear-confirm" ? "record" : "none";
}

// Saving is an action on the current look, not every sentence containing "save" or "add".
const SAVE_ACTIVE = /\bsave\s+(?:(?:it|that|this)(?:\s+(?:outfit|look))?|(?:the|my|current|suggested)\s+(?:outfit|look)|(?:outfit|look))\b|\badd\s+(?:it|that|this|the\s+(?:outfit|look))\s+to\s+(?:my\s+)?(?:outfits|looks)\b|^\s*save\s*[.!?]?\s*$/i;
const WEAR_ACTIVE = /\b(?:record|log|mark)\b[^.!?]{0,35}\b(?:wear|worn|outfit|look|it|that|those)\b/i;
const EXPLAIN_ACTIVE = /\b(?:why|explain|how did you choose|what made you choose|tell me about)\b/i;
const REVISION_CUE = /\b(?:keep|swap|change|replace|remove|drop|leave out|without|instead|different|another|adjust|redo|remake|revise|try again|make it|make this|make that|more formal|more casual|less formal|less casual|use that|use those|use them)\b/i;
const KEEP_CUE = /\b(?:keep|reuse|still use|use again|use that|use those|use them)\b/i;
const CHANGE_CUE = /\b(?:swap|change|replace|remove|drop|leave out|without|different|another)\b/i;
const CHANGE_EVERYTHING = /\b(?:change|replace|swap|redo)\s+(?:the\s+)?(?:whole|entire|everything)|\bchange everything else\b/i;
const WARDROBE_REVIEW = /\b(?:what have i not worn|what haven t i worn|which (?:pieces|items|garments) (?:have i not worn|are underused)|wardrobe gap|closet gap|what am i missing|how many times|how often)\b/i;
const NEGATED_ACTION = /\b(?:do not|don['’]?t|never|not|no)\s+(?:save|record|log|mark)\b/i;
const ADD_TO_LOOK = /\badd\b[^.!?;]{0,70}\b(?:to|into)\s+(?:(?:this|that|the|my|current)\s+)?(?:outfit|look)\b/i;
const CURRENT_LOOK_REFERENCE = /\b(?:this|that|current|same)\s+(?:outfit|look)\b|\b(?:make|style|change|adjust|redo|revise)\s+it\b/i;
const OMIT_CUE = /\b(?:remove|drop|leave out|without|no)\b/;

const CATEGORY_WORDS: Record<string, string[]> = {
  top: ["top", "tops", "shirt", "shirts", "tee", "tees", "hoodie", "hoodies", "sweater", "sweaters", "blouse", "blouses"],
  bottom: ["bottom", "bottoms", "pants", "trousers", "jeans", "shorts", "skirt", "skirts", "leggings"],
  shoe: ["shoe", "shoes", "sneaker", "sneakers", "boot", "boots", "loafer", "loafers", "heels", "footwear"],
  outerwear: ["outerwear", "jacket", "jackets", "coat", "coats", "blazer", "blazers", "layer", "layers"],
  dress: ["dress", "dresses", "gown", "gowns", "jumpsuit", "jumpsuits", "romper", "rompers"],
  bag: ["bag", "bags", "purse", "purses", "tote", "totes", "backpack", "backpacks"],
  jewelry: ["jewelry", "jewellery", "necklace", "necklaces", "ring", "rings", "bracelet", "bracelets", "earrings", "watch", "watches"],
  accessory: ["accessory", "accessories", "belt", "belts", "hat", "hats", "scarf", "scarves", "tie", "ties", "sunglasses"],
};

const clean = (value: unknown) => String(value ?? "").toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

function ownedActiveItems(wardrobe: WardrobeItem[], active: HangerActiveOutfit | null | undefined) {
  const byId = new Map(wardrobe.map((item) => [item.id, item]));
  const items = (active?.itemIds ?? []).map((id) => byId.get(id));
  // A deleted garment invalidates the whole current plan. Never silently save only the survivors.
  return items.every((item): item is WardrobeItem => Boolean(item)) ? items : [];
}

function categoryInstructions(message: string) {
  // Keep punctuation until each garment cue has been resolved. Normalizing commas away
  // would let "keep" in one clause override "change" in the next.
  const request = message.toLocaleLowerCase();
  const kept = new Set<string>();
  const changed = new Set<string>();
  const omitted = new Set<string>();
  for (const [category, words] of Object.entries(CATEGORY_WORDS)) {
    for (const word of words) {
      const match = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\b`).exec(request);
      if (!match) continue;
      const before = request.slice(Math.max(0, match.index - 55), match.index);
      const clause = before.split(/\bbut\b|\bwhile\b|\band\b|,|;/).at(-1) ?? before;
      if (KEEP_CUE.test(clause)) kept.add(category);
      if (CHANGE_CUE.test(clause)) changed.add(category);
      if (OMIT_CUE.test(clause) && (word === category || word === `${category}s` || word === "footwear" || word === "outerwear")) omitted.add(category);
      break;
    }
  }
  return { kept, changed, omitted };
}

function mergeIntent(previous: OutfitIntent | null, current: OutfitIntent, inherit: boolean, message: string): OutfitIntent {
  if (!inherit || !previous) return current;
  const currentHasStyle = current.styleHints.length > 0;
  const negates = (value: string) => new RegExp(`\\b(?:not|no longer|without|avoid)\\s+(?:for\\s+)?${value}\\b`, "i").test(message);
  const retainedStyles = previous.styleHints.filter((style) => !negates(style));
  const styleHints = currentHasStyle ? current.styleHints : retainedStyles;
  return {
    mode: current.mode === "rotation" ? "rotation" : previous.mode,
    occasion: current.occasion ?? (previous.occasion && negates(previous.occasion) ? null : previous.occasion),
    weather: current.weather ?? (previous.weather && negates(previous.weather) ? null : previous.weather),
    styleHints,
    styleSource: currentHasStyle ? "request" : styleHints.length ? previous.styleSource : "none",
    alternativeRequested: current.alternativeRequested,
  };
}

export function planHangerTurn(input: {
  wardrobe: WardrobeItem[];
  message: string;
  activeOutfit?: HangerActiveOutfit | null;
}): HangerTurnPlan {
  const currentIntent = readOutfitIntent(input.message);
  const creationRequested = asksForOutfitSuggestion(input.message);
  const activeItems = ownedActiveItems(input.wardrobe, input.activeOutfit);
  const activeItemIds = activeItems.map((item) => item.id);
  const hasActive = activeItemIds.length > 0;
  const requested = explicitlyRequestedWardrobeItems(input.wardrobe, input.message);
  const explicitlyExcluded = explicitlyExcludedWardrobeItems(input.wardrobe, input.message);
  const { kept, changed, omitted } = categoryInstructions(input.message);
  const changeEverything = CHANGE_EVERYTHING.test(input.message);
  const creationVerbAt = input.message.search(/\b(?:build|create|make|style|suggest|give|show)\b/i);
  const refersToActive = CURRENT_LOOK_REFERENCE.test(creationRequested && creationVerbAt >= 0 ? input.message.slice(creationVerbAt) : input.message);
  const addingToFullOutfit = hasActive && activeItemIds.length >= MAX_OUTFIT_PIECES && ADD_TO_LOOK.test(input.message) && requested.some((item) => !activeItemIds.includes(item.id));
  const specificOwnedPieceUnresolved = (creationRequested || ADD_TO_LOOK.test(input.message)) && requested.length === 0
    && /\b(?:with|using|use|wear|include|including|add)\s+(?:my|the)\s+(?!(?:wardrobe|closet|outfit|look|plans)\b)[a-z]/i.test(input.message)
    && !/\b(?:without|instead of|rather than)\s+(?:my|the)\b/i.test(input.message);

  let mode: HangerTurnMode;
  // Questions and explicit confirmations must not be interpreted as revisions just because
  // they refer to "this outfit". A new-look request only inherits the current look when
  // the customer actually refers to it ("make this outfit more formal").
  if (addingToFullOutfit || specificOwnedPieceUnresolved) mode = "clarify";
  else if (WARDROBE_REVIEW.test(input.message)) mode = "advice";
  else if (!creationRequested && NEGATED_ACTION.test(input.message) && !ADD_TO_LOOK.test(input.message)) mode = "advice";
  else if (!creationRequested && SAVE_ACTIVE.test(input.message)) mode = "save-confirm";
  else if (!creationRequested && WEAR_ACTIVE.test(input.message)) mode = "wear-confirm";
  else if (hasActive && EXPLAIN_ACTIVE.test(input.message)) mode = "explain";
  else if (creationRequested && !KEEP_CUE.test(input.message) && !refersToActive) mode = "create";
  else if (hasActive && (ADD_TO_LOOK.test(input.message) || (refersToActive && (creationRequested || REVISION_CUE.test(input.message))) || REVISION_CUE.test(input.message) || requested.length > 0 || explicitlyExcluded.length > 0)) mode = "revise";
  else if (creationRequested || currentIntent.mode === "rotation" || requested.length > 0) mode = "create";
  else mode = "advice";

  const required = new Set(requested.map((item) => item.id));
  const excluded = new Set(explicitlyExcluded.map((item) => item.id));
  for (const item of input.wardrobe) if (omitted.has(clean(item.category))) excluded.add(item.id);

  if (mode === "revise") {
    for (const item of activeItems) {
      if (changed.has(clean(item.category))) excluded.add(item.id);
      if (kept.has(clean(item.category)) && !excluded.has(item.id)) required.add(item.id);
    }

    const requestedCategories = new Set(requested.map((item) => clean(item.category)));
    const replacement = /\b(?:instead of|replace|swap|change)\b/i.test(input.message);
    if (requestedCategories.size && !ADD_TO_LOOK.test(input.message)) {
      for (const item of activeItems) {
        if (requestedCategories.has(clean(item.category)) && !required.has(item.id)) excluded.add(item.id);
      }
    }

    if (changeEverything) {
      for (const item of activeItems) if (!required.has(item.id)) excluded.add(item.id);
    } else if (changed.size || replacement || requestedCategories.size) {
      // A targeted revision keeps every unaffected part of the active outfit stable.
      for (const item of activeItems) if (!excluded.has(item.id)) required.add(item.id);
    } else if (KEEP_CUE.test(input.message) && !kept.size && !requested.length) {
      // "Keep those" resolves only to this account's latest canonical selection.
      for (const item of activeItems) required.add(item.id);
    }
  }

  // A direct current inclusion wins over an older exclusion, but only for this turn.
  for (const id of required) excluded.delete(id);
  const inheritIntent = mode === "revise" || mode === "explain" || mode === "save-confirm" || mode === "wear-confirm";
  const intent = mergeIntent(input.activeOutfit?.intent ?? null, currentIntent, inheritIntent, input.message);
  const requestedCount = requestedOutfitPieceCount(input.message);
  const removedActiveCount = activeItems.filter((item) => omitted.has(clean(item.category))).length;
  const addition = mode === "revise" && ADD_TO_LOOK.test(input.message) && requested.some((item) => !activeItemIds.includes(item.id)) ? 1 : 0;
  const maxPieces = Math.max(1, Math.min(MAX_OUTFIT_PIECES, requestedCount ?? (mode === "revise" && activeItemIds.length ? activeItemIds.length - removedActiveCount + addition : MAX_OUTFIT_PIECES)));

  return {
    mode,
    intent,
    activeItemIds,
    requiredItemIds: [...required].slice(0, maxPieces),
    excludedItemIds: [...excluded],
    maxPieces,
    rotatePriorSuggestions: mode === "create" ? hasActive : mode === "revise" && (currentIntent.alternativeRequested || changed.size > 0 || changeEverything),
    contextUsed: inheritIntent && hasActive,
    ...(addingToFullOutfit ? { clarification: `This outfit already has four pieces. To add ${requested.map((item) => item.name).join(" and ")}, tell me which existing piece to replace. I have not changed or saved your current outfit.` }
      : specificOwnedPieceUnresolved ? { clarification: "I couldn't find one clearly matching that requested piece in your saved wardrobe. Tell me its exact saved name, or add it to your Closet first. I have not made or saved an unrelated outfit." } : {}),
  };
}
