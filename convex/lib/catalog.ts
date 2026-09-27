import type { MutationCtx, QueryCtx } from "../_generated/server";
import { normalizeIsbn } from "../../lib/domain/catalog";

export async function findTitleByIsbn(
  ctx: QueryCtx | MutationCtx,
  isbn: string,
) {
  const normalized = normalizeIsbn(isbn);
  if (!normalized) {
    return null;
  }
  const indexed = await ctx.db
    .query("titles")
    .withIndex("by_isbn", (q) => q.eq("isbn", normalized))
    .unique();
  if (indexed) {
    return indexed;
  }
  const titles = await ctx.db.query("titles").collect();
  return (
    titles.find((title) => normalizeIsbn(title.isbn) === normalized) ?? null
  );
}
