import { expect, test } from "@playwright/test";

test("anonymous visitor cannot see operations views", async ({ page }) => {
  await page.goto("/views");
  await expect(
    page.getByRole("heading", { name: "Operations views" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Staff navigation" }),
  ).toHaveCount(0);
});

test("unconfigured views keep labelled headings visible", async ({ page }) => {
  await page.goto("/views");
  await expect(page.getByRole("heading", { name: "Table" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Visit board" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
});
