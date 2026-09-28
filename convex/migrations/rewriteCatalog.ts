import { internalMutation } from "../_generated/server";
import {
  catalogText,
  normalizeIsbn,
  stripNotionMarkdown,
} from "../../lib/domain/catalog";

function optionalCleaned(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }
  const cleaned = catalogText(value);
  return cleaned ? cleaned : undefined;
}

export const rewriteCatalog = internalMutation({
  args: {},
  handler: async (ctx) => {
    const titles = await ctx.db.query("titles").collect();
    const byIsbn = new Map<string, string[]>();
    for (const title of titles) {
      const isbn = normalizeIsbn(title.isbn);
      if (!isbn) {
        throw new Error(`Title ${title.title} has no ISBN digits to keep`);
      }
      const group = byIsbn.get(isbn) ?? [];
      group.push(`${title.title} (${title.isbn})`);
      byIsbn.set(isbn, group);
    }
    const collisions = [...byIsbn.entries()].filter(
      ([, group]) => group.length > 1,
    );
    if (collisions.length > 0) {
      throw new Error(
        `Cannot rewrite catalog: duplicate ISBNs ${collisions
          .map(([isbn, group]) => `${isbn} → ${group.join("; ")}`)
          .join(" | ")}`,
      );
    }

    let updated = 0;
    for (const title of titles) {
      const next = {
        title: stripNotionMarkdown(title.title),
        author: stripNotionMarkdown(title.author),
        isbn: normalizeIsbn(title.isbn),
        synopsis: optionalCleaned(title.synopsis),
        notes: optionalCleaned(title.notes),
        purchaseInfo: optionalCleaned(title.purchaseInfo),
      };
      const changed =
        next.title !== title.title ||
        next.author !== title.author ||
        next.isbn !== title.isbn ||
        next.synopsis !== title.synopsis ||
        next.notes !== title.notes ||
        next.purchaseInfo !== title.purchaseInfo;
      if (!changed) {
        continue;
      }
      await ctx.db.patch(title._id, next);
      updated += 1;
    }
    return { titles: titles.length, updated };
  },
});
