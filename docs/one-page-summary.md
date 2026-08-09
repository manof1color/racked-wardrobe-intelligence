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

## Current status and learning

The application is hosted on AWS Amplify with a deployed CloudFormation production stack and working Bedrock model access. The primary learning is that a useful AI feature needs an ownership and evidence system around it: image recognition alone cannot prove a SKU, and an aggregate alone is unsafe until consent and minimum-cohort rules are enforced.
