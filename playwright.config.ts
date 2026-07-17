import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir:"./e2e", webServer:{ command:"npm run dev", port:3000, reuseExistingServer:!process.env.CI }, use:{ baseURL:"http://127.0.0.1:3000" } });
