/**
 * Deterministic dialogue planning for Consumer Hanger.
 *
 * Bedrock may explain a choice, but it never decides which private wardrobe IDs a pronoun such as
 * "those" or a revision such as "keep the shoes" refers to. This planner resolves those phrases
 * only against the latest owned outfit saved in the account's Hanger state.
 */
import { garmentFormality, weatherFit } from "./garment-knowledge.ts";
import type { HangerActiveOutfit, HangerPendingRequest } from "./hanger-memory.ts";
import {
  MAX_OUTFIT_PIECES,
  asksForOutfitSuggestion,
  explicitlyExcludedWardrobeItems,
  explicitlyRequestedWardrobeItems,
  readOutfitIntent,
  requestedOutfitCount,
  requestedOutfitPieceCount,
  type OutfitIntent,
} from "./outfit-ranking.ts";
import type { WardrobeItem } from "./types.ts";

export type HangerTurnMode = "create" | "revise" | "explain" | "save-confirm" | "wear-confirm" | "advice" | "clarify";

export interface HangerTurnPlan {
  mode: HangerTurnMode;
  /**
   * The request being answered. Normally the latest message; when that message only supplies
   * something Hanger asked for, it is that answer appended to the request still outstanding.
   */
  effectiveMessage: string;
  /** How many outfits this turn owes, which only a turn that builds outfits can be more than one. */
  outfitCount: number;
  /** The request to hold open if this turn ends in a question, so the answer completes it. */
  pendingRequest: HangerPendingRequest | null;
  intent: OutfitIntent;
  activeItemIds: string[];
  requiredItemIds: string[];
  excludedItemIds: string[];
  maxPieces: number;
  rotatePriorSuggestions: boolean;
  contextUsed: boolean;
  clarification?: string;
  /** Slots of the outfit on screen the person asked to change, e.g. ["shoe"]. Empty unless this is a targeted swap. */
  changedCategories: string[];
  /** Something the reply should say about a swap: the closet had nothing in the direction asked for. */
  swapNote?: string;
  /** Why a swap cannot be made at all — nothing else owned for that slot, or none of the kind asked for. */
  swapBlocked?: string;
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
const REVISION_CUE = /\b(?:keep|swap|switch|trade|change|replace|remove|drop|leave out|without|instead|different|another|adjust|redo|remake|revise|try again|make it|make this|make that|more formal|more casual|less formal|less casual|use that|use those|use them)\b/i;
const KEEP_CUE = /\b(?:keep|reuse|still use|use again|use that|use those|use them)\b/i;
const CHANGE_CUE = /\b(?:swap|switch|trade|change|replace|remove|drop|leave out|without|different|another)\b/i;
const CHANGE_EVERYTHING = /\b(?:change|replace|swap|redo)\s+(?:the\s+)?(?:whole|entire|everything)|\bchange everything else\b/i;
const WARDROBE_REVIEW = /\b(?:what have i not worn|what haven t i worn|which (?:pieces|items|garments) (?:have i not worn|are underused)|wardrobe gap|closet gap|what am i missing|how many times|how often)\b/i;
const NEGATED_ACTION = /\b(?:do not|don['’]?t|never|not|no)\s+(?:save|record|log|mark)\b/i;
const ADD_TO_LOOK = /\badd\b[^.!?;]{0,70}\b(?:to|into)\s+(?:(?:this|that|the|my|current)\s+)?(?:outfit|look)\b/i;
const CURRENT_LOOK_REFERENCE = /\b(?:this|that|current|same)\s+(?:outfit|look)\b|\b(?:make|style|change|adjust|redo|revise)\s+it\b/i;
const OMIT_CUE = /\b(?:remove|drop|leave out|without|no)\b/;

/**
 * Words that supply what Hanger asks for when it asks. A message made only of these is an answer
 * to the outstanding question — "cold", "for a wedding", "weather please" — and must finish the
 * request that prompted it rather than starting a thinner one of its own.
 */
const SUPPLIES_CONTEXT = /\b(?:weather|forecast|temperature|cold|cool|chilly|warm|hot|mild|rain|rainy|raining|wet|snow|snowy|windy|humid|sunny|indoors|outdoors|work|office|school|class|date|dinner|lunch|brunch|party|wedding|funeral|interview|meeting|church|gym|travel|flight|errands|casual|formal|smart|business|dressy|relaxed|comfortable|night out|going out|day|evening|morning|tonight|tomorrow|weekend|today)\b/i;
const ANSWER_LENGTH_WORDS = 8;
/**
 * Replies that keep a conversation going without answering anything. "Have a good day" names a
 * day and "no, that's fine for work" names an occasion, but both are someone saying they are
 * done — read as answers, they would rebuild the outfits that person just accepted.
 */
// "cool", "fine", and "good" are left out on purpose: each is also an answer about the weather
// ("cool and rainy"), and a request is only held when Hanger has just asked a question, so the
// weather meaning is the likelier one. Thanks count wherever they appear ("cool, thanks").
const ACKNOWLEDGEMENT = /^\s*(?:ok|okay|k|nice|great|perfect|awesome|amazing|love|lol|haha|no|nah|nope|yes|yeah|yep|yup|sure|that'?s (?:fine|good|great|perfect|it)|all good|sounds good|got it|bye|see ya|have a (?:good|great|nice)|talk (?:soon|later))\b|\b(?:thanks|thank you|thx|ty)\b/i;

/**
 * True when the message reads as an answer to a question rather than a fresh request. It must
 * name something Hanger could have asked for; length alone proves nothing, and treating every
 * short message as an answer turned "thanks!" into a request for five more outfits.
 */
export function suppliesPendingContext(message: string) {
  const words = message.trim().split(/\s+/).filter(Boolean);
  if (!words.length || words.length > ANSWER_LENGTH_WORDS) return false;
  if (ACKNOWLEDGEMENT.test(message)) return false;
  return SUPPLIES_CONTEXT.test(message);
}

/**
 * Whether a reply asked the customer anything. A request is held open only when it did; holding
 * it after every outfit meant the next unrelated message was read as an answer to a question
 * nobody had asked.
 */
export function replyAsksBack(reply: string) {
  return reply.includes("?");
}

export const CATEGORY_WORDS: Record<string, string[]> = {
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

/** The category a word names — "shoes", "tops", "pants" — or null. */
export function categoryForWord(word: unknown): string | null {
  const wanted = clean(word);
  if (!wanted) return null;
  return Object.entries(CATEGORY_WORDS).find(([category, words]) => category === wanted || words.includes(wanted))?.[0] ?? null;
}

/**
 * Kinds of garment a swap can ask for by name: "swap the skirt for pants" wants trousers of some
 * kind, not shorts and not another skirt. Longest words first, so "dress shoes" is not read as "dress".
 */
const SWAP_TARGETS: Array<{ words: string[]; category: string; subtypes: string[] }> = [
  { words: ["dress shoes", "smart shoes"], category: "shoe", subtypes: ["dress-shoes", "oxfords", "derbies", "loafers"] },
  { words: ["running shoes", "runners"], category: "shoe", subtypes: ["running-shoes"] },
  { words: ["sneakers", "trainers", "kicks", "tennis shoes"], category: "shoe", subtypes: ["sneakers", "low-top-sneakers", "high-top-sneakers", "slip-on-sneakers", "running-shoes", "basketball-shoes", "skate-shoes"] },
  { words: ["boots"], category: "shoe", subtypes: ["boots", "ankle-boots", "chelsea-boots", "work-boots", "hiking-boots"] },
  { words: ["heels", "pumps"], category: "shoe", subtypes: ["heels"] },
  { words: ["loafers"], category: "shoe", subtypes: ["loafers"] },
  { words: ["sandals"], category: "shoe", subtypes: ["sandals", "slides"] },
  { words: ["flats"], category: "shoe", subtypes: ["flats"] },
  { words: ["dress pants", "trousers", "slacks"], category: "bottom", subtypes: ["dress-pants", "chinos", "casual-pants"] },
  { words: ["sweatpants", "sweats", "joggers"], category: "bottom", subtypes: ["sweatpants"] },
  { words: ["pants"], category: "bottom", subtypes: ["jeans", "chinos", "dress-pants", "casual-pants", "sweatpants", "leggings"] },
  { words: ["jeans", "denim"], category: "bottom", subtypes: ["jeans"] },
  { words: ["shorts"], category: "bottom", subtypes: ["shorts"] },
  { words: ["skirt"], category: "bottom", subtypes: ["skirt"] },
  { words: ["chinos", "khakis"], category: "bottom", subtypes: ["chinos"] },
  { words: ["leggings", "tights"], category: "bottom", subtypes: ["leggings"] },
  { words: ["t-shirt", "t shirt", "tee"], category: "top", subtypes: ["t-shirt"] },
  { words: ["button-up", "button up", "button-down", "button down", "collared shirt", "dress shirt"], category: "top", subtypes: ["dress-shirt", "casual-shirt"] },
  { words: ["sweater", "jumper", "knit"], category: "top", subtypes: ["sweater", "cardigan"] },
  { words: ["hoodie"], category: "top", subtypes: ["hoodie"] },
  { words: ["sweatshirt", "crewneck"], category: "top", subtypes: ["sweatshirt"] },
  { words: ["blouse"], category: "top", subtypes: ["blouse"] },
  { words: ["polo"], category: "top", subtypes: ["polo"] },
  { words: ["cardigan"], category: "top", subtypes: ["cardigan"] },
  { words: ["tank top", "tank"], category: "top", subtypes: ["tank-top"] },
  { words: ["blazer", "sport coat"], category: "outerwear", subtypes: ["blazer", "suit-jacket"] },
  { words: ["rain jacket", "raincoat"], category: "outerwear", subtypes: ["rain-jacket"] },
  { words: ["coat"], category: "outerwear", subtypes: ["overcoat", "puffer-jacket"] },
];

/** The kind of garment a swap asks for after "for", "to" or "with" — or null when it names none. */
function readSwapTarget(message: string) {
  const tail = /\b(?:swap|switch|trade|change|replace)\b[^.!?;]*?\b(?:for|to|with|into)\s+([^.!?;]+)/i.exec(message)?.[1]?.toLocaleLowerCase();
  if (!tail) return null;
  const ordered = SWAP_TARGETS.flatMap((target) => target.words.map((word) => ({ word, target }))).sort((a, b) => b.word.length - a.word.length);
  return ordered.find(({ word }) => new RegExp(`\\b${word.replace(/[-]/g, "[- ]")}\\b`).test(tail)) ?? null;
}

/** Which way a swap should move the piece: dressier or more casual, warmer or cooler. */
function readSwapDirection(message: string) {
  const asked = message.toLocaleLowerCase();
  const formality = /\b(?:more casual|less formal|less dressy|dress(?:ed)? (?:it )?down|more relaxed|more laid[- ]back)\b/.test(asked) ? "down" as const
    : /\b(?:dressier|more formal|less casual|fancier|smarter|dress(?:ed)? (?:it )?up|more polished|more elegant|classier)\b/.test(asked) ? "up" as const : null;
  const warmth = /\b(?:warmer|cozier|cosier|heavier|thicker)\b/.test(asked) ? "up" as const
    : /\b(?:cooler|lighter|more breathable|less warm|not (?:so|as) (?:warm|hot|heavy))\b/.test(asked) ? "down" as const : null;
  return { formality, warmth };
}

const SLOT_NAMES: Record<string, string> = { top: "top", bottom: "bottoms", shoe: "shoes", outerwear: "jacket", dress: "dress", bag: "bag", jewelry: "jewelry", accessory: "accessory" };

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
    // The finer reading travels with the occasion it belongs to: a new occasion brings its own.
    ...(current.occasion
      ? (current.brief ? { brief: current.brief, ...(current.briefShift ? { briefShift: current.briefShift } : {}) } : {})
      : previous.brief && previous.occasion && !negates(previous.occasion) ? { brief: previous.brief, ...(previous.briefShift ? { briefShift: previous.briefShift } : {}) } : {}),
    ...(current.aesthetic ?? previous.aesthetic ? { aesthetic: current.aesthetic ?? previous.aesthetic } : {}),
  };
}

export function planHangerTurn(input: {
  wardrobe: WardrobeItem[];
  message: string;
  activeOutfit?: HangerActiveOutfit | null;
  pendingRequest?: HangerPendingRequest | null;
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
    && /\b(?:with|using|use|uses|wear|wears|include|includes|including|add|adds|features|featuring)\s+(?:my|the)\s+(?!(?:wardrobe|closet|outfit|look|plans)\b)[a-z]/i.test(input.message)
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

  // "Build me five outfits" → "what is the weather?" → "cold" has to answer the first message.
  // Without this, the answer is read as a new and much vaguer request, and the five outfits the
  // customer already asked for never arrive.
  const pending = input.pendingRequest ?? null;
  const continues = mode === "advice" && Boolean(pending) && suppliesPendingContext(input.message);
  if (continues) mode = "create";
  const effectiveMessage = continues && pending ? `${pending.message} ${input.message}`.slice(0, 1_000) : input.message;

  const required = new Set(requested.map((item) => item.id));
  const excluded = new Set(explicitlyExcluded.map((item) => item.id));
  for (const item of input.wardrobe) if (omitted.has(clean(item.category))) excluded.add(item.id);

  if (mode === "revise") {
    for (const item of activeItems) {
      if (changed.has(clean(item.category))) excluded.add(item.id);
      if (kept.has(clean(item.category)) && !excluded.has(item.id)) required.add(item.id);
    }

    const requestedCategories = new Set(requested.map((item) => clean(item.category)));
    const replacement = /\b(?:instead of|replace|swap|switch|trade|change)\b/i.test(input.message);
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

  // A swap of one slot is answered from the pieces that could actually take its place: of the kind
  // asked for ("for pants"), and in the direction asked for ("more casual", "warmer"). Everything
  // else in that slot is set aside for this turn, so the builder cannot answer with the wrong kind.
  const direction = readSwapDirection(input.message);
  // "Remove the shoes" takes the slot away; it is not a request for a different pair.
  const changedCategories = mode === "revise" && !changeEverything ? [...changed].filter((category) => !omitted.has(category) && activeItems.some((item) => clean(item.category) === category)) : [];
  let swapNote: string | undefined;
  let swapRefusal: string | undefined;
  for (const category of changedCategories) {
    // A piece named outright ("swap the shoes for my Black Boots") needs no narrowing.
    if (requested.some((item) => clean(item.category) === category)) continue;
    const current = activeItems.find((item) => clean(item.category) === category)!;
    const slot = SLOT_NAMES[category] ?? category;
    let candidates = input.wardrobe.filter((item) => clean(item.category) === category && !activeItemIds.includes(item.id) && !excluded.has(item.id));
    if (!candidates.length) { swapRefusal = `The ${current.name} is the only ${slot === "shoes" ? "pair of shoes" : slot} I can use from your closet, so there is nothing to swap it for. I have not changed your outfit.`; continue; }
    const target = readSwapTarget(input.message);
    if (target && target.target.category === category) {
      const ofKind = candidates.filter((item) => target.target.subtypes.includes(String(item.subtype ?? "")));
      if (!ofKind.length) { swapRefusal = `I looked through your ${slot} and there are no ${target.word} to swap in. I have not changed your outfit.`; continue; }
      candidates = ofKind;
    }
    const level = (item: WardrobeItem) => garmentFormality(item).level;
    const warmth = (item: WardrobeItem) => weatherFit(item, "cold").score - weatherFit(item, "warm").score;
    const moved = candidates.filter((item) =>
      (direction.formality === "down" ? level(item) < level(current) : direction.formality === "up" ? level(item) > level(current) : true)
      && (direction.warmth === "up" ? warmth(item) > warmth(current) : direction.warmth === "down" ? warmth(item) < warmth(current) : true));
    if (moved.length) candidates = moved;
    else if (direction.formality || direction.warmth) {
      const asked = direction.formality === "down" ? "more casual" : direction.formality === "up" ? "dressier" : direction.warmth === "up" ? "warmer" : "lighter";
      swapNote = `Nothing in your closet is ${asked} than the ${current.name}, so this is the closest other option.`;
    }
    const allowed = new Set(candidates.map((item) => item.id));
    for (const item of input.wardrobe) if (clean(item.category) === category && !allowed.has(item.id)) excluded.add(item.id);
  }
  if (swapRefusal) mode = "clarify";

  // A direct current inclusion wins over an older exclusion, but only for this turn.
  for (const id of required) excluded.delete(id);
  const inheritIntent = mode === "revise" || mode === "explain" || mode === "save-confirm" || mode === "wear-confirm";
  const merged = mergeIntent(input.activeOutfit?.intent ?? null, currentIntent, inheritIntent, input.message);
  // "Warmer" says the person is cold; "lighter" that they are warm. The swap is dressed for that.
  const intent = mode === "revise" && direction.warmth && !currentIntent.weather ? { ...merged, weather: direction.warmth === "up" ? "cold" as const : "warm" as const } : merged;
  const requestedCount = requestedOutfitPieceCount(input.message);
  const removedActiveCount = activeItems.filter((item) => omitted.has(clean(item.category))).length;
  const addition = mode === "revise" && ADD_TO_LOOK.test(input.message) && requested.some((item) => !activeItemIds.includes(item.id)) ? 1 : 0;
  const maxPieces = Math.max(1, Math.min(MAX_OUTFIT_PIECES, requestedCount ?? (mode === "revise" && activeItemIds.length ? activeItemIds.length - removedActiveCount + addition : MAX_OUTFIT_PIECES)));

  const producesOutfit = mode === "create" || mode === "revise";
  const outfitCount = !producesOutfit ? 1
    : continues && pending ? pending.count
    : requestedOutfitCount(effectiveMessage);

  return {
    mode,
    effectiveMessage,
    outfitCount,
    // Held open only while a question is outstanding; answering it clears the request.
    pendingRequest: producesOutfit && !continues ? { message: effectiveMessage, count: outfitCount } : null,
    intent,
    activeItemIds,
    requiredItemIds: [...required].slice(0, maxPieces),
    excludedItemIds: [...excluded],
    maxPieces,
    rotatePriorSuggestions: mode === "create" ? hasActive : mode === "revise" && (currentIntent.alternativeRequested || changed.size > 0 || changeEverything),
    contextUsed: inheritIntent && hasActive,
    changedCategories,
    ...(swapNote ? { swapNote } : {}),
    ...(swapRefusal ? { swapBlocked: swapRefusal } : {}),
    ...(swapRefusal ? { clarification: swapRefusal } : addingToFullOutfit ? { clarification: `This outfit already has four pieces. To add ${requested.map((item) => item.name).join(" and ")}, tell me which existing piece to replace. I have not changed or saved your current outfit.` }
      : specificOwnedPieceUnresolved ? { clarification: "I couldn't find one clearly matching that requested piece in your saved wardrobe. Tell me its exact saved name, or add it to your Closet first. I have not made or saved an unrelated outfit." } : {}),
  };
}
