# Backend API

All private routes verify the signed HTTP-only session and role on the server. Structured state persists in DynamoDB; image objects persist in private S3.

## Abuse controls

Endpoints that create accounts, invoke Amazon Bedrock, release aggregates, or accept public writes apply sliding-window rate limits and answer excess traffic with HTTP 429 plus a `retry-after` header: sign-in (per client and per email), registration, garment analysis, both Hanger agents, brand metrics, community publishing, and community likes. Counters are held in compute-instance memory (documented in `SECURITY.md` as a first layer). Separately, brand aggregate reads are governed by a persistent DynamoDB enumeration budget — at most six distinct products per brand account per five minutes — enforced inside the shared metrics function so the dashboard and Brand Hanger cannot be used to sweep near-threshold cohorts.

| Route | Access | Production behavior |
| --- | --- | --- |
| `POST /api/auth/register` | Public | Creates a real Consumer or Brand account, salts and scrypt-hashes the password, then starts a 7-day session |
| `POST /api/auth/login` | Public | Verifies the password using constant-time comparison and starts the role session |
| `POST /api/auth/logout` | Signed in | Expires the session cookie |
| `GET /api/consumer/wardrobe` | Consumer | Returns only that account’s garments and outfits with one-hour private image links |
| `POST /api/garments/analyze` | Consumer | Receives browser-prepared front, back, and label views, calls Bedrock, produces verified/suggested/unverified identity, stores the unmodified front photo as private evidence plus a separate auto-cropped display version (falling back to original framing when the crop is unsafe), and returns a signed confirmation binding both keys |
| `POST /api/consumer/wardrobe` | Consumer | Verifies the account/image confirmation HMAC and persists the garment with bounded Consumer-confirmed name, brand, and optional SKU overrides |
| `POST /api/consumer/outfits` | Consumer | Saves an account-owned outfit of 1–10 unique wardrobe items |
| `POST /api/wears` | Consumer | Atomically increments owned-item totals and writes a timestamped product wear event when the garment is registry-linked |
| `GET/PATCH /api/consumer/consent` | Consumer | Reads or changes that account’s brand-aggregate opt-in |
| `POST /api/agents/consumer` | Consumer | Accepts a free-form message plus at most eight bounded chat turns, reloads that account’s current garments/wears/outfits, and returns a grounded answer with validated save/wear actions |
| `GET /api/brand/products` | Brand | Lists only products enrolled by that brand account |
| `POST /api/brand/products` | Brand | Encrypts authorized three-view images and registers brand-bound SKU identity |
| `POST /api/brand/metrics` | Brand | Confirms product ownership, filters owners and wear events by consent, applies `k ≥ 25`, then returns total/average/median usage, engagement, repeat wear, frequency distribution, and an eight-week trend |
| `POST /api/agents/brand` | Brand | Accepts a free-form strategy question plus bounded chat history, reloads the selected brand-owned product and consent-filtered aggregate, and discusses only released metrics; below `k=25`, the context contains the privacy rule rather than suppressed values |
| `GET/POST/PATCH /api/community` | Public/Consumer | Lists posts, publishes from the signed-in Consumer’s saved wardrobe, and records likes. Feed responses are rebuilt from a public-field allowlist; owner IDs, private S3 keys, and database key attributes are never serialized |

## Image security

- Types: JPG, PNG, WebP.
- Browser preparation: mobile images are resized to at most 1800 px and approximately 1.2 MB each before the AWS request, preventing Amplify from replacing JSON with a 413 hosting response.
- Server maximum: 5 MB per view and 16 MB per prepared three-view request.
- Public access: blocked.
- Browser access: one-hour signed S3 link.
- Save authorization: HMAC binds owner, S3 key, AI garment fields, and registry result.
- Production provider failure: returns explicit manual review; no AI attributes or verified product link are invented.

## DynamoDB key design

```text
USER#<id> / PROFILE
USER#<id> / GARMENT#<id>
USER#<id> / OUTFIT#<time>#<id>
USER#<brand-id> / PRODUCT#<id>
PRODUCT#<product-id> / WEAR#<time>#<id>
COMMUNITY / POST#<time>#<id>
AGGQ#<brand-id> / PRODUCT#<product-id>   (aggregate enumeration-budget log)
```

The `GSI1` index supports normalized email lookup, registry listing, and product-to-owner aggregation without scanning unrelated wardrobe partitions.
