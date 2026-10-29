/**
 * Real-use evidence: how often people keep the AI's proposal for a scanned piece unchanged.
 *
 * When a piece is saved, the server already holds the AI's proposal, signed into the confirmation
 * token, and the person's edits. Comparing the two at save time measures acceptance with integrity:
 * the proposal cannot be forged by the browser, and only pieces a person actually kept count.
 *
 * Only daily totals are stored — never an account, a photo, a garment or a name. Colour is not
 * measured: the save step offers no colour edit, so it would read as 100% kept by construction.
 */
export const ACCEPTANCE_FIELDS = ["category", "subtype", "name"] as const;
export type AcceptanceField = (typeof ACCEPTANCE_FIELDS)[number];

export interface AcceptanceOutcome {
  /** The scan could not read this piece, and the person labelled it from scratch. */
  needsLabel: boolean;
  edited: Record<AcceptanceField, boolean>;
  /** Kept exactly as proposed: nothing edited, and not a needs-your-label card. */
  unchanged: boolean;
}

const same = (a: unknown, b: unknown) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

export function acceptanceOutcome(
  proposal: { garment: { name: string; category: string; subtype: string } },
  saved: { name: string; category: string; subtype: string; customType?: string | null },
): AcceptanceOutcome {
  const edited = {
    category: !same(saved.category, proposal.garment.category),
    // A type typed by hand replaces the proposed one, even when it sits under the same "other" subtype.
    subtype: !same(saved.subtype, proposal.garment.subtype) || Boolean(saved.customType),
    name: !same(saved.name, proposal.garment.name),
  };
  // Read from the signed garment, not the unsigned fallback flag: a needs-your-label card is the one
  // whose category the scan left "unknown".
  const needsLabel = proposal.garment.category === "unknown";
  return { needsLabel, edited, unchanged: !needsLabel && !edited.category && !edited.subtype && !edited.name };
}

/** The DynamoDB ADD expression for one saved piece: whole-number counters, no identifiers. */
export function acceptanceIncrement(outcome: AcceptanceOutcome) {
  return {
    saved: 1,
    unchanged: outcome.unchanged ? 1 : 0,
    needsLabel: outcome.needsLabel ? 1 : 0,
    categoryEdited: outcome.edited.category ? 1 : 0,
    subtypeEdited: outcome.edited.subtype ? 1 : 0,
    nameEdited: outcome.edited.name ? 1 : 0,
  };
}

export type AcceptanceTotals = ReturnType<typeof acceptanceIncrement>;

/** Real-use totals as published in `data/pilot-usage.json` by the owner's snapshot. */
/** A count as published: exact from 5 up, "fewer than 5" below, null before any snapshot. */
export type PublishedCount = number | "fewer than 5" | null;

export interface PilotUsage {
  asOf: string | null;
  countingSince: string;
  accounts: { consumer: PublishedCount; brand: PublishedCount };
  piecesSaved: PublishedCount;
  outfitsSaved: PublishedCount;
  wearsRecorded: PublishedCount;
  hangerConversations: PublishedCount;
  /** Null until at least 5 pieces were saved. */
  aiAcceptance: AcceptanceTotals | null;
}

/** Any count under five is published as "fewer than 5", so no small group can be singled out. */
export const SMALL_COUNT = 5;
const shown = (value: PublishedCount) => (value === null ? "not measured yet" : typeof value === "string" || value < SMALL_COUNT ? "fewer than 5" : value.toLocaleString("en-US"));
const percent = (part: number, whole: number) => `${Math.round((part / whole) * 100)}%`;

/** The README's "Real use" block, generated from the data file so the two cannot disagree. */
export function renderRealUse(usage: PilotUsage) {
  const lines = ["<!-- real-use:start (generated from data/pilot-usage.json; tests/real-use.test.ts) -->"];
  if (!usage.asOf) {
    lines.push(`**Real use: not measured yet.** Racked has counted, since ${usage.countingSince}, how often people keep the AI's proposal for a scanned piece unchanged, as anonymous daily totals for real (non-demo) accounts. The first snapshot will be published here, with any count under 5 shown as "fewer than 5".`);
  } else {
    const a = usage.aiAcceptance;
    lines.push(`**Real use** (non-demo accounts, snapshot ${usage.asOf}; any count under 5 is shown as "fewer than 5"):`, "", "| Measure | Total |", "| --- | ---: |");
    lines.push(`| Consumer accounts | ${shown(usage.accounts.consumer)} |`, `| Brand accounts | ${shown(usage.accounts.brand)} |`);
    lines.push(`| Pieces saved | ${shown(usage.piecesSaved)} |`, `| Outfits saved | ${shown(usage.outfitsSaved)} |`, `| Wears recorded | ${shown(usage.wearsRecorded)} |`, `| Hanger conversations | ${shown(usage.hangerConversations)} |`);
    if (a && a.saved >= SMALL_COUNT) {
      lines.push("", `Across ${a.saved.toLocaleString("en-US")} scanned pieces people kept since ${usage.countingSince}, **${percent(a.unchanged, a.saved)} were saved exactly as the AI proposed**; people changed the category on ${percent(a.categoryEdited, a.saved)}, the type on ${percent(a.subtypeEdited, a.saved)} and the name on ${percent(a.nameEdited, a.saved)}, and ${percent(a.needsLabel, a.saved)} were pieces the scan could not read.`);
    } else {
      lines.push("", `Fewer than 5 scanned pieces have been saved since ${usage.countingSince}, too few to report how often the AI's proposal was kept.`);
    }
  }
  lines.push("<!-- real-use:end -->");
  return lines.join("\n");
}
