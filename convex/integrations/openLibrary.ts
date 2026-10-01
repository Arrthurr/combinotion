import { v } from "convex/values";
import { staffAction } from "../lib/auth";
import { normalizeIsbn } from "../../lib/domain/catalog";
import {
  parseOpenLibraryBook,
  type IsbnLookupResult,
} from "../../lib/domain/enrichment";

export const lookupIsbn = staffAction({
  args: {
    isbn: v.string(),
  },
  handler: async (ctx, { isbn }): Promise<IsbnLookupResult> => {
    const cleanIsbn = normalizeIsbn(isbn);
    if (cleanIsbn.length === 0) {
      throw new Error("ISBN is required");
    }

    try {
      const sourceKey = `ISBN:${cleanIsbn}`;
      const response = await fetch(
        `https://openlibrary.org/api/books?bibkeys=${encodeURIComponent(sourceKey)}&format=json&jscmd=data`,
      );
      if (!response.ok) {
        return { kind: "unavailable" };
      }
      const suggestion = parseOpenLibraryBook(
        await response.json(),
        cleanIsbn,
      );
      if (suggestion === null) {
        return { kind: "notFound" };
      }
      return {
        kind: "found",
        suggestion,
        enrichmentSource: {
          source: "openLibrary",
          fetchedAt: Date.now(),
        },
      };
    } catch {
      return { kind: "unavailable" };
    }
  },
});
