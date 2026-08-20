# Racked — one-page summary

## Problem

Brands know what was purchased but usually cannot tell whether a product becomes part of real life. Consumers also lack a simple, private way to organize real garments, build outfits, and measure what they use.

## Solution

Racked is a two-sided wardrobe-intelligence application. A Consumer creates a private account, photographs real garments, confirms AI-visible attributes, saves cropped display images, builds and stores outfits in a category-arranged flat-lay, and records wear. A Brand creates its own account, enrolls authorized product and label evidence with SKU identity, and receives actual-wear intelligence only for its own connected products.

## AI

Amazon Bedrock Nova Lite analyzes the supplied garment views under a prompt that prohibits person and demographic inference. Major-brand names are editable suggestions; verified identity requires a brand-enrolled GTIN or brand-plus-SKU match. The Consumer confirms or edits the result before saving. Consumer Hanger uses owned garments and wear context; Brand Hanger uses only product registry records and thresholded aggregates.

## Data and security

Accounts, garments, outfits, wears, consent, brand products, and posts persist in encrypted DynamoDB. Photos are encrypted in private S3 and exposed through one-hour signed links. Passwords are randomly salted and scrypt-hashed. A garment confirmation HMAC prevents a browser from substituting another account’s image or changing a verified registry result. Brand metrics remove non-opted-in owners and release no aggregate below 25 qualifying people.

## Business value

Consumers receive a persistent wardrobe, repeat-use tracking, outfit storage, and grounded styling. Brands can measure actual wears, active owners, and repeat-wear rate instead of relying only on transactions. Early or low-volume products correctly show “insufficient cohort” rather than fabricated confidence.

## Business model & pricing (proposed — not currently billed)

The consumer side is free to solve the cold-start problem: wardrobe and wear data only become valuable once enough real closets exist. The brand side carries the revenue, because actual-wear intelligence is what brands cannot get anywhere else. The Starter tier exists because the target customer — an emerging brand — often cannot reach the `k ≥ 25` privacy threshold immediately; it prices that waiting period honestly with category benchmarks and progress-to-threshold visibility only. No tier weakens the privacy model.

| Tier | Price | Includes |
| --- | --- | --- |
| Consumer Free | $0 | Wardrobe logging, wear tracking, limited Hanger queries |
| Consumer Pro | $6.99/mo or $59/yr | Unlimited Hanger, advanced analytics, outfit export |
| Brand SKU Enrollment | $25 one-time + $10/yr/SKU | Verification, registry matching |
| Brand Starter (below k≥25) | $29/mo | Category benchmarks, progress-to-threshold visibility only |
| Brand Standard (post-threshold) | $149/mo | Full aggregate dashboard, CSV export |
| Brand Growth | $299/mo | Standard + multi-product comparison + Hanger strategy artifacts |
| A la carte strategy artifact | $15/artifact | For non-subscribers |

All figures are planned pricing, clearly labeled in-app at [/pricing](https://main.d2iv0khybuuaeh.amplifyapp.com/pricing); no billing integration exists and nothing is charged today.

## Current status and learning

The application is hosted on AWS Amplify with a deployed CloudFormation production stack and working Bedrock model access. The primary learning is that a useful AI feature needs an ownership and evidence system around it: image recognition alone cannot prove a SKU, and an aggregate alone is unsafe until consent and minimum-cohort rules are enforced.
