import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
const candidates = [
  process.env.LENNY_BROWSER_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].filter((path): path is string => !!path);
const executablePath = candidates.find(existsSync);
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  expect: { timeout: 10000 },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    viewport: { width: 1280, height: 900 },
    launchOptions: { executablePath, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    { command: "node tests/mock-api.mjs", url: "http://127.0.0.1:4011/health", reuseExistingServer: false },
    { command: "npm run dev", url: "http://127.0.0.1:3000", reuseExistingServer: false, timeout: 120000,
      env: { NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:4011", NEXT_PUBLIC_LENNY_REFERENCE_URL: "" } },
  ],
});
