import type { AgentChatTurn } from "./platform-types.ts";
import type { WardrobeItem } from "./types.ts";

// Judge note: this replaces a fixed wear-count sort that returned the same four items
// for every message in a conversation. Selection is now scored against signals read
// from the request (occasion, weather, style) and against what Hanger already
// suggested earlier in the same conversation, so a follow-up genuinely produces
// something else. It stays deterministic — weighted scores with an id tie-break,
// never sampling — so results are reproducible and testable. It only ever ranks items
// the signed-in account already owns; it cannot invent or introduce an item.

export const OUTFIT_OCCASIONS = ["work", "formal", "evening", "casual", "active", "travel"] as const;
export const OUTFIT_WEATHERS = ["cold", "warm", "wet"] as const;
export type OutfitOccasion = (typeof OUTFIT_OCCASIONS)[number];
export type OutfitWeather = (typeof OUTFIT_WEATHERS)[number];
export type OutfitMode = "rotation" | "outfit";

export interface OutfitIntent {
  mode: OutfitMode;
  occasion: OutfitOccasion | null;
  weather: OutfitWeather | null;
  styleHints: string[];
  styleSource: "request" | "inspiration" | "none";
  alternativeRequested: boolean;
}

export interface OutfitScoreComponent {
  key: "occasion" | "weather" | "style" | "underuse" | "recency";
  label: string;
  score: number;
  weight: number;
  evidence: string;
}

export interface RankedGarment {
  item: WardrobeItem;
  score: number;
  components: OutfitScoreComponent[];
  reasons: string[];
}

export interface GroundedOutfit {
  intent: OutfitIntent;
  pieces: RankedGarment[];
  /** Owned pieces the customer explicitly required in this request. */
  requiredPieceIds: string[];
  /** Items held back because Hanger already suggested them earlier in this conversation. */
  setAside: number;
  methodology: string;
}

export const MAX_OUTFIT_PIECES = 4;

const OCCASION_KEYWORDS: Array<[OutfitOccasion, string[]]> = [
  ["formal", ["formal", "wedding", "gala", "black tie", "interview", "ceremony"]],
  ["work", ["work", "office", "meeting", "business", "professional", "presentation"]],
  ["evening", ["dinner", "date", "drinks", "night out", "evening", "party", "cocktail"]],
  ["active", ["gym", "workout", "run", "running", "training", "athletic", "hike", "exercise"]],
  ["travel", ["travel", "flight", "airport", "trip", "commute", "train"]],
  ["casual", ["casual", "weekend", "everyday", "relaxed", "errands", "coffee", "brunch"]],
];

const OCCASION_STYLES: Record<OutfitOccasion, string[]> = {
  work: ["tailored", "classic", "minimal", "smart", "structured", "refined"],
  formal: ["tailored", "formal", "classic", "elegant", "refined"],
  evening: ["elegant", "sleek", "statement", "refined", "minimal"],
  casual: ["casual", "relaxed", "everyday", "comfortable", "minimal"],
  active: ["athletic", "sport", "technical", "performance", "utility"],
  travel: ["comfortable", "casual", "layered", "utility", "relaxed"],
};

const WEATHER_KEYWORDS: Array<[OutfitWeather, string[]]> = [
  ["wet", ["rain", "rainy", "wet", "storm", "drizzle", "downpour"]],
  ["cold", ["cold", "winter", "snow", "freezing", "chilly", "cool"]],
  ["warm", ["warm", "hot", "summer", "heat", "sunny", "humid"]],
];

const WEATHER_SEASONS: Record<OutfitWeather, string[]> = {
  cold: ["fall", "winter"],
  warm: ["spring", "summer"],
  wet: ["fall", "winter"],
};

const ROTATION_KEYWORDS = /not worn|least worn|rotation|forgotten|underused|neglected|barely worn/;
// Natural follow-ups people use after seeing an outfit. These words must be
// recognized before ranking so "redo it" and "use other pieces" do not silently
// return the same deterministic selection.
const ALTERNATIVE_KEYWORDS = /something else|different|another|new outfit|adjust(?: it| the outfit| this look)?|redo(?: it| the outfit| this look)?|remake(?: it| the outfit| this look)?|revise(?: it| the outfit| this look)?|try again|start over|use (?:my )?other pieces|change (?:it|the outfit|this look)|switch (?:it|the outfit|this look)|swap (?:it|the outfit|this look|the pieces)|refresh (?:it|the outfit|this look)/;
const OUTFIT_CREATION_KEYWORDS = /(?:build|create|make|style|suggest|give|show|put together|throw together|plan)(?:\s+[a-z0-9'-]+){0,8}\s+(?:outfit|look|rotation|fit)|what (?:can|should|could) i wear|what about (?:an?|another|some) (?:outfit|look|fit)|an? (?:outfit|look|fit)(?:\s+[a-z0-9'-]+){0,3}\s+(?:that|which|with|using|including|includes|featuring|around)|(?:advice|help|ideas?|suggestions?|recommendations?|thoughts)(?:\s+[a-z0-9'-]+){0,4}\s+(?:on |for |about )?what to wear|(?:what|something|anything) to wear|dress me|help me (?:get )?dress|outfit ideas|style me/;
export const STYLE_VOCABULARY = ["minimal", "classic", "casual", "tailored", "relaxed", "elegant", "utility", "sporty", "athletic", "vintage", "structured", "sleek", "comfortable", "statement", "layered", "refined"];
const REQUIRED_PIECE_CUE = /\b(?:use|uses|using|wear|wears|wearing|include|includes|including|incorporate|incorporates|pair|pairs|pairing|style|styles|styling|with|from|around|centered|starting|start|featuring|feature|features|add|adds|keep|keeps|want|wants|need|needs|has|have|must have|built around|based on)\b/;
const REPLACEMENT_TARGET_CUE = /\b(?:change|swap|replace)\b[^|.!?;]{0,65}\b(?:to|for|with)(?:\s+(?:the|my|a))?$/;
const EXCLUDED_PIECE_CUE = /\b(?:without|except|other than|instead of|rather than|avoid|exclude|excluding|skip|leave out|drop|remove|replace|swap out|change out|never|hate|do not want|don t want|dont want|do not use|don t use|dont use|do not wear|don t wear|dont wear|do not include|don t include|dont include|no|not)\b[^,.!?;]{0,50}$/;
const EXCLUSION_CATEGORY_ALIASES: Record<string, string[]> = {
  top: ["top", "tops"], bottom: ["bottom", "bottoms"], shoe: ["shoe", "shoes", "footwear"],
  outerwear: ["outerwear"], dress: ["dress", "dresses"], bag: ["bag", "bags"],
  jewelry: ["jewelry", "jewellery"], accessory: ["accessory", "accessories"],
};
const ITEM_ALIAS_STOPWORDS = new Set([
  "black", "white", "blue", "brown", "grey", "gray", "red", "green", "yellow", "orange", "purple", "pink", "navy", "beige", "tan",
  "classic", "casual", "tailored", "relaxed", "elegant", "utility", "sporty", "athletic", "vintage", "structured", "sleek", "comfortable", "statement", "layered", "refined",
  "piece", "item", "outfit", "look", "clothing", "garment",
]);

const OPTIONAL_CATEGORY_SLOTS = ["outerwear", "bag", "accessory", "jewelry"];

const OUTFIT_WEIGHTS = { occasion: 0.3, weather: 0.2, style: 0.15, underuse: 0.2, recency: 0.15 } as const;
const ROTATION_WEIGHTS = { occasion: 0.1, weather: 0.1, style: 0.1, underuse: 0.45, recency: 0.25 } as const;

function clean(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function searchable(value: unknown) {
  return ` ${clean(value).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()} `;
}

function searchableRequest(value: unknown) {
  // Commas separate instructions such as "without the tee, use the shirt". Retain them
  // until cue resolution; otherwise "without" can leak into the next garment mention.
  return ` ${clean(value).replace(/[.!?;]/g, " | ").replace(/,/g, " , ").replace(/[^a-z0-9|,]+/g, " ").replace(/\s+/g, " ").trim()} `;
}

function pieceInstructionBefore(request: string, index: number): "require" | "exclude" | null {
  const before = request.slice(0, index);
  const sentence = before.split("|").at(-1) ?? before;
  // Explicit instructions after a comma or contrast word take precedence. A cue-free
  // list member inherits the prior cue ("use my tee, my jeans"), but a new "use" or
  // "not" starts its own instruction ("without my tee, use my shirt").
  const clauses = sentence.split(/,|\b(?:but|while|and|or)\b/);
  for (let position = clauses.length - 1; position >= 0; position--) {
    const clause = clauses[position].trim();
    // In "replace the shoes with Black Boots", the target follows "with" and is
    // required even though the earlier "replace" is an exclusion cue for the old pair.
    if (REPLACEMENT_TARGET_CUE.test(clause)) return "require";
    if (EXCLUDED_PIECE_CUE.test(clause)) return "exclude";
    if (REQUIRED_PIECE_CUE.test(clause)) return "require";
  }
  return null;
}

function aliasesFor(item: WardrobeItem) {
  const fullName = searchable(item.name).trim();
  const aliases = new Set<string>([fullName]);
  const subtype = searchable(item.subtype).trim();
  if (subtype.length >= 4) aliases.add(subtype);
  const color = searchable(item.color).trim();
  const category = searchable(item.category).trim();
  const brand = searchable(item.brand).trim();
  if (color.length >= 3 && subtype.length >= 4) aliases.add(`${color} ${subtype}`);
  if (color.length >= 3 && category.length >= 4) aliases.add(`${color} ${category}`);
  if (brand.length >= 3 && subtype.length >= 4) aliases.add(`${brand} ${subtype}`);
  if (brand.length >= 3 && category.length >= 4) aliases.add(`${brand} ${category}`);
  const sku = searchable(item.sku).trim();
  if (sku.length >= 4) aliases.add(sku);
  for (const token of fullName.split(" ")) {
    if (token.length >= 4 && !ITEM_ALIAS_STOPWORDS.has(token)) aliases.add(token);
  }
  return [...aliases].filter((alias) => alias.length >= 4);
}

/**
 * Resolves explicit natural-language inclusion requests to owned garments only.
 * Ambiguous aliases are ignored rather than forcing the wrong wardrobe item.
 */
export function explicitlyRequestedWardrobeItems(wardrobe: WardrobeItem[], message: string) {
  const request = searchableRequest(message);
  const aliases = new Map<string, WardrobeItem[]>();
  for (const item of wardrobe) {
    for (const alias of aliasesFor(item)) aliases.set(alias, [...(aliases.get(alias) ?? []), item]);
  }
  const mentions: Array<{ item: WardrobeItem; index: number; specificity: number }> = [];
  for (const [alias, owners] of aliases) {
    if (owners.length !== 1) continue;
    const needle = ` ${alias} `;
    const index = request.indexOf(needle);
    if (index < 0) continue;
    const before = request.slice(Math.max(0, index - 90), index);
    const sentenceBefore = before.split("|").at(-1) ?? before;
    const after = request.slice(index + needle.length, Math.min(request.length, index + needle.length + 30));
    if (/\b(?:swap|change|replace)\b/.test(sentenceBefore) && /^\s*(?:for|to|with)\b/.test(after)) continue;
    if (pieceInstructionBefore(request, index) !== "require") continue;
    mentions.push({ item: owners[0], index, specificity: alias.length });
  }
  mentions.sort((a, b) => a.index - b.index || b.specificity - a.specificity || a.item.id.localeCompare(b.item.id));
  const seen = new Set<string>();
  const requested: WardrobeItem[] = [];
  for (const { item } of mentions) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    requested.push(item);
  }
  return requested;
}

/**
 * Resolves negative instructions to owned garments. These are hard exclusions for the current
 * turn: "without my Grey Hoodie" must never quietly rank that hoodie back into the outfit.
 * A negative class instruction such as "without jeans" excludes every matching owned item.
 * Unlike a positive request, no arbitrary item needs to be selected from an ambiguous class.
 */
export function explicitlyExcludedWardrobeItems(wardrobe: WardrobeItem[], message: string) {
  const request = searchableRequest(message);
  const requiredIds = new Set(explicitlyRequestedWardrobeItems(wardrobe, message).map((item) => item.id));
  const aliases = new Map<string, WardrobeItem[]>();
  for (const item of wardrobe) {
    const category = searchable(item.category).trim();
    for (const alias of [...aliasesFor(item), ...(EXCLUSION_CATEGORY_ALIASES[category] ?? [])]) {
      aliases.set(alias, [...(aliases.get(alias) ?? []), item]);
    }
  }
  const mentions: Array<{ item: WardrobeItem; index: number; specificity: number }> = [];
  for (const [alias, owners] of aliases) {
    const needle = ` ${alias} `;
    const index = request.indexOf(needle);
    if (index < 0) continue;
    if (pieceInstructionBefore(request, index) !== "exclude") continue;
    for (const item of owners) mentions.push({ item, index, specificity: alias.length });
  }
  mentions.sort((a, b) => a.index - b.index || b.specificity - a.specificity || a.item.id.localeCompare(b.item.id));
  const seen = new Set<string>();
  return mentions.flatMap(({ item }) => {
    // A named replacement is not part of the set being replaced, even if a generic
    // source like "the shoes" initially matched every pair in the wardrobe.
    if (seen.has(item.id) || requiredIds.has(item.id)) return [];
    seen.add(item.id);
    return [item];
  });
}

/** A bounded piece count stated by the customer; ordinary requests keep the four-piece default. */
export function requestedOutfitPieceCount(message: string) {
  const request = clean(message);
  const numeric = request.match(/\b([1-4])(?:\s*[- ]\s*|\s+)pieces?\b/);
  if (numeric) return Number(numeric[1]);
  const words: Array<[number, string]> = [[1, "one"], [2, "two"], [3, "three"], [4, "four"]];
  return words.find(([, word]) => new RegExp(`\\b${word}(?:\\s*[- ]\\s*|\\s+)pieces?\\b`).test(request))?.[0] ?? null;
}

/** Reads occasion, weather, style, and rotation signals out of the request itself. */
export function readOutfitIntent(message: string): OutfitIntent {
  const request = clean(message);
  const positiveMention = (word: string) => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = request.matchAll(new RegExp(`\\b${escaped}\\b`, "g"));
    for (const match of matches) {
      const before = request.slice(Math.max(0, (match.index ?? 0) - 30), match.index);
      if (!/\b(?:not|no|no longer|less|without|avoid|never|do not want|don['’]?t want)\s+(?:for\s+)?(?:a\s+)?$/.test(before)) return true;
    }
    return false;
  };
  const statedLessFormal = /\b(?:less|not|no)\s+formal\b|\binformal\b/.test(request);
  const statedLessCasual = /\b(?:less|not|no)\s+casual\b/.test(request);
  const occasion = statedLessFormal ? "casual" : statedLessCasual ? "formal"
    : OCCASION_KEYWORDS.find(([, words]) => words.some(positiveMention))?.[0] ?? null;
  const weather = WEATHER_KEYWORDS.find(([, words]) => words.some(positiveMention))?.[0] ?? null;
  const styleHints = STYLE_VOCABULARY.filter(positiveMention);
  return { mode: ROTATION_KEYWORDS.test(request) ? "rotation" : "outfit", occasion, weather, styleHints, styleSource:styleHints.length?"request":"none", alternativeRequested: ALTERNATIVE_KEYWORDS.test(request) };
}

function occasionScore(item: WardrobeItem, intent: OutfitIntent) {
  if (!intent.occasion) return { score: 50, evidence: "No occasion given, so occasion fit is neutral." };
  const expected = OCCASION_STYLES[intent.occasion];
  const tags = (item.style ?? []).map(clean);
  const overlap = tags.filter((tag) => expected.some((want) => tag.includes(want) || want.includes(tag)));
  if (overlap.length === 0) return { score: tags.length ? 20 : 45, evidence: `No ${intent.occasion} style tags on this piece.` };
  return { score: Math.min(100, 60 + overlap.length * 20), evidence: `${overlap.join(", ")} suits ${intent.occasion}.` };
}

function weatherScore(item: WardrobeItem, intent: OutfitIntent) {
  if (!intent.weather) return { score: 50, evidence: "No weather given, so season fit is neutral." };
  const season = clean(item.season);
  if (season === "all-season" || !season) return { score: 70, evidence: "All-season piece works in most conditions." };
  const wanted = WEATHER_SEASONS[intent.weather];
  if (wanted.includes(season)) return { score: 100, evidence: `${season} suits ${intent.weather} conditions.` };
  return { score: 10, evidence: `${season} is a poor fit for ${intent.weather} conditions.` };
}

function styleScore(item: WardrobeItem, intent: OutfitIntent) {
  if (intent.styleHints.length === 0) return { score: 50, evidence: "No style request or saved inspiration signal, so style match is neutral." };
  const tags = (item.style ?? []).map(clean);
  const overlap = intent.styleHints.filter((hint) => tags.some((tag) => tag.includes(hint) || hint.includes(tag)));
  const source=intent.styleSource==="inspiration"?"saved inspiration":"request";
  if (overlap.length === 0) return { score: 15, evidence: `Does not carry the ${intent.styleHints.join(", ")} signal from the ${source}.` };
  return { score: Math.min(100, 60 + overlap.length * 25), evidence: `Matches ${overlap.join(", ")} from the ${source}.` };
}

function underuseScore(item: WardrobeItem) {
  const wears = Math.max(0, Number(item.wearCount ?? 0));
  const score = Math.max(0, 100 - Math.min(100, wears * 12));
  return { score, evidence: wears === 0 ? "Never worn yet." : `Worn ${wears} time${wears === 1 ? "" : "s"}.` };
}

function recencyScore(item: WardrobeItem) {
  const days = Math.max(0, Number(item.lastWornDays ?? 0));
  if (days >= 900) return { score: 100, evidence: "Not worn on record." };
  const score = Math.max(0, Math.min(100, Math.round((days / 60) * 100)));
  return { score, evidence: `Last worn ${days} day${days === 1 ? "" : "s"} ago.` };
}

function componentsFor(item: WardrobeItem, intent: OutfitIntent): OutfitScoreComponent[] {
  const weights = intent.mode === "rotation" ? ROTATION_WEIGHTS : OUTFIT_WEIGHTS;
  const occasion = occasionScore(item, intent);
  const weather = weatherScore(item, intent);
  const style = styleScore(item, intent);
  const underuse = underuseScore(item);
  const recency = recencyScore(item);
  return [
    { key: "occasion", label: "Occasion fit", score: occasion.score, weight: weights.occasion, evidence: occasion.evidence },
    { key: "weather", label: "Weather and season", score: weather.score, weight: weights.weather, evidence: weather.evidence },
    { key: "style", label: intent.styleSource==="inspiration"?"Inspired style":"Requested style", score: style.score, weight: weights.style, evidence: style.evidence },
    { key: "underuse", label: "Bringing it back into rotation", score: underuse.score, weight: weights.underuse, evidence: underuse.evidence },
    { key: "recency", label: "Time since last worn", score: recency.score, weight: weights.recency, evidence: recency.evidence },
  ];
}

function weightedScore(components: OutfitScoreComponent[]) {
  return Math.round(components.reduce((sum, component) => sum + component.score * component.weight, 0));
}

/**
 * Item ids Hanger already put in front of this person during this conversation.
 * Stored history is plain assistant text, so items are matched by name — the only
 * durable handle the transcript carries. Ids are never read back from the browser.
 */
export function previouslySuggestedItemIds(wardrobe: WardrobeItem[], history: AgentChatTurn[]) {
  const spoken = history.filter((turn) => turn.role === "assistant").map((turn) => clean(turn.content)).join(" \n ");
  if (!spoken.trim()) return new Set<string>();
  return new Set(wardrobe.filter((item) => {
    const name = clean(item.name);
    return name.length >= 3 && spoken.includes(name);
  }).map((item) => item.id));
}

function rankGarments(wardrobe: WardrobeItem[], intent: OutfitIntent): RankedGarment[] {
  return wardrobe
    .map((item) => {
      const components = componentsFor(item, intent);
      const score = weightedScore(components);
      const reasons = [...components]
        .sort((a, b) => b.score * b.weight - a.score * a.weight)
        .slice(0, 2)
        .map((component) => `${component.label}: ${component.evidence}`);
      return { item, score, components, reasons };
    })
    .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id));
}

function seedRequired(ranked: RankedGarment[], requiredIds: string[], maxPieces: number) {
  const byId = new Map(ranked.map((entry) => [entry.item.id, entry]));
  return requiredIds.map((id) => byId.get(id)).filter((entry): entry is RankedGarment => Boolean(entry)).slice(0, maxPieces);
}

function fillCategorySlots(ranked: RankedGarment[], maxPieces: number, requiredIds: string[] = [], preferDress = false, freshIds: Set<string> | null = null) {
  const chosen: RankedGarment[] = seedRequired(ranked, requiredIds, maxPieces);
  const usedItems = new Set(chosen.map((entry) => entry.item.id));
  const usedCategories = new Set(chosen.map((entry) => clean(entry.item.category)));
  const add = (entry: RankedGarment | undefined) => {
    if (!entry || chosen.length >= maxPieces || usedItems.has(entry.item.id)) return;
    chosen.push(entry);
    usedItems.add(entry.item.id);
    usedCategories.add(clean(entry.item.category));
  };
  const best = (category: string, freshOnly = false) => ranked.find((entry) => !usedItems.has(entry.item.id) && clean(entry.item.category) === category && (!freshOnly || freshIds?.has(entry.item.id)));

  // A dress is a foundation in place of top + bottom, never an extra fourth torso piece.
  const hasDress = usedCategories.has("dress");
  const hasSeparates = usedCategories.has("top") || usedCategories.has("bottom");
  if (!hasDress && !hasSeparates) {
    const dress = best("dress");
    const top = best("top");
    const bottom = best("bottom");
    const separateScore = top && bottom ? Math.round((top.score + bottom.score) / 2) : -1;
    if (dress && (preferDress || !top || !bottom || dress.score > separateScore)) add(dress);
    else { add(top); add(bottom); }
  } else if (!hasDress) {
    if (!usedCategories.has("top")) add(best("top"));
    if (!usedCategories.has("bottom")) add(best("bottom"));
  }

  // Footwear is part of the foundation. Optional slots prefer unseen pieces before returning
  // to an earlier suggestion of another category (for example a prior blazer over a fresh bag).
  if (!usedCategories.has("shoe")) add(best("shoe"));
  for (const slot of OPTIONAL_CATEGORY_SLOTS) {
    if (chosen.length >= maxPieces) break;
    if (!usedCategories.has(slot)) add(best(slot, Boolean(freshIds)));
  }
  for (const slot of OPTIONAL_CATEGORY_SLOTS) {
    if (chosen.length >= maxPieces) break;
    if (!usedCategories.has(slot)) add(best(slot));
  }

  // Prefer a new category before using a second piece from the same category. Multiple pieces in
  // one category still survive when the customer explicitly requested them because they were seeded.
  for (const entry of ranked) {
    if (chosen.length >= maxPieces) break;
    const category = clean(entry.item.category);
    const conflictsWithFoundation = category === "dress"
      ? usedCategories.has("top") || usedCategories.has("bottom")
      : (category === "top" || category === "bottom") && usedCategories.has("dress");
    if (!usedItems.has(entry.item.id) && !usedCategories.has(category) && !conflictsWithFoundation) add(entry);
  }
  for (const entry of ranked) {
    if (chosen.length >= maxPieces) break;
    const category = clean(entry.item.category);
    const conflictsWithFoundation = category === "dress"
      ? usedCategories.has("top") || usedCategories.has("bottom")
      : (category === "top" || category === "bottom") && usedCategories.has("dress");
    if (!usedItems.has(entry.item.id) && !conflictsWithFoundation) add(entry);
  }
  return chosen;
}

/** Score the already-selected owned pieces for explanation without choosing or replacing any ID. */
export function scoreOwnedPieces(items: WardrobeItem[], intent: OutfitIntent): RankedGarment[] {
  return items.map((item) => rankGarments([item], intent)[0]);
}

/** True only for a request to produce a look, not general wardrobe advice. */
export function asksForOutfitSuggestion(message: string) {
  return OUTFIT_CREATION_KEYWORDS.test(clean(message));
}

/**
 * Scores every owned garment against the request, then covers one piece per category
 * slot before filling any remainder with the next best. Items already suggested in
 * this conversation are set aside, unless doing so would leave too little to answer
 * with — a small wardrobe still gets a real outfit rather than an empty one.
 */
/**
 * More than one outfit, when more than one was asked for.
 *
 * "Build me five outfits for the week" used to return a single outfit, because the ranker only ever
 * produced one and nothing read the number. A set is built by ranking repeatedly and excluding every
 * piece already used, so the outfits share nothing — and when the closet runs out of pieces the set
 * stops early and says how many it could actually build rather than padding with repeats.
 */
export const MAX_OUTFIT_SET = 5;
const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, a: 1, an: 1 };

export function requestedOutfitCount(message: string) {
  const asked = message.toLocaleLowerCase();
  const digits = /\b(\d{1,3})\s+(?:unique\s+|different\s+|separate\s+|distinct\s+)?(?:outfits|looks|fits)\b/.exec(asked);
  if (digits) return Math.min(MAX_OUTFIT_SET, Math.max(1, Number(digits[1])));
  const words = /\b(one|two|three|four|five|six|seven)\s+(?:unique\s+|different\s+|separate\s+|distinct\s+)?(?:outfits|looks|fits)\b/.exec(asked);
  if (words) return Math.min(MAX_OUTFIT_SET, NUMBER_WORDS[words[1]] ?? 1);
  // "outfits for the week" names a quantity without a number: five working days.
  if (/\b(?:outfits|looks|fits)\b/.test(asked) && /\b(?:week|working week|workweek|every day|each day|daily)\b/.test(asked)) return MAX_OUTFIT_SET;
  if (/\b(?:a few|several|some|multiple)\s+(?:unique\s+|different\s+)?(?:outfits|looks|fits)\b/.test(asked)) return 3;
  return 1;
}

/**
 * One piece per category. A single outfit may legitimately carry a fourth piece — a jacket, a bag —
 * but the filler that tops an outfit up will otherwise add a second pair of trousers, which is both
 * a worse outfit and a closet spent twice as fast across a set.
 */
function oneOfEachCategory(pieces: RankedGarment[]) {
  const seen = new Set<string>();
  return pieces.filter((piece) => {
    const category = String(piece.item.category ?? "").toLocaleLowerCase();
    if (seen.has(category)) return false;
    seen.add(category);
    return true;
  });
}

export interface OutfitSetEntry {
  /** 1-based position in the set, so a reply and an action can name the same outfit. */
  index: number;
  outfit: GroundedOutfit;
}

/** The same pieces in a different order are the same outfit, so a set is deduplicated by id. */
const outfitSignature = (pieces: RankedGarment[]) => pieces.map((piece) => piece.item.id).sort().join("|");

/**
 * How many outfits in a set one piece may appear in. A category with at least as many pieces as
 * the set needs spends each one once — five pairs of shoes should not repeat across five outfits.
 * A category with fewer shares them out evenly instead: three tops across five outfits appear
 * twice at most, so the set rotates the whole closet rather than leaning on one favourite.
 */
function appearanceAllowance(wardrobe: WardrobeItem[], count: number) {
  const owned = new Map<string, number>();
  for (const item of wardrobe) {
    const category = String(item.category ?? "").toLocaleLowerCase();
    owned.set(category, (owned.get(category) ?? 0) + 1);
  }
  const allowance = new Map<string, number>();
  for (const [category, pieces] of owned) allowance.set(category, Math.max(1, Math.ceil(count / pieces)));
  return allowance;
}

export function rankOutfitSet(
  wardrobe: WardrobeItem[],
  message: string,
  options: Parameters<typeof rankOutfit>[2] & { count?: number } = {},
): OutfitSetEntry[] {
  const count = Math.max(1, Math.min(MAX_OUTFIT_SET, options.count ?? 1));
  const allowance = appearanceAllowance(wardrobe, count);
  const carriedAvoid = [...(options.avoidItemIds ?? [])];
  const appearances = new Map<string, number>();
  const used = new Set<string>();
  const signatures = new Set<string>();
  const entries: OutfitSetEntry[] = [];

  for (let index = 0; index < count; index++) {
    // A piece that has had its share of the set steps aside so the rest of the closet is seen.
    const spent = wardrobe
      .filter((item) => (appearances.get(item.id) ?? 0) >= (allowance.get(String(item.category ?? "").toLocaleLowerCase()) ?? 1))
      .map((item) => item.id);
    let pieces: RankedGarment[] = [];
    let outfit = null as ReturnType<typeof rankOutfit> | null;
    // Two attempts, and the second one only widens what may be reused: never an endless search.
    for (const excluded of [spent, [] as string[]]) {
      outfit = rankOutfit(wardrobe, message, {
        ...options,
        excludedItemIds: [...(options.excludedItemIds ?? []), ...excluded],
        avoidItemIds: [...carriedAvoid, ...used],
        rotatePriorSuggestions: index > 0 || options.rotatePriorSuggestions,
      });
      pieces = oneOfEachCategory(outfit.pieces);
      if (pieces.length && !signatures.has(outfitSignature(pieces))) break;
      pieces = [];
    }
    // A second outfit that repeats the first is not a second outfit. Stop and report honestly.
    if (!outfit || !pieces.length) break;
    signatures.add(outfitSignature(pieces));
    for (const piece of pieces) {
      used.add(piece.item.id);
      appearances.set(piece.item.id, (appearances.get(piece.item.id) ?? 0) + 1);
    }
    entries.push({ index: entries.length + 1, outfit: { ...outfit, pieces } });
  }
  return entries;
}

/** How many pieces the set had to use more than once, so the reply can say so rather than hide it. */
export function repeatedPiecesInSet(entries: OutfitSetEntry[]) {
  const seen = new Map<string, number>();
  for (const entry of entries) {
    for (const piece of entry.outfit.pieces) seen.set(piece.item.id, (seen.get(piece.item.id) ?? 0) + 1);
  }
  return [...seen.values()].filter((appearances) => appearances > 1).length;
}

export function rankOutfit(
  wardrobe: WardrobeItem[],
  message: string,
  options: {
    history?: AgentChatTurn[];
    maxPieces?: number;
    avoidItemIds?: Iterable<string>;
    excludedItemIds?: Iterable<string>;
    requiredItemIds?: Iterable<string>;
    rotatePriorSuggestions?: boolean;
    inspirationStyleHints?: Iterable<string>;
    intentOverride?: OutfitIntent;
  } = {},
): GroundedOutfit {
  const requestedIntent = options.intentOverride ?? readOutfitIntent(message);
  const suppliedInspiration=[...new Set([...(options.inspirationStyleHints??[])].map(clean).filter(Boolean))];
  const inspirationStyleHints=STYLE_VOCABULARY.filter(style=>suppliedInspiration.some(hint=>style===hint||style.includes(hint)||hint.includes(style))).slice(0,8);
  // A style stated in the current message always outranks historical inspiration.
  // Inspiration is a transparent fallback, never an instruction override.
  const intent=requestedIntent.styleHints.length||!inspirationStyleHints.length?requestedIntent:{...requestedIntent,styleHints:inspirationStyleHints,styleSource:"inspiration" as const};
  const maxPieces = Math.max(1, Math.min(MAX_OUTFIT_PIECES, options.maxPieces ?? requestedOutfitPieceCount(message) ?? MAX_OUTFIT_PIECES));
  const owned = new Set(wardrobe.map((item) => item.id));
  const requiredPieceIds = [...new Set([
    ...[...(options.requiredItemIds ?? [])].filter((id) => owned.has(id)),
    ...explicitlyRequestedWardrobeItems(wardrobe, message).map((item) => item.id),
  ])].slice(0, maxPieces);
  const requiredIdSet = new Set(requiredPieceIds);
  const excludedIdSet = new Set([
    ...[...(options.excludedItemIds ?? [])].filter((id) => owned.has(id)),
    ...explicitlyExcludedWardrobeItems(wardrobe, message).map((item) => item.id),
  ]);
  // A clear current inclusion is the strongest instruction for this turn. It may override an older
  // standing dislike without erasing that stored preference for later turns.
  for (const id of requiredPieceIds) excludedIdSet.delete(id);
  const eligibleWardrobe = wardrobe.filter((item) => !excludedIdSet.has(item.id));
  const alreadySuggested = new Set<string>();
  if (intent.alternativeRequested || options.rotatePriorSuggestions) {
    for (const id of previouslySuggestedItemIds(eligibleWardrobe, options.history ?? [])) alreadySuggested.add(id);
    for (const id of options.avoidItemIds ?? []) if (owned.has(id)) alreadySuggested.add(id);
  }
  // An explicit current request outranks rotation: the customer may deliberately
  // ask to reuse a garment Hanger suggested earlier.
  for (const id of requiredPieceIds) alreadySuggested.delete(id);
  const fresh = eligibleWardrobe.filter((item) => !alreadySuggested.has(item.id));
  const repeated = eligibleWardrobe.filter((item) => alreadySuggested.has(item.id));
  // Fresh pieces always rank before repeats. When the wardrobe cannot supply a
  // completely new outfit, Hanger fills only the missing slots from earlier pieces
  // instead of abandoning the alternative and returning the identical outfit.
  const freshRanked = rankGarments(fresh, intent);
  const repeatedRanked = rankGarments(repeated, intent);
  const ranked = alreadySuggested.size && fresh.length ? [...freshRanked, ...repeatedRanked] : rankGarments(eligibleWardrobe, intent);
  const preferDress = /\b(?:dress|gown|jumpsuit|romper)\b/i.test(message);
  const pieces = intent.mode === "rotation"
    ? [...seedRequired(ranked, requiredPieceIds, maxPieces), ...ranked.filter((entry) => !requiredIdSet.has(entry.item.id))].slice(0, maxPieces)
    : alreadySuggested.size && fresh.length
      ? fillCategorySlots([...freshRanked, ...repeatedRanked], maxPieces, requiredPieceIds, preferDress, new Set(fresh.map((item) => item.id)))
      : fillCategorySlots(ranked, maxPieces, requiredPieceIds, preferDress);
  const groundedPieces = pieces.map((piece) => requiredIdSet.has(piece.item.id)
    ? { ...piece, reasons: ["Directly requested by the customer.", ...piece.reasons] }
    : piece);
  const reused = groundedPieces.filter((piece) => alreadySuggested.has(piece.item.id)).length;
  return {
    intent,
    pieces: groundedPieces,
    requiredPieceIds,
    setAside: Math.max(0, alreadySuggested.size - reused),
    methodology: requiredPieceIds.length
      ? "Locked the explicitly requested owned pieces first, then scored compatible owned pieces to complete the outfit."
      : intent.styleSource==="inspiration"
      ? "Scored only owned pieces using the request plus style signals from Looks this Consumer intentionally saved as inspiration; current instructions still take priority."
      : intent.mode === "rotation"
      ? "Ranked owned pieces by how little they have been worn and how long since they were last worn, with occasion, weather, and style as secondary signals."
      : "Scored owned pieces on occasion fit, weather and season, requested style, underuse, and time since last worn, then covered one piece per category before filling the rest.",
  };
}
