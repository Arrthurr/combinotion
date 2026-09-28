import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import {
  POPULARITY_COLUMNS,
  formatAverageScore,
  type PopularityColumnKey,
  type PopularityFilter,
  type PopularityRow,
  type PopularityView,
} from "@/lib/domain/reports";

const PAGE_SIZE: [number, number] = [792, 612];
const MARGIN = 40;
const TITLE_SIZE = 18;
const META_SIZE = 10;
const HEADER_SIZE = 9;
const ROW_SIZE = 9;
const ROW_HEIGHT = 16;
const HEADER_HEIGHT = 18;
const COLUMN_GAP = 8;

const COLUMN_FRACTIONS: Record<PopularityColumnKey, number> = {
  title: 0.32,
  author: 0.24,
  requestCount: 0.12,
  donatedQuantity: 0.16,
  averageScore: 0.16,
};

export type PopularityPdfInput<TitleId = string> = {
  rows: ReadonlyArray<PopularityRow<TitleId>>;
  view: PopularityView;
  generatedAt?: number;
};

function formattedGeneratedAt(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(timestamp));
}

function sortLabel(view: PopularityView) {
  const column = POPULARITY_COLUMNS.find(
    (item) => item.key === view.sort.column,
  );
  const direction = view.sort.direction === "asc" ? "ascending" : "descending";
  return `Sorted by ${column?.label ?? view.sort.column}, ${direction}`;
}

function filterLines(filter: PopularityFilter) {
  const lines: string[] = [];
  const text = filter.text?.trim();
  if (text) {
    lines.push(`Title or author contains “${text}”`);
  }
  if (filter.min?.requestCount !== undefined) {
    lines.push(`Minimum requests: ${filter.min.requestCount}`);
  }
  if (filter.min?.donatedQuantity !== undefined) {
    lines.push(`Minimum donated copies: ${filter.min.donatedQuantity}`);
  }
  if (filter.min?.averageScore !== undefined) {
    lines.push(`Minimum average rubric score: ${filter.min.averageScore}`);
  }
  return lines;
}

export function popularityPdfSummary(view: PopularityView, rowCount: number) {
  const filters = filterLines(view.filter);
  return [
    sortLabel(view),
    filters.length === 0
      ? "No filters applied"
      : `Filters: ${filters.join("; ")}`,
    `${rowCount} ${rowCount === 1 ? "title" : "titles"}`,
  ];
}

function cellText<TitleId>(
  row: PopularityRow<TitleId>,
  column: PopularityColumnKey,
) {
  switch (column) {
    case "title":
      return row.title;
    case "author":
      return row.author;
    case "requestCount":
      return String(row.requestCount);
    case "donatedQuantity":
      return String(row.donatedQuantity);
    case "averageScore":
      return formatAverageScore(row.averageScore) || "No reviews";
    default: {
      const exhaustive: never = column;
      return exhaustive;
    }
  }
}

function numericColumn(column: PopularityColumnKey) {
  return (
    column === "requestCount" ||
    column === "donatedQuantity" ||
    column === "averageScore"
  );
}

function wrappedLines(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines.length === 0 ? [""] : lines;
}

function columnWidths(contentWidth: number) {
  const gapTotal = COLUMN_GAP * (POPULARITY_COLUMNS.length - 1);
  const usableWidth = contentWidth - gapTotal;
  return POPULARITY_COLUMNS.map((column) => ({
    ...column,
    width: usableWidth * COLUMN_FRACTIONS[column.key],
  }));
}

export async function renderPopularityReportPdf<TitleId>(
  input: PopularityPdfInput<TitleId>,
): Promise<Uint8Array> {
  const generatedAt = input.generatedAt ?? Date.now();
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const contentWidth = PAGE_SIZE[0] - MARGIN * 2;
  const columns = columnWidths(contentWidth);
  let page: PDFPage = document.addPage(PAGE_SIZE);
  let y = PAGE_SIZE[1] - MARGIN;

  function newPage() {
    page = document.addPage(PAGE_SIZE);
    y = PAGE_SIZE[1] - MARGIN;
  }

  function ensureSpace(height: number) {
    if (y - height < MARGIN) {
      newPage();
      return true;
    }
    return false;
  }

  function drawTextLine(
    text: string,
    font: PDFFont,
    size: number,
    indent = 0,
  ) {
    for (const line of wrappedLines(
      text,
      font,
      size,
      contentWidth - indent,
    )) {
      ensureSpace(16);
      page.drawText(line, {
        x: MARGIN + indent,
        y,
        font,
        size,
        color: rgb(0.12, 0.16, 0.22),
      });
      y -= 16;
    }
  }

  function drawTableHeader() {
    ensureSpace(HEADER_HEIGHT + 4);
    let x = MARGIN;
    for (const column of columns) {
      page.drawText(column.label, {
        x,
        y,
        font: bold,
        size: HEADER_SIZE,
        color: rgb(0.12, 0.16, 0.22),
      });
      x += column.width + COLUMN_GAP;
    }
    y -= 6;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: MARGIN + contentWidth, y },
      thickness: 0.75,
      color: rgb(0.12, 0.16, 0.22),
    });
    y -= HEADER_HEIGHT - 6;
  }

  drawTextLine("Book popularity report", bold, TITLE_SIZE);
  y -= 4;
  drawTextLine(
    `Joy for Books · ${formattedGeneratedAt(generatedAt)}`,
    regular,
    META_SIZE,
  );
  for (const line of popularityPdfSummary(input.view, input.rows.length)) {
    drawTextLine(line, regular, META_SIZE);
  }
  y -= 8;
  drawTableHeader();

  if (input.rows.length === 0) {
    drawTextLine("No titles match these filters.", regular, ROW_SIZE);
  } else {
    for (const row of input.rows) {
      const wrappedCells = columns.map((column) => {
        const textWidth = column.width - 2;
        return wrappedLines(
          cellText(row, column.key),
          regular,
          ROW_SIZE,
          textWidth,
        );
      });
      const lineCount = Math.max(
        ...wrappedCells.map((lines) => lines.length),
        1,
      );
      const height = lineCount * ROW_HEIGHT;
      if (ensureSpace(height)) {
        drawTableHeader();
      }

      for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
        let x = MARGIN;
        for (const [columnIndex, column] of columns.entries()) {
          const line = wrappedCells[columnIndex]?.[lineIndex] ?? "";
          if (line) {
            const textWidth = regular.widthOfTextAtSize(line, ROW_SIZE);
            const offset = numericColumn(column.key)
              ? Math.max(column.width - textWidth - 2, 0)
              : 0;
            page.drawText(line, {
              x: x + offset,
              y,
              font: regular,
              size: ROW_SIZE,
              color: rgb(0.12, 0.16, 0.22),
            });
          }
          x += column.width + COLUMN_GAP;
        }
        y -= ROW_HEIGHT;
      }
    }
  }

  document.setTitle("Book popularity report");
  document.setSubject("Joy for Books book popularity report");
  return await document.save();
}

export const popularityPdfFilename = "book-popularity.pdf";
