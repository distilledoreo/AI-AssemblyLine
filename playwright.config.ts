import { defineConfig, devices } from "@playwright/test";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `${npmCommand} run dev -- --hostname 127.0.0.1 --port 3100`,
    url: "http://127.0.0.1:3100/signin",
    reuseExistingServer: false,
    timeout: 90_000,
    env: {
      QUEUE_MODE: "inline",
      STORAGE_ROOT: "./test-storage/e2e",
      AUTH_GOOGLE_ID: "playwright-google-client",
      AUTH_GOOGLE_SECRET: "playwright-google-secret",
      AUTH_GITHUB_ID: "playwright-github-client",
      AUTH_GITHUB_SECRET: "playwright-github-secret",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
