# Privacy, ethics, and accessibility

## Data principles

- **Opt in before analysis.** Consumer access requires explicit consent in the demo.
- **Confirm inference.** Suggested garment attributes are not saved until corrected or confirmed.
- **Collect less.** Matching needs garment/product attributes and use counts—not demographic profiles.
- **Separate trust zones.** Brand users cannot access names, emails, images, or raw wardrobes.
- **Release aggregates cautiously.** Segment output is suppressed below 25 opted-in members.
- **Explain decisions.** Score components, weights, confidence, and fallback state are visible.

## Bias controls

The score excludes age, gender, ethnicity, disability, body shape, income, address, and inferred socioeconomic proxies. Style and color inputs are confirmed garment attributes, not identity labels. A future evaluation should compare missingness, confirmation corrections, recommendation exposure, and opt-out rates across voluntarily reported groups without adding those groups to the ranking model.

## Retention plan

| Data | Demo | Production target |
| --- | --- | --- |
| Uploaded image | Not retained | Private S3; delete after extraction or within 24 hours |
| Confirmed garment attributes | Seed/session only | Until user deletion or account closure |
| Wear events/outfits | Seed/session only | Until user deletion or documented inactivity limit |
| Match results | Recomputed | Short audit window, then aggregate/delete |
| Security logs | Local framework logs | Metadata only; never raw images or secrets |

## Delete-my-data workflow

1. Authenticated Consumer requests deletion and reauthenticates.
2. Account is disabled to prevent new writes.
3. Owned wardrobe items, wear events, outfits, consent records, match results, and S3 objects are deleted.
4. Segment aggregates are recomputed; small cohorts are suppressed.
5. A non-sensitive audit record stores request/completion timestamps.
6. Cognito identity is deleted after application records succeed.

## Accessibility evidence

- Semantic headings, navigation, articles, forms, dialog, status, and alert roles.
- Controls have visible labels and unique accessible names.
- Keyboard focus uses a high-contrast 3 px outline.
- Color is supplemented with words, values, and shape—not used as the only status signal.
- `prefers-reduced-motion` disables transitions and smooth scrolling.
- Layouts adapt from four columns to one without horizontal content loss.

Formal WCAG 2.2 AA auditing remains a pre-production task; the current implementation is aligned but does not claim certification.
