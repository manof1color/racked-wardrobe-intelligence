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
- Public community responses are rebuilt from an explicit allowlist so owner account IDs, private S3 keys, and database key attributes never leave the server.
- Production uploads must be private, allowlisted, size-limited, scanned, and lifecycle-deleted.
- Logs must exclude tokens, raw images, credentials, and personal data.

## Before public deployment

Add WAF/edge rate limiting and CSRF review, persist consent versions, implement upload malware scanning, validate CloudFormation changes, and complete a focused authorization test against every write endpoint.

Automated repository checks currently include production dependency auditing on every change, weekly Dependabot version updates, and CodeQL scanning on pushes, pull requests, and a weekly schedule. These checks complement rather than replace manual authorization and privacy review.
