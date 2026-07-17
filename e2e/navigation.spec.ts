import { test, expect } from "@playwright/test";
test("public request page is reachable", async ({ page }) => { await page.goto("/request-books"); await expect(page.getByRole("heading", {name:"Request books"})).toBeVisible(); });
