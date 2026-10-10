import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  use: { baseURL: "http://127.0.0.1:4173/pulse/", headless: true },
  webServer: {
    command: "npm run preview",
    url: "http://127.0.0.1:4173/pulse/",
    reuseExistingServer: !process.env.CI,
  },
  reporter: [["list"], ["html", { open: "never" }]],
});
