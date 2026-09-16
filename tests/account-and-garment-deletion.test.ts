import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ACCOUNT_DELETION_CONFIRMATION,
  accountDeletionConfirmed,
  accountDeletionInventory,
  communityPostChangeForDeletedImage,
  outfitChangesForGarmentDeletion,
  ownedObjectKey,
  sharedEvidenceKeyToDelete,
} from "../lib/deletion-plan.ts";
import { RATE_LIMIT_RULES } from "../lib/rate-limit.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const OWNER = "7f1c2a9e-0000-4000-8000-000000000001";
const OTHER = "7f1c2a9e-0000-4000-8000-000000000002";

/** The body of one exported function, so the order of steps inside it can be checked. */
function functionBody(source: string, name: string) {
  const start = source.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `${name} must exist`);
  const next = source.indexOf("\nexport ", start + 10);
  return source.slice(start, next < 0 ? undefined : next);
}

function inOrder(body: string, steps: string[]) {
  let previous = -1;
  for (const step of steps) {
    const at = body.indexOf(step);
    assert.ok(at >= 0, `missing step: ${step}`);
    assert.ok(at > previous, `out of order: ${step}`);
    previous = at;
  }
}

test("deletion only ever reaches storage under the account's own prefix", () => {
  assert.equal(ownedObjectKey(`wardrobe/${OWNER}/piece.png`, OWNER), `wardrobe/${OWNER}/piece.png`);
  assert.equal(ownedObjectKey(`wardrobe/${OWNER}/evidence/scan.jpg`, OWNER), `wardrobe/${OWNER}/evidence/scan.jpg`);
  assert.equal(ownedObjectKey(`wardrobe/${OTHER}/piece.png`, OWNER), null, "another account's photo");
  assert.equal(ownedObjectKey(`wardrobe/${OWNER}/../${OTHER}/piece.png`, OWNER), null, "path traversal");
  assert.equal(ownedObjectKey(`demo/${OWNER}/piece.png`, OWNER), null, "outside the private prefixes");
  assert.equal(ownedObjectKey(undefined, OWNER), null);
  assert.equal(ownedObjectKey("wardrobe//piece.png", ""), null, "an empty account ID matches nothing");
});

test("a deleted garment leaves each saved outfit smaller or gone, never pointing at it", () => {
  const changes = outfitChangesForGarmentDeletion("g1", [
    { id: "two-pieces", itemIds: ["g1", "g2"] },
    { id: "only-this-piece", itemIds: ["g1"] },
    { id: "unrelated", itemIds: ["g2", "g3"] },
  ]);
  assert.deepEqual(changes, [
    { outfitId: "two-pieces", action: "update", itemIds: ["g2"] },
    { outfitId: "only-this-piece", action: "delete", itemIds: [] },
  ]);
});

// REGRESSION guard for the boundary the whole feature rests on.
test("REGRESSION: deleting a garment never edits another person's Community post", () => {
  const imageKey = `wardrobe/${OWNER}/piece.png`;
  const theirs = { ownerId: OTHER, publishedGarments: [{ publicGarmentId: "p1", name: "Tee", category: "top", imageKey, resolutionState: "GENERIC_UNVERIFIED" as const }] };
  assert.deepEqual(communityPostChangeForDeletedImage(theirs, OWNER, imageKey), { action: "keep" });
});

test("a published outfit loses only the deleted photograph, and an emptied post is removed", () => {
  const imageKey = `wardrobe/${OWNER}/piece.png`;
  const garment = (id: string, key: string) => ({ publicGarmentId: id, name: id, category: "top", imageKey: key, resolutionState: "GENERIC_UNVERIFIED" as const });
  const kept = garment("kept", `wardrobe/${OWNER}/other.png`);
  assert.deepEqual(
    communityPostChangeForDeletedImage({ ownerId: OWNER, publishedGarments: [garment("gone", imageKey), kept] }, OWNER, imageKey),
    { action: "update", publishedGarments: [kept] },
  );
  assert.deepEqual(communityPostChangeForDeletedImage({ ownerId: OWNER, publishedGarments: [garment("gone", imageKey)] }, OWNER, imageKey), { action: "delete" });
  assert.deepEqual(communityPostChangeForDeletedImage({ ownerId: OWNER, publishedGarments: [kept] }, OWNER, imageKey), { action: "keep" });
  assert.deepEqual(communityPostChangeForDeletedImage({ ownerId: OWNER, imageKey }, OWNER, imageKey), { action: "delete" }, "a legacy single-image post");
});

test("a scan's evidence photo goes only with the last piece cut from it", () => {
  const evidence = `wardrobe/${OWNER}/evidence/scan.jpg`;
  const shorts = { id: "shorts", evidenceImageKey: evidence };
  const shoes = { id: "shoes", evidenceImageKey: evidence };
  assert.equal(sharedEvidenceKeyToDelete(shorts, [shorts, shoes], OWNER), null, "the shoes still use it");
  assert.equal(sharedEvidenceKeyToDelete(shorts, [shorts], OWNER), evidence);
  assert.equal(sharedEvidenceKeyToDelete({ id: "x", evidenceImageKey: `wardrobe/${OTHER}/evidence/scan.jpg` }, [], OWNER), null);
});

test("an account inventory holds only this account's records and photos, with the profile last", () => {
  const inventory = accountDeletionInventory(OWNER, [
    { PK: `USER#${OWNER}`, SK: "PROFILE", email: "person@example.com" },
    { PK: `USER#${OWNER}`, SK: "GARMENT#g1", imageKey: `wardrobe/${OWNER}/g1.png`, evidenceImageKey: `wardrobe/${OWNER}/evidence/s.jpg`, GSI1PK: "PRODUCT#p1" },
    { PK: `USER#${OWNER}`, SK: "GARMENT#g2", imageKey: `wardrobe/${OTHER}/stolen.png` },
    { PK: `USER#${OWNER}`, SK: "OUTFIT#2026#o1", boardImageKey: `wardrobe/${OWNER}/outfits/o1.webp` },
    { PK: `USER#${OWNER}`, SK: "INSPIRATION#post1" },
    { PK: `USER#${OTHER}`, SK: "GARMENT#theirs", imageKey: `wardrobe/${OTHER}/theirs.png` },
  ]);
  assert.deepEqual(inventory.objectKeys.sort(), [`wardrobe/${OWNER}/evidence/s.jpg`, `wardrobe/${OWNER}/g1.png`, `wardrobe/${OWNER}/outfits/o1.webp`]);
  assert.deepEqual(inventory.productKeys, ["PRODUCT#p1"]);
  assert.equal(inventory.recordKeys.length, 5);
  assert.ok(inventory.recordKeys.every((key) => key.PK === `USER#${OWNER}`), "never another account's partition");
  assert.deepEqual(inventory.recordKeys.at(-1), { PK: `USER#${OWNER}`, SK: "PROFILE" });
});

test("account deletion needs the typed word, exactly", () => {
  assert.equal(ACCOUNT_DELETION_CONFIRMATION, "DELETE");
  assert.equal(accountDeletionConfirmed("DELETE"), true);
  assert.equal(accountDeletionConfirmed(" DELETE "), true);
  assert.equal(accountDeletionConfirmed("delete"), false);
  assert.equal(accountDeletionConfirmed(undefined), false);
});

test("garment deletion resolves dependants first and removes the record last, so a retry finishes", () => {
  inOrder(functionBody(read("lib/server/production-store.ts"), "deleteWardrobeItem"), [
    "outfitChangesForGarmentDeletion(",
    "communityPostChangeForDeletedImage(",
    "deleteOwnWearEvents(",
    "deleteOwnedObjects(",
    "new DeleteCommand({TableName:requireTable(),Key:{PK:`USER#${ownerId}`,SK:`GARMENT#${garmentId}`}})",
  ]);
});

test("account deletion checks the password first and removes the profile last", () => {
  const store = read("lib/server/production-store.ts");
  const body = functionBody(store, "deleteOwnConsumerAccount");
  inOrder(body, ["verifyAccountPassword(", 'account.role!=="consumer"', "ownCommunityPosts(", "deleteOwnWearEvents(", "deleteOwnedObjects(", "sweepOwnedPrefix(", 'key.SK!=="PROFILE"', "for(const key of profile)"]);
  // REGRESSION guard: only a missing list permission is tolerated; any other storage failure
  // must stop the deletion while the account still exists to retry.
  assert.ok(store.includes('if(name!=="AccessDenied"&&name!=="AccessDeniedException")throw error;'));
});

test("both deletion routes act only on the signed-in account and are rate limited", () => {
  const wardrobe = read("app/api/consumer/wardrobe/route.ts");
  assert.match(wardrobe, /deleteWardrobeItem\(session\.subject,itemId\)/);
  assert.match(wardrobe, /RATE_LIMIT_RULES\.garmentDelete/);
  assert.doesNotMatch(wardrobe, /body\??\.(ownerId|accountId|subject)/);

  const account = read("app/api/account/route.ts");
  assert.match(account, /deleteOwnConsumerAccount\(session\.subject,body\.currentPassword\)/);
  assert.match(account, /accountDeletionConfirmed\(body\.confirmation\)/);
  assert.match(account, /RATE_LIMIT_RULES\.accountDeletion/);
  assert.ok(account.includes('response.cookies.set(SESSION_COOKIE,"",'), "a deleted account's session cookie is cleared");
  assert.match(account, /AccountDeletionUnavailableError\)return NextResponse\.json\(\{error:error\.message\},\{status:409\}\)/);
  assert.ok(RATE_LIMIT_RULES.accountDeletion.limit <= 10);
  assert.ok(RATE_LIMIT_RULES.garmentDelete.limit > 0);
});

test("the closet asks once before deleting a piece, and says what else changes", () => {
  const dashboard = read("components/consumer-dashboard.tsx");
  assert.ok(dashboard.includes('fetch("/api/consumer/wardrobe",{method:"DELETE"'));
  assert.ok(dashboard.includes('"Confirm delete":"Delete piece"'));
  assert.ok(dashboard.includes("Any Community post showing it stops showing it."));
  assert.ok(dashboard.includes("onClick={()=>setConfirmDeleteItemId(null)}>Cancel"));
});

test("Settings deletes a consumer account only with the password and the typed word", () => {
  const panel = read("components/account-settings-panel.tsx");
  assert.ok(panel.includes('fetch("/api/account",{method:"DELETE"'));
  assert.ok(panel.includes('deleteConfirmation.trim()!=="DELETE"'));
  assert.ok(panel.includes("Delete my account permanently"));
  assert.ok(panel.includes("Brand account deletion isn&rsquo;t in Settings yet."), "brands are told plainly");
});

// The privacy page promised a deletion workflow before one existed. It must now describe
// exactly what happens, and nothing that does not.
test("REGRESSION: the privacy page promises only what deletion actually does", () => {
  const privacy = read("app/privacy/page.tsx");
  assert.doesNotMatch(privacy, /product registrations/);
  assert.match(privacy, /href="\/settings"/);
  assert.match(privacy, /Brand accounts cannot yet be deleted from Settings\./);
});

test("terms exist, are linked beside privacy, and say they have not had legal review", () => {
  assert.match(read("app/terms/page.tsx"), /have not yet had legal review/);
  assert.match(read("app/page.tsx"), /<Link href="\/terms">Terms<\/Link>/);
});

test("the storage sweep may list only the wardrobe prefix", () => {
  const template = read("infra/template.yaml");
  const at = template.indexOf("- s3:ListBucket");
  assert.ok(at > 0, "listing is granted for the deletion sweep");
  const block = template.slice(at, template.indexOf("- Effect:", at));
  assert.match(block, /Resource: !GetAtt UploadBucket\.Arn/);
  assert.match(block, /s3:prefix:\s*\n\s*- "wardrobe\/\*"/, "never bucket-wide listing");
});
