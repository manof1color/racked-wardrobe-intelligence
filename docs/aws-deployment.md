# AWS production deployment

Live app: [https://main.d2iv0khybuuaeh.amplifyapp.com](https://main.d2iv0khybuuaeh.amplifyapp.com)

## Current infrastructure

The `racked-production` CloudFormation stack is deployed in `us-east-2` and provides:

- DynamoDB on-demand table with encryption, point-in-time recovery, and deletion protection;
- private encrypted S3 bucket with public access blocked;
- Cognito resources reserved for a later managed-identity migration;
- Amplify compute role scoped to required DynamoDB, private S3-object, and Amazon Bedrock actions. The template also grants `s3:ListBucket` limited to the `wardrobe/` prefix, so account deletion can remove scan photos that were never saved. **That permission takes effect only after the stack is updated**; until then deletion completes without the sweep and logs the gap.

The DynamoDB policy covers both the table ARN and `${tableArn}/index/*`. The index resource is required because registration and sign-in query the `GSI1` email lookup index; table-only `Query` permission is insufficient.

The app expects the table and bucket names, compute role, and `AI_PROVIDER=bedrock` in Amplify. Code defaults whole-look detection and Hanger to the US Nova Pro inference profile (`us.amazon.nova-pro-v1:0`), with Nova Lite as fallback; three-view benchmark analysis uses Nova Lite. `AI_LOOK_DETECTION_MODEL` overrides scan detection and `AI_HANGER_MODEL` overrides Hanger independently of `AI_MODEL`. The compute role permits the required Nova foundation-model and account inference-profile resources. Synchronous intake stores bounded crops without a per-piece Stable Image call. Live settings were not inspected for this work; secret values are never printed or stored in GitHub.

## Deployment path

1. GitHub `main` triggers AWS Amplify.
2. `amplify.yml` installs from the lockfile and runs `scripts/write-amplify-env.mjs`.
3. The helper copies only explicit server runtime variables into `.env.production` and never logs their values.
4. `next build` creates the SSR/API artifact.
5. Amplify compute assumes the scoped runtime role.

## Required runtime names

```text
SESSION_SECRET
RACKED_TABLE_NAME
RACKED_UPLOAD_BUCKET
RACKED_PASSWORD_RESET_FROM
RACKED_PUBLIC_ORIGIN
AI_PROVIDER=bedrock
AI_MODEL=amazon.nova-lite-v1:0
# Whole-look detection only; these are code-default examples, not verified live settings.
AI_LOOK_DETECTION_MODEL=us.amazon.nova-pro-v1:0
AI_HANGER_MODEL=us.amazon.nova-pro-v1:0
AI_BRAND_MODEL=amazon.nova-lite-v1:0
AI_BACKGROUND_REMOVAL_MODEL=us.stability.stable-image-remove-background-v1:0
# Optional: site-wide daily ceiling on Bedrock model calls (default 1500).
AI_DAILY_CEILING
NEXT_PUBLIC_SITE_URL
# Optional: more origins trusted for state-changing requests, comma-separated (for example a custom domain).
RACKED_ALLOWED_ORIGINS
# Optional: X-Forwarded-For entries the platform appends; unset, each instance learns it.
RACKED_TRUSTED_PROXY_HOPS
# Set to scrypt-n17, after the release that reads both schemes is verified live, to hash passwords at
# OWASP's scrypt cost. From then on, roll back no further than that release.
RACKED_PASSWORD_SCHEME
```

`RACKED_PASSWORD_RESET_FROM` must be a verified Amazon SES identity. If SES remains in sandbox mode, reset email works only for recipient addresses that are also verified. Before public recovery can be claimed, request SES production access and verify SPF/DKIM for the sender domain. The committed template describes only `ses:SendEmail`, but the 2026-08-28 Stable Image-only stack update deliberately did not deploy that unrelated permission. No SMTP/API credential is committed.

The committed synthetic cohort uses reserved `.local` addresses, so those accounts cannot receive real email. To demonstrate recovery before SES leaves its sandbox, use a separately created synthetic test account whose recipient address is verified in SES; never replace the documented cohort addresses with a judge's or customer's private email in source control. Deploying the application code also does not update an already-created IAM role automatically: apply the `infra/template.yaml` permission change (or add the equivalent narrowly scoped `ses:SendEmail` policy) before expecting delivery.

`AWS_REGION` is supplied by the AWS runtime and must not be added as an Amplify environment variable because the prefix is reserved.

## Verification checklist

- [x] CloudFormation stack created successfully.
- [x] Amplify compute role attached.
- [x] On 2026-08-28, change set `racked-stable-image-only` added exactly the three US Stable Image foundation-model ARNs to the existing Bedrock `InvokeModel` statement. The role was modified in place (`Replacement: False`); `AmplifyComputeRole` and `racked-production` both reached `UPDATE_COMPLETE`.
- [x] DynamoDB and S3 runtime names configured.
- [x] Amazon Nova Lite is available for routine calls from `us-east-2`; the US Nova Pro geographic profile accepts `us-east-2` as a source and routes only among documented US destination regions. Stable Image background removal is retained as a future asynchronous option rather than a synchronous per-piece intake dependency.
- [x] Direct Bedrock response test passed.
- [x] Local lint passed.
- [x] All 402 automated tests pass (re-verified 2026-09-18); clean CI type-check, build, production dependency audit, and CodeQL remain mandatory before merge.
- [x] PR #91 merged as `3a5c0d9` after Validate Racked and CodeQL passed. Amplify deployment 78 completed successfully from that commit in 3 minutes 30 seconds, and the production root served the expected Racked application immediately after the CloudFormation update. A physical-phone garment segmentation retest remains outstanding.
- [x] PR #86 merged as `ae315b4` after Validate Racked and CodeQL passed. By 2026-08-23 19:40 UTC the production root returned HTTP 200 and served the corrected Add Racked flow from `/_next/static/chunks/app/layout-2d79734cfefd5cc0.js`; compatible browsers receive the native prompt and browsers without one receive the device-specific guide.
- [x] PR #84 merged as `17e73ed` after Validate Racked and CodeQL passed. By 2026-08-23 02:28 UTC, the production Community page returned HTTP 200 and served the new Hanger-inspiration JavaScript bundle; `/login` returned HTTP 200 and the signed-out Consumer route retained its expected HTTP 307 redirect to `/login`. The exact Amplify job ID was not recorded because the AWS console session had expired, so deployment is evidenced by the public production artifact rather than an invented console identifier.
- [x] PR #82 merged as `6bc2557` after Validate Racked and CodeQL passed; Amplify's replacement build `BJCT2zWZITIpnwl872W83` was visible at the production URL by 2026-08-22 18:45 UTC. The public login returns HTTP 200 and the signed-out Consumer route returns its expected HTTP 307 redirect to login, preserving the access-control boundary.
- [x] Production Next.js build passed.
- [x] Amplify deployment 39 deployed PR #52 merge commit `893c4fb`; the synthetic seed was rerun and the documented 62% exact + strong substitute + missing Recreate result was verified live.
- [ ] Post-merge live account, photo, persistence, and brand enrollment smoke test.

## Production incident note: mobile registration permission

During the first mobile registration test, DynamoDB rejected the email-index query because the deployed Amplify role had table access but not the `GSI1` index ARN. The infrastructure template already described the index resource, and the production stack was reconciled to that template. Authentication routes now also translate unexpected provider failures into safe user-facing messages instead of returning AWS resource identifiers.

## Cost and safety

- DynamoDB uses on-demand billing.
- S3 is private and objects under `temp/` expire after one day. Scan photos wait there until a piece is kept, so photos nobody keeps are deleted within two days; the app relies on the `DeleteTemporaryUploads` rule for this.
- Bedrock is usage-billed; uploads are limited to control request size. Nova Pro handles the complex whole-look scan and Hanger's conversation, where Nova Lite lost the thread of longer exchanges; routine analysis stays on lower-cost Nova Lite. Hanger's model is chosen by `AI_HANGER_MODEL` alone — it no longer inherits `AI_MODEL` — and falls back to Nova Lite if Nova Pro is unavailable.
- Create an AWS Budget alert and monitor Amplify, S3, DynamoDB, and Bedrock usage.
- AI spending is capped twice (`lib/abuse-limits.ts`, `lib/ai-budget.ts`): per account per day in requests, and across the site per day in **model calls** — every Bedrock call a scan or Hanger message makes. The ceiling defaults to 1,500 model calls a day; at Nova Pro prices of roughly half a cent to a cent and a half a call, that bounds a worst day at about $8–20. Set `AI_DAILY_CEILING` in Amplify to change it. Both budgets fail closed: if DynamoDB cannot be reached, no model is called and the non-model fallback answers.
- `RACKED_TRUSTED_PROXY_HOPS` (optional) is how many `X-Forwarded-For` entries the platform appends. Leave it unset and each instance learns it from the shortest chain it sees, which a client can lengthen but never shorten.
- **DynamoDB time-to-live must be on** for the `ttl` attribute (`infra/template.yaml` declares it). It expires password-reset tokens, shared rate-limit windows, and the 90-day account activity log. If the stack predates this, turn it on in the console: DynamoDB → Tables → the Racked table → Additional settings → Time to Live → attribute `ttl`.
- Never place access keys, session secrets, account identifiers, or private image URLs in GitHub issues or logs.

## Security alerts — owner-applied, not deployed

The template now declares nine alarms, six log metric filters, one SNS topic, an optional email
subscription, and a notification-only monthly Amazon Bedrock budget. This is **not deployed** by
a Git push, an Amplify build, or these tests. The owner reviews and applies the stack change.

### Find the real compute log group first

Amplify **compute logging must be enabled** (Amplify → Monitoring → Hosting compute logs), and
the existing group must use the CloudWatch Logs Standard class. Do not guess its name:

```bash
aws logs describe-log-groups --log-group-name-prefix /aws/amplify --region us-east-2 \
  --query 'logGroups[].{Name:logGroupName,Class:logGroupClass}' --output table
```

Select the production branch's actual compute group. This template neither creates that group
nor changes Amplify's logging role. Metric filters only observe new events after installation,
not historical logs. A blank `ComputeLogGroupName` deliberately omits all six log filters/alarms;
the three service alarms and budget still exist. Missing data is not treated as a breach, so
silence is **not proof** that logging works.

### Reviewed change set, owner only

From a checkout containing this reviewed template, use the existing stack in `us-east-2`.
Supply the private destination email and discovered group at runtime, not in committed files.
The example assumes the existing `Environment` parameter; preserve any other live parameters.

```bash
# Set ALERT_EMAIL and COMPUTE_LOG_GROUP privately in your own shell first.
aws cloudformation create-change-set --stack-name racked-production \
  --change-set-name racked-security-alarms-YYYYMMDD --change-set-type UPDATE \
  --template-body file://infra/template.yaml --capabilities CAPABILITY_IAM --region us-east-2 \
  --parameters ParameterKey=Environment,UsePreviousValue=true \
    ParameterKey=AlertEmail,ParameterValue="$ALERT_EMAIL" \
    ParameterKey=AmplifyAppId,ParameterValue=d2iv0khybuuaeh \
    ParameterKey=ComputeLogGroupName,ParameterValue="$COMPUTE_LOG_GROUP" \
    ParameterKey=BedrockMonthlyBudgetUSD,ParameterValue=25
aws cloudformation wait change-set-create-complete --stack-name racked-production \
  --change-set-name racked-security-alarms-YYYYMMDD --region us-east-2
aws cloudformation describe-change-set --stack-name racked-production \
  --change-set-name racked-security-alarms-YYYYMMDD --region us-east-2
# STOP: owner reviews all changes, including existing IAM/TTL/lifecycle drift.
# No replacement or deletion of table/bucket/identity resources is expected.
# Only after owner approval:
aws cloudformation execute-change-set --stack-name racked-production \
  --change-set-name racked-security-alarms-YYYYMMDD --region us-east-2
aws cloudformation wait stack-update-complete --stack-name racked-production --region us-east-2
```

Do not blindly apply unrelated pending template changes. Reject an unexpected replacement,
deletion, or permission expansion and have it reviewed separately. The existing data resources
are not disposable. No application runtime permissions are added by this alert work.

Retrieve `SecurityAlertTopicArn` from stack outputs and use the email's **Confirm subscription**
link. Then check privately:

```bash
aws sns list-subscriptions-by-topic --topic-arn "$TOPIC_ARN" --region us-east-2 \
  --query 'Subscriptions[].{Protocol:Protocol,State:SubscriptionArn}'
aws cloudwatch describe-alarms --alarm-name-prefix racked-production- --region us-east-2 \
  --query 'MetricAlarms[].{Name:AlarmName,State:StateValue}'
```

An email subscription must show an ARN, not `PendingConfirmation`; blank `AlertEmail` creates no
subscription and therefore delivers no email. The owner can test SNS delivery separately without
triggering application attacks or writing fake events to production. Treat notifications and logs
as private operational information.

### What triggers

- Each of the six literal phrases listed in `tests/infra-alarms.test.ts`: one occurrence in five
  minutes. Tests also read the emitting source files, so renaming a phrase breaks the build.
- Amplify: five `AWS/AmplifyHosting` `5xxErrors` in five minutes, dimension `App` = app ID.
- DynamoDB: any `ThrottledRequests` or `SystemErrors` in five minutes for this table, summed across
  GetItem, BatchGetItem, PutItem, UpdateItem, DeleteItem, Query, Scan and TransactWriteItems.
  Both metrics require **TableName + Operation**. Each alarm sums eight metric series; a table-only
  SystemErrors alarm would never observe data. New access operations require extending the alarms.
  Partial batch throttles may only appear in Read/WriteThrottleEvents, which these alarms do not cover.
- Budget: actual monthly cost for the **Amazon Bedrock** service exceeds 80% or 100% of
  `BedrockMonthlyBudgetUSD` (default $25). It sends to the same account-scoped topic. Billing data
  is delayed: this is not a hard stop and does not replace the app's model-call budgets.

### Monthly cost estimate (USD, before account allowances and credits)

Nine alarm resources monitor **23 billable alarm metrics**: six log metrics, one Amplify metric,
and eight operation series in each of two DynamoDB metric-math alarms. At $0.10 per standard
alarm metric-month, alarms total **$2.30/month**, not nine times $0.10.
The six log-derived **custom metrics** can add 6 × $0.30 = **$1.80/month**.
Conservative full-month total: **$4.10/month**, plus existing log ingestion/storage, any applicable
API charges, and SNS usage beyond free allowances. Custom metrics are prorated by publication;
eligible unused free allowances/credits may reduce the actual bill.

There is no separate filter-creation fee, but its generated metrics are not universally free.
Low-volume SNS email may fit the free allowance; it is not unlimited free email.
This notification-only AWS Budget is free; the first two **action-enabled** budgets are also free
under current AWS pricing, but this template creates no budget actions.

Sources: [CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/),
[CloudWatch metric-filter billing](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/cloudwatch_billing.html),
[SNS pricing](https://aws.amazon.com/sns/pricing/),
[Budgets pricing](https://aws.amazon.com/aws-cost-management/aws-budgets/pricing/),
[Amplify dimensions](https://docs.aws.amazon.com/amplify/latest/userguide/monitoring-with-cloudwatch.html),
[DynamoDB dimensions](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/metrics-dimensions.html).

## Rollback

Revert the application PR first so the current Amplify build remains usable. Keep the protected table and retained bucket while investigating. Delete data only through exact, reviewed account-owned keys; never run a broad recursive bucket or table deletion.
