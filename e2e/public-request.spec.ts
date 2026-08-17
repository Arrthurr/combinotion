import { expect, test } from "@playwright/test";

test("shows the public request fields and unavailable state", async ({
  page,
}) => {
  await page.goto("/request-books");

  await expect(
    page.getByRole("heading", { name: "Request books" }),
  ).toBeVisible();
  await expect(page.getByLabel("School name")).toBeVisible();
  await expect(page.getByLabel("School address")).toBeVisible();
  await expect(page.getByLabel("Contact name")).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    "No titles are available to request right now.",
  );
});

test("shows the returned reference after a valid request", async ({
  page,
}) => {
  await page.route("**/api/school-requests", async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ reference: "JFB-TEST1234" }),
    });
  });
  await page.goto("/request-books");
  await page.getByLabel("School name").fill("Joy School");
  await page.getByLabel("School address").fill("1 Main Street");
  await page.getByLabel("Contact name").fill("Pat Reader");
  await page.getByLabel("Email").fill("pat@example.com");
  await page.getByLabel("Title ISBN").fill("9780000000001");
  await page.getByLabel("Copies").fill("2");
  await page
    .getByRole("button", { name: "Reserve requested copies" })
    .click();

  await expect(page.getByRole("status")).toContainText(
    "Request received: JFB-TEST1234",
  );
});

test("uses native required fields before submitting", async ({ page }) => {
  let submitted = false;
  await page.route("**/api/school-requests", async (route) => {
    submitted = true;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ reference: "JFB-TEST1234" }),
    });
  });
  await page.goto("/request-books");
  await page
    .getByRole("button", { name: "Reserve requested copies" })
    .click();

  await expect(page.getByLabel("School name")).toBeFocused();
  expect(submitted).toBe(false);
});

test("does not expose the staff request queue anonymously", async ({
  page,
}) => {
  await page.goto("/requests");

  await expect(
    page.getByRole("heading", { name: "School requests" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Staff navigation" }),
  ).toHaveCount(0);
});
