# Racked — one-page summary

## Problem

Brands know what was purchased but usually cannot tell whether a product becomes part of real life. Consumers also lack a simple, private way to organize real garments, build outfits, and measure what they use.

## Solution

Racked is a two-sided wardrobe-intelligence application. A Consumer creates a private account, photographs real garments, confirms AI-visible attributes, saves avatar-ready images, builds and stores outfits, and records wear. A Brand creates its own account, enrolls authorized product and label evidence with SKU identity, and receives actual-wear intelligence only for its own connected products.

## AI

Amazon Bedrock Nova Lite analyzes the supplied garment views under a prompt that prohibits person and demographic inference. Major-brand names are editable suggestions; verified identity requires a brand-enrolled GTIN or brand-plus-SKU match. The Consumer confirms or edits the result before saving. Consumer Hanger uses owned garments and wear context; Brand Hanger uses only product registry records and thresholded aggregates.

## Data and security

Accounts, garments, outfits, wears, consent, brand products, and posts persist in encrypted DynamoDB. Photos are encrypted in private S3 and exposed through one-hour signed links. Passwords are randomly salted and scrypt-hashed. A garment confirmation HMAC prevents a browser from substituting another account’s image or changing a verified registry result. Brand metrics remove non-opted-in owners and release no aggregate below 25 qualifying people.

## Business value

Consumers receive a persistent wardrobe, repeat-use tracking, outfit storage, and grounded styling. Brands can measure actual wears, active owners, and repeat-wear rate instead of relying only on transactions. Early or low-volume products correctly show “insufficient cohort” rather than fabricated confidence.

## Business model (proposed, not validated)

The Consumer product would remain free at MVP stage; brands would pay for workflow and privacy-safe intelligence. A testable starting structure is a **$99/month Starter** tier for product enrollment and pre-threshold catalog tools, a **$249/month Insights** tier covering a limited number of qualifying SKUs, and an optional **$49 per aggregate report** for occasional users. If multi-brand participation later supports independently thresholded category benchmarks, enterprise customers could license those benchmarks under negotiated annual agreements. Racked would not sell identities, photos, individual wardrobes, row-level wear histories, or access to suppressed cohorts. The tiers and prices are hypotheses for customer discovery, not validated revenue.

## Threshold tension and emerging-brand fallback

Racked's proposed customer base includes emerging apparel brands, yet a strict `k ≥ 25` release rule means a low-volume SKU may not unlock product-level wear intelligence quickly—or at all. Racked should keep that rule intact and offer a useful pre-threshold path instead: product enrollment, catalog and label-identity readiness, a non-numeric "not yet eligible" status, campaign-planning tools that make no wearer claims, and independently thresholded category benchmarks when enough unrelated data exists. This gives smaller brands operational value without exposing individual wear data or using one brand's small cohort to reconstruct another result.

## Bootstrapping plan (proposed)

The first approximately 100 real Consumers do not require a Brand partnership. Racked can recruit a campus beta through student organizations, clothing swaps, vintage resellers, fashion creators, and referral-based wardrobe challenges. The immediate value is private wardrobe organization, outfit creation, saved rotations, wear tracking, and optional Community posts; verified Brand matching and aggregate intelligence are additive rather than prerequisites. Short onboarding sessions and a "photograph ten pieces" challenge would help the initial cohort reach usefulness quickly while keeping Brand-data sharing optional.

## Current status and learning

The application is hosted on AWS Amplify with a deployed CloudFormation production stack and working Bedrock model access. The primary learning is that a useful AI feature needs an ownership and evidence system around it: image recognition alone cannot prove a SKU, and an aggregate alone is unsafe until consent and minimum-cohort rules are enforced.
