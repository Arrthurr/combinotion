import type { Role } from "./types";
import type { ImportRow } from "./notionImport";

export type NotionDumpRow = Record<string, unknown>;

export type NotionLaunchDump = {
  people: NotionDumpRow[];
  organizations: NotionDumpRow[];
  titles: NotionDumpRow[];
  requests: NotionDumpRow[];
  reviews: NotionDumpRow[];
  visits: NotionDumpRow[];
};

const ROLE_BY_NOTION: Record<string, Role> = {
  Donor: "donor",
  Volunteer: "volunteer",
  Educator: "schoolStaff",
  "Educator Applicant": "schoolStaff",
  School: "schoolStaff",
  "Board Member": "board",
  Reader: "reader",
  Reviewer: "reviewer",
  "Partner Contact": "professional",
  "Publishing Contact": "professional",
  Author: "professional",
  Client: "professional",
  "Potential Client": "professional",
  Supporter: "professional",
};

const SCHOOL_NAME = /school|academy|elementary|middle|high|k-8|k8/i;
const DECLINED_STATUS = new Set(["Not Selected", "Did not qualify"]);

function text(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/\*+/g, "").trim();
}

function pageIdFromUrl(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }
  const match = value.match(/([0-9a-f]{32})/i);
  if (!match) {
    return "";
  }
  const hex = match[1].toLowerCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function parsedList(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function relationIds(value: unknown) {
  return parsedList(value)
    .map((entry) => pageIdFromUrl(entry))
    .filter(Boolean);
}

function firstRelationId(value: unknown) {
  return relationIds(value)[0] ?? "";
}

function rolesFromLabels(value: unknown) {
  const roles = new Set<Role>();
  for (const label of parsedList(value)) {
    if (typeof label !== "string") {
      continue;
    }
    const mapped = ROLE_BY_NOTION[label];
    if (mapped) {
      roles.add(mapped);
    }
  }
  return [...roles];
}

function inferRoles(row: NotionDumpRow) {
  const roles = new Set<Role>(rolesFromLabels(row["Role (s)"]));
  if (relationIds(row["Book Reviews"]).length > 0) {
    roles.add("reviewer");
  }
  if (relationIds(row["Donation History"]).length > 0) {
    roles.add("donor");
  }
  if (relationIds(row["Full Name 2"]).length > 0) {
    roles.add("schoolStaff");
  }
  if (
    relationIds(row.Services).length > 0 ||
    relationIds(row["Full Name 4"]).length > 0
  ) {
    roles.add("volunteer");
  }
  return [...roles];
}

function composeAddress(row: NotionDumpRow) {
  const parts = [text(row.City), text(row.State)].filter(Boolean);
  return parts.join(", ");
}

function rememberAddress(
  addresses: Map<string, string>,
  notionId: string,
  address: string,
) {
  if (!notionId || !address || addresses.has(notionId)) {
    return;
  }
  addresses.set(notionId, address);
}

export function indexSchoolAddresses(
  dump: Pick<NotionLaunchDump, "organizations" | "visits" | "requests">,
): Map<string, string> {
  const addresses = new Map<string, string>();
  for (const row of dump.organizations) {
    rememberAddress(addresses, pageIdFromUrl(row.url), composeAddress(row));
  }
  for (const row of dump.visits) {
    rememberAddress(
      addresses,
      firstRelationId(row["School or Organization Name"]),
      text(row["Event Location/Address"]),
    );
  }
  for (const row of dump.requests) {
    rememberAddress(
      addresses,
      firstRelationId(row["School or Organization"]),
      composeAddress(row),
    );
  }
  return addresses;
}

function isSchoolRow(row: NotionDumpRow) {
  const name = text(row["Organization Name"]);
  if (!name) {
    return false;
  }
  return text(row["Organization Type"]) === "School" || SCHOOL_NAME.test(name);
}

function parseWhen(value: unknown) {
  const raw = text(value);
  if (!raw) {
    return 0;
  }
  const slash = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/,
  );
  if (slash) {
    const [, month, day, year, hour, minute] = slash;
    return Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      hour ? Number(hour) : 0,
      minute ? Number(minute) : 0,
    );
  }
  const parsed = Date.parse(raw.replace(" ", "T"));
  return Number.isFinite(parsed) ? parsed : 0;
}

function reviewScore(value: unknown) {
  const score = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(score)) {
    return Number.NaN;
  }
  return score <= 1 ? score * 100 : score;
}

function isbnOf(value: unknown) {
  return text(value).replace(/\s+/g, "");
}

function uniqueByNotionId<T extends { notionId: string }>(rows: T[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (!row.notionId || seen.has(row.notionId)) {
      return false;
    }
    seen.add(row.notionId);
    return true;
  });
}

export function exportPeople(rows: NotionDumpRow[]): ImportRow[] {
  return uniqueByNotionId(
    rows.flatMap((row) => {
      const name = text(row["Full Name"]);
      const roles = inferRoles(row);
      if (!name || roles.length === 0) {
        return [];
      }
      const email = text(row["Email Address"]);
      return [
        {
          kind: "person" as const,
          notionId: pageIdFromUrl(row.url),
          name,
          ...(email ? { email } : {}),
          roles,
        },
      ];
    }),
  );
}

export function exportSchools(
  rows: NotionDumpRow[],
  addresses: Map<string, string> = new Map(),
): ImportRow[] {
  return uniqueByNotionId(
    rows.flatMap((row) => {
      if (!isSchoolRow(row)) {
        return [];
      }
      const notionId = pageIdFromUrl(row.url);
      const address = composeAddress(row) || addresses.get(notionId) || "";
      if (!address) {
        return [];
      }
      return [
        {
          kind: "school" as const,
          notionId,
          name: text(row["Organization Name"]),
          address,
        },
      ];
    }),
  );
}

export function exportTitles(rows: NotionDumpRow[]): ImportRow[] {
  return uniqueByNotionId(
    rows.flatMap((row) => {
      const title = text(row.Name);
      const author = text(row.Author);
      const isbn = isbnOf(row["Hardcover ISBN"]);
      if (!title || !author || !isbn) {
        return [];
      }
      return [
        {
          kind: "title" as const,
          notionId: pageIdFromUrl(row.url),
          title,
          author,
          isbn,
        },
      ];
    }),
  );
}

export function exportRequests(rows: NotionDumpRow[]): ImportRow[] {
  return uniqueByNotionId(
    rows.flatMap((row) => {
      const contactName = text(row["Applicant Name 1"]) || text(row.Name);
      const email = text(row["Your email address"]);
      const notionId = pageIdFromUrl(row.url);
      if (!contactName || !email || !notionId) {
        return [];
      }
      const status = text(row.Status);
      return [
        {
          kind: "request" as const,
          notionId,
          schoolNotionId: firstRelationId(row["School or Organization"]),
          contactName,
          email,
          createdAt: parseWhen(row["Date Submitted"]),
          disposition: {
            kind: "historicalContext" as const,
            status: DECLINED_STATUS.has(status) ? "declined" : "fulfilled",
          },
        },
      ];
    }),
  );
}

export function exportReviews(
  rows: NotionDumpRow[],
  titlesByNotionId: Map<string, string>,
): ImportRow[] {
  const exportedIsbns = new Set(titlesByNotionId.values());
  return uniqueByNotionId(
    rows.flatMap((row) => {
      const reviewer = text(row["Your name"]);
      const score = reviewScore(row.Score);
      const ownIsbn = isbnOf(row["Hardcover ISBN"]);
      const isbn =
        (ownIsbn && exportedIsbns.has(ownIsbn) ? ownIsbn : "") ||
        titlesByNotionId.get(firstRelationId(row["Book title 1"])) ||
        "";
      if (!reviewer || !isbn || !Number.isFinite(score)) {
        return [];
      }
      return [
        {
          kind: "review" as const,
          notionId: pageIdFromUrl(row.url),
          isbn,
          reviewer,
          score,
          feedback:
            text(row["Overall thoughts and comments."]) ||
            text(row["Comments 1"]),
        },
      ];
    }),
  );
}

export function exportVisits(
  rows: NotionDumpRow[],
  titlesByName: Map<string, string>,
  exportedSchoolIds: Set<string>,
): ImportRow[] {
  return uniqueByNotionId(
    rows.flatMap((row) => {
      const notionId = pageIdFromUrl(row.url);
      const schoolNotionId = firstRelationId(row["School or Organization Name"]);
      if (!notionId || !schoolNotionId || !exportedSchoolIds.has(schoolNotionId)) {
        return [];
      }
      const titleName = text(row["Book Title for Read Aloud"]);
      const isbn = titleName ? titlesByName.get(titleName.toLowerCase()) : "";
      const donated = Number(row["Number of Books Distributed"]);
      const readerNotionIds = relationIds(row["Lead Volunteer"]);
      if (
        !isbn ||
        !Number.isFinite(donated) ||
        donated <= 0 ||
        readerNotionIds.length === 0
      ) {
        return [];
      }
      const followUp = text(row["Next Steps or Follow Up"]);
      return [
        {
          kind: "visit" as const,
          notionId,
          schoolNotionId,
          occurredAt: parseWhen(row["date:Event Date:start"]),
          ...(followUp ? { followUp } : {}),
          staffNotionIds: relationIds(row["Contact Name"]),
          readerNotionIds,
          books: [{ isbn, donatedQuantity: donated, readAloud: true }],
        },
      ];
    }),
  );
}

export function rowsFromNotionDump(dump: NotionLaunchDump): ImportRow[] {
  const titles = exportTitles(dump.titles);
  const titlesByNotionId = new Map(
    titles.map((row) => [row.notionId, row.isbn]),
  );
  const titlesByName = new Map(
    titles.map((row) => [row.title.toLowerCase(), row.isbn]),
  );
  const addresses = indexSchoolAddresses(dump);
  const schools = exportSchools(dump.organizations, addresses);
  const exportedSchoolIds = new Set(schools.map((row) => row.notionId));
  return [
    ...exportPeople(dump.people),
    ...schools,
    ...titles,
    ...exportRequests(dump.requests),
    ...exportReviews(dump.reviews, titlesByNotionId),
    ...exportVisits(dump.visits, titlesByName, exportedSchoolIds),
  ];
}
