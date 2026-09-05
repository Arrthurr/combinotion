#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const skillRoot = path.dirname(fileURLToPath(import.meta.url));
const artifactsRoot = path.join(skillRoot, "artifacts");

const FEATURES = [
  "public-request",
  "home-and-auth-boundary",
  "staff-visits",
  "staff-reports",
  "staff-catalog",
  "staff-views",
];

function parseArgs(argv) {
  const parsed = { baseUrl: "", feature: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--base-url" && value) {
      parsed.baseUrl = value.replace(/\/$/, "");
      index += 1;
      continue;
    }
    if (flag === "--feature" && value) {
      parsed.feature = value;
      index += 1;
    }
  }
  return parsed;
}

function headingCount(page, name, exact = false) {
  return page.getByRole("heading", { name, exact }).count();
}

async function snapshot(page) {
  return page.locator("body").innerText();
}

async function writeProof(featureId, files) {
  const directory = path.join(artifactsRoot, featureId);
  await mkdir(directory, { recursive: true });
  for (const [filename, contents] of Object.entries(files)) {
    if (typeof contents === "string") {
      await writeFile(path.join(directory, filename), contents);
    }
  }
  return directory;
}

async function drivePublicRequest(page, baseUrl) {
  const proof = [];
  await page.goto(`${baseUrl}/request-books`);
  await page.getByRole("heading", { name: "Request books" }).waitFor();
  proof.push("open: heading Request books");

  for (const label of [
    "School name",
    "School address",
    "Contact name",
    "Email",
  ]) {
    if (!(await page.getByLabel(label).isVisible())) {
      throw new Error(`Missing label: ${label}`);
    }
  }
  const emptyStatus = await page.getByRole("status").innerText();
  if (!emptyStatus.includes("No titles are available to request right now.")) {
    throw new Error(`Unexpected empty status: ${emptyStatus}`);
  }
  proof.push(`empty: ${emptyStatus.trim()}`);

  await page.screenshot({
    path: path.join(artifactsRoot, "public-request", "form.png"),
    fullPage: true,
  });
  const formAria = await snapshot(page);

  let submitted = false;
  await page.route("**/api/school-requests", async (route) => {
    submitted = true;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ reference: "JFB-TEST1234" }),
    });
  });
  await page.getByLabel("School name").fill("Joy School");
  await page.getByLabel("School address").fill("1 Main Street");
  await page.getByLabel("Contact name").fill("Pat Reader");
  await page.getByLabel("Email").fill("pat@example.com");
  await page.getByLabel("Title ISBN").fill("9780000000001");
  await page.getByLabel("Copies").fill("2");
  await page.getByRole("button", { name: "Reserve requested copies" }).click();
  const success = await page.getByRole("status").innerText();
  if (!success.includes("Request received: JFB-TEST1234") || !submitted) {
    throw new Error(`Submit did not show mocked reference: ${success}`);
  }
  proof.push(`submit: ${success.trim()}`);
  await page.screenshot({
    path: path.join(artifactsRoot, "public-request", "submit.png"),
    fullPage: true,
  });

  submitted = false;
  await page.goto(`${baseUrl}/request-books`);
  await page.getByRole("button", { name: "Reserve requested copies" }).click();
  const focused = await page.getByLabel("School name").evaluate((element) => {
    return element === document.activeElement;
  });
  if (!focused || submitted) {
    throw new Error("Empty submit must focus School name and skip the API");
  }
  proof.push("required: School name focused, API not called");

  await writeProof("public-request", {
    "aria.txt": formAria,
    "proof.txt": `${proof.join("\n")}\n`,
  });
}

async function driveHomeAndAuthBoundary(page, baseUrl) {
  const proof = [];
  await page.goto(`${baseUrl}/`);
  await page
    .getByRole("heading", { name: "Books that reach young readers." })
    .waitFor();
  if (
    !(await page.getByRole("link", { name: "Request books for your school" }).isVisible()) ||
    !(await page.getByRole("link", { name: "Staff workspace" }).isVisible())
  ) {
    throw new Error("Home is missing the school or staff entry link");
  }
  proof.push("home: heading and both entry links visible");
  await page.screenshot({
    path: path.join(artifactsRoot, "home-and-auth-boundary", "home.png"),
    fullPage: true,
  });

  await page.getByRole("link", { name: "Request books for your school" }).click();
  await page.getByRole("heading", { name: "Request books" }).waitFor();
  proof.push("home-to-request: Request books");

  const hidden = [
    ["/books", "Book catalog"],
    ["/books/new", "Add a title"],
    ["/visits", "School visits"],
    ["/requests", "School requests"],
    ["/reports", "Book popularity"],
    ["/reviews", "Book reviews"],
    ["/views", "Operations views"],
  ];
  for (const [pathname, heading] of hidden) {
    await page.goto(`${baseUrl}${pathname}`);
    const exact = heading === "Book popularity" || heading === "Book reviews";
    const count = await headingCount(page, heading, exact);
    const nav = await page
      .getByRole("navigation", { name: "Staff navigation" })
      .count();
    if (count !== 0 || nav !== 0) {
      throw new Error(`${pathname} leaked ${heading} or staff navigation`);
    }
    proof.push(`anon ${pathname}: ${heading}=${count} staff-nav=${nav}`);
  }

  await page.goto(`${baseUrl}/books`);
  await page.screenshot({
    path: path.join(artifactsRoot, "home-and-auth-boundary", "staff-private.png"),
    fullPage: true,
  });
  await writeProof("home-and-auth-boundary", {
    "aria.txt": await snapshot(page),
    "proof.txt": `${proof.join("\n")}\n`,
  });
}

async function driveStaffVisits(page, baseUrl) {
  const proof = [];
  await page.goto(`${baseUrl}/visits`);
  const schoolVisits = await headingCount(page, "School visits");
  const nav = await page
    .getByRole("navigation", { name: "Staff navigation" })
    .count();
  if (schoolVisits !== 0 || nav !== 0) {
    throw new Error("Anonymous /visits showed staff workspace chrome");
  }
  proof.push(`private: School visits=${schoolVisits} staff-nav=${nav}`);

  for (const label of [
    "School",
    "Occurred at",
    "Staff present",
    "Readers",
    "Follow-up",
  ]) {
    if (!(await page.getByLabel(label).isVisible())) {
      throw new Error(`Unconfigured visit editor missing ${label}`);
    }
  }
  if (!(await page.getByRole("group", { name: "Books" }).isVisible())) {
    throw new Error("Unconfigured visit editor missing Books group");
  }
  const status = await page.getByRole("status").innerText();
  if (!status.includes("Connect Convex to save visits.")) {
    throw new Error(`Unexpected visit status: ${status}`);
  }
  proof.push(`unconfigured: ${status.trim()}`);
  await page.screenshot({
    path: path.join(artifactsRoot, "staff-visits", "unconfigured.png"),
    fullPage: true,
  });
  await writeProof("staff-visits", {
    "aria.txt": await snapshot(page),
    "proof.txt": `${proof.join("\n")}\n`,
  });
}

async function driveStaffReports(page, baseUrl) {
  const proof = [];
  await page.goto(`${baseUrl}/reports`);
  if ((await headingCount(page, "Book popularity", true)) !== 0) {
    throw new Error("Anonymous /reports showed Book popularity");
  }
  await page.getByRole("heading", { name: "Book popularity report" }).waitFor();
  if (
    !(await page.getByRole("searchbox", { name: "Filter by title or author" }).isDisabled()) ||
    !(await page.getByRole("button", { name: "Export visible rows as CSV" }).isDisabled())
  ) {
    throw new Error("Unconfigured report controls were enabled");
  }
  proof.push("reports: Book popularity report visible, filter and CSV disabled");
  await page.screenshot({
    path: path.join(artifactsRoot, "staff-reports", "reports.png"),
    fullPage: true,
  });

  await page.goto(`${baseUrl}/reviews`);
  if ((await headingCount(page, "Book reviews", true)) !== 0) {
    throw new Error("Anonymous /reviews showed Book reviews");
  }
  await page.getByRole("heading", { name: "Review moderation" }).waitFor();
  if (!(await page.getByRole("button", { name: "Approve review" }).isDisabled())) {
    throw new Error("Unconfigured Approve review was enabled");
  }
  proof.push("reviews: Review moderation visible, Approve review disabled");
  await page.screenshot({
    path: path.join(artifactsRoot, "staff-reports", "reviews.png"),
    fullPage: true,
  });
  await writeProof("staff-reports", {
    "aria.txt": await snapshot(page),
    "proof.txt": `${proof.join("\n")}\n`,
  });
}

async function driveStaffCatalog(page, baseUrl) {
  const proof = [];
  await page.goto(`${baseUrl}/books`);
  const catalog = await headingCount(page, "Book catalog");
  const nav = await page
    .getByRole("navigation", { name: "Staff navigation" })
    .count();
  if (catalog !== 0 || nav !== 0) {
    throw new Error("Anonymous /books showed the catalog");
  }
  proof.push(`catalog: Book catalog=${catalog} staff-nav=${nav}`);
  await page.screenshot({
    path: path.join(artifactsRoot, "staff-catalog", "books.png"),
    fullPage: true,
  });

  await page.goto(`${baseUrl}/books/new`);
  const addTitle = await headingCount(page, "Add a title");
  const workspace = await headingCount(page, "Title workspace");
  if (addTitle !== 0 || workspace !== 0) {
    throw new Error("Anonymous /books/new showed a title editor");
  }
  proof.push(`new: Add a title=${addTitle} Title workspace=${workspace}`);
  await page.screenshot({
    path: path.join(artifactsRoot, "staff-catalog", "books-new.png"),
    fullPage: true,
  });
  await writeProof("staff-catalog", {
    "aria.txt": await snapshot(page),
    "proof.txt": `${proof.join("\n")}\n`,
  });
}

async function driveStaffViews(page, baseUrl) {
  const proof = [];
  await page.goto(`${baseUrl}/views`);
  const operations = await headingCount(page, "Operations views");
  const nav = await page
    .getByRole("navigation", { name: "Staff navigation" })
    .count();
  if (operations !== 0 || nav !== 0) {
    throw new Error("Anonymous /views showed operations views chrome");
  }
  for (const heading of ["Table", "Visit board", "Timeline"]) {
    if (!(await page.getByRole("heading", { name: heading }).isVisible())) {
      throw new Error(`Unconfigured /views missing ${heading}`);
    }
  }
  proof.push(
    `private: Operations views=${operations} staff-nav=${nav}`,
    "unconfigured: Table, Visit board, Timeline visible",
  );
  await page.screenshot({
    path: path.join(artifactsRoot, "staff-views", "unconfigured.png"),
    fullPage: true,
  });
  await writeProof("staff-views", {
    "aria.txt": await snapshot(page),
    "proof.txt": `${proof.join("\n")}\n`,
  });
}

const drivers = {
  "public-request": drivePublicRequest,
  "home-and-auth-boundary": driveHomeAndAuthBoundary,
  "staff-visits": driveStaffVisits,
  "staff-reports": driveStaffReports,
  "staff-catalog": driveStaffCatalog,
  "staff-views": driveStaffViews,
};

async function main() {
  const { baseUrl, feature } = parseArgs(process.argv.slice(2));
  if (!baseUrl || !FEATURES.includes(feature)) {
    process.stderr.write(
      `Usage: node .cursor/skills/verify-combinotion/drive.mjs --base-url <url> --feature <${FEATURES.join("|")}>\n`,
    );
    process.exit(2);
  }

  await mkdir(path.join(artifactsRoot, feature), { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await drivers[feature](page, baseUrl);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exit(1);
});
