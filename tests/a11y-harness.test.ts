import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { once } from "node:events";
import { a11yHarnessEnabled, harnessScreen, A11Y_HARNESS_FLAG } from "../lib/a11y-harness.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the accessibility harness exists only when its flag is exactly \"1\"", () => {
  assert.equal(A11Y_HARNESS_FLAG, "RACKED_A11Y_HARNESS");
  assert.equal(a11yHarnessEnabled({ RACKED_A11Y_HARNESS: "1" }), true);
  for (const value of [undefined, "", "0", "true", "yes", " 1"]) assert.equal(a11yHarnessEnabled({ RACKED_A11Y_HARNESS: value }), false, `"${value}" must not enable it`);
  assert.equal(a11yHarnessEnabled({}), false);
});

test("the harness page reads its flag per request and answers 404 without it", () => {
  const page = read("app/a11y-harness/page.tsx");
  assert.match(page, /await connection\(\);\s*if\(!a11yHarnessEnabled\(process\.env\)\)notFound\(\);/, "a build-time read could bake the page into a deployment");
  assert.match(page, /robots:\{ index:false, follow:false \}/);
  assert.doesNotMatch(page, /production-store|getSession|requireRole/, "the harness renders fixtures, never stored data or a session");
});

test("an unknown role or view falls back to the consumer landing view", () => {
  assert.deepEqual(harnessScreen("brand", "catalog"), { role: "brand", view: "catalog" });
  assert.deepEqual(harnessScreen("brand", "product"), { role: "brand", view: "overview" });
  assert.deepEqual(harnessScreen("admin", "anything"), { role: "consumer", view: "home" });
  assert.deepEqual(harnessScreen(undefined, undefined), { role: "consumer", view: "home" });
});

test("the accessibility checks run against a local build, never the deployed site", () => {
  const config = read("playwright.config.ts");
  const workflow = read(".github/workflows/ci.yml");
  for (const source of [config, workflow, read("tests/a11y/public.spec.ts"), read("tests/a11y/signed-in.spec.ts"), read("tests/a11y/keyboard.spec.ts")]) {
    assert.doesNotMatch(source, /amplifyapp\.com|https:\/\/(?!github\.com)/, "no check may reach a live host");
  }
  assert.match(config, /next start --hostname 127\.0\.0\.1/);
  assert.match(config, /RACKED_A11Y_HARNESS: "1"/);
  assert.match(config, /AWS_ENDPOINT_URL_DYNAMODB: `http:\/\/127\.0\.0\.1:\$\{storePort\}`/, "the server's table reads must go to the local fixture store");
  assert.match(workflow, /accessibility:[\s\S]*pnpm build[\s\S]*pnpm test:a11y/);
  assert.match(read("tests/a11y/axe.ts"), /new Set\(\["serious", "critical"\]\)/, "serious and critical violations fail the check");
  assert.match(read("tests/a11y/public.spec.ts"), /\["\/", "\/pricing", "\/privacy", "\/terms", "\/login", "\/community"\]/);
});

test("the fixture store answers reads with invented posts and refuses every write", async () => {
  const port = 4600 + Math.floor(Math.random() * 300);
  const store = spawn(process.execPath, [new URL("./a11y/community-store-stub.mjs", import.meta.url).pathname], { env: { ...process.env, A11Y_STORE_PORT: String(port) } });
  try {
    await once(store.stdout, "data");
    const call = (operation: string, body: unknown) => fetch(`http://127.0.0.1:${port}/`, { method: "POST", headers: { "x-amz-target": `DynamoDB_20120810.${operation}` }, body: JSON.stringify(body) });
    const query = await call("Query", { ExpressionAttributeValues: { ":pk": { S: "COMMUNITY" } } });
    const posts = await query.json() as { Items: Array<{ fictional: { BOOL: boolean } }> };
    assert.equal(query.status, 200);
    assert.ok(posts.Items.length > 0);
    assert.ok(posts.Items.every(item => item.fictional.BOOL === true), "every fixture post is labelled fictional");
    for (const write of ["PutItem", "UpdateItem", "DeleteItem", "BatchWriteItem", "TransactWriteItems"]) assert.equal((await call(write, {})).status, 400, `${write} must be refused`);
  } finally {
    store.kill();
  }
});
