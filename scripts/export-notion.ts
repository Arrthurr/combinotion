import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { rowsFromNotionDump, type NotionLaunchDump } from "../lib/domain/notionExport";
import { dryRunImport } from "../lib/domain/notionImport";

function argValue(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

function isDump(value: unknown): value is NotionLaunchDump {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const dump = value as Record<string, unknown>;
  return (
    Array.isArray(dump.people) &&
    Array.isArray(dump.organizations) &&
    Array.isArray(dump.titles) &&
    Array.isArray(dump.requests) &&
    Array.isArray(dump.reviews) &&
    Array.isArray(dump.visits)
  );
}

const dumpPath = argValue("--dump");
const outPath = argValue("--out") ?? "notion.json";

if (!dumpPath) {
  console.error(
    "Usage: npx tsx scripts/export-notion.ts --dump dump.json [--out notion.json]",
  );
  process.exit(1);
}

const parsed: unknown = JSON.parse(readFileSync(resolve(dumpPath), "utf8"));
if (!isDump(parsed)) {
  console.error(
    "Dump must be { people, organizations, titles, requests, reviews, visits }",
  );
  process.exit(1);
}

const rows = rowsFromNotionDump(parsed);
const report = dryRunImport(rows);
writeFileSync(resolve(outPath), `${JSON.stringify({ rows }, null, 2)}\n`);
console.log(`Wrote ${rows.length} rows to ${outPath}`);
console.log(`Dry-run: ${report.validCount} valid, ${report.invalid.length} invalid`);
for (const row of report.invalid) {
  console.log(`  ${row.sourceId}: ${row.reason}`);
}
console.log(`Preview digest: ${report.digest}`);
