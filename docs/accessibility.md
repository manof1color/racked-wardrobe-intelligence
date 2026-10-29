# Accessibility

Work order W8. What was checked, how, what it found, what was fixed, and what has not been tested yet.

**Last run:** 2026-10-29, on `claude/w8-accessibility` (branched from `main` at `504d1d7`). Result: **38 of 38 checks pass**, run twice in a row; axe reports **no violations at any impact level** on any checked screen.

## How it is checked

| Part | What runs |
| --- | --- |
| Engine | [axe-core](https://github.com/dequelabs/axe-core) 4.13.0 through `@axe-core/playwright` 4.13.0, in Chromium 153 driven by `@playwright/test` 1.63.0 |
| Rules | Every axe rule tagged WCAG 2.0, 2.1 or 2.2 at level A or AA |
| Fails on | Any **serious** or **critical** violation. Moderate and minor findings are attached to the report but do not fail the run (there are none today) |
| Viewports | Desktop 1280×900, and a phone (Pixel 7 profile), because the phone layout swaps in the bottom tab bar and a different header |
| Motion | Checked with reduced motion. The home page's scroll-driven reveals keep below-the-fold sections at 35% opacity until they scroll into view, which axe reads as low contrast; reduced motion shows the final, fully opaque state |
| Server | A local `next start` of the commit under test. **Never the deployed site**, and no real account |
| CI | The `accessibility` job in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml), on every push and pull request. The HTML report is kept as the `accessibility-report` artifact for 14 days |

Run it locally after a build:

```bash
SESSION_SECRET=any-local-value-of-32-characters-or-more pnpm build
pnpm exec playwright install chromium   # once
pnpm test:a11y
```

### Public pages

`/`, `/pricing`, `/privacy`, `/terms`, `/login` and `/community`, signed out, as `next start` serves them. `/community` is server-rendered from DynamoDB, so the checks point the server at a small local stand-in ([`tests/a11y/community-store-stub.mjs`](../tests/a11y/community-store-stub.mjs)) that answers reads with two invented posts labelled fictional and refuses every write.

### Signed-in screens, without an account

[`/a11y-harness`](../app/a11y-harness/page.tsx) renders the real consumer and brand dashboards with no session. It exists only when `RACKED_A11Y_HARNESS=1`, which the check sets for its local server and production never does; the flag is read per request, so anywhere else the route answers 404. The dashboards still call the real API routes, which still refuse a request without a session; the checks answer those calls inside the test browser with synthetic fixtures ([`tests/a11y/fixtures.ts`](../tests/a11y/fixtures.ts)), so no request reaches a data store. [`tests/a11y-harness.test.ts`](../tests/a11y-harness.test.ts) pins the gate, the per-request read, the local-only server, and the read-only stand-in.

Screens checked: consumer **Today, Looks, Closet** (also with a piece open for editing), **Outfits**, **scan review cards** (three pieces: plain, brand read from the label, and one needing a label), **consumer Hanger** with a reply; brand **Overview, Catalog, Brand Looks**, a **product's metrics**, and **Brand Hanger** with a reply.

### Keyboard-only pass

[`tests/a11y/keyboard.spec.ts`](../tests/a11y/keyboard.spec.ts) walks both demo flows using only Tab, Shift+Tab, Enter, Space and Escape. At every stop it checks that a focus ring is visible, and inside a dialog it checks that focus never leaves it.

- **Consumer: scan → confirm → Hanger.** Add clothing; Space on the photo library picker opens the file chooser; leave out the piece that needs a label; tick the confirmation; save two pieces; focus returns to Add clothing. Open Hanger, ask for an outfit, choose *Wear today*, cycle Tab and Shift+Tab inside the drawer, then Escape: the drawer closes and focus returns to the launcher.
- **Brand: product → metrics → Brand Hanger.** Catalog tab; open a product; focus lands on its name; reach *Download aggregate CSV*; open Brand Hanger, ask a question, choose *Draft a strategy brief*, then Escape back to the launcher.

The keyboard pass runs at desktop size only.

## What axe found, and what changed

The first run, before any fix and before the keyboard pass existed, failed 34 of its 36 checks; only the harness fallback check passed, at each viewport.

| Rule (impact) | Where | Cause | Fix |
| --- | --- | --- | --- |
| `color-contrast` (serious) | Every public page and every signed-in screen | The shared secondary-text grey `--muted` `#716f68` measured 4.18–4.49:1 on the cream surfaces, under the 4.5:1 minimum | `--muted` is now `#64625b`: 4.68:1 or better on each of the cream and lilac surfaces axe flagged |
| `color-contrast` (serious) | Login eyebrow and *Forgot password*, brand catalog chips, *Needs your label* status | Coral `#e94f30` used as small text: 3.5–3.67:1 | `--coral-dark`, now used only for text, is `#c23a1f` (4.79:1 on the page, 5.27:1 on the card white). The two hover fills that used it keep `#e94f30` as `--coral-hover` |
| `color-contrast` (serious) | Italic accents in the page headings, numbered labels on /privacy, reason numbers, empty-state mark | Bright coral `#ff6846` as text: 2.56:1, under even the 3:1 allowed for large text | These use `--coral-dark`. Coral stays as the button and accent fill, where ink text on it reads 6.17:1 |
| `color-contrast` (serious) | Looks, the faded preview beside an empty row | "NONE" at 42% opacity: 1.71:1 | The faded preview shows the dashed box alone, and both previews are hidden from assistive technology; the arrows beside them carry their meaning |
| `button-name` (critical) | Every signed-in screen on a phone | The Hanger launcher hides its words on narrow screens, leaving a button with no name | The launcher is named "Ask Hanger" |
| `scrollable-region-focusable` (serious) | Saved-outfit piece carousels; the pricing table on a phone | A region that scrolls sideways could not be reached or scrolled from the keyboard | Both are named regions that take focus |
| `target-size` (serious) | /community and /pricing on a phone | The header links stacked with 6px gaps were under 24px tall | They are at least 24px tall |

## What the keyboard pass found, and what changed

Axe does not test these. The keyboard pass caught each one before it passed.

| Problem | WCAG | Fix |
| --- | --- | --- |
| The focus ring was coral `#ff6846` at 2.56:1 against the page, under the 3:1 a focus indicator needs | 1.4.11, 2.4.7 | It uses `--coral-dark`: 4.79:1 on the page, 3.31:1 on dark surfaces. It now also covers text areas, `summary`, and anything made focusable with `tabindex="0"` |
| The photo pickers' real file inputs are transparent, so their focus ring was invisible | 2.4.7 | The visible picker draws the ring while its input has focus |
| *Add clothing* opened a dialog but left focus behind it; Tab walked the page under the backdrop; Escape did nothing | 2.4.3 | A shared [`useDialogFocus`](../components/use-dialog-focus.ts) moves focus in, keeps Tab and Shift+Tab inside, closes on Escape, and returns focus to the opener. It is the behaviour Shop the Look already had |
| The Hanger drawer took focus but let Tab leave it for the page behind | 2.4.3 | The drawer uses the same hook; it still locks page scroll |
| The install-steps dialog did not take or keep focus | 2.4.3 | Same hook |
| The *Install Racked* tip sat on top of the Hanger launcher in the same corner, hiding it, focus ring included, until the tip was dismissed | 2.4.11 | The tip publishes its height and the launcher rises clear of it while it shows; measured clear at 320, 390, 760, 761, 1024 and 1280px wide |
| Opening a brand product removed the catalog card that had focus, dropping a keyboard user back at the top of the page | 2.4.3 | Focus moves to the product's name |
| The Hanger message box showed focus only as a 1px border colour change | 2.4.7 | A 2px ink ring |

## Known gaps

- **No screen-reader testing yet.** Nothing has been checked with VoiceOver, NVDA, JAWS or TalkBack, including how Hanger's replies and the scan progress are announced.
- **Automated rules catch only part of WCAG.** Axe cannot judge whether alt text is accurate, whether headings describe their sections, or whether an error message is understandable.
- **Not every screen is covered.** Settings, the pending-brand notice, password reset, public brand pages (`/brands/…`), the demo store, Shop the Look, the brand product editor and enrolment form, and the outfit Recreate panel have not been checked. The harness covers what its fixtures exercise; the brand-link search and label-code steps inside a review card were not opened.
- **Keyboard pass at desktop size only**, with no on-screen keyboard and no switch access.
- **Hover and other transient states are not measured.** Axe checks the page at rest.
- **No checks yet for 400% zoom and reflow, text spacing, or Windows forced-colours mode.**
- **Chromium only.** Safari, where most of Racked's phone users are, and Firefox have not been run.
- **Images.** Contrast over garment photos and the accuracy of their alt text depend on real photos, which the fixtures do not use.
