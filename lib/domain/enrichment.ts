export type IsbnSuggestion = {
  title?: string;
  author?: string;
  coverUrl?: string;
  synopsis?: string;
};

export type IsbnLookupResult =
  | {
      kind: "found";
      suggestion: IsbnSuggestion;
      enrichmentSource: {
        source: "openLibrary";
        fetchedAt: number;
      };
    }
  | { kind: "notFound" }
  | { kind: "unavailable" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function readAuthor(book: Record<string, unknown>) {
  if (!Array.isArray(book.authors)) {
    return undefined;
  }
  const names = book.authors.flatMap((author) => {
    if (!isRecord(author)) {
      return [];
    }
    const name = nonEmptyString(author.name);
    return name === undefined ? [] : [name];
  });
  return names.length === 0 ? undefined : names.join(", ");
}

function readCover(book: Record<string, unknown>) {
  if (!isRecord(book.cover)) {
    return undefined;
  }
  return (
    nonEmptyString(book.cover.medium) ??
    nonEmptyString(book.cover.large) ??
    nonEmptyString(book.cover.small)
  );
}

function readSynopsis(book: Record<string, unknown>) {
  const notes = nonEmptyString(book.notes);
  if (notes !== undefined) {
    return notes;
  }
  if (isRecord(book.notes)) {
    const value = nonEmptyString(book.notes.value);
    if (value !== undefined) {
      return value;
    }
  }
  if (!Array.isArray(book.excerpts)) {
    return undefined;
  }
  for (const excerpt of book.excerpts) {
    if (!isRecord(excerpt)) {
      continue;
    }
    const text = nonEmptyString(excerpt.text);
    if (text !== undefined) {
      return text;
    }
  }
  return undefined;
}

export function parseOpenLibraryBook(
  payload: unknown,
  isbn: string,
): IsbnSuggestion | null {
  if (!isRecord(payload)) {
    return null;
  }
  const book = payload[`ISBN:${isbn}`];
  if (!isRecord(book)) {
    return null;
  }

  const title = nonEmptyString(book.title);
  const author = readAuthor(book);
  const coverUrl = readCover(book);
  const synopsis = readSynopsis(book);
  const suggestion: IsbnSuggestion = {
    ...(title === undefined ? {} : { title }),
    ...(author === undefined ? {} : { author }),
    ...(coverUrl === undefined ? {} : { coverUrl }),
    ...(synopsis === undefined ? {} : { synopsis }),
  };

  return Object.keys(suggestion).length === 0 ? null : suggestion;
}
