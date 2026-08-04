# Racked — one-page competition summary

## Problem

Apparel brands know what customers purchased, but rarely know what they actually wear, what pairs with their closet, or which product would duplicate an ignored category. Small direct-to-consumer brands therefore target broadly and consumers receive recommendations disconnected from real life. This wastes marketing effort and can encourage unnecessary purchases.

## Solution

Racked is a privacy-first wardrobe-intelligence application. A consumer opts in, confirms garment attributes, tracks wears and outfits, and sees usage insights. A brand selects a product and receives ranked anonymous segments, an inspectable match score, three grounded reasons, and a campaign brief. The brand never sees names, emails, photos, or raw wardrobes.

## AI use

Garment intake is designed around a multimodal provider interface: a model may suggest category, color, style, and season, but the user must confirm or correct every field. Product matching combines seven explainable signals: category/outfit pairing, color, style, wear relevance, season, wardrobe gaps, and duplicate risk. Language generation is constrained to stored score components and confirmed attributes. If an external provider fails, a labeled deterministic fallback completes the demo without fabricating output.

## Business value

For consumers, Racked makes an existing wardrobe easier to use and makes new-product recommendations more relevant. For brands, it exposes four actionable measures: product match opportunity, wardrobe-gap prevalence, duplicate-category risk, and eligible segment size. These can support better creative briefs and merchandising decisions. Racked does not claim sales lift until a real opt-in pilot validates it.

## Privacy and ethics

Consent is explicit. Protected demographic traits are excluded from matching. Brands receive aggregates only when a cohort has at least 25 participants. Inferred garment fields require human confirmation. Uploads are validated and production source images are scheduled for deletion after extraction. A documented delete-my-data workflow removes owned records and recomputes aggregates.

## Technical approach

The application uses Next.js and TypeScript with protected server-rendered routes, signed HTTP-only demo sessions, typed matching modules, tests, and deterministic seed data. The AWS design uses Amplify Hosting for the web application, Cognito for production identity, DynamoDB for structured state, and private S3 storage for temporary garment images. Infrastructure scaffolding and deployment steps are included in the public repository.

## Key learning

The strongest AI product was not the most open-ended model call. It was a reliable workflow in which model suggestions are confirmed, the important decision is inspectable, privacy changes what brands are allowed to see, and a deterministic path preserves usefulness when a provider is unavailable.
