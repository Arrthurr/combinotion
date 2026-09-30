import { normalizeIsbn, stripNotionMarkdown } from "./catalog";
import { availableQuantity } from "./inventory";
import type { Title } from "./types";
export const isApprovedStaff = (identity: string | null, allowlist: readonly string[]) => !!identity && allowlist.includes(identity);
export function publicTitle(title: Title) {
  return {
    title: stripNotionMarkdown(title.title),
    author: stripNotionMarkdown(title.author),
    isbn: normalizeIsbn(title.isbn) || title.isbn,
    availableQuantity: availableQuantity(title),
    coverUrl: title.coverUrl,
  };
}
