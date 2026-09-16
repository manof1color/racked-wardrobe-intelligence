# Publishing Racked to the App Store and Google Play

Written 2026-09-16. Racked is a Next.js PWA hosted on AWS Amplify. Nothing about that has to
change for Android. iOS is the hard half, and this plan says why in plain terms.

## The one thing to understand first

Apple rejects apps that are a website in a shell. Guideline 4.2 (Minimum Functionality)
is enforced harder now than when the PWA wrapper era began: a WebView that adds no native
navigation, no push, no offline behaviour and no device integration is refused. Google Play
accepts a packaged PWA (a Trusted Web Activity) as a normal app.

So: **Android is a packaging job. iOS is a small native build.** Plan them as two tracks
with different costs, and do not let the iOS answer hold Android hostage.

## Blockers that apply to both stores

Fix these before either submission — they are in the streamline plan for the same reason.

1. **In-app account deletion.** Apple 5.1.1(v) requires it in the app, easy to find, and a
   real delete rather than a deactivate. Google requires it in-app *and* as a web URL you
   declare in the Play Console.
2. **Delete a garment.** Deleting user content is expected, and today a bad scan cannot be
   removed.
3. **Terms of service** page alongside the existing `/privacy`.
4. **Permission strings** that name the real reason, e.g. camera: "Racked uses the camera to
   photograph clothing you add to your wardrobe."
5. **No demo commerce inside the app build.** Fictional storefronts and a $0 checkout read as
   placeholder content.

**Status 2026-09-16:** blockers 1–3 are done for consumer accounts (PROGRESS Phase 36). Brand account deletion is in the ChatGPT work order; the mobile app itself is consumer-only.

## Track A — Google Play (start this first)

The long pole is a testing rule, not the build.

| Step | Detail |
| --- | --- |
| 1. Developer account | $25 once. A **personal** account created after 13 Nov 2023 must run a closed test with **12 testers opted in continuously for 14 days** before it can apply for production. Organisation accounts are exempt |
| 2. Recruit 12 testers now | The 14-day clock only runs while they stay opted in. This is the single best reason to start Play before anything else |
| 3. Package the PWA | Bubblewrap or PWABuilder generates a Trusted Web Activity from `manifest.webmanifest`. Icons, maskable icon, `standalone`, and `start_url` are already correct |
| 4. Digital Asset Links | Host `/.well-known/assetlinks.json` on the Amplify domain so the TWA opens without a URL bar |
| 5. Play Console forms | Data safety (email, name, photos, wear history), account deletion URL, content rating, target audience, privacy policy URL |
| 6. Store listing | Short and full description, feature graphic, phone screenshots |
| 7. Closed test, then production | Apply once the 12 x 14 condition is met |

**Realistic:** 3 weeks, most of it waiting out the tester clock.

## Track B — Apple App Store

Passing 4.2 means the iOS app must do things a browser tab cannot. Build a Capacitor shell
around the existing web app and add native capability that is genuinely useful:

- **Native camera capture** for adding pieces, including multi-shot for a rack.
- **Push notifications** — "you haven't worn 12 pieces this season", wear reminders.
- **Offline closet** — cached garment images and wear counts, readable with no signal.
- **Share sheet import** — save an outfit photo from Instagram or TikTok straight into Racked.
- **Home-screen widget** — today's outfit, or the piece you have not worn longest.

Two or three of those, done properly, is the difference between approved and refused.

| Step | Detail |
| --- | --- |
| 1. Apple Developer Program | $99/year, and allow days for verification |
| 2. Capacitor shell | iOS project wrapping the hosted app, with the native features above |
| 3. Info.plist strings | `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSPhotoLibraryAddUsageDescription` |
| 4. App Privacy labels | Contact info (email, name), user content (photos), identifiers, usage data; declare linkage and tracking honestly |
| 5. Account deletion | In-app, reachable from Settings in a couple of taps |
| 6. TestFlight | Internal, then external testers |
| 7. Screenshots | 6.9" and 6.5" iPhone sets; no fictional brand content that looks like a real shop |
| 8. Submit | Expect one rejection round; answer with specifics about native capability |

**Realistic:** 5–8 weeks including one rejection cycle. Sign in with Apple is **not**
required, because Racked has no third-party social login.

## If you need to be live sooner

Ship **Android only** and keep iOS on "Add to Home Screen" from Safari, which already works
and is documented in the app. Say so plainly in your marketing rather than implying both.
It is a normal sequence for a small team and keeps the iOS build honest instead of rushed.

## Pre-submission checklist

- [ ] Account deletion, garment deletion, terms page shipped and tested
- [ ] Privacy policy and account-deletion URLs reachable and correct
- [ ] Demo storefronts and $0 checkout excluded from app builds
- [ ] Real-device pass: scan, closet, outfits, Hanger, tab bar, keyboard behaviour
- [ ] Crash and error reporting in place before external testers
- [ ] Store copy makes no claim the product does not support: no photorealistic try-on, no
      fit prediction, no sales-lift claim
- [ ] `DEMO` synthetic data cannot be mistaken for real users in screenshots
