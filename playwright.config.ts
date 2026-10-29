import { defineConfig, devices } from "@playwright/test";

// Accessibility checks (work order W8). They run against a local `next start` of a build made
// beforehand, never against the deployed site. `pnpm test:a11y` runs them; CI runs them in the
// `accessibility` job.
const port = Number(process.env.A11Y_PORT ?? 3100);
const storePort = Number(process.env.A11Y_STORE_PORT ?? 4599);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "tests/a11y",
  testMatch: "*.spec.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]] : "list",
  // Checked at rest. The home page's scroll-driven reveals hold below-the-fold sections at partial
  // opacity until they are scrolled into view, which axe would read as low contrast. Reduced motion
  // shows every section at its final, fully opaque state.
  use: { baseURL, trace: "retain-on-failure", reducedMotion: "reduce" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    // The phone layout swaps in the bottom tab bar and a different header, so it is checked too.
    { name: "mobile", use: { ...devices["Pixel 7"] }, testIgnore: "keyboard.spec.ts" },
  ],
  webServer: [
    {
      command: "node tests/a11y/community-store-stub.mjs",
      url: `http://127.0.0.1:${storePort}/`,
      env: { A11Y_STORE_PORT: String(storePort) },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `pnpm exec next start --hostname 127.0.0.1 --port ${port}`,
      url: `${baseURL}/api/version`,
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
      env: {
        RACKED_A11Y_HARNESS: "1",
        // Same throwaway value the build step uses; it signs nothing that outlives the run.
        SESSION_SECRET: process.env.SESSION_SECRET ?? "github-actions-test-only-secret-with-32-characters",
        RACKED_TABLE_NAME: "a11y-fixture-table",
        RACKED_UPLOAD_BUCKET: "",
        AWS_REGION: "us-east-2",
        AWS_ENDPOINT_URL_DYNAMODB: `http://127.0.0.1:${storePort}`,
        AWS_ACCESS_KEY_ID: "a11y-fixture",
        AWS_SECRET_ACCESS_KEY: "a11y-fixture",
        AWS_SESSION_TOKEN: "",
        AWS_PROFILE: "",
      },
    },
  ],
});
