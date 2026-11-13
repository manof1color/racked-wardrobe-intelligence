import type { Page } from "@playwright/test";
import { expect, test } from "./csp.ts";
import { expectNoSeriousViolations } from "./axe.ts";
import { mockSignedInApi, PIXEL_PNG } from "./fixtures.ts";

// Signed-in screens rendered by /a11y-harness with fixture data: no account, no session, and no
// request leaves the test browser for a data store.
test.beforeEach(async ({ page }) => { await mockSignedInApi(page); });

async function openConsumer(page: Page, view: string) {
  await page.goto(`/a11y-harness?role=consumer&view=${view}`);
  await expect(page.getByText("Loading your private wardrobe")).toHaveCount(0);
}

async function openBrand(page: Page, view: string) {
  await page.goto(`/a11y-harness?role=brand&view=${view}`);
  await expect(page.getByText("Loading your catalog")).toHaveCount(0);
}

for (const view of ["home", "looks", "closet", "outfits"]) {
  test(`axe: consumer ${view}`, async ({ page }, testInfo) => {
    await openConsumer(page, view);
    await expectNoSeriousViolations(page, testInfo, `consumer ${view}`);
  });
}

test("axe: a saved outfit's detail, and the way back to the list", async ({ page }, testInfo) => {
  await openConsumer(page, "outfits");
  await page.locator(".outfit-row").first().click();
  await expect(page.getByRole("button", { name: "Wear This Again" })).toBeVisible();
  await expectNoSeriousViolations(page, testInfo, "outfit detail");
  await page.getByRole("button", { name: "Back to saved outfits" }).click();
  await expect(page.locator(".outfit-row").first()).toBeVisible();
});

test("axe: a saved Community look opens as its post, the heart unsaves it, and a gone look shows style words only", async ({ page }, testInfo) => {
  // On a phone the install tip can appear over the card's action row; dismiss it as a person would.
  await page.addLocatorHandler(page.getByRole("button", { name: "Dismiss installation tip" }), async (dismiss) => { await dismiss.click(); });
  await openConsumer(page, "outfits");
  await expect(page.getByRole("heading", { name: "2 saved looks" })).toBeVisible();
  await page.locator(".saved-look-list .outfit-row").first().click();
  await expect(page.getByRole("button", { name: "Recreate with my wardrobe" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Wear This Again" })).toHaveCount(0);
  await expectNoSeriousViolations(page, testInfo, "saved look detail");
  await page.getByRole("button", { name: /^Saved/ }).click();
  await expect(page.getByRole("button", { name: /^Save look/ })).toBeVisible();
  await page.getByRole("button", { name: "Back to Outfits" }).click();
  await expect(page.getByRole("heading", { name: "1 saved look" })).toBeVisible();
  await page.locator(".saved-look-list .outfit-row").first().click();
  await expect(page.getByText("minimal", { exact: true })).toBeVisible();
  await expectNoSeriousViolations(page, testInfo, "saved look no longer in Community");
});

test("axe: consumer closet with a piece open for editing", async ({ page }, testInfo) => {
  await openConsumer(page, "closet");
  await page.getByRole("button", { name: /^Edit piece:/ }).first().click();
  await expectNoSeriousViolations(page, testInfo, "consumer closet editor");
});

test("axe: scan review cards", async ({ page }, testInfo) => {
  await page.goto("/a11y-harness?role=consumer&view=home&add=1");
  await page.getByRole("dialog").locator('input[type="file"][multiple]').setInputFiles({ name: "look.png", mimeType: "image/png", buffer: PIXEL_PNG });
  await expect(page.locator(".intake-card")).toHaveCount(3);
  await expectNoSeriousViolations(page, testInfo, "scan review cards");
});

test("axe: consumer Hanger with a reply", async ({ page }, testInfo) => {
  await openConsumer(page, "home");
  await page.getByRole("button", { name: /Ask Hanger/ }).click();
  const hanger = page.getByRole("dialog", { name: "Hanger AI assistant" });
  await hanger.getByRole("textbox").fill("What should I wear today?");
  await hanger.getByRole("textbox").press("Enter");
  await expect(hanger.getByText("Here is an outfit from pieces you already own")).toBeVisible();
  await expectNoSeriousViolations(page, testInfo, "consumer Hanger");
});

for (const view of ["overview", "catalog", "looks"]) {
  test(`axe: brand ${view}`, async ({ page }, testInfo) => {
    await openBrand(page, view);
    await expectNoSeriousViolations(page, testInfo, `brand ${view}`);
  });
}

test("axe: brand product metrics and Brand Hanger", async ({ page }, testInfo) => {
  await openBrand(page, "catalog");
  await page.getByRole("button", { name: /Fixture straight jean/ }).click();
  await expect(page.getByText("CONFIRMED WEARS", { exact: true })).toBeVisible();
  await expectNoSeriousViolations(page, testInfo, "brand product metrics");
  await page.getByRole("button", { name: /Ask Hanger/ }).click();
  const hanger = page.getByRole("dialog", { name: "Hanger AI assistant" });
  await hanger.getByRole("textbox").fill("How is repeat wear?");
  await hanger.getByRole("textbox").press("Enter");
  await expect(hanger.getByText("Repeat wear is strong")).toBeVisible();
  await expectNoSeriousViolations(page, testInfo, "Brand Hanger");
});

test("axe: the judge guide on a demo wardrobe is a corner dock that spotlights the step's button, opens the scanner and Hanger, and ticks steps off", async ({ page }, testInfo) => {
  await page.goto("/a11y-harness?role=consumer&view=home&tour=1");
  await expect(page.getByText("Loading your private wardrobe")).toHaveCount(0);
  const guide = page.getByRole("region", { name: "Judge guide: the wardrobe side" });
  await expect(guide.getByRole("status")).toHaveText("0 of 4 done");
  await expect(guide.getByRole("heading", { name: "Scan a photo and confirm the pieces" })).toBeVisible();
  // The spotlight rings the Add control that is on screen. On a phone that is the Add tab. On a computer,
  // Today with clothes saved leads with "Log today's outfit" instead, so nothing is ringed and the dock's
  // own button is the way in; the hint about a highlighted button then stays away.
  const lit = page.locator("[data-tour-spotlight]");
  if (testInfo.project.name === "mobile") {
    await expect(lit).toHaveCount(1);
    await expect(lit).toHaveAttribute("data-tour", "scan");
    await expect(lit).toBeVisible();
    await expect(guide.getByText("or tap the highlighted button")).toBeHidden(); // hidden on phones to keep the dock short
  } else {
    await expect(lit).toHaveCount(0);
    await expect(guide.getByText("or tap the highlighted button")).toHaveCount(0);
  }
  // A dock, not a banner: it leaves most of the screen to the app.
  const box = await guide.boundingBox();
  const viewport = page.viewportSize();
  expect(box && viewport && box.height < viewport.height * 0.45).toBeTruthy();
  await expectNoSeriousViolations(page, testInfo, "judge guide, wardrobe");

  await guide.getByRole("button", { name: "Open the scanner" }).click();
  const scanner = page.getByRole("dialog", { name: "Add clothing to your wardrobe." });
  await expect(scanner).toBeVisible();
  await scanner.getByRole("button", { name: "Close" }).click();

  await guide.getByRole("button", { name: "All steps" }).click();
  await expect(guide.getByRole("listitem")).toHaveCount(4);
  await guide.getByRole("button", { name: /^Go: Ask Hanger for an outfit/ }).click();
  const hanger = page.getByRole("dialog", { name: "Hanger AI assistant" });
  await hanger.getByRole("textbox").fill("What should I wear today?");
  await hanger.getByRole("textbox").press("Enter");
  await expect(hanger.getByText("Here is an outfit from pieces you already own")).toBeVisible();
  await hanger.getByRole("button", { name: "Close Hanger" }).click();
  await expect(guide.getByRole("status")).toHaveText("1 of 4 done");
  await expectNoSeriousViolations(page, testInfo, "judge guide, all steps");

  await guide.getByRole("button", { name: "Minimize guide" }).click();
  const pill = page.getByRole("region", { name: "Judge guide: the wardrobe side" }).getByRole("button", { name: /^Show guide/ });
  await expect(pill).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("[data-tour-spotlight]")).toHaveCount(0);
  await pill.click();
  await expect(page.getByRole("region", { name: "Judge guide: the wardrobe side" }).getByRole("status")).toHaveText("1 of 4 done");
});

test("axe: the judge guide on the demo brand", async ({ page }, testInfo) => {
  await page.goto("/a11y-harness?role=brand&view=overview&tour=1");
  await expect(page.getByText("Loading your catalog")).toHaveCount(0);
  const guide = page.getByRole("region", { name: "Judge guide: the brand side" });
  await expect(guide.getByRole("heading", { name: "Open Judge Limited Overshirt" })).toBeVisible();
  await guide.getByRole("button", { name: "All steps" }).click();
  await expect(guide.getByRole("listitem")).toHaveCount(4);
  await expect(guide.getByRole("button", { name: /^See the wardrobe side/ })).toBeVisible();
  await expectNoSeriousViolations(page, testInfo, "judge guide, brand");

  // Write and post a Brand Look: in a demo, Post shows a labelled preview and sends nothing.
  let posted = false;
  page.on("request", (request) => { if (request.method() === "POST" && new URL(request.url()).pathname === "/api/brand/looks") posted = true; });
  await guide.getByRole("button", { name: /^Go: Write and post a Brand Look/ }).click();
  const builder = page.locator("#brand-looks");
  await expect(builder.getByRole("heading", { name: "Style your own catalog." })).toBeVisible();
  await builder.locator(".brand-look-options button").first().click();
  await builder.getByLabel("Look title").fill("Weekend layers");
  await builder.getByLabel("Styling story").fill("Easy pieces for a cool Saturday.");
  await builder.getByRole("button", { name: "Post", exact: true }).click();
  const preview = page.getByRole("article", { name: "Demo preview of your posted Look" });
  await expect(preview).toBeVisible();
  await expect(preview.getByText("Demo preview · not published")).toBeVisible();
  await expect(preview.getByRole("heading", { name: "Weekend layers" })).toBeVisible();
  await expect(page.getByText("Nothing was published or saved.", { exact: false })).toBeVisible();
  await expect(guide.getByRole("status")).toHaveText("1 of 4 done");
  expect(posted).toBe(false);
  await expectNoSeriousViolations(page, testInfo, "judge guide, brand post preview");
});

test("axe: the demo brand's Settings preview, with every control disabled", async ({ page }, testInfo) => {
  await page.goto("/a11y-harness?role=brand&view=demo-settings");
  await expect(page.getByRole("heading", { name: "Two-step sign-in." })).toBeVisible();
  for (const part of ["two-step", "approval", "budget", "activity"]) await expect(page.locator(`[data-demo-preview="${part}"]`)).toBeVisible();
  await expect(page.locator('[data-demo-preview="approval"] h2')).toHaveText("Approved.");
  await expect(page.locator('[data-demo-preview="budget"] h2')).toHaveText("Not limited in the demo.");
  const controls = page.locator("[data-demo-preview] button, [data-demo-preview] input");
  expect(await controls.count()).toBeGreaterThanOrEqual(3);
  for (const control of await controls.all()) await expect(control).toBeDisabled();
  await expectNoSeriousViolations(page, testInfo, "demo brand settings preview");
});

test("the harness falls back to the consumer landing view for a role or view it does not know", async ({ page }) => {
  const response = await page.goto("/a11y-harness?role=admin&view=anything");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("What are you wearing today?");
});

test("axe: the wardrobe while it loads, then an empty category with its way back", async ({ page }, testInfo) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/consumer/wardrobe", async route => { await held; await route.fallback(); });
  await page.goto("/a11y-harness?role=consumer&view=closet");
  await expect(page.getByRole("status").filter({ hasText: "Loading your private wardrobe" })).toHaveCount(1);
  await expect(page.locator(".view-stats"), "no zero counts while loading").toHaveCount(0);
  await expectNoSeriousViolations(page, testInfo, "closet loading");
  release();
  await expect(page.getByText("Loading your private wardrobe")).toHaveCount(0);
  await page.getByRole("button", { name: "accessory" }).click();
  await expect(page.getByRole("heading", { name: "Nothing in accessory yet." })).toBeVisible();
  await expectNoSeriousViolations(page, testInfo, "closet, empty category");
  await page.getByRole("button", { name: "Show everything" }).click();
  await expect(page.locator(".garment-card").first()).toBeVisible();
});

test("axe: an empty wardrobe's Closet, Looks and Outfits", async ({ page }, testInfo) => {
  await page.route("**/api/consumer/wardrobe", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [], outfits: [] }) }));
  await openConsumer(page, "closet");
  await expect(page.getByRole("heading", { name: "Your closet is empty." })).toBeVisible();
  await expect(page.getByRole("group", { name: "Filter wardrobe" }), "no filters with nothing to filter").toHaveCount(0);
  await expectNoSeriousViolations(page, testInfo, "closet, empty wardrobe");
  await openConsumer(page, "looks");
  await expect(page.getByRole("heading", { name: "Looks needs clothes to work with." })).toBeVisible();
  await expectNoSeriousViolations(page, testInfo, "looks, empty wardrobe");
  await openConsumer(page, "outfits");
  await expect(page.getByRole("heading", { name: "No saved outfits yet." })).toBeVisible();
  await expectNoSeriousViolations(page, testInfo, "outfits, empty wardrobe");
});
