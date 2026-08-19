import { expect, test } from "@playwright/test";

test("anonymous visitor cannot see staff review and report pages", async ({
  page,
}) => {
  await page.goto("/reports");
  await expect(
    page.getByRole("heading", { name: "Book popularity", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Staff navigation" }),
  ).toHaveCount(0);

  await page.goto("/reviews");
  await expect(
    page.getByRole("heading", { name: "Book reviews", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Staff navigation" }),
  ).toHaveCount(0);
});

test("unconfigured review and report fallbacks keep labelled controls", async ({
  page,
}) => {
  await page.goto("/reports");
  await expect(
    page.getByRole("heading", { name: "Book popularity report" }),
  ).toBeVisible();
  await expect(
    page.getByRole("searchbox", { name: "Filter by title or author" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Export visible rows as CSV" }),
  ).toBeDisabled();

  await page.goto("/reviews");
  await expect(
    page.getByRole("heading", { name: "Review moderation" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve review" }),
  ).toBeDisabled();
});
