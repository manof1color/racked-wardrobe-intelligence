# Security policy

## Supported scope

The competition demo is an educational prototype. Security reports should cover authentication/session integrity, role authorization, consent bypass, exposure of raw wardrobe data, unsafe uploads, secret leakage, and cohort-threshold bypass.

## Never include in an issue

Do not publish any password — including synthetic test-cohort credentials, which are shared with judges privately and never committed to this repository — or session cookies, AWS credentials, model/API keys, private user data, or exploit output containing sensitive data. Share a minimal redacted reproduction with the repository owner privately.

## Baseline controls

- Secrets come from ignored runtime environment files or the deployment platform.
- Sessions are signed, HTTP-only, SameSite, expiring cookies.
- Consumer/Brand pages enforce roles on the server.
- Consumer analysis requires explicit consent.
- Brand-safe aggregate helpers suppress cohorts below 25 and strip identity/raw-wardrobe fields.
- A DynamoDB-backed enumeration budget caps how many distinct products one brand account can pull aggregates for in a rolling window, on the production dashboard and Hanger paths.
- Sliding-window rate limits protect sign-in, registration, garment analysis, both Hanger agents, brand metrics, and community publishing/likes with 429 responses. Counters are in-memory per compute instance — a deliberate zero-cost first layer, not a WAF replacement.
- Every response carries browser security headers (HSTS, `nosniff`, `X-Frame-Options: DENY`, referrer and permissions policies). The Content Security Policy is **report-only**: it records violations but blocks nothing yet.
- State-changing API requests must carry an Origin on the explicit allowlist in `lib/site-origin.ts`; a request's own Host or X-Forwarded-Host grants no trust. Password-reset links use the configured public origin only.
- Request bodies are capped by declared length in middleware and by bytes actually read in the photo routes.
- Public community responses are rebuilt from an explicit allowlist so owner account IDs, private S3 keys, and database key attributes never leave the server.
- Uploads are private, type-allowlisted, size-limited, and decoded at no more than 64 megapixels. Brand product photos are re-encoded without location or camera metadata before storage. **There is no malware scanning**: decoding and re-encoding proves a file is an image, which is not the same thing.
- Logs must exclude tokens, raw images, credentials, and personal data.

## Still open

Racked is in use by real brands, so these are live gaps rather than pre-launch tasks:

- **Enforce the Content Security Policy.** It is report-only. Enforcing it needs nonce-based script loading (Next.js hydration and the install-prompt capture are inline scripts) and a period of clean reports from `/api/security/csp-report`.
- **Edge rate limiting (AWS WAF).** Per-address limits belong at the edge, where the real client address is known.
- **Upload malware scanning** is not implemented.
- **Consent versions** are not persisted.
- **CloudFormation changes** in `infra/template.yaml` must be applied and verified against the live stack; the template is not proof of live settings.
- **A focused authorization test against every write endpoint** with synthetic accounts.

Automated repository checks currently include production dependency auditing on every change, weekly Dependabot version updates, and CodeQL scanning on pushes, pull requests, and a weekly schedule. These checks complement rather than replace manual authorization and privacy review.
