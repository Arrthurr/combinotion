import { normalizeIsbn, stripNotionMarkdown } from "./catalog";
import type { Title } from "./types";
export const isApprovedStaff = (identity: string | null, allowlist: readonly string[]) => !!identity && allowlist.includes(identity);
export function publicTitle(title: Title) {
  return {
    title: stripNotionMarkdown(title.title),
    author: stripNotionMarkdown(title.author),
    isbn: normalizeIsbn(title.isbn) || title.isbn,
    availableQuantity: Math.max(0, title.quantityOnHand - title.activeReservedQuantity),
    coverUrl: title.coverUrl,
  };
}
