import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const template = read("infra/template.yaml");
// Intentionally inspect text: CloudFormation's !Ref/!Sub/!GetAtt are not plain YAML.
const resources = template.slice(template.indexOf("\nResources:")).split(/\n(?=  [A-Za-z0-9]+:\n)/);
const resource = (id: string) => {
  const block = resources.find(entry => entry.startsWith(`  ${id}:\n`));
  assert.ok(block, `missing resource ${id}`);
  return block;
};
const signals = [
  ["SignInPause", "Sign-in pause engaged", "app/api/auth/login/route.ts"],
  ["AISiteCeiling", "AI site ceiling reached", "lib/ai-budget.ts"],
  ["AIBudgetUnavailable", "AI budget unavailable; failing closed", "lib/ai-budget.ts"],
  ["SharedLimitUnavailable", "Shared limit unavailable; failing open", "lib/server/abuse-guard.ts"],
  ["ScanPhotoWithoutExpiry", "Scan photo stored without expiry", "lib/server/production-store.ts"],
  ["DeletionSweepSkipped", "Account deletion storage sweep skipped", "lib/server/production-store.ts"],
];
const operations = ["GetItem", "BatchGetItem", "PutItem", "UpdateItem", "DeleteItem", "Query", "Scan", "TransactWriteItems"];

test("alarm inputs are explicit and no email subscription exists without an email", () => {
  assert.match(template, /AlertEmail:\s+Type: String\s+Default: ""\s+NoEcho: true/);
  assert.match(template, /AmplifyAppId:\s+Type: String\s+Default: d2iv0khybuuaeh/);
  assert.match(template, /ComputeLogGroupName:\s+Type: String\s+Default: ""/);
  assert.match(template, /HasAlertEmail: !Not \[!Equals \[!Ref AlertEmail, ""\]\]/);
  assert.match(template, /HasComputeLogGroup: !Not \[!Equals \[!Ref ComputeLogGroupName, ""\]\]/);
  const email = resource("SecurityAlertEmail");
  assert.match(email, /Condition: HasAlertEmail/);
  assert.match(email, /Protocol: email\s+Endpoint: !Ref AlertEmail/);
});

test("each exact security phrase still exists in its live source and quoted metric filter", () => {
  for (const [id, phrase, path] of signals) {
    assert.ok(read(path).includes(phrase), `${path} must retain the monitored phrase: ${phrase}`);
    const filter = resource(`${id}Filter`);
    assert.ok(filter.includes(`FilterPattern: '"${phrase}"'`), "a quoted literal phrase, not loose terms");
    assert.match(filter, /Condition: HasComputeLogGroup/);
    assert.match(filter, /LogGroupName: !Ref ComputeLogGroupName/);
    assert.ok(filter.includes(`MetricName: ${id}\n`));
    assert.match(filter, /MetricValue: "1"\s+DefaultValue: 0\s+Unit: Count/);
    assert.doesNotMatch(filter, /Dimensions:/, "no account identifiers or high-cardinality dimensions");
    const alarm = resource(`${id}Alarm`);
    assert.match(alarm, /Condition: HasComputeLogGroup/);
    assert.ok(alarm.includes(`MetricName: ${id}\n`));
    assert.match(alarm, /Threshold: 1\s+ComparisonOperator: GreaterThanOrEqualToThreshold/);
  }
});

test("all nine alarms notify the topic and handle missing metrics without inventing failures", () => {
  const alarms = resources.filter(entry => /Type: AWS::CloudWatch::Alarm\n/.test(entry));
  assert.equal(alarms.length, 9);
  for (const alarm of alarms) {
    assert.match(alarm, /AlarmActions:\s+- !Ref SecurityAlertTopic/);
    assert.match(alarm, /TreatMissingData: notBreaching/);
    assert.match(alarm, /EvaluationPeriods: 1\s+DatapointsToAlarm: 1/);
  }
  const amplify = resource("Amplify5xxAlarm");
  assert.match(amplify, /Namespace: AWS\/AmplifyHosting\s+MetricName: 5xxErrors/);
  assert.match(amplify, /- Name: App\s+Value: !Ref AmplifyAppId/);
  assert.match(amplify, /Statistic: Sum\s+Period: 300/);
});

test("DynamoDB alarms sum real TableName plus Operation metric series, never a nonexistent table-only series", () => {
  for (const metric of ["ThrottledRequests", "SystemErrors"]) {
    const alarm = resource(`DynamoDB${metric}Alarm`);
    assert.match(alarm, /Expression: "SUM\(\[m0,m1,m2,m3,m4,m5,m6,m7\]\)"/);
    assert.equal((alarm.match(/ReturnData: true/g) ?? []).length, 1);
    assert.equal((alarm.match(/Value: !Ref RackedTable/g) ?? []).length, operations.length);
    assert.equal((alarm.match(new RegExp(`MetricName: ${metric}\\n`, "g")) ?? []).length, operations.length);
    for (const operation of operations) assert.ok(alarm.includes(`- Name: Operation\n                  Value: ${operation}\n`));
  }
});

test("budget is Bedrock-only, monthly USD and notification-only, with scoped publishing permissions", () => {
  assert.match(template, /BedrockMonthlyBudgetUSD:\s+Type: Number\s+Default: 25\s+MinValue: 1/);
  const budget = resource("BedrockMonthlyBudget");
  assert.match(budget, /DependsOn: SecurityAlertTopicPolicy/);
  assert.match(budget, /BudgetType: COST\s+TimeUnit: MONTHLY/);
  assert.match(budget, /Amount: !Ref BedrockMonthlyBudgetUSD\s+Unit: USD/);
  assert.match(budget, /CostFilters:\s+Service:\s+- Amazon Bedrock/);
  assert.equal((budget.match(/SubscriptionType: SNS\s+Address: !Ref SecurityAlertTopic/g) ?? []).length, 2);
  assert.doesNotMatch(budget, /ActionType|ExecutionRoleArn/);
  const policy = resource("SecurityAlertTopicPolicy");
  for (const service of ["cloudwatch.amazonaws.com", "budgets.amazonaws.com"]) assert.ok(policy.includes(`Service: ${service}`));
  assert.equal((policy.match(/aws:SourceAccount: !Ref AWS::AccountId/g) ?? []).length, 2);
  assert.equal((policy.match(/Resource: !Ref SecurityAlertTopic/g) ?? []).length, 2);
  assert.doesNotMatch(policy, /Principal: ["']?\*/);
});

test("owner runbook requires discovery, review, subscription confirmation and honest costs", () => {
  for (const path of ["docs/aws-deployment.md", "docs/security-verification.md"]) {
    const doc = read(path);
    assert.ok(doc.includes("aws logs describe-log-groups --log-group-name-prefix /aws/amplify"));
    assert.match(doc, /compute logging must be enabled/i);
    assert.match(doc, /change set/i);
    assert.match(doc, /Confirm subscription/);
    assert.ok(doc.includes("$4.10"));
    assert.match(doc, /not deployed|not applied/i);
  }
});
