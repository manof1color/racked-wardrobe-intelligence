// The words on the saved-outfit screens.

const CATEGORY_LABELS: Record<string, string> = {
  top: "Top", bottom: "Bottom", outerwear: "Outerwear", shoe: "Shoes", dress: "Dress", bag: "Bag", jewelry: "Jewelry", accessory: "Accessory",
};

export const pieceCategoryLabel = (category: string) => CATEGORY_LABELS[category] ?? "Piece";

const CATEGORY_ORDER = ["top", "dress", "bottom", "shoe", "outerwear", "bag", "jewelry", "accessory"];
const categoryRank = (category: string) => { const rank = CATEGORY_ORDER.indexOf(category); return rank < 0 ? CATEGORY_ORDER.length : rank; };

/** Head to toe, with the outer layer last. Pieces in the same category keep their saved order. */
export function outfitDetailOrder<T extends { category: string }>(pieces: T[]) {
  return [...pieces].sort((a, b) => categoryRank(a.category) - categoryRank(b.category));
}

export const wearsLabel = (wears: number) => `${wears} wear${wears === 1 ? "" : "s"}`;

export const piecesLabel = (pieces: number) => `${pieces} piece${pieces === 1 ? "" : "s"}`;

/** "Saved Aug 9, 2026", or just "Saved" when the stored date cannot be read. */
export function savedLabel(createdAt: string, timeZone?: string) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "Saved";
  return `Saved ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone }).format(date)}`;
}

/** The name to save, or null when an edit would leave it blank or unchanged. */
export function renamedOutfit(current: string, next: string) {
  const name = next.trim().replace(/\s+/g, " ");
  return name && name !== current ? name : null;
}
