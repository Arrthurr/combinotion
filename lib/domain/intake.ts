export const intakeRetentionDays = 180;

export type IntakeFeedKind = "bookReviews" | "donationApplications";

export type SheetsSourceId = `sheets:${string}`;
export type NotionSourceId = `notion:${string}`;

export type ReviewMapping = {
  identityColumns: string[];
  reviewerColumn: string;
  scoreColumn: string;
  feedbackColumn: string;
  isbnColumn?: string;
  titleTextColumn?: string;
};

export type DonationApplicationMapping = {
  identityColumns: string[];
  nameColumn: string;
  emailColumn?: string;
  schoolNameColumn?: string;
  schoolAddressColumn?: string;
  messageColumn?: string;
};

export type IntakeMapping = ReviewMapping | DonationApplicationMapping;

export type ReviewCandidate = {
  kind: "review";
  reviewer: string;
  score: number;
  feedback: string;
  isbn?: string;
  titleText?: string;
};

export type DonationApplicationCandidate = {
  kind: "donationApplication";
  name: string;
  email?: string;
  schoolName?: string;
  schoolAddress?: string;
  message?: string;
};

export type IntakeCandidate = ReviewCandidate | DonationApplicationCandidate;

export type IntakeRecordRef =
  | { kind: "person"; id: string }
  | { kind: "school"; id: string }
  | { kind: "title"; id: string }
  | { kind: "review"; id: string };

export type IntakeResolution =
  | { kind: "autoApplied"; record: IntakeRecordRef }
  | { kind: "attached"; record: IntakeRecordRef }
  | { kind: "createdRecord"; record: IntakeRecordRef }
  | { kind: "dismissed"; reason: string };

export type IntakeItemState =
  | { kind: "pending"; candidate: IntakeCandidate }
  | { kind: "invalid"; errors: string[] }
  | {
      kind: "resolved";
      candidate: IntakeCandidate;
      resolution: IntakeResolution;
      resolvedAt: number;
      sourceDrift: boolean;
    };

export type ParsedRow = {
  sourceId: SheetsSourceId;
  fingerprint: string;
  rawValues: string;
  outcome:
    | { kind: "candidate"; candidate: IntakeCandidate }
    | { kind: "invalid"; errors: string[] };
};

export type RowPlan =
  | { kind: "skip" }
  | {
      kind: "create";
      state: Extract<IntakeItemState, { kind: "pending" | "invalid" }>;
    }
  | {
      kind: "reparse";
      state: Extract<IntakeItemState, { kind: "pending" | "invalid" }>;
    }
  | { kind: "markDrift" };

export type MatchOutcome =
  | {
      kind: "autoApply";
      target: { kind: "title"; id: string } | { kind: "person"; id: string };
    }
  | { kind: "needsStaff" };

export function sheetsSourceId(
  kind: IntakeFeedKind,
  spreadsheetId: string,
  tabName: string,
  rowKey: string,
): SheetsSourceId {
  const key = rowKey.trim();
  if (!key) {
    throw new Error("Sheet row key is required");
  }
  return `sheets:${kind}:${spreadsheetId}:${tabName}:${key}`;
}

export function notionSourceId(kind: string, pageId: string): NotionSourceId {
  const clean = pageId.trim();
  if (!clean) {
    throw new Error("Notion page id is required");
  }
  return `notion:${kind}:${clean}`;
}

export function fingerprintOf(value: unknown): string {
  return JSON.stringify(value);
}

function cell(headers: string[], cells: string[], column: string) {
  const index = headers.indexOf(column);
  if (index === -1) {
    return undefined;
  }
  const value = cells[index]?.trim();
  return value ? value : undefined;
}

function rowKey(headers: string[], cells: string[], identityColumns: string[]) {
  if (identityColumns.length === 0) {
    return "";
  }
  const parts = identityColumns.map(
    (column) => cell(headers, cells, column) ?? "",
  );
  if (parts.every((part) => part === "")) {
    return "";
  }
  return parts.join("|");
}

function parsedState(
  outcome: ParsedRow["outcome"],
): Extract<IntakeItemState, { kind: "pending" | "invalid" }> {
  if (outcome.kind === "invalid") {
    return { kind: "invalid", errors: outcome.errors };
  }
  return { kind: "pending", candidate: outcome.candidate };
}

export function parseRow(
  feed: {
    kind: IntakeFeedKind;
    mapping: IntakeMapping;
    spreadsheetId: string;
    tabName: string;
  },
  headers: string[],
  cells: string[],
): ParsedRow {
  const identityColumns = feed.mapping.identityColumns;
  const missingIdentity = identityColumns.filter(
    (column) => !headers.includes(column),
  );
  const rawValues = JSON.stringify(cells);
  const errors: string[] = missingIdentity.map(
    (column) => `Missing identity column ${column}`,
  );

  if (feed.kind === "bookReviews") {
    const mapping = feed.mapping as ReviewMapping;
    const reviewer = cell(headers, cells, mapping.reviewerColumn);
    const feedback = cell(headers, cells, mapping.feedbackColumn);
    const scoreText = cell(headers, cells, mapping.scoreColumn);
    const isbn = mapping.isbnColumn
      ? cell(headers, cells, mapping.isbnColumn)
      : undefined;
    const titleText = mapping.titleTextColumn
      ? cell(headers, cells, mapping.titleTextColumn)
      : undefined;
    if (!reviewer) {
      errors.push("Reviewer is required");
    }
    if (!feedback) {
      errors.push("Feedback is required");
    }
    const score = scoreText === undefined ? Number.NaN : Number(scoreText);
    if (!Number.isFinite(score)) {
      errors.push("Score must be a number");
    }
    if (!isbn && !titleText) {
      errors.push("ISBN or title is required");
    }
    const key = rowKey(headers, cells, identityColumns);
    const sourceId = sheetsSourceId(
      feed.kind,
      feed.spreadsheetId,
      feed.tabName,
      key || rawValues,
    );
    if (errors.length > 0) {
      return {
        sourceId,
        fingerprint: fingerprintOf({ headers, cells }),
        rawValues,
        outcome: { kind: "invalid", errors },
      };
    }
    const candidate: ReviewCandidate = {
      kind: "review",
      reviewer: reviewer as string,
      score,
      feedback: feedback as string,
      ...(isbn === undefined ? {} : { isbn }),
      ...(titleText === undefined ? {} : { titleText }),
    };
    return {
      sourceId,
      fingerprint: fingerprintOf(candidate),
      rawValues,
      outcome: { kind: "candidate", candidate },
    };
  }

  const mapping = feed.mapping as DonationApplicationMapping;
  const name = cell(headers, cells, mapping.nameColumn);
  const email = mapping.emailColumn
    ? cell(headers, cells, mapping.emailColumn)
    : undefined;
  const schoolName = mapping.schoolNameColumn
    ? cell(headers, cells, mapping.schoolNameColumn)
    : undefined;
  const schoolAddress = mapping.schoolAddressColumn
    ? cell(headers, cells, mapping.schoolAddressColumn)
    : undefined;
  const message = mapping.messageColumn
    ? cell(headers, cells, mapping.messageColumn)
    : undefined;
  if (!name) {
    errors.push("Name is required");
  }
  const key = rowKey(headers, cells, identityColumns);
  const sourceId = sheetsSourceId(
    feed.kind,
    feed.spreadsheetId,
    feed.tabName,
    key || rawValues,
  );
  if (errors.length > 0) {
    return {
      sourceId,
      fingerprint: fingerprintOf({ headers, cells }),
      rawValues,
      outcome: { kind: "invalid", errors },
    };
  }
  const candidate: DonationApplicationCandidate = {
    kind: "donationApplication",
    name: name as string,
    ...(email === undefined ? {} : { email }),
    ...(schoolName === undefined ? {} : { schoolName }),
    ...(schoolAddress === undefined ? {} : { schoolAddress }),
    ...(message === undefined ? {} : { message }),
  };
  return {
    sourceId,
    fingerprint: fingerprintOf(candidate),
    rawValues,
    outcome: { kind: "candidate", candidate },
  };
}

export function duplicateSourceIds(rows: { sourceId: string }[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.sourceId)) {
      duplicates.add(row.sourceId);
    }
    seen.add(row.sourceId);
  }
  return [...duplicates];
}

export function assertUniqueSourceIds(rows: { sourceId: string }[]) {
  const duplicates = duplicateSourceIds(rows);
  if (duplicates.length > 0) {
    throw new Error(`Duplicate sheet row keys: ${duplicates.join(", ")}`);
  }
}

export function planRow(
  existing: { fingerprint: string; state: IntakeItemState } | null,
  parsed: ParsedRow,
): RowPlan {
  const next = parsedState(parsed.outcome);
  if (existing === null) {
    return { kind: "create", state: next };
  }
  if (existing.fingerprint === parsed.fingerprint) {
    return { kind: "skip" };
  }
  if (existing.state.kind === "resolved") {
    return { kind: "markDrift" };
  }
  return { kind: "reparse", state: next };
}

export function matchCandidate(
  candidate: IntakeCandidate,
  lookups: {
    titleByIsbn: (isbn: string) => string | null;
    personByEmail: (email: string) => string | null;
  },
): MatchOutcome {
  if (candidate.kind === "review") {
    if (!candidate.isbn) {
      return { kind: "needsStaff" };
    }
    const titleId = lookups.titleByIsbn(candidate.isbn);
    return titleId
      ? { kind: "autoApply", target: { kind: "title", id: titleId } }
      : { kind: "needsStaff" };
  }
  if (!candidate.email) {
    return { kind: "needsStaff" };
  }
  const personId = lookups.personByEmail(candidate.email);
  return personId
    ? { kind: "autoApply", target: { kind: "person", id: personId } }
    : { kind: "needsStaff" };
}

export function assertFreshFingerprint(
  existing: string,
  expected: string,
) {
  if (existing !== expected) {
    throw new Error("This form row changed after you opened it");
  }
}

export function nextPurgeState<T extends { rawValues?: string; receivedAt: number }>(
  item: T,
  now: number,
): T {
  const ageDays = (now - item.receivedAt) / (24 * 60 * 60 * 1000);
  if (ageDays < intakeRetentionDays || item.rawValues === undefined) {
    return item;
  }
  const { rawValues: _rawValues, ...rest } = item;
  return rest as T;
}

export function redactError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Intake failed";
  return message
    .replace(/-----BEGIN[\s\S]+?PRIVATE KEY-----/g, "[redacted]")
    .replace(/\b[\w.+-]+@[\w.-]+\.\w+\b/g, "[redacted-email]")
    .replace(/ya29\.[A-Za-z0-9._-]+/g, "[redacted-token]");
}

export type FeedPollOutcome =
  | { kind: "ok"; at: number; rowsSeen: number; newItems: number }
  | { kind: "failed"; at: number; message: string };

export type FeedHealth = {
  kind: IntakeFeedKind;
  configured: boolean;
  enabled: boolean;
  credentialPresent: boolean;
  lastPoll?: FeedPollOutcome;
  message?: string;
};

export function feedHealth(input: {
  kind: IntakeFeedKind;
  enabled: boolean;
  configured: boolean;
  credentialPresent: boolean;
  lastPoll?: FeedPollOutcome;
}): FeedHealth {
  const health: FeedHealth = {
    kind: input.kind,
    configured: input.configured,
    enabled: input.enabled,
    credentialPresent: input.credentialPresent,
    ...(input.lastPoll === undefined ? {} : { lastPoll: input.lastPoll }),
  };
  if (!input.credentialPresent) {
    return { ...health, message: "Google credentials are missing" };
  }
  if (!input.configured) {
    return { ...health, message: "Approve a sheet, tab, and mapping" };
  }
  if (input.lastPoll?.kind === "failed") {
    return { ...health, message: input.lastPoll.message };
  }
  return health;
}
