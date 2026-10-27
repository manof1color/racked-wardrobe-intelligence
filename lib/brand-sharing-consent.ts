/**
 * The words beside the Anonymous brand insights switch, versioned, and the record kept each time a
 * person turns it on or off.
 *
 * Consent is read when a brand total is built, so a choice is only as good as the words it was made
 * under. Every change is stored under the account for as long as the account exists — on or off,
 * when, and which version of these words was on screen — and the profile keeps the version behind
 * its current state. A choice made before versions were kept reads as the first entry below.
 *
 * Changing the text means adding a version, never editing one: tests/brand-sharing-consent.test.ts
 * pins every text to its version.
 */
export const BRAND_SHARING_TERMS_HISTORY = [
  {
    version: "before-2026-10-27",
    text: "When enabled, eligible wear events may contribute to groups of at least 25 people. Brands never receive your identity, photos, or raw wardrobe.",
  },
  {
    version: "2026-10-27",
    text: "When on, wear on your brand-verified pieces counts toward anonymous totals for groups of at least 25 people, including wear you recorded before turning it on. Turn it off and your wear stops counting from then on, though figures a brand has already seen can’t be taken back. Brands never receive your identity, photos, or raw wardrobe.",
  },
] as const;

export type BrandSharingTermsVersion = (typeof BRAND_SHARING_TERMS_HISTORY)[number]["version"];

/** The words on screen now. */
export const BRAND_SHARING_TERMS = BRAND_SHARING_TERMS_HISTORY[BRAND_SHARING_TERMS_HISTORY.length - 1];

/** The version a stored choice was made under. A choice stored before versions were kept has none. */
export function brandSharingTermsOf(stored: unknown): BrandSharingTermsVersion {
  return BRAND_SHARING_TERMS_HISTORY.find((terms) => terms.version === stored)?.version ?? BRAND_SHARING_TERMS_HISTORY[0].version;
}

/**
 * The one write that changes the setting and records the change, all or nothing. The profile update
 * only applies to an account that exists and is in the other state — an account never asked counts
 * as off — so asking for the state it is already in writes nothing.
 */
export function brandSharingChange(table: string, ownerId: string, sharing: boolean, now: number, recordId: string) {
  const at = new Date(now).toISOString();
  return [
    {
      Update: {
        TableName: table,
        Key: { PK: `USER#${ownerId}`, SK: "PROFILE" },
        UpdateExpression: "SET brandDataSharing = :sharing, brandDataSharingChangedAt = :at, brandDataSharingTerms = :terms",
        ConditionExpression: sharing
          ? "attribute_exists(PK) AND (attribute_not_exists(brandDataSharing) OR brandDataSharing = :was)"
          : "attribute_exists(PK) AND brandDataSharing = :was",
        ExpressionAttributeValues: { ":sharing": sharing, ":was": !sharing, ":at": at, ":terms": BRAND_SHARING_TERMS.version },
      },
    },
    {
      // No `ttl`: unlike the 90-day activity log, this lasts until the account is deleted.
      Put: {
        TableName: table,
        Item: { PK: `USER#${ownerId}`, SK: `CONSENT#${at}#${recordId}`, type: "brand-data-sharing", sharing, at, terms: BRAND_SHARING_TERMS.version },
        ConditionExpression: "attribute_not_exists(PK)",
      },
    },
  ];
}

/** Whether a refused change wrote nothing because the account was already in that state, or is gone. */
export function brandSharingUnchanged(error: unknown) {
  const reasons = (error as { CancellationReasons?: Array<{ Code?: string }> } | null)?.CancellationReasons ?? [];
  return error instanceof Error && error.name === "TransactionCanceledException" && reasons[0]?.Code === "ConditionalCheckFailed";
}
