import { test, expect } from "@playwright/test";

test("apex sends anonymous visitors to staff sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(
    page.getByRole("heading", { name: "Staff authentication is not configured" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Request books" })).toHaveCount(0);
});

test("public request page is reachable", async ({ page }) => {
  await page.goto("/request-books");
  await expect(page.getByRole("heading", { name: "Request books" })).toBeVisible();
});

test("public request page does not link to the staff door", async ({ page }) => {
  await page.goto("/request-books");
  await expect(page.getByRole("link", { name: "Back home" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Joy for Books/ })).toHaveCount(0);
});

test("the origin asks crawlers not to index", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.ok()).toBe(true);
  const body = await robots.text();
  expect(body).not.toMatch(/Disallow:\s*\//);
  const page = await request.get("/request-books");
  expect(page.headers()["x-robots-tag"] ?? "").toMatch(/noindex/i);
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
