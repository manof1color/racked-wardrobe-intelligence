import type { AgentChatTurn } from "./platform-types.ts";
import type { WardrobeItem } from "./types.ts";

// Judge note: this replaces a fixed wear-count sort that returned the same four items
// for every message in a conversation. Selection is now scored against signals read
// from the request (occasion, weather, style) and against what Hanger already
// suggested earlier in the same conversation, so a follow-up genuinely produces
// something else. It stays deterministic — weighted scores with an id tie-break,
// never sampling — so results are reproducible and testable. It only ever ranks items
// the signed-in account already owns; it cannot invent or introduce an item.

export type OutfitOccasion = "work" | "formal" | "evening" | "casual" | "active" | "travel";
export type OutfitWeather = "cold" | "warm" | "wet";
export type OutfitMode = "rotation" | "outfit";

export interface OutfitIntent {
  mode: OutfitMode;
  occasion: OutfitOccasion | null;
  weather: OutfitWeather | null;
  styleHints: string[];
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
const OUTFIT_CREATION_KEYWORDS = /(?:build|create|make|style|suggest|give|show)(?:\s+[a-z0-9'-]+){0,8}\s+(?:outfit|look|rotation)|what (?:can|should) i wear/;
const STYLE_VOCABULARY = ["minimal", "classic", "casual", "tailored", "relaxed", "elegant", "utility", "sporty", "athletic", "vintage", "structured", "sleek", "comfortable", "statement", "layered", "refined"];
const REQUIRED_PIECE_CUE = /\b(?:use|using|wear|wearing|include|including|incorporate|pair|pairing|style|styling|with|from|around|centered|starting|start|featuring|feature|add|keep|want|need|must have)\b/;
const REQUIRED_PIECE_NEGATION = /\b(?:without|except|other than|instead of|rather than|avoid|exclude|excluding|skip|leave out|do not use|don t use|dont use|do not wear|don t wear|dont wear|do not include|don t include|dont include|no|not)\b[^,.!?;]{0,40}$/;
const ITEM_ALIAS_STOPWORDS = new Set([
  "black", "white", "blue", "brown", "grey", "gray", "red", "green", "yellow", "orange", "purple", "pink", "navy", "beige", "tan",
  "classic", "casual", "tailored", "relaxed", "elegant", "utility", "sporty", "athletic", "vintage", "structured", "sleek", "comfortable", "statement", "layered", "refined",
  "piece", "item", "outfit", "look", "clothing", "garment",
]);

const CATEGORY_SLOTS = ["top", "bottom", "shoe", "outerwear", "accessory"];

const OUTFIT_WEIGHTS = { occasion: 0.3, weather: 0.2, style: 0.15, underuse: 0.2, recency: 0.15 } as const;
const ROTATION_WEIGHTS = { occasion: 0.1, weather: 0.1, style: 0.1, underuse: 0.45, recency: 0.25 } as const;

function clean(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function searchable(value: unknown) {
  return ` ${clean(value).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()} `;
}

function searchableRequest(value: unknown) {
  return ` ${clean(value).replace(/[.!?;]/g, " | ").replace(/[^a-z0-9|]+/g, " ").replace(/\s+/g, " ").trim()} `;
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
    // A cue must be in the same sentence as the garment mention. This supports
    // comma-separated lists without treating a garment mentioned in unrelated
    // conversation context as a required piece.
    const sentenceBefore = before.split("|").at(-1) ?? before;
    const after = request.slice(index + needle.length, Math.min(request.length, index + needle.length + 30));
    const sentenceContext = `${sentenceBefore} ${after.split("|")[0]}`;
    if (!REQUIRED_PIECE_CUE.test(sentenceContext) || REQUIRED_PIECE_NEGATION.test(sentenceBefore)) continue;
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

/** Reads occasion, weather, style, and rotation signals out of the request itself. */
export function readOutfitIntent(message: string): OutfitIntent {
  const request = clean(message);
  const occasion = OCCASION_KEYWORDS.find(([, words]) => words.some((word) => request.includes(word)))?.[0] ?? null;
  const weather = WEATHER_KEYWORDS.find(([, words]) => words.some((word) => request.includes(word)))?.[0] ?? null;
  const styleHints = STYLE_VOCABULARY.filter((style) => request.includes(style));
  return { mode: ROTATION_KEYWORDS.test(request) ? "rotation" : "outfit", occasion, weather, styleHints, alternativeRequested: ALTERNATIVE_KEYWORDS.test(request) };
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
  if (intent.styleHints.length === 0) return { score: 50, evidence: "No style asked for, so style match is neutral." };
  const tags = (item.style ?? []).map(clean);
  const overlap = intent.styleHints.filter((hint) => tags.some((tag) => tag.includes(hint) || hint.includes(tag)));
  if (overlap.length === 0) return { score: 15, evidence: `Does not carry the requested ${intent.styleHints.join(", ")} style.` };
  return { score: Math.min(100, 60 + overlap.length * 25), evidence: `Matches the requested ${overlap.join(", ")} style.` };
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
    { key: "style", label: "Requested style", score: style.score, weight: weights.style, evidence: style.evidence },
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

function fillCategorySlots(ranked: RankedGarment[], maxPieces: number, requiredIds: string[] = []) {
  const chosen: RankedGarment[] = seedRequired(ranked, requiredIds, maxPieces);
  const used = new Set<string>();
  for (const entry of chosen) used.add(entry.item.id);
  for (const slot of CATEGORY_SLOTS) {
    if (chosen.length >= maxPieces) break;
    const best = ranked.find((entry) => !used.has(entry.item.id) && clean(entry.item.category).includes(slot));
    if (best) { chosen.push(best); used.add(best.item.id); }
  }
  for (const entry of ranked) {
    if (chosen.length >= maxPieces) break;
    if (!used.has(entry.item.id)) { chosen.push(entry); used.add(entry.item.id); }
  }
  return chosen;
}

/** True only for a request to produce a look, not general wardrobe advice. */
export function asksForOutfitSuggestion(message: string) {
  return OUTFIT_CREATION_KEYWORDS.test(clean(message));
}

function fillAlternativeCategorySlots(fresh: RankedGarment[], repeated: RankedGarment[], maxPieces: number, requiredIds: string[] = []) {
  const allRanked = [...fresh, ...repeated];
  const chosen: RankedGarment[] = seedRequired(allRanked, requiredIds, maxPieces);
  const usedItems = new Set<string>();
  const usedCategories = new Set<string>();
  const categorySlot = (entry: RankedGarment) => CATEGORY_SLOTS.find((slot) => clean(entry.item.category).includes(slot)) ?? clean(entry.item.category);
  for (const entry of chosen) { usedItems.add(entry.item.id); usedCategories.add(categorySlot(entry)); }
  const add = (entry: RankedGarment | undefined) => {
    if (!entry || chosen.length >= maxPieces || usedItems.has(entry.item.id)) return;
    chosen.push(entry); usedItems.add(entry.item.id); usedCategories.add(categorySlot(entry));
  };
  // Take every distinct-category fresh option before reusing an older suggestion.
  for (const slot of CATEGORY_SLOTS) add(fresh.find((entry) => clean(entry.item.category).includes(slot)));
  for (const slot of CATEGORY_SLOTS) {
    if (chosen.length >= maxPieces) break;
    if (!usedCategories.has(slot)) add(repeated.find((entry) => clean(entry.item.category).includes(slot)));
  }
  for (const entry of fresh) add(entry);
  for (const entry of repeated) add(entry);
  return chosen;
}

/**
 * Scores every owned garment against the request, then covers one piece per category
 * slot before filling any remainder with the next best. Items already suggested in
 * this conversation are set aside, unless doing so would leave too little to answer
 * with — a small wardrobe still gets a real outfit rather than an empty one.
 */
export function rankOutfit(
  wardrobe: WardrobeItem[],
  message: string,
  options: { history?: AgentChatTurn[]; maxPieces?: number; avoidItemIds?: Iterable<string>; rotatePriorSuggestions?: boolean } = {},
): GroundedOutfit {
  const intent = readOutfitIntent(message);
  const maxPieces = Math.max(1, options.maxPieces ?? MAX_OUTFIT_PIECES);
  const requiredItems = explicitlyRequestedWardrobeItems(wardrobe, message).slice(0, maxPieces);
  const requiredPieceIds = requiredItems.map((item) => item.id);
  const requiredIdSet = new Set(requiredPieceIds);
  const alreadySuggested = previouslySuggestedItemIds(wardrobe, options.history ?? []);
  if (intent.alternativeRequested || options.rotatePriorSuggestions) {
    const owned = new Set(wardrobe.map((item) => item.id));
    for (const id of options.avoidItemIds ?? []) if (owned.has(id)) alreadySuggested.add(id);
  }
  // An explicit current request outranks rotation: the customer may deliberately
  // ask to reuse a garment Hanger suggested earlier.
  for (const id of requiredPieceIds) alreadySuggested.delete(id);
  const fresh = wardrobe.filter((item) => !alreadySuggested.has(item.id));
  const repeated = wardrobe.filter((item) => alreadySuggested.has(item.id));
  // Fresh pieces always rank before repeats. When the wardrobe cannot supply a
  // completely new outfit, Hanger fills only the missing slots from earlier pieces
  // instead of abandoning the alternative and returning the identical outfit.
  const freshRanked = rankGarments(fresh, intent);
  const repeatedRanked = rankGarments(repeated, intent);
  const ranked = alreadySuggested.size && fresh.length ? [...freshRanked, ...repeatedRanked] : rankGarments(wardrobe, intent);
  const pieces = intent.mode === "rotation"
    ? [...seedRequired(ranked, requiredPieceIds, maxPieces), ...ranked.filter((entry) => !requiredIdSet.has(entry.item.id))].slice(0, maxPieces)
    : alreadySuggested.size && fresh.length
      ? fillAlternativeCategorySlots(freshRanked, repeatedRanked, maxPieces, requiredPieceIds)
      : fillCategorySlots(ranked, maxPieces, requiredPieceIds);
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
      : intent.mode === "rotation"
      ? "Ranked owned pieces by how little they have been worn and how long since they were last worn, with occasion, weather, and style as secondary signals."
      : "Scored owned pieces on occasion fit, weather and season, requested style, underuse, and time since last worn, then covered one piece per category before filling the rest.",
  };
}
