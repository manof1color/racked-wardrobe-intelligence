/**
 * What a stylist knows about kinds of clothing, written down so the outfit builder can use it.
 *
 * The builder used to judge "formal" only from the style tags image recognition attached to a piece,
 * and those are sparse and noisy. With no tag to go on, a graphic tee and a dress shirt looked the
 * same to it, and a graphic tee that had never been worn won on rotation. Asked for "a more formal
 * outfit", Hanger offered a Stussy graphic tee, jeans, sneakers, and a skully.
 *
 * This is the knowledge a person learns before styling anyone: every garment type in the taxonomy
 * has a formality on a five-step ladder, and words in a piece's own name can move it — a graphic or
 * ripped piece is dressed down, cashmere and a turtleneck dress up. Occasions then ask for a band of
 * that ladder. It is a curated dataset, not a trained model: every value can be read, argued with,
 * and tested, and the same request always gets the same answer.
 */
import { GARMENT_TAXONOMY, type GarmentSubtype } from "./garment-taxonomy.ts";
import type { OutfitOccasion } from "./outfit-ranking.ts";
import type { WardrobeItem } from "./types.ts";

/** 1 athletic or lounge · 2 casual · 3 smart casual · 4 business · 5 formal. Halves sit between. */
export const FORMALITY_LADDER = ["athletic or lounge", "casual", "smart casual", "business", "formal"] as const;

export const SUBTYPE_FORMALITY: Record<GarmentSubtype, number> = {
  // Tops
  "t-shirt": 2, polo: 3, "dress-shirt": 4.5, "casual-shirt": 3, blouse: 3.5, hoodie: 1.5, sweatshirt: 1.5,
  sweater: 3, cardigan: 3, "tank-top": 1.5, "other-top": 2.5,
  // Bottoms
  jeans: 2, chinos: 3, "dress-pants": 4.5, "casual-pants": 3, shorts: 1.5, sweatpants: 1, leggings: 1,
  skirt: 3, "other-bottom": 2.5,
  // Outerwear
  blazer: 4, "suit-jacket": 5, "bomber-jacket": 2, "denim-jacket": 2, "leather-jacket": 2.5, "puffer-jacket": 1.5,
  overcoat: 4.5, "rain-jacket": 1.5, vest: 2.5, "other-outerwear": 2.5,
  // Shoes
  sneakers: 2, "low-top-sneakers": 2, "high-top-sneakers": 2, "running-shoes": 1, "basketball-shoes": 1.5,
  "skate-shoes": 1.5, "slip-on-sneakers": 2, "dress-shoes": 5, oxfords: 5, derbies: 4.5, loafers: 4, boots: 3,
  "ankle-boots": 3.5, "chelsea-boots": 3.5, "work-boots": 2, "hiking-boots": 1.5, sandals: 1.5, slides: 1,
  heels: 4.5, flats: 3.5, mules: 3, clogs: 2, "other-shoes": 2.5,
  // Dresses and one-pieces
  "casual-dress": 2.5, "formal-dress": 5, "maxi-dress": 3, "midi-dress": 3.5, "mini-dress": 3, "shirt-dress": 3,
  "wrap-dress": 3.5, jumpsuit: 3, romper: 2, "other-dress": 3,
  // Bags
  tote: 2.5, backpack: 1.5, crossbody: 2.5, "shoulder-bag": 3, handbag: 3.5, clutch: 4.5, duffel: 1.5,
  briefcase: 4, "other-bag": 2.5,
  // Jewelry is judged separately (it dresses up or down); these values are for display only.
  ring: 3, necklace: 3, bracelet: 3, earrings: 3, watch: 3.5, brooch: 4, anklet: 2.5, "other-jewelry": 3,
  // Accessories
  belt: 3.5, hat: 2, beanie: 1.5, scarf: 3, gloves: 3, sunglasses: 2.5, tie: 5, "pocket-square": 5,
  "other-accessory": 2.5,
  "other-garment": 2.5,
};

/** When the subtype is missing or unknown, the category's middle. */
const CATEGORY_FORMALITY: Record<string, number> = {
  // An unlisted top is most often a tee or long sleeve; the rest sit in the middle.
  top: 2, bottom: 2.5, outerwear: 2.5, shoe: 2.5, dress: 3, bag: 2.5, jewelry: 3, accessory: 2.5,
};

/**
 * Words in a piece's own name or description that move it. The person's name for a piece is often
 * more specific than its subtype: "Stussy Graphic Tee" and "Black Skully" say more than "t-shirt"
 * and "hat". `set` replaces the level, `raise` adds half a step, `cap` limits it — applied in that
 * order, so a graphic print caps even a silk tee.
 */
export const NAME_CUES: Array<{ pattern: RegExp; rule: "set" | "raise" | "cap"; level: number; note: string }> = [
  { pattern: /\b(?:tuxedo|tux|three[- ]piece|suit jacket|suit trousers)\b/, rule: "set", level: 5, note: "suiting" },
  { pattern: /\b(?:blazer|sport ?coat)\b/, rule: "set", level: 4, note: "a tailored jacket" },
  { pattern: /\b(?:trousers|slacks|pleated)\b/, rule: "set", level: 4, note: "trousers" },
  { pattern: /\b(?:turtleneck|mock[- ]neck)\b/, rule: "set", level: 3.5, note: "a turtleneck" },
  { pattern: /\b(?:oxford shirt|button[- ]?(?:up|down)|dress shirt)\b/, rule: "set", level: 3.5, note: "a buttoned shirt" },
  { pattern: /\bhenley\b/, rule: "set", level: 2.5, note: "a henley" },
  { pattern: /\b(?:skully|beanie|snapback|trucker|bucket hat|baseball cap|ball cap)\b/, rule: "set", level: 1.5, note: "a casual hat" },
  { pattern: /\b(?:jordans?|air jordan|dunks?|yeezys?|air max|air force|af1s?)\b/, rule: "set", level: 2, note: "sneakers" },
  { pattern: /\b(?:timbs|timberlands?)\b/, rule: "set", level: 2.5, note: "boots, a step above sneakers" },
  { pattern: /\b(?:cashmere|merino|silk|satin|velvet|camel hair|tweed)\b/, rule: "raise", level: 0.5, note: "a dressier material" },
  { pattern: /\b(?:graphic|logo|band tee|printed tee|slogan)\b/, rule: "cap", level: 1.75, note: "a graphic print" },
  { pattern: /\b(?:ripped|distressed|destroyed|acid wash)\b/, rule: "cap", level: 1.75, note: "a distressed finish" },
  { pattern: /\b(?:cargo|joggers?|track ?pants?|tracksuit|gym|basketball shorts|sweat ?(?:pants|shorts|suit))\b/, rule: "cap", level: 1.5, note: "sportswear" },
  { pattern: /\b(?:pajamas?|pyjamas?|lounge(?:wear)?|slippers?|flip[- ]flops?)\b/, rule: "cap", level: 1, note: "loungewear" },
];

/** Style tags from image recognition count too, more gently than the name. */
const DRESSY_TAGS = ["formal", "tailored", "elegant", "refined"];
const SPORTY_TAGS = ["athletic", "sporty", "sport", "performance"];

export interface GarmentFormality {
  level: number;
  /** Plain words, e.g. "smart casual". */
  label: string;
  /** Why, for evidence: "a graphic print". */
  basis: string;
}

const lower = (value: unknown) => String(value ?? "").toLocaleLowerCase();
const clamp = (level: number) => Math.max(1, Math.min(5, level));

export function formalityLabel(level: number) {
  return FORMALITY_LADDER[Math.max(0, Math.min(4, Math.round(level) - 1))];
}

export function garmentFormality(item: Pick<WardrobeItem, "name" | "category" | "subtype" | "customType" | "style" | "pattern" | "material">): GarmentFormality {
  const subtype = item.subtype && item.subtype in SUBTYPE_FORMALITY ? item.subtype : null;
  let level = subtype ? SUBTYPE_FORMALITY[subtype] : CATEGORY_FORMALITY[lower(item.category)] ?? 2.5;
  let basis = subtype ? subtype.replace(/-/g, " ") : "its category";
  // The name, the person's own type, and what recognition saw: a pattern of "graphic print" is a
  // graphic tee whatever the piece is called, and a material of cashmere dresses it up.
  const words = ` ${lower(`${item.name} ${item.customType ?? ""} ${item.pattern ?? ""} ${item.material ?? ""}`).replace(/[^a-z0-9 -]+/g, " ")} `;
  const set = NAME_CUES.find((cue) => cue.rule === "set" && cue.pattern.test(words));
  if (set) { level = set.level; basis = set.note; }
  for (const cue of NAME_CUES) if (cue.rule === "raise" && cue.pattern.test(words)) { level += cue.level; basis = `${basis}, ${cue.note}`; }
  const tags = (item.style ?? []).map(lower);
  if (tags.some((tag) => DRESSY_TAGS.includes(tag))) level += 0.5;
  if (tags.some((tag) => SPORTY_TAGS.includes(tag))) level = Math.min(level, 2);
  for (const cue of NAME_CUES) if (cue.rule === "cap" && cue.pattern.test(words) && level > cue.level) { level = cue.level; basis = cue.note; }
  level = clamp(level);
  return { level, label: formalityLabel(level), basis };
}

/** The band of the ladder each occasion asks for, and the point a stylist would aim at. */
export const OCCASION_FORMALITY: Record<OutfitOccasion, { target: number; min: number; max: number }> = {
  formal: { target: 4.5, min: 3.5, max: 5 },
  work: { target: 3.5, min: 2.5, max: 4.5 },
  evening: { target: 3.5, min: 2.5, max: 5 },
  casual: { target: 2, min: 1.5, max: 3.5 },
  active: { target: 1, min: 1, max: 1.5 },
  travel: { target: 2, min: 1, max: 3 },
};

/**
 * How well a piece suits an occasion, 0–100. Inside the occasion's band a piece loses a little for
 * each step from the target; outside it, it loses a lot — a graphic tee is not slightly wrong for a
 * wedding, it is wrong. Jewelry dresses up or down, so it suits everything but a workout.
 */
export function occasionFit(item: Pick<WardrobeItem, "name" | "category" | "subtype" | "customType" | "style" | "pattern" | "material">, occasion: OutfitOccasion) {
  if (lower(item.category) === "jewelry") {
    return occasion === "active"
      ? { score: 30, evidence: "Jewelry is best left off for a workout." }
      : { score: 75, evidence: "Jewelry dresses up or down." };
  }
  const formality = garmentFormality(item);
  const band = OCCASION_FORMALITY[occasion];
  const inside = formality.level >= band.min && formality.level <= band.max;
  const outside = formality.level < band.min ? band.min - formality.level : formality.level - band.max;
  const score = inside
    ? Math.round(100 - 15 * Math.abs(formality.level - band.target))
    : Math.max(0, Math.round(45 - 20 * outside));
  const evidence = inside
    ? `${formality.label} (${formality.basis}) suits ${occasion}.`
    : formality.level < band.min
      ? `${formality.label} (${formality.basis}) is too casual for ${occasion}.`
      : `${formality.label} (${formality.basis}) is dressier than ${occasion} needs.`;
  return { score, evidence };
}

/**
 * How many steps of the ladder a piece sits outside an occasion's band; 0 inside it. The outfit
 * builder uses this as a gate before rotation gets a say: a stylist picks from what suits the
 * occasion first and only then reaches for what has not been worn lately.
 */
export function formalityGap(item: Pick<WardrobeItem, "name" | "category" | "subtype" | "customType" | "style" | "pattern" | "material">, occasion: OutfitOccasion) {
  if (lower(item.category) === "jewelry") return occasion === "active" ? 1 : 0;
  const { level } = garmentFormality(item);
  const band = OCCASION_FORMALITY[occasion];
  return level < band.min ? band.min - level : level > band.max ? level - band.max : 0;
}

/** Every subtype in the taxonomy, so a test can prove none was left without knowledge. */
export const KNOWN_SUBTYPES = Object.values(GARMENT_TAXONOMY).flat() as GarmentSubtype[];
