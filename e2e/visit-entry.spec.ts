import { expect, test } from "@playwright/test";

test("anonymous visitor cannot see the staff visits workspace", async ({
  page,
}) => {
  await page.goto("/visits");

  await expect(
    page.getByRole("heading", { name: "School visits" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Staff navigation" }),
  ).toHaveCount(0);
});

test("unconfigured visit editor keeps its labelled fields visible", async ({
  page,
}) => {
  await page.goto("/visits");

  await expect(page.getByLabel("School")).toBeVisible();
  await expect(page.getByLabel("Occurred at")).toBeVisible();
  await expect(page.getByLabel("Staff present")).toBeVisible();
  await expect(page.getByLabel("Readers")).toBeVisible();
  await expect(page.getByRole("group", { name: "Books" })).toBeVisible();
  await expect(page.getByLabel("Follow-up")).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    "Connect Convex to save visits.",
  );
});
