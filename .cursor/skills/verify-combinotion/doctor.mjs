#!/usr/bin/env node

function parseArgs(argv) {
  const parsed = { baseUrl: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--base-url" && value) {
      parsed.baseUrl = value.replace(/\/$/, "");
      index += 1;
    }
  }
  return parsed;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

async function main() {
  const { baseUrl } = parseArgs(process.argv.slice(2));
  if (!baseUrl) {
    process.stderr.write(
      "Usage: node .cursor/skills/verify-combinotion/doctor.mjs --base-url <url>\n",
    );
    process.exit(2);
  }

  const url = `${baseUrl}/request-books`;
  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    fail(
      `doctor: could not fetch ${url}: ${error instanceof Error ? error.message : error}`,
    );
  }
  if (response.status !== 200) {
    fail(`doctor: ${url} returned ${response.status}, expected 200`);
  }

  const html = await response.text();
  if (!html.includes("<h1>Request books</h1>")) {
    fail("doctor: missing <h1>Request books</h1>");
  }

  const hasSchool = html.includes("School name");
  const hasIsbn = html.includes("Title ISBN");
  if (html.includes("Public book requests are closed") && !hasSchool) {
    fail(
      "doctor: live Convex hold (Public book requests are closed). Empty NEXT_PUBLIC_CONVEX_URL for E2E.",
    );
  }
  if (!hasSchool) {
    fail("doctor: missing School name (not the E2E unconfigured form)");
  }
  if (!hasIsbn) {
    fail(
      "doctor: missing Title ISBN. NEXT_PUBLIC_CONVEX_URL is probably still set; empty it for E2E.",
    );
  }

  process.stdout.write("ok: Request books, School name, Title ISBN\n");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exit(1);
});
