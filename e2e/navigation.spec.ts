import { test, expect } from "@playwright/test";

test("public request page is reachable", async ({ page }) => {
  await page.goto("/request-books");
  await expect(page.getByRole("heading", { name: "Request books" })).toBeVisible();
});

test("anonymous visitor cannot see the staff catalog", async ({ page }) => {
  await page.goto("/books");
  await expect(page.getByRole("heading", { name: "Book catalog" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Staff navigation" })).toHaveCount(0);
});

test("anonymous visitor cannot see a title workspace at /books/new", async ({ page }) => {
  await page.goto("/books/new");
  await expect(page.getByRole("heading", { name: "Title workspace" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Staff navigation" })).toHaveCount(0);
});
