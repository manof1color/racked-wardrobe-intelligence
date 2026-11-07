import { MAX_WEAR_PIECES, type SuggestionStatus, type WearPhotoSuggestion } from "./wear-photo-match.ts";

/**
 * The confirm screen's choices for "Log with a photo". Kept apart from the component so the two
 * rules that matter are tested in plain code: a closet piece is in the outfit at most once, and
 * the outfit never holds more than the wear route accepts.
 */
export interface ReviewState {
  /** One entry per detected piece, in the same order as the suggestions. */
  rows: Array<{ detectionId: string; chosen: string | null }>;
  /** Pieces the person added by hand. */
  extras: string[];
}

export function startReview(suggestions: WearPhotoSuggestion[]): ReviewState {
  return { rows: suggestions.map(entry => ({ detectionId: entry.detectionId, chosen: entry.preselectedItemId })), extras: [] };
}

/** What would be recorded: every chosen piece once, in the order shown. */
export function chosenItemIds(state: ReviewState) {
  return [...new Set([...state.rows.map(row => row.chosen).filter((id): id is string => Boolean(id)), ...state.extras])];
}

/** Whether a piece is already in the outfit somewhere other than this row. */
export function usedElsewhere(state: ReviewState, itemId: string, rowIndex?: number) {
  return state.extras.includes(itemId) || state.rows.some((row, index) => index !== rowIndex && row.chosen === itemId);
}

/** Choose a piece for a detected garment, or null to leave it out. A refused choice changes nothing. */
export function chooseForRow(state: ReviewState, rowIndex: number, itemId: string | null): ReviewState {
  const row = state.rows[rowIndex];
  if (!row || row.chosen === itemId) return state;
  if (itemId !== null) {
    if (usedElsewhere(state, itemId, rowIndex)) return state;
    if (row.chosen === null && chosenItemIds(state).length >= MAX_WEAR_PIECES) return state;
  }
  return { ...state, rows: state.rows.map((entry, index) => (index === rowIndex ? { ...entry, chosen: itemId } : entry)) };
}

/** Add or remove a piece by hand. */
export function toggleExtra(state: ReviewState, itemId: string): ReviewState {
  if (state.extras.includes(itemId)) return { ...state, extras: state.extras.filter(id => id !== itemId) };
  if (usedElsewhere(state, itemId) || chosenItemIds(state).length >= MAX_WEAR_PIECES) return state;
  return { ...state, extras: [...state.extras, itemId] };
}

/** The plain-language line under each detected piece. Nothing but a strong match reads as likely. */
export function statusLine(status: SuggestionStatus) {
  switch (status) {
    case "matched": return "Likely match. Check it is the right one.";
    case "choose": return "Not sure which piece this is. Pick the right one, or leave it out.";
    case "no-match": return "No match in your closet. Add it by hand below if it is there, or leave it out.";
    case "unrecognized": return "Racked could not tell what this piece is. Add it by hand below if you wore it.";
    case "other-shoe": return "Probably the other shoe of a pair already chosen above.";
    case "already-matched": return "Its closest match is already chosen above. Pick another piece, or leave it out.";
  }
}
