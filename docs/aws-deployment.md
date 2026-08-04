# AWS deployment checklist

No AWS credentials or paid actions are required to review this repository. These steps intentionally stop before account-specific submission.

## Target services

- **AWS Amplify Hosting:** Next.js 15 SSR, static landing pages, and API routes. AWS’s [Next.js deployment guide](https://docs.aws.amazon.com/amplify/latest/userguide/deploy-nextjs-app.html) uses a `next build` script and `.next` artifact directory.
- **Amazon Cognito:** production OIDC authentication and Consumer/Brand/Admin groups. AWS recommends authorization-code flow with PKCE for public clients in its [app-client guidance](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-client-apps.html).
- **Amazon DynamoDB:** structured user, wardrobe, wear, outfit, catalog, consent, and match records.
- **Amazon S3:** private temporary garment uploads with encryption, public-access blocking, and lifecycle deletion.
- **AWS Budgets/CloudWatch:** spend alerting and operational logs that exclude secrets and images.

## Stage 0 — account safety

1. Enable MFA on the root account and use an IAM administrative identity for setup.
2. Create a small AWS Budget with email alerts before provisioning.
3. Choose one region (the scaffold defaults to `us-east-1`).
4. Review current AWS Free Tier and Amplify pricing; do not assume every service remains free.
5. Never paste AWS access keys into the browser, source files, GitHub, or build logs.

## Stage 1 — backend resources

1. Install/configure AWS CLI locally using an IAM identity with narrow temporary permissions.
2. Validate `infra/template.yaml`:

   ```bash
   aws cloudformation validate-template --template-body file://infra/template.yaml
   ```

3. Deploy to a non-production stack only after reviewing the change set:

   ```bash
   aws cloudformation deploy \
     --template-file infra/template.yaml \
     --stack-name racked-demo \
     --parameter-overrides Environment=demo \
     --capabilities CAPABILITY_NAMED_IAM
   ```

4. Record stack outputs in a password manager—not in GitHub.

## Stage 2 — application configuration

1. Generate a unique `SESSION_SECRET` with at least 32 random bytes.
2. Add runtime values in the Amplify console. Do not prefix secrets with `NEXT_PUBLIC_`.
3. Replace the demo auth adapter with Cognito OIDC verification and group-to-role mapping.
4. Replace seed repositories with DynamoDB and private S3 adapters while keeping the pure matching module unchanged.
5. Configure S3 upload URLs server-side with content type, size, ownership, and short expiration.

## Stage 3 — Amplify deployment

1. Push the public GitHub repository without `.env.local`.
2. In AWS Amplify choose **Create new app → GitHub → repository → main branch**.
3. Allow Amplify to create a service role or select a narrowly scoped existing role.
4. Confirm `amplify.yml` uses `pnpm install --frozen-lockfile`, `pnpm build`, and `.next` artifacts.
5. Add `SESSION_SECRET` and non-secret resource IDs in Amplify settings.
6. Save and deploy. Confirm the generated HTTPS URL.

## Stage 4 — production smoke test

- Public landing page loads over HTTPS.
- Anonymous requests to `/consumer` and `/brand` redirect to login.
- Consumer cannot call Brand operations; Brand cannot retrieve raw Consumer records.
- Consent is required before a wardrobe write.
- JPG/PNG/WebP under 5 MB succeeds; other uploads fail.
- Provider failure shows deterministic fallback.
- Segment sizes under 25 return no aggregate.
- Delete-my-data removes DynamoDB items and S3 objects.
- CloudWatch logs contain no tokens, emails, or image payloads.

## Rollback

Disconnect the Amplify branch, disable self-registration, retain logs needed for diagnosis, empty only the dedicated demo upload bucket after confirming its exact name, and delete the `racked-demo` CloudFormation stack. Never run broad recursive deletion commands.
