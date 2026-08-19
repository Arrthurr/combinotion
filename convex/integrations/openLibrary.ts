import { v } from "convex/values";
import { internal } from "../_generated/api";
import { action } from "../_generated/server";
import {
  parseOpenLibraryBook,
  type IsbnLookupResult,
} from "../../lib/domain/enrichment";

export const lookupIsbn = action({
  args: {
    isbn: v.string(),
  },
  handler: async (ctx, { isbn }): Promise<IsbnLookupResult> => {
    await ctx.runQuery(internal.staff.assertStaff, {});
    const cleanIsbn = isbn.trim();
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
