import assert from "node:assert/strict";
import test from "node:test";
import { MAX_WEAR_PIECES, type WearPhotoSuggestion } from "../lib/wear-photo-match.ts";
import { chooseForRow, chosenItemIds, startReview, statusLine, toggleExtra } from "../lib/wear-photo-review.ts";

function suggestion(detectionId: string, preselectedItemId: string | null, candidates: string[], status: WearPhotoSuggestion["status"] = preselectedItemId ? "matched" : "choose"): WearPhotoSuggestion {
  return { detectionId, detectedName: detectionId, category: "top", preselectedItemId, status, candidates: candidates.map(itemId => ({ itemId, score: 50, strength: itemId === preselectedItemId ? "strong" : "possible", reasons: [] })) };
}

test("the confirm screen starts from the strong matches only", () => {
  const state = startReview([suggestion("tee", "white-tee", ["white-tee", "grey-tee"]), suggestion("jeans", null, ["jeans-a", "jeans-b"])]);
  assert.deepEqual(chosenItemIds(state), ["white-tee"]);
});

test("a closet piece is used once in an outfit: in another row or added by hand, it is refused", () => {
  let state = startReview([suggestion("tee", "white-tee", ["white-tee", "grey-tee"]), suggestion("layer", null, ["white-tee", "grey-tee"])]);
  assert.equal(chooseForRow(state, 1, "white-tee"), state, "already chosen above");
  state = chooseForRow(state, 1, "grey-tee");
  assert.deepEqual(chosenItemIds(state), ["white-tee", "grey-tee"]);
  assert.equal(toggleExtra(state, "grey-tee"), state, "not added again by hand");
  // Swapping a row frees its old piece for another row.
  state = chooseForRow(state, 0, null);
  state = chooseForRow(state, 1, "white-tee");
  assert.deepEqual(chosenItemIds(state), ["white-tee"]);
});

test("remove and add by hand", () => {
  let state = startReview([suggestion("tee", "white-tee", ["white-tee"])]);
  state = chooseForRow(state, 0, null);
  assert.deepEqual(chosenItemIds(state), []);
  state = toggleExtra(state, "belt");
  state = toggleExtra(state, "watch");
  assert.deepEqual(chosenItemIds(state), ["belt", "watch"]);
  state = toggleExtra(state, "belt");
  assert.deepEqual(chosenItemIds(state), ["watch"]);
});

test("never more than the wear route's ten pieces", () => {
  let state = startReview([suggestion("extra-row", null, ["row-piece"])]);
  for (let index = 0; index < 12; index++) state = toggleExtra(state, `piece-${index}`);
  assert.equal(chosenItemIds(state).length, MAX_WEAR_PIECES);
  assert.equal(chooseForRow(state, 0, "row-piece"), state, "a row cannot push the outfit past ten");
});

test("only a strong match reads as likely; no line claims certainty", () => {
  const lines = (["matched", "choose", "no-match", "unrecognized", "other-shoe", "already-matched"] as const).map(statusLine);
  assert.match(lines[0], /^Likely match\. Check/);
  for (const line of lines) assert.doesNotMatch(line, /\b(certain|definitely|confirmed|exact)\b/i);
  assert.match(lines[2], /No match in your closet/);
});
