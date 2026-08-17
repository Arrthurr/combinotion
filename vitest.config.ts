import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: { environment: "node", exclude: ["e2e/**", "node_modules/**", ".next/**"] },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
