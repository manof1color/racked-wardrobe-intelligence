/**
 * Editing a piece that is already in someone's wardrobe.
 *
 * A saved piece could only be deleted: a wrong name or a misread type meant deleting it, losing
 * its wear history, and scanning it again. This module decides what an edit may change, as a pure
 * function over the stored record, so the rules are testable without a database.
 *
 * What an edit may never touch is as much the point as what it may:
 *  - Wear history. `wearCount` and `lastWornDays` are derived from recorded wears, and a product's
 *    released aggregates are built from those same wears. Editing a count would falsify both.
 *  - The photo. A different garment is a different piece; re-scan it.
 *  - Verified identity. A piece verified from its care label keeps its brand, style code, and
 *    registry link. Those change only through the label, never through a form.
 * A catalog product chosen here is the person's own pick — shown to them alone, never verified,
 * and never joined to the brand's owner index — exactly as it is when chosen during a scan.
 */
import { normalizeGarmentClassification } from "./garment-taxonomy.ts";
import type { BrandProductRegistration } from "./platform-types.ts";
import type { Season, WardrobeItem } from "./types.ts";

export const SEASONS: readonly Season[] = ["all-season", "spring", "summer", "fall", "winter"];
const MAX_STYLES = 8;

export interface GarmentEdit {
  name?: string;
  category?: string;
  subtype?: string;
  customType?: string | null;
  color?: string;
  pattern?: string;
  material?: string;
  style?: string[];
  season?: Season;
  /** Brand in the person's own words. Clears any catalog pick, since the two would disagree. */
  brand?: string | null;
  /** Choose an enrolled product as this piece (their own pick), or null to unlink one. */
  catalogProductId?: string | null;
}

/**
 * Why an edit was refused, in words the person can act on. 409 means the request was well formed
 * but conflicts with what the piece is — a verified brand link — rather than being malformed.
 */
export class GarmentEditRefused extends Error {
  // A plain field, not a constructor parameter property: the test runner strips types without
  // compiling, and parameter properties need compiling.
  readonly status: 400 | 409;
  constructor(message: string, status: 400 | 409 = 400) {
    super(message);
    this.name = "GarmentEditRefused";
    this.status = status;
  }
}

// Control characters become spaces rather than vanishing, so a pasted line break separates two
// words instead of gluing them together.
const clean = (value: unknown, maximum: number) =>
  typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maximum) : "";

/**
 * Reads an untrusted request body into an edit. Unknown keys are dropped rather than passed
 * along, so a body naming `wearCount` or `registryProductId` changes nothing at all.
 */
export function readGarmentEdit(value: unknown): GarmentEdit {
  if (!value || typeof value !== "object") throw new GarmentEditRefused("Nothing to change was sent.");
  const body = value as Record<string, unknown>;
  const edit: GarmentEdit = {};
  if ("name" in body) {
    const name = clean(body.name, 100);
    if (!name) throw new GarmentEditRefused("Give the piece a name.");
    edit.name = name;
  }
  if ("category" in body) edit.category = clean(body.category, 40);
  if ("subtype" in body) edit.subtype = clean(body.subtype, 60);
  if ("customType" in body) edit.customType = body.customType === null ? null : clean(body.customType, 60) || null;
  for (const [key, maximum] of [["color", 60], ["pattern", 60], ["material", 100]] as const) {
    if (key in body) {
      const text = clean(body[key], maximum);
      if (!text) throw new GarmentEditRefused(`The ${key === "color" ? "colour" : key} cannot be empty.`);
      edit[key] = text;
    }
  }
  if ("style" in body) {
    if (!Array.isArray(body.style)) throw new GarmentEditRefused("Style must be a list.");
    edit.style = [...new Set(body.style.map((entry) => clean(entry, 30).toLowerCase()).filter(Boolean))].slice(0, MAX_STYLES);
  }
  if ("season" in body) {
    const season = SEASONS.find((entry) => entry === body.season);
    if (!season) throw new GarmentEditRefused("Choose a season from the list.");
    edit.season = season;
  }
  if ("brand" in body) edit.brand = body.brand === null ? null : clean(body.brand, 100) || null;
  if ("catalogProductId" in body) edit.catalogProductId = body.catalogProductId === null ? null : clean(body.catalogProductId, 128) || null;
  if (!Object.keys(edit).length) throw new GarmentEditRefused("Nothing to change was sent.");
  return edit;
}

/** Brand details that only a care label may set on a verified piece. */
const touchesIdentity = (edit: GarmentEdit) => "brand" in edit || "catalogProductId" in edit;

/**
 * Whether a stored piece is verified. The status field alone is not enough: a piece verified
 * before that field existed has no status, yet sits in its brand's owner index with a registry id.
 * Reading only the status let such a piece be relabelled as another brand while the first brand
 * kept counting it and its wears.
 */
export function isVerifiedPiece(item: Pick<WardrobeItem, "identityStatus" | "registryProductId"> & { GSI1PK?: unknown }) {
  return item.identityStatus === "verified" || Boolean(item.registryProductId) || String(item.GSI1PK ?? "").startsWith("PRODUCT#");
}

/**
 * The fields to write for this edit. Only fields named here are ever written; everything else on
 * the stored record — wear history, photos, owner, verified identity — is left exactly as it is.
 */
export function applyGarmentEdit(item: WardrobeItem, edit: GarmentEdit, registry: BrandProductRegistration[] = []): Partial<WardrobeItem> {
  if (isVerifiedPiece(item) && touchesIdentity(edit)) {
    throw new GarmentEditRefused("This piece was verified from its care label, so its brand details can only change through the label. Everything else can be edited.", 409);
  }
  const changes: Partial<WardrobeItem> = {};
  if (edit.name !== undefined) changes.name = edit.name;

  if (edit.category !== undefined || edit.subtype !== undefined || edit.customType !== undefined) {
    const classification = normalizeGarmentClassification(edit.category ?? String(item.category), edit.subtype ?? String(item.subtype ?? ""));
    changes.category = classification.category;
    changes.subtype = classification.subtype;
    // As at creation: a typed type is kept only beside a fallback subtype, so it cannot contradict
    // a controlled one.
    const typed = edit.customType !== undefined ? edit.customType : item.customType ?? null;
    changes.customType = typed && classification.subtype.startsWith("other-") ? typed : null;
    if (classification.category !== "shoe") changes.wearableUnit = "single";
  }

  if (edit.color !== undefined) changes.color = edit.color;
  if (edit.pattern !== undefined) changes.pattern = edit.pattern;
  if (edit.material !== undefined) changes.material = edit.material;
  if (edit.style !== undefined) changes.style = edit.style;
  if (edit.season !== undefined) changes.season = edit.season;

  if (edit.catalogProductId !== undefined) {
    if (edit.catalogProductId === null) {
      Object.assign(changes, unlinked(edit.brand ?? null));
    } else {
      const product = registry.find((entry) => entry.id === edit.catalogProductId && !entry.archived);
      if (!product) throw new GarmentEditRefused("That product is no longer listed. Search the brand again.");
      Object.assign(changes, {
        brand: product.brand,
        sku: product.sku,
        selectedProductId: product.id,
        identityStatus: "owner-selected",
        listedPrice: product.price ?? null,
        listedCurrency: product.price !== undefined ? product.currency ?? "USD" : null,
      } satisfies Partial<WardrobeItem>);
    }
  } else if (edit.brand !== undefined) {
    // A brand typed by hand replaces any catalog pick: keeping the pick would show one brand's
    // price beside another brand's name.
    Object.assign(changes, unlinked(edit.brand));
  }
  return changes;
}

function unlinked(brand: string | null): Partial<WardrobeItem> {
  return {
    brand,
    sku: null,
    selectedProductId: null,
    listedPrice: null,
    listedCurrency: null,
    identityStatus: brand ? "user-labeled" : "unverified",
  };
}
