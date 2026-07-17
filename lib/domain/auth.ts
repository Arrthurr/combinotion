import type { Title } from "./types";
export const isApprovedStaff = (identity: string | null, allowlist: readonly string[]) => !!identity && allowlist.includes(identity);
export function publicTitle(title: Title) { return { title:title.title, author:title.author, isbn:title.isbn, availableQuantity:Math.max(0, title.quantityOnHand-title.activeReservedQuantity), coverUrl:title.coverUrl }; }
