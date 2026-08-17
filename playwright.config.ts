import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  webServer: {
    command: "npm run dev",
    port: 3000,
    reuseExistingServer: false,
    env: {
      ...process.env,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "",
      NEXT_PUBLIC_E2E_UNCONFIGURED_REQUESTS: "1",
      CLERK_SECRET_KEY: "",
    },
  },
  use: { baseURL: "http://127.0.0.1:3000" },
});
