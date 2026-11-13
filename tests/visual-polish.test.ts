import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const css = read("app/globals.css");

// REGRESSION: 277 rules set text below 12px, down to 6.4px (.4rem) for score labels and 7px for
// the phone tab labels. Nothing in the stylesheet goes below 12px now, except the phone tab-bar
// labels at 10px, the size iOS itself uses for tab bars, which fits "Community" in a sixth of a
// 375px-wide phone.
test("REGRESSION: no text is set below 12px, apart from the 10px phone tab labels", () => {
  const sizes = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap(([, selector, body]) =>
    [...body.matchAll(/font(?:-size)?:(?:\d{3} )?(\.\d+)rem/g)]
      .filter(([, size]) => Number(size) < 0.75)
      .map(([, size]) => `${selector.trim()} ${size}rem`));
  assert.deepEqual(sizes, [".mobile-tab-bar small .625rem"]);
  assert.doesNotMatch(read("app/pricing/page.tsx"), /fontSize: "\.[0-6]\d*rem"|fontSize: "\.7[0-4]\d*rem"/);
});

// The body face was named but never loaded, so body text was Segoe UI on Windows and San
// Francisco on Apple devices. Both faces are now served from this site, with their licences.
test("both typefaces are served from this site, with their licences", () => {
  assert.match(css, /@font-face\{font-family:Inter;src:url\("\/fonts\/inter-latin-wght\.woff2"\) format\("woff2"\);font-weight:100 900;font-style:normal;font-display:swap\}/);
  assert.match(css, /@font-face\{font-family:Anton;src:url\("\/fonts\/anton-latin-400\.woff2"\)/);
  const fonts = readdirSync(new URL("../public/fonts/", import.meta.url));
  for (const file of ["inter-latin-wght.woff2", "OFL-Inter.txt", "anton-latin-400.woff2", "OFL-Anton.txt"]) assert.ok(fonts.includes(file), file);
  assert.match(read("public/fonts/OFL-Inter.txt"), /SIL Open Font License, Version 1\.1/);
});

// REGRESSION: navigation used text symbols (⌂ ◇ ▦ ◫ ◎ ⌁ ▧) as icons, which every phone drew in a
// different font and weight, and the phone tab bar read them out to screen readers.
test("REGRESSION: navigation and photo pickers use the shared line icons, never text symbols", () => {
  for (const file of ["workspace-mobile-nav.tsx", "consumer-dashboard.tsx", "hanger-dock.tsx", "photo-source-picker.tsx", "wear-photo-log.tsx", "looks-builder.tsx"]) {
    assert.doesNotMatch(read(`components/${file}`), /[⌂◇▦◫◎⌁▧]/, file);
  }
  const icons = read("components/icons.tsx");
  assert.match(icons, /aria-hidden="true" focusable="false"/, "icons are decorative; the label beside each carries the meaning");
  const nav = read("components/workspace-mobile-nav.tsx");
  assert.doesNotMatch(nav, /<span>\{tab\.icon\}<\/span>/);
  assert.match(nav, /<Icon name=\{tab\.icon\}\/><small>\{tab\.label\}<\/small>/);
});

// REGRESSION: Today said "Log today's outfit to keep your streak going", but its main button was
// "+ Add clothing", a second accent button ("Scan my first look") sat below it, and the real logging
// button was a third, inside the "This week" card. Today now has one main button for each case.
test("REGRESSION: Today has one main button, and with clothes saved it logs today's outfit", () => {
  const dashboard = read("components/consumer-dashboard.tsx");
  const card = read("components/wear-points-card.tsx");
  assert.match(dashboard, /activeView==="home"&&items\.length>0\s*\? <button type="button" className="button button-accent" aria-expanded=\{logOpen\} aria-controls=\{LOG_TODAY_PANEL_ID\} onClick=\{\(\)=>setLogOpen\(true\)\}>\{"Log today's outfit"\}<\/button>\s*: <button className="button button-accent" data-tour="scan" onClick=\{openAdd\}>\+ Add clothing<\/button>/);
  assert.doesNotMatch(dashboard, /Scan my first look/, "the empty Today has one main button, not two");
  assert.match(dashboard, /logging=\{logOpen\} onLoggingChange=\{setLogOpen\}/);
  assert.equal((card.match(/Log today's outfit/g) ?? []).length, 2, "the card names its panel and nothing else");
  assert.doesNotMatch(card, /button-accent/, "the card no longer carries a second main button");
  assert.match(card, /id=\{LOG_TODAY_PANEL_ID\}/);
  assert.match(card, />Cancel<\/button>/, "the opened panel can be closed where it is");
  assert.match(card, /scrollIntoView\(\{ block: "nearest" \}\)/, "opening from the heading brings the panel into view");
  assert.match(css, /\.insight-grid>\.points-card\{order:-1\}/, "the logging card leads Today");
  // REGRESSION: the LIVE DATA label inherited the dark card's light text and read as an empty pink box.
  assert.match(css, /\.demo-pill,\.fallback-pill\{[^}]*color:var\(--ink\)/);
});

// Corners and timings come from one set of values, and motion stays decorative: only colour,
// opacity, scale and position animate, nothing starts invisible, and reduced motion turns it off.
test("corners and motion come from shared values, and reduced motion turns the motion off", () => {
  assert.match(css, /:root\{--radius-sm:8px;--radius:10px;--radius-lg:12px;--radius-xl:18px;--radius-pill:999px;--motion-fast:120ms;--motion:200ms;--motion-slow:320ms;/);
  assert.doesNotMatch(css, /button,a\{transition:\.2s ease\}/, "no blanket transition on every property");
  assert.match(css, /\.workspace-heading\.view-heading,\.empty-wardrobe,[^{]*\.wear-photo-row,[^{]*\{border-radius:var\(--radius-lg\)\}/);
  assert.match(css, /@keyframes view-in\{from\{opacity:\.4;/, "a view never starts invisible");
  // REGRESSION: the reduced-motion override was less specific than the rule it overrode
  // (".consumer-workspace>section" against "…>section:not(.workspace-heading)"), so views still faded
  // in for people who asked for reduced motion, and axe sometimes measured text mid-fade. The override
  // now repeats the animated selector exactly.
  const animated = css.match(/\n([^{}\n]+)\{animation:view-in /)?.[1];
  assert.equal(animated, ".consumer-workspace>section:not(.workspace-heading),.brand-workspace>section:not(.workspace-heading)");
  assert.ok(css.includes(`@media(prefers-reduced-motion:reduce){${animated}{animation:none}`), "reduced motion switches off exactly what animates");
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{[^}]*\{animation:none\}[^}]*\{scale:none\}\}/);
});

// REGRESSION: Log with a photo kept its Record bar stuck over the bottom of the scrolling list. Whatever
// choice sat under the bar's edge was half covered, leaving less than 24px of a radio button to tap,
// and which choice that was moved with the text size and the browser's fonts (it failed in CI after
// passing locally). The bar now ends the list instead.
test("REGRESSION: the photo log's Record bar never floats over the choices", () => {
  const rule = css.match(/\.wear-photo-actions\{[^}]*\}/)?.[0] ?? "";
  assert.ok(rule, "the Record bar has its rule");
  assert.doesNotMatch(rule, /position:(sticky|fixed|absolute)/);
  assert.doesNotMatch(css, /\.wear-photo-actions\{bottom:/);
  assert.match(css, /\.wear-photo-option input\{width:24px;height:24px;/, "radio buttons meet the 24px minimum target");
});

// Empty views used to differ from screen to screen: a bare heading, a page-sized poster, or a second
// accent button competing with the page's own main button. They now share one quiet pattern.
test("empty views share one pattern and never add a second main button", () => {
  const component = read("components/empty-state.tsx");
  assert.doesNotMatch(component, /button-accent/);
  for (const file of ["components/consumer-dashboard.tsx", "components/saved-looks.tsx", "components/brand-look-builder.tsx"]) {
    const source = read(file);
    for (const match of source.matchAll(/<EmptyState [^]*?<\/EmptyState>/g)) assert.doesNotMatch(match[0], /button-accent/, `${file}: ${match[0].slice(0, 60)}`);
  }
  const dashboard = read("components/consumer-dashboard.tsx");
  assert.doesNotMatch(dashboard, /No garments in this category yet|Add clothing before building an outfit/);
  // REGRESSION: an empty closet showed six category filters with nothing to filter.
  assert.match(dashboard, /\{items\.length>0&&<div className="filter-row"/);
  assert.match(dashboard, /onClick=\{\(\)=>setFilter\("all"\)\}>Show everything<\/button>/, "an empty category offers a way back");
});

// REGRESSION: while the wardrobe loaded, the page showed "…" and a line of text, then jumped to a grid.
test("loading shows placeholders shaped like the content, announced once and still under reduced motion", () => {
  const component = read("components/empty-state.tsx");
  assert.match(component, /role="status">\s*<span className="sr-only">\{label\}<\/span>/);
  assert.equal((component.match(/aria-hidden="true"/g) ?? []).length, 3, "the icon and both placeholder shapes are hidden from assistive technology");
  assert.match(read("components/consumer-dashboard.tsx"), /<LoadingPlaceholder label="Loading your private wardrobe" shape=\{activeView==="closet"\?"garments":"cards"\}/);
  assert.match(read("components/saved-looks.tsx"), /<LoadingPlaceholder label="Loading saved looks…"/);
  // REGRESSION: while loading, the Closet heading said "0 pieces, 0 wears logged", as if the wardrobe were empty.
  assert.match(read("components/consumer-dashboard.tsx"), /\{!loading&&heading\.stats\.length>0&&<dl className="view-stats">/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{\.skeleton-card i,\.skeleton-text i\{animation:none\}\}/);
});

// REGRESSION: on a computer, choosing Community left the workspace tab row behind, so getting back to
// Today, Looks, Closet or Outfits took the header link or the browser's Back button (phones kept their
// bottom tab bar). Community now carries the same row, with Community marked as the current page.
test("REGRESSION: Community keeps the workspace tab row on a computer, for consumers and brands", () => {
  const page = read("app/community/page.tsx");
  assert.match(page, /\{session&&<CommunityWorkspaceTabs role=\{session\.role\}\/>\}<CommunityFeed/);
  const tabs = read("components/workspace-tabs.tsx");
  assert.match(tabs, /CONSUMER_TABS\.map\(tab => <Link key=\{tab\.id\} href=\{consumerViewPath\(tab\.id\)\}>/);
  assert.match(tabs, /BRAND_TABS\.map\(tab => <Link key=\{tab\.id\} href=\{brandViewPath\(tab\.id\)\}>/);
  assert.equal((tabs.match(/<Link className="active" href="\/community" aria-current="page">/g) ?? []).length, 2);
  const navigation = read("lib/workspace-navigation.ts");
  for (const label of ["Today", "Looks", "Closet", "Outfits", "Overview", "Catalog", "Brand Looks"]) assert.match(navigation, new RegExp(`label:"${label}"`));
  assert.match(read("components/workspace-mobile-nav.tsx"), /export const consumerTabs=CONSUMER_TABS;/, "one list of views for every tab row");
  assert.match(read("components/brand-dashboard.tsx"), /<Link href="\/community">Community<\/Link>\s*<\/nav>/, "brands reach Community from their own tab row too");
  assert.match(css, /\.consumer-view-tabs a\.active\{/);
});

// The view heading was a full poster on every visit (about 300px on a phone before any clothes).
// Returning wardrobes now get one compact row; a new, empty wardrobe keeps the poster as its welcome.
// It is decided by the data, not a stored flag, so the page never switches layout after it loads.
test("returning wardrobes get a compact view heading; an empty wardrobe keeps the full welcome", () => {
  const dashboard = read("components/consumer-dashboard.tsx");
  assert.match(dashboard, /const compact=loading\|\|items\.length>0;/);
  assert.match(dashboard, /className=\{`workspace-heading view-heading view-\$\{activeView\}\$\{compact\?" compact":""\}`\}/);
  assert.doesNotMatch(dashboard, /localStorage/, "no stored flag, so no layout switch after load");
  assert.match(css, /\.view-heading\.compact h1 br,\.view-heading\.compact>div:first-child>p\{display:none\}/);
  assert.match(css, /\.view-heading\.compact\{flex-direction:row;/);
});

// The brand side of compact headings: a brand with products enrolled gets one-line headings on
// Overview, Catalog and Brand Looks; a brand with an empty catalog keeps the full explanations.
test("brands with products get compact headings; an empty catalog keeps its explanations", () => {
  const dashboard = read("components/brand-dashboard.tsx");
  assert.match(dashboard, /const compactHeadings=!catalogLoaded\|\|products\.length>0;/);
  assert.match(dashboard, /<section className=\{`workspace-heading\$\{compactHeadings\?" compact":""\}`\}>/);
  assert.match(dashboard, /<BrandProductEnrollment products=\{products\} onProducts=\{acceptProducts\} compact=\{compactHeadings\}\/>/);
  assert.match(dashboard, /<BrandLookBuilder products=\{live\}(?: preview=\{previewLooks\})? compact=\{compactHeadings\}\/>/);
  for (const file of ["components/brand-product-enrollment.tsx", "components/brand-look-builder.tsx"]) {
    assert.match(read(file), /className=\{`registry-heading\$\{compact\?" compact":""\}`\}/, file);
  }
  // REGRESSION: hiding the line break joined the words: "Understand how productsare actually worn."
  assert.match(dashboard, /Understand how products\{" "\}<br\/>are/);
  assert.match(css, /\.brand-workspace>\.workspace-heading\.compact h1 br,\.brand-workspace>\.workspace-heading\.compact p\{display:none\}/);
  assert.match(css, /\.registry-heading\.compact>div:first-child>p\{display:none\}/);
});

// REGRESSION: on a phone, the fictional storefront's header set the store name in the Racked wordmark
// style (wide tracking and brackets), so it wrapped onto two lines and its bracket ran into the links,
// and the purchase came only after the description and four rows of product facts.
test("REGRESSION: the demo storefront has a plain store name and the purchase right under the price", () => {
  const product = read("app/demo-store/[brandSlug]/[sku]/page.tsx");
  const brand = read("app/demo-store/[brandSlug]/page.tsx");
  for (const page of [product, brand]) assert.doesNotMatch(page, /className="wordmark"/);
  assert.match(product, /className="demo-store-name"/);
  assert.match(brand, /className="demo-store-name"/);
  const order = ["demo-product-price", "<DemoPurchasePanel", "demo-product-description", "demo-product-facts"].map(marker => product.indexOf(marker));
  assert.ok(order.every(index => index > 0), "every part is on the page");
  assert.deepEqual([...order].sort((a, b) => a - b), order, "price, then the purchase, then the description and facts");
  assert.match(css, /\.demo-store \.demo-product-facts\{grid-template-columns:1fr 1fr\}/, "two columns of facts on a phone");
});
