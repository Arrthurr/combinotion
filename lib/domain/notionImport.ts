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

export type InvalidImportRow = { sourceId: string; reason: string };

export type ImportDryRunReport = {
  validCount: number;
  invalid: InvalidImportRow[];
  wouldWrite: { sourceId: string; kind: ImportRow["kind"] }[];
  digest: string;
};

export function previewDigest(
  wouldWrite: ImportDryRunReport["wouldWrite"],
): string {
  return fingerprintOf(wouldWrite);
}

function requiredText(value: unknown, label: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
  return value.trim();
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

export function dryRunImport(rows: ImportRow[]): ImportDryRunReport {
  const invalid: InvalidImportRow[] = [];
  const wouldWrite: ImportDryRunReport["wouldWrite"] = [];
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
    wouldWrite.push({ sourceId, kind: row.kind });
  }
  return {
    validCount: wouldWrite.length,
    invalid,
    wouldWrite,
    digest: previewDigest(wouldWrite),
  };
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
        title: textField(value.title),
        author: textField(value.author),
        isbn: textField(value.isbn),
      };
    case "review":
      return {
        kind: "review",
        notionId: textField(value.notionId),
        isbn: textField(value.isbn),
        reviewer: textField(value.reviewer),
        score: numberField(value.score),
        feedback: textField(value.feedback),
      };
    case "openingBalance":
      return {
        kind: "openingBalance",
        isbn: textField(value.isbn),
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
                  isbn: textField(line.isbn),
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
                  isbn: textField(book.isbn),
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
        isbn: requiredText(cells[isbnIndex], "ISBN"),
        quantity: Number(cells[quantityIndex]),
        reason: "Physical count",
      },
    ];
  });
}
