import { defineConfig, devices } from "@playwright/test"
import { config } from "dotenv"
import path from "path"

// Load the root .env so ADMIN_API_KEY, API_URL, etc. are available to tests
config({ path: path.resolve(__dirname, "../.env") })

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.BASE_URL || `http://localhost:${process.env.WEB_PORT || "3000"}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
})
