import { catalogText, normalizeIsbn } from "./catalog";
import { ROLES, type Role } from "./types";
import { fingerprintOf, notionSourceId, type NotionSourceId } from "./intake";

export type ImportRow =
  | {
      kind: "person";
      notionId: string;
      name: string;
      email?: string;
      roles: Role[];
    }
  | { kind: "school"; notionId: string; name: string; address: string }
  | {
      kind: "title";
      notionId: string;
      title: string;
      author: string;
      isbn: string;
    }
  | {
      kind: "request";
      notionId: string;
      schoolNotionId: string;
      contactName: string;
      email: string;
      createdAt: number;
      disposition:
        | { kind: "historicalContext"; status: "fulfilled" | "cancelled" | "declined" }
        | { kind: "verifiedActive"; lines: { isbn: string; quantity: number }[] };
    }
  | {
      kind: "visit";
      notionId: string;
      schoolNotionId: string;
      occurredAt: number;
      followUp?: string;
      staffNotionIds: string[];
      readerNotionIds: string[];
      books: { isbn: string; donatedQuantity: number; readAloud: boolean }[];
    }
  | {
      kind: "review";
      notionId: string;
      isbn: string;
      reviewer: string;
      score: number;
      feedback: string;
    }
  | { kind: "openingBalance"; isbn: string; quantity: number; reason: string };

export type ImportSourceId = ReturnType<typeof sourceFor>;

export type InvalidImportRow = { sourceId: ImportSourceId; reason: string };

export type PlannedImportWrite = {
  sourceId: ImportSourceId;
  kind: ImportRow["kind"];
};

export type ImportDryRunReport = {
  validCount: number;
  invalid: InvalidImportRow[];
  skipped: InvalidImportRow[];
  reused: PlannedImportWrite[];
  wouldWrite: PlannedImportWrite[];
  digest: string;
};

const KIND_RANK: Record<ImportRow["kind"], number> = {
  person: 0,
  school: 1,
  title: 2,
  openingBalance: 3,
  review: 4,
  request: 5,
  visit: 6,
};

export function orderedImportRows(rows: ImportRow[]): ImportRow[] {
  return [...rows].sort((left, right) => {
    const kindDelta = KIND_RANK[left.kind] - KIND_RANK[right.kind];
    if (kindDelta !== 0) return kindDelta;
    return sourceFor(left).localeCompare(sourceFor(right));
  });
}

export function previewDigest(rows: ImportRow[]): string {
  return fingerprintOf(orderedImportRows(rows));
}

function requiredText(value: unknown, label: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

function isbnField(value: unknown) {
  return normalizeIsbn(typeof value === "string" ? value : "");
}

function cleanedText(value: unknown) {
  return catalogText(typeof value === "string" ? value : "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function sourceFor(row: ImportRow): NotionSourceId | `openingBalance:${string}` {
  if (row.kind === "openingBalance") {
    return `openingBalance:${row.isbn}`;
  }
  return notionSourceId(row.kind, row.notionId);
}

export function validateImportRow(row: ImportRow): string[] {
  const errors: string[] = [];
  switch (row.kind) {
    case "person":
      if (!row.name.trim()) errors.push("Name is required");
      if (row.roles.length === 0) errors.push("Choose at least one role");
      break;
    case "school":
      if (!row.name.trim()) errors.push("School name is required");
      if (!row.address.trim()) errors.push("School address is required");
      break;
    case "title":
      if (!row.title.trim()) errors.push("Title is required");
      if (!row.author.trim()) errors.push("Author is required");
      if (!row.isbn.trim()) errors.push("ISBN is required");
      break;
    case "request":
      if (!row.contactName.trim()) errors.push("Contact name is required");
      if (!row.email.trim()) errors.push("Email is required");
      if (
        row.disposition.kind === "verifiedActive" &&
        row.disposition.lines.length === 0
      ) {
        errors.push("Verified active requests need title quantities");
      }
      break;
    case "visit":
      if (!Number.isFinite(row.occurredAt)) errors.push("Occurred-at is required");
      if (!Array.isArray(row.staffNotionIds)) errors.push("Staff list is required");
      if (!Array.isArray(row.readerNotionIds) || row.readerNotionIds.length === 0) {
        errors.push("Choose at least one reader");
      }
      if (!Array.isArray(row.books) || row.books.length === 0) {
        errors.push("Add at least one book");
      }
      break;
    case "review":
      if (!row.isbn.trim()) errors.push("ISBN is required");
      if (!row.reviewer.trim()) errors.push("Reviewer is required");
      if (!Number.isFinite(row.score)) errors.push("Score must be a number");
      break;
    case "openingBalance":
      if (!row.isbn.trim()) errors.push("ISBN is required");
      if (!Number.isInteger(row.quantity) || row.quantity < 1) {
        errors.push("Quantity must be a positive whole number");
      }
      if (!row.reason.trim()) errors.push("Reason is required");
      break;
    default: {
      const unhandled: never = row;
      errors.push(`Unhandled import kind: ${JSON.stringify(unhandled)}`);
    }
  }
  return errors;
}

export type ImportCatalog = {
  importedSourceIds: ReadonlySet<string>;
  titles: ReadonlyMap<
    string,
    { quantityOnHand: number; hasMovements: boolean }
  >;
};

type BatchIndex = {
  people: Set<string>;
  schools: Set<string>;
  isbns: Set<string>;
};

function indexBatch(rows: ImportRow[]): BatchIndex {
  const people = new Set<string>();
  const schools = new Set<string>();
  const isbns = new Set<string>();
  for (const row of rows) {
    if (row.kind === "person") people.add(row.notionId);
    if (row.kind === "school") schools.add(row.notionId);
    if (row.kind === "title") isbns.add(row.isbn);
  }
  return { people, schools, isbns };
}

function hasTitle(isbn: string, batch: BatchIndex, catalog: ImportCatalog) {
  return batch.isbns.has(isbn) || catalog.titles.has(isbn);
}

function hasPerson(notionId: string, batch: BatchIndex, catalog: ImportCatalog) {
  return (
    batch.people.has(notionId) ||
    catalog.importedSourceIds.has(notionSourceId("person", notionId))
  );
}

function hasSchool(notionId: string, batch: BatchIndex, catalog: ImportCatalog) {
  return (
    batch.schools.has(notionId) ||
    catalog.importedSourceIds.has(notionSourceId("school", notionId))
  );
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function relationOutcome(
  row: ImportRow,
  batch: BatchIndex,
  catalog: ImportCatalog,
): { errors: string[]; skipped: string[] } {
  switch (row.kind) {
    case "review":
      return {
        errors: hasTitle(row.isbn, batch, catalog)
          ? []
          : [`Title not found for review ${row.notionId}`],
        skipped: [],
      };
    case "openingBalance": {
      if (!hasTitle(row.isbn, batch, catalog)) {
        return {
          errors: [`Title not found for opening balance ${row.isbn}`],
          skipped: [],
        };
      }
      if (catalog.importedSourceIds.has(sourceFor(row))) {
        return { errors: [], skipped: [] };
      }
      const existing = catalog.titles.get(row.isbn);
      if (existing && (existing.quantityOnHand !== 0 || existing.hasMovements)) {
        return {
          errors: [
            "Opening balance can only be recorded when on-hand is zero and the title has no movements",
          ],
          skipped: [],
        };
      }
      return { errors: [], skipped: [] };
    }
    case "request": {
      if (row.disposition.kind !== "verifiedActive") {
        return { errors: [], skipped: [] };
      }
      return {
        errors: unique(
          row.disposition.lines.flatMap((line) =>
            hasTitle(line.isbn, batch, catalog)
              ? []
              : [`Title not found for request ${row.notionId}`],
          ),
        ),
        skipped: [],
      };
    }
    case "visit": {
      const errors: string[] = [];
      const skipped: string[] = [];
      if (!hasSchool(row.schoolNotionId, batch, catalog)) {
        errors.push(`School not found for visit ${row.notionId}`);
      }
      errors.push(
        ...unique(
          row.books.flatMap((book) =>
            hasTitle(book.isbn, batch, catalog)
              ? []
              : [`Title not found for visit ${row.notionId}`],
          ),
        ),
      );
      const resolvedReaders = row.readerNotionIds.filter((id) =>
        hasPerson(id, batch, catalog),
      );
      if (resolvedReaders.length === 0) {
        errors.push(`Person not found for visit ${row.notionId}`);
      } else {
        for (const id of row.readerNotionIds) {
          if (!hasPerson(id, batch, catalog)) {
            skipped.push(`Skipping unresolved reader ${id}`);
          }
        }
      }
      for (const id of row.staffNotionIds) {
        if (!hasPerson(id, batch, catalog)) {
          skipped.push(`Skipping unresolved staff ${id}`);
        }
      }
      return { errors, skipped };
    }
    default:
      return { errors: [], skipped: [] };
  }
}

export function planImport(
  rows: ImportRow[],
  catalog?: ImportCatalog,
): ImportDryRunReport {
  const invalid: InvalidImportRow[] = [];
  const valid: ImportRow[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const sourceId = sourceFor(row);
    const errors = validateImportRow(row);
    if (seen.has(sourceId)) {
      errors.push("Duplicate source id");
    }
    seen.add(sourceId);
    if (errors.length > 0) {
      invalid.push({ sourceId, reason: errors.join("; ") });
      continue;
    }
    valid.push(row);
  }
  const skipped: InvalidImportRow[] = [];
  const batch = indexBatch(valid);
  const executable = catalog
    ? valid.filter((row) => {
        const outcome = relationOutcome(row, batch, catalog);
        skipped.push(
          ...outcome.skipped.map((reason) => ({
            sourceId: sourceFor(row),
            reason,
          })),
        );
        if (outcome.errors.length === 0) return true;
        invalid.push({
          sourceId: sourceFor(row),
          reason: outcome.errors.join("; "),
        });
        return false;
      })
    : valid;
  const wouldWrite: PlannedImportWrite[] = [];
  const reused: PlannedImportWrite[] = [];
  for (const row of orderedImportRows(executable)) {
    const sourceId = sourceFor(row);
    const alreadyImported = catalog?.importedSourceIds.has(sourceId) === true;
    const reusedTitle = row.kind === "title" && catalog?.titles.has(row.isbn) === true;
    if (alreadyImported || reusedTitle) {
      reused.push({ sourceId, kind: row.kind });
    }
    if (!alreadyImported) {
      wouldWrite.push({ sourceId, kind: row.kind });
    }
  }
  return {
    validCount: wouldWrite.length,
    invalid,
    skipped,
    reused,
    wouldWrite,
    digest: previewDigest(valid),
  };
}

export function dryRunImport(
  rows: ImportRow[],
  catalog?: ImportCatalog,
): ImportDryRunReport {
  return planImport(rows, catalog);
}

function textField(value: unknown) {
  return typeof value === "string" ? value : "";
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberField(value: unknown) {
  return typeof value === "number" ? value : Number(value);
}

function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function parseImportRow(value: unknown, index = 0): ImportRow {
  if (!isRecord(value) || typeof value.kind !== "string") {
    throw new Error(`Row ${index + 1} is missing a kind`);
  }
  switch (value.kind) {
    case "person":
      return {
        kind: "person",
        notionId: textField(value.notionId),
        name: textField(value.name),
        ...(optionalText(value.email) ? { email: optionalText(value.email) } : {}),
        roles: Array.isArray(value.roles) ? value.roles.filter(isRole) : [],
      };
    case "school":
      return {
        kind: "school",
        notionId: textField(value.notionId),
        name: textField(value.name),
        address: textField(value.address),
      };
    case "title":
      return {
        kind: "title",
        notionId: textField(value.notionId),
        title: cleanedText(value.title),
        author: cleanedText(value.author),
        isbn: isbnField(value.isbn),
      };
    case "review":
      return {
        kind: "review",
        notionId: textField(value.notionId),
        isbn: isbnField(value.isbn),
        reviewer: cleanedText(value.reviewer),
        score: numberField(value.score),
        feedback: cleanedText(value.feedback),
      };
    case "openingBalance":
      return {
        kind: "openingBalance",
        isbn: isbnField(value.isbn),
        quantity: numberField(value.quantity),
        reason: textField(value.reason) || "Physical count",
      };
    case "request": {
      const disposition = isRecord(value.disposition) ? value.disposition : {};
      if (disposition.kind === "verifiedActive") {
        const lines = Array.isArray(disposition.lines)
          ? disposition.lines.flatMap((line) => {
              if (!isRecord(line)) {
                return [];
              }
              return [
                {
                  isbn: isbnField(line.isbn),
                  quantity: numberField(line.quantity),
                },
              ];
            })
          : [];
        return {
          kind: "request",
          notionId: textField(value.notionId),
          schoolNotionId: textField(value.schoolNotionId),
          contactName: textField(value.contactName),
          email: textField(value.email),
          createdAt: numberField(value.createdAt),
          disposition: { kind: "verifiedActive", lines },
        };
      }
      const status =
        disposition.status === "cancelled" || disposition.status === "declined"
          ? disposition.status
          : "fulfilled";
      return {
        kind: "request",
        notionId: textField(value.notionId),
        schoolNotionId: textField(value.schoolNotionId),
        contactName: textField(value.contactName),
        email: textField(value.email),
        createdAt: numberField(value.createdAt),
        disposition: { kind: "historicalContext", status },
      };
    }
    case "visit":
      return {
        kind: "visit",
        notionId: textField(value.notionId),
        schoolNotionId: textField(value.schoolNotionId),
        occurredAt: numberField(value.occurredAt),
        ...(optionalText(value.followUp) ? { followUp: optionalText(value.followUp) } : {}),
        staffNotionIds: Array.isArray(value.staffNotionIds)
          ? value.staffNotionIds.filter((id): id is string => typeof id === "string")
          : [],
        readerNotionIds: Array.isArray(value.readerNotionIds)
          ? value.readerNotionIds.filter((id): id is string => typeof id === "string")
          : [],
        books: Array.isArray(value.books)
          ? value.books.flatMap((book) => {
              if (!isRecord(book)) {
                return [];
              }
              return [
                {
                  isbn: isbnField(book.isbn),
                  donatedQuantity: numberField(book.donatedQuantity),
                  readAloud: book.readAloud === true,
                },
              ];
            })
          : [],
      };
    default:
      throw new Error(`Row ${index + 1} has an unknown kind`);
  }
}

export function parseImportRows(rows: unknown[]): ImportRow[] {
  return rows.map((row, index) => parseImportRow(row, index));
}

export function parseNotionExport(payload: unknown): ImportRow[] {
  if (!isRecord(payload) || !Array.isArray(payload.rows)) {
    throw new Error("Notion export must be a { rows } document");
  }
  return parseImportRows(payload.rows);
}

export function parseCountsCsv(text: string): ImportRow[] {
  const lines = text.trim().split(/\r?\n/);
  const [header, ...body] = lines;
  if (!header) {
    return [];
  }
  const columns = header.split(",").map((part) => part.trim());
  const isbnIndex = columns.indexOf("isbn");
  const quantityIndex = columns.indexOf("quantity");
  if (isbnIndex === -1 || quantityIndex === -1) {
    throw new Error("Physical count CSV needs isbn and quantity columns");
  }
  return body.flatMap((line) => {
    if (!line.trim()) {
      return [];
    }
    const cells = line.split(",").map((part) => part.trim());
    return [
      {
        kind: "openingBalance" as const,
        isbn: isbnField(requiredText(cells[isbnIndex], "ISBN")),
        quantity: Number(cells[quantityIndex]),
        reason: "Physical count",
      },
    ];
  });
}
