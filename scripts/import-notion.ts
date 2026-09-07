import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  dryRunImport,
  parseCountsCsv,
  parseNotionExport,
  type ImportRow,
} from "../lib/domain/notionImport";

function argValue(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

function printReport(label: string, rows: ImportRow[]) {
  const report = dryRunImport(rows);
  console.log(`${label}: ${report.validCount} valid, ${report.invalid.length} invalid`);
  for (const row of report.invalid) {
    console.log(`  ${row.sourceId}: ${row.reason}`);
  }
  return report;
}

const exportPath = argValue("--export");
const countsPath = argValue("--counts");
const apply = process.argv.includes("--apply");
const prod = process.argv.includes("--prod");

if (!exportPath && !countsPath) {
  console.error(
    "Usage: npx tsx scripts/import-notion.ts --export notion.json [--counts counts.csv] [--apply] [--prod]",
  );
  process.exit(1);
}

const rows: ImportRow[] = [];
if (exportPath) {
  rows.push(
    ...parseNotionExport(JSON.parse(readFileSync(resolve(exportPath), "utf8"))),
  );
}
if (countsPath) {
  rows.push(...parseCountsCsv(readFileSync(resolve(countsPath), "utf8")));
}

const report = printReport("Dry-run", rows);
if (report.invalid.length > 0) {
  console.error("Fix invalid rows before apply.");
  process.exit(apply ? 1 : 0);
}

if (!apply) {
  console.log(`Preview digest: ${report.digest}`);
  process.exit(0);
}

const convexArgs = [
  "convex",
  "run",
  "migrations/notionImport:applyFromScript",
  JSON.stringify({ rows, expectedDigest: report.digest }),
];
if (prod) {
  convexArgs.push("--prod");
}
const result = spawnSync("npx", convexArgs, { stdio: "inherit" });
process.exit(result.status ?? 1);
