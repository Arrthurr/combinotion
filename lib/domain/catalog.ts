export function stripNotionMarkdown(value: string) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/~~+/g, "")
    .replace(/`+/g, "")
    .replace(/\*+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeIsbn(value: string) {
  return value.replace(/[^0-9Xx]/g, "").toUpperCase();
}

export function catalogText(value: string) {
  return stripNotionMarkdown(value);
}
