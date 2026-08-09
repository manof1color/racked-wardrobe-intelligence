# Backend API

All private routes verify the signed HTTP-only session and role on the server. Structured state persists in DynamoDB; image objects persist in private S3.

| Route | Access | Production behavior |
| --- | --- | --- |
| `POST /api/auth/register` | Public | Creates a real Consumer or Brand account, salts and scrypt-hashes the password, then starts a 7-day session |
| `POST /api/auth/login` | Public | Verifies the password using constant-time comparison and starts the role session |
| `POST /api/auth/logout` | Signed in | Expires the session cookie |
| `GET /api/consumer/wardrobe` | Consumer | Returns only that account’s garments and outfits with one-hour private image links |
| `POST /api/garments/analyze` | Consumer | Validates real views, calls Bedrock, verifies registry evidence, normalizes the front image, saves privately, and returns a signed confirmation |
| `POST /api/consumer/wardrobe` | Consumer | Verifies the account/image confirmation HMAC and persists the confirmed garment |
| `POST /api/consumer/outfits` | Consumer | Saves an account-owned outfit of 1–10 unique wardrobe items |
| `POST /api/wears` | Consumer | Atomically increments wear totals for owned items |
| `GET/PATCH /api/consumer/consent` | Consumer | Reads or changes that account’s brand-aggregate opt-in |
| `POST /api/agents/consumer` | Consumer | Builds an outfit from that account’s owned garments, wears, outfits, and submitted context |
| `GET /api/brand/products` | Brand | Lists only products enrolled by that brand account |
| `POST /api/brand/products` | Brand | Encrypts authorized three-view images and registers brand-bound SKU identity |
| `POST /api/brand/metrics` | Brand | Confirms product ownership, filters connected owners by consent, applies `k ≥ 25`, then calculates wear metrics |
| `POST /api/agents/brand` | Brand | Uses Amazon Bedrock to explain only the same brand-owned, consented, thresholded aggregate wear result; no AI call occurs below k=25 |
| `GET/POST/PATCH /api/community` | Public/Consumer | Lists posts, publishes from the signed-in Consumer’s saved wardrobe, and records likes |

## Image security

- Types: JPG, PNG, WebP.
- Maximum: 5 MB per view and 16 MB per three-view request.
- Public access: blocked.
- Browser access: one-hour signed S3 link.
- Save authorization: HMAC binds owner, S3 key, AI garment fields, and registry result.
- Production provider failure: HTTP 503; no wardrobe record is created.

## DynamoDB key design

```text
USER#<id> / PROFILE
USER#<id> / GARMENT#<id>
USER#<id> / OUTFIT#<time>#<id>
USER#<brand-id> / PRODUCT#<id>
COMMUNITY / POST#<time>#<id>
```

The `GSI1` index supports normalized email lookup, registry listing, and product-to-owner aggregation without scanning unrelated wardrobe partitions.
