/**
 * The Looks screen as rows you flip through: a Layer, a Top, a Bottom (or one Dress), and Shoes,
 * plus optional rows for a hat, bag, jewellery, or anything else.
 *
 * Pure state over the wardrobe, so every rule here is testable without a browser. Selections are
 * held as ids and resolved against the current wardrobe on every read, so a piece edited or
 * deleted elsewhere is reflected — or quietly dropped — rather than shown stale.
 *
 * The screen opens on Hanger's pick for today: the same deterministic ranker Hanger uses, asked
 * a plain "what should I wear today". Shuffle asks it again around the locked rows, steering away
 * from what has already been shown; Finish asks it for its best completion of the locked rows.
 * Neither is random, so the same wardrobe and the same taps give the same outfits.
 */
import { rankOutfit } from "./outfit-ranking.ts";
import type { WardrobeItem } from "./types.ts";

export type LooksRowKey = "layer" | "top" | "bottom" | "dress" | "shoe" | "hat" | "bag" | "jewelry" | "accessory";
export type LooksMode = "separates" | "dress";
export type LooksExtraKey = "hat" | "bag" | "jewelry" | "accessory";

export const LOOKS_EXTRAS: readonly LooksExtraKey[] = ["hat", "bag", "jewelry", "accessory"];
const TODAY = "What should I wear today?";
const MAX_LOOK_PIECES = 10;
const HAT_SUBTYPES = new Set(["hat", "beanie"]);

const ROW_LABELS: Record<LooksRowKey, string> = {
  layer: "Layer", top: "Top", bottom: "Bottom", dress: "Dress", shoe: "Shoes",
  hat: "Hat", bag: "Bag", jewelry: "Jewellery", accessory: "Other",
};

export interface LooksState {
  mode: LooksMode;
  extras: LooksExtraKey[];
  /** The chosen piece id per row; null is "none", which only an optional row can hold. */
  selected: Partial<Record<LooksRowKey, string | null>>;
  locked: LooksRowKey[];
  /** Everything shown so far, so Shuffle keeps bringing something new. */
  seen: string[];
}

export interface LooksRow {
  key: LooksRowKey;
  label: string;
  /** An optional row can be empty: its first position is "none". */
  optional: boolean;
  /** The row's pieces in flip order. */
  items: WardrobeItem[];
  selected: WardrobeItem | null;
  locked: boolean;
}

const category = (item: WardrobeItem) => String(item.category ?? "").toLowerCase();

/**
 * Which pieces a row may show. The Layer row holds jackets and shirts alike, so an open overshirt
 * or a flannel can go over a tee as easily as a blazer can.
 */
export function rowAccepts(key: LooksRowKey, item: WardrobeItem) {
  const kind = category(item);
  switch (key) {
    case "layer": return kind === "outerwear" || kind === "top";
    case "top": return kind === "top";
    case "bottom": return kind === "bottom";
    case "dress": return kind === "dress";
    case "shoe": return kind === "shoe";
    case "hat": return kind === "accessory" && HAT_SUBTYPES.has(String(item.subtype ?? ""));
    case "bag": return kind === "bag";
    case "jewelry": return kind === "jewelry";
    case "accessory": return kind === "accessory" && !HAT_SUBTYPES.has(String(item.subtype ?? ""));
  }
}

const isOptional = (key: LooksRowKey) => key === "layer" || (LOOKS_EXTRAS as readonly string[]).includes(key);

/** The rows on screen, top to bottom in the order a person dresses. */
export function visibleRowKeys(state: LooksState): LooksRowKey[] {
  const body: LooksRowKey[] = state.mode === "dress" ? ["layer", "dress", "shoe"] : ["layer", "top", "bottom", "shoe"];
  return [...body, ...state.extras];
}

/** Extra rows worth offering: ones this wardrobe can actually fill and that are not already open. */
export function availableExtras(wardrobe: WardrobeItem[], state: LooksState): LooksExtraKey[] {
  return LOOKS_EXTRAS.filter((key) => !state.extras.includes(key) && wardrobe.some((item) => rowAccepts(key, item)));
}

/**
 * A row's pieces in wardrobe order, so flipping a row always visits them in the same sequence.
 * The Layer row shows jackets before shirts: a jacket is what most people reach for as a layer.
 */
function rowItems(key: LooksRowKey, wardrobe: WardrobeItem[]) {
  const items = wardrobe.filter((item) => rowAccepts(key, item));
  return key === "layer" ? [...items.filter((item) => category(item) === "outerwear"), ...items.filter((item) => category(item) !== "outerwear")] : items;
}

/** Resolves the state against the wardrobe as it is now. */
export function looksRows(wardrobe: WardrobeItem[], state: LooksState): LooksRow[] {
  const byId = new Map(wardrobe.map((item) => [item.id, item]));
  return visibleRowKeys(state).map((key) => {
    const chosen = state.selected[key];
    const selected = chosen ? byId.get(chosen) ?? null : null;
    return {
      key,
      label: ROW_LABELS[key],
      optional: isOptional(key),
      items: rowItems(key, wardrobe),
      // A required row whose piece was deleted falls back to its first piece rather than showing
      // nothing; an optional one falls back to "none".
      selected: selected && rowAccepts(key, selected) ? selected : isOptional(key) ? null : wardrobe.find((item) => rowAccepts(key, item)) ?? null,
      locked: state.locked.includes(key),
    };
  });
}

/** The chosen pieces, in dressing order, with "none" rows left out. */
export function looksItemIds(wardrobe: WardrobeItem[], state: LooksState) {
  const ids = looksRows(wardrobe, state).map((row) => row.selected?.id).filter((id): id is string => Boolean(id));
  return [...new Set(ids)].slice(0, MAX_LOOK_PIECES);
}

function rowForRankedPiece(item: WardrobeItem, mode: LooksMode, extras: LooksExtraKey[]): LooksRowKey | null {
  const kind = category(item);
  if (kind === "outerwear") return "layer";
  if (kind === "top") return mode === "separates" ? "top" : "layer";
  if (kind === "bottom") return mode === "separates" ? "bottom" : null;
  if (kind === "dress") return mode === "dress" ? "dress" : null;
  if (kind === "shoe") return "shoe";
  const extra = LOOKS_EXTRAS.find((key) => rowAccepts(key, item));
  return extra && extras.includes(extra) ? extra : null;
}

/** Pieces the ranker must not offer in this mode: a dress in separates, separates in dress mode. */
function outOfMode(wardrobe: WardrobeItem[], mode: LooksMode) {
  return wardrobe.filter((item) => mode === "separates" ? category(item) === "dress" : ["top", "bottom"].includes(category(item))).map((item) => item.id);
}

/** Hanger's pick for today, laid out as rows. A pick that includes a dress opens in dress mode. */
export function initialLooks(wardrobe: WardrobeItem[]): LooksState {
  const ranked = rankOutfit(wardrobe, TODAY, { maxPieces: 4 }).pieces.map((piece) => piece.item);
  const mode: LooksMode = ranked.some((item) => category(item) === "dress") ? "dress" : "separates";
  const extras = [...new Set(ranked.map((item) => LOOKS_EXTRAS.find((key) => rowAccepts(key, item))).filter((key): key is LooksExtraKey => Boolean(key)))];
  const state: LooksState = { mode, extras, selected: {}, locked: [], seen: [] };
  for (const item of ranked) {
    const key = rowForRankedPiece(item, mode, extras);
    if (key && state.selected[key] === undefined) state.selected[key] = item.id;
  }
  return fillRequired(wardrobe, { ...state, seen: ranked.map((item) => item.id) });
}

/** Every required row holds a piece when the wardrobe has one for it; optional rows may be "none". */
function fillRequired(wardrobe: WardrobeItem[], state: LooksState): LooksState {
  const selected = { ...state.selected };
  for (const key of visibleRowKeys(state)) {
    if (isOptional(key)) { if (selected[key] === undefined) selected[key] = null; continue; }
    if (!selected[key]) {
      const taken = new Set(Object.values(selected).filter(Boolean));
      selected[key] = wardrobe.find((item) => rowAccepts(key, item) && !taken.has(item.id))?.id ?? null;
    }
  }
  return { ...state, selected };
}

/**
 * Flips one row. A piece already chosen in another row is skipped, so a shirt worn as the Top is
 * never offered again as the Layer over itself. A locked row does not move.
 */
export function stepRow(wardrobe: WardrobeItem[], state: LooksState, key: LooksRowKey, direction: 1 | -1): LooksState {
  if (state.locked.includes(key)) return state;
  const row = looksRows(wardrobe, state).find((entry) => entry.key === key);
  if (!row) return state;
  const positions: Array<WardrobeItem | null> = row.optional ? [null, ...row.items] : row.items;
  if (positions.length < 2) return state;
  const takenElsewhere = new Set(visibleRowKeys(state).filter((other) => other !== key).map((other) => state.selected[other]).filter(Boolean));
  let index = positions.findIndex((entry) => (entry?.id ?? null) === (row.selected?.id ?? null));
  for (let attempts = 0; attempts < positions.length; attempts++) {
    index = (index + direction + positions.length) % positions.length;
    const candidate = positions[index];
    if (!candidate || !takenElsewhere.has(candidate.id)) {
      const id = candidate?.id ?? null;
      return { ...state, selected: { ...state.selected, [key]: id }, seen: id && !state.seen.includes(id) ? [...state.seen, id] : state.seen };
    }
  }
  return state;
}

export function toggleLock(state: LooksState, key: LooksRowKey): LooksState {
  return { ...state, locked: state.locked.includes(key) ? state.locked.filter((entry) => entry !== key) : [...state.locked, key] };
}

/** Separates or a dress. Top and Bottom give way to one Dress row and back; locks on them lapse. */
export function setMode(wardrobe: WardrobeItem[], state: LooksState, mode: LooksMode): LooksState {
  if (state.mode === mode) return state;
  const lapsed: LooksRowKey[] = mode === "dress" ? ["top", "bottom"] : ["dress"];
  return fillRequired(wardrobe, { ...state, mode, locked: state.locked.filter((key) => !lapsed.includes(key)) });
}

export function addExtra(wardrobe: WardrobeItem[], state: LooksState, key: LooksExtraKey): LooksState {
  if (state.extras.includes(key)) return state;
  // Tapping "+ Bag" means a bag is wanted, so the new row opens on one rather than on "none".
  const first = wardrobe.find((item) => rowAccepts(key, item));
  return { ...state, extras: [...state.extras, key], selected: { ...state.selected, [key]: first?.id ?? null } };
}

export function removeExtra(state: LooksState, key: LooksExtraKey): LooksState {
  const selected = { ...state.selected };
  delete selected[key];
  return { ...state, extras: state.extras.filter((entry) => entry !== key), locked: state.locked.filter((entry) => entry !== key), selected };
}

/**
 * Asks the ranker to refill every unlocked row around the locked ones. `fresh` steers it away from
 * everything already shown (Shuffle); without it the ranker gives its best completion (Finish).
 * An unlocked required row the ranker leaves unchanged is flipped once, so Shuffle always moves.
 */
function refill(wardrobe: WardrobeItem[], state: LooksState, fresh: boolean): LooksState {
  const rows = visibleRowKeys(state);
  const lockedIds = state.locked.map((key) => state.selected[key]).filter((id): id is string => Boolean(id));
  const ranked = rankOutfit(wardrobe, TODAY, {
    maxPieces: 4,
    requiredItemIds: lockedIds,
    excludedItemIds: outOfMode(wardrobe, state.mode),
    ...(fresh ? { avoidItemIds: state.seen, rotatePriorSuggestions: true } : {}),
  }).pieces.map((piece) => piece.item);

  let next: LooksState = { ...state, selected: { ...state.selected } };
  const filled = new Set<LooksRowKey>();
  for (const item of ranked) {
    const key = rowForRankedPiece(item, state.mode, state.extras);
    if (!key || !rows.includes(key) || state.locked.includes(key) || filled.has(key)) continue;
    next.selected[key] = item.id;
    filled.add(key);
  }
  if (fresh) {
    for (const key of rows) {
      if (state.locked.includes(key) || filled.has(key) || isOptional(key)) continue;
      next = stepRow(wardrobe, next, key, 1);
    }
  }
  const shown = Object.values(next.selected).filter((id): id is string => Boolean(id));
  return { ...next, seen: [...new Set([...state.seen, ...shown])] };
}

export const shuffleLooks = (wardrobe: WardrobeItem[], state: LooksState) => refill(wardrobe, state, true);
export const finishLooks = (wardrobe: WardrobeItem[], state: LooksState) => refill(wardrobe, state, false);
