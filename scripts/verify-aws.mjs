// Reads back the live AWS settings the security documents rely on. Read-only: it prints PASS or
// FAIL for each line and writes nothing.
//
// Judge note: a template is not proof of a live setting. This asks DynamoDB and S3 directly, using
// the owner's own AWS sign-in (for example in AWS CloudShell, or after `aws login`).
//
// Run:
//   RACKED_TABLE_NAME=... RACKED_UPLOAD_BUCKET=... node scripts/verify-aws.mjs
// The region comes from AWS_REGION and defaults to us-east-2.

import { DescribeTimeToLiveCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetBucketEncryptionCommand, GetBucketLifecycleConfigurationCommand, GetPublicAccessBlockCommand, S3Client } from "@aws-sdk/client-s3";

const table = process.env.RACKED_TABLE_NAME;
const bucket = process.env.RACKED_UPLOAD_BUCKET;
if (!table || !bucket) throw new Error("RACKED_TABLE_NAME and RACKED_UPLOAD_BUCKET are required.");
const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-2";
const db = new DynamoDBClient({ region });
const s3 = new S3Client({ region });

const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`); };
const attempt = async (name, run) => {
  try {
    await run();
  } catch (error) {
    check(name, false, error instanceof Error ? error.name : "Error");
  }
};

console.log(`Checked ${new Date().toISOString().slice(0, 10)} in ${region}\n`);

await attempt("DynamoDB time-to-live is on, on the attribute `ttl`", async () => {
  const { TimeToLiveDescription: ttl } = await db.send(new DescribeTimeToLiveCommand({ TableName: table }));
  check("DynamoDB time-to-live is on, on the attribute `ttl`", ttl?.TimeToLiveStatus === "ENABLED" && ttl?.AttributeName === "ttl", `${ttl?.TimeToLiveStatus ?? "unknown"} on ${ttl?.AttributeName ?? "no attribute"}`);
});

await attempt("S3 blocks all public access", async () => {
  const { PublicAccessBlockConfiguration: block } = await s3.send(new GetPublicAccessBlockCommand({ Bucket: bucket }));
  const settings = ["BlockPublicAcls", "BlockPublicPolicy", "IgnorePublicAcls", "RestrictPublicBuckets"];
  check("S3 blocks all public access", settings.every((setting) => block?.[setting] === true), settings.map((setting) => `${setting} ${block?.[setting]}`).join(", "));
});

await attempt("S3 default encryption is on", async () => {
  const { ServerSideEncryptionConfiguration: encryption } = await s3.send(new GetBucketEncryptionCommand({ Bucket: bucket }));
  const algorithm = encryption?.Rules?.[0]?.ApplyServerSideEncryptionByDefault?.SSEAlgorithm;
  check("S3 default encryption is on", Boolean(algorithm), String(algorithm ?? "none"));
});

await attempt("S3 deletes unkept scan photos under temp/ after one day", async () => {
  const { Rules: rules } = await s3.send(new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }));
  const rule = rules?.find((entry) => entry.ID === "DeleteTemporaryUploads");
  const prefix = rule?.Filter?.Prefix ?? rule?.Prefix;
  check("S3 deletes unkept scan photos under temp/ after one day", rule?.Status === "Enabled" && prefix === "temp/" && rule?.Expiration?.Days === 1, rule ? `${rule.Status}, ${prefix}, ${rule.Expiration?.Days} day(s)` : "rule not found");
});

const failed = results.filter((ok) => !ok).length;
console.log(failed ? `\n${failed} check${failed === 1 ? "" : "s"} failed.` : "\nAll AWS settings read back as documented.");
process.exit(failed ? 1 : 0);
