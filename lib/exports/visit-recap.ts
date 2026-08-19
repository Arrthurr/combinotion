import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFPage,
  type PDFFont,
} from "pdf-lib";

export type VisitRecapData = {
  occurredAt: number;
  followUp?: string;
  school: {
    name: string;
    address: string;
  };
  staffPresent: ReadonlyArray<{ name: string }>;
  readers: ReadonlyArray<{ name: string }>;
  booksRead: ReadonlyArray<{
    title: string;
    author: string;
  }>;
  booksDonated: ReadonlyArray<{
    title: string;
    author: string;
    donatedQuantity: number;
  }>;
};

export type RecapSection = {
  heading: string;
  lines: string[];
};

function formattedDate(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(timestamp));
}

function bookLine(book: { title: string; author: string }) {
  return `${book.title} by ${book.author}`;
}

export function visitRecapLines(data: VisitRecapData): RecapSection[] {
  const followUp = data.followUp?.trim();
  return [
    {
      heading: "School visit",
      lines: [
        data.school.name,
        data.school.address,
        formattedDate(data.occurredAt),
      ],
    },
    {
      heading: "Staff present",
      lines:
        data.staffPresent.length === 0
          ? ["No staff recorded"]
          : data.staffPresent.map((person) => person.name),
    },
    {
      heading: "Readers",
      lines:
        data.readers.length === 0
          ? ["No readers recorded"]
          : data.readers.map((person) => person.name),
    },
    {
      heading: "Books read aloud",
      lines:
        data.booksRead.length === 0
          ? ["No books read aloud"]
          : data.booksRead.map(bookLine),
    },
    {
      heading: "Books donated",
      lines:
        data.booksDonated.length === 0
          ? ["No books donated"]
          : data.booksDonated.map(
              (book) =>
                `${bookLine(book)}, ${book.donatedQuantity} ${
                  book.donatedQuantity === 1 ? "copy" : "copies"
                }`,
            ),
    },
    {
      heading: "Follow-up",
      lines: [followUp || "No follow-up recorded"],
    },
  ];
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

export async function renderVisitRecapPdf(
  data: VisitRecapData,
): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [612, 792];
  const margin = 54;
  const contentWidth = pageSize[0] - margin * 2;
  const lineHeight = 16;
  let page: PDFPage = document.addPage(pageSize);
  let y = pageSize[1] - margin;

  function newPage() {
    page = document.addPage(pageSize);
    y = pageSize[1] - margin;
  }

  function ensureSpace(height: number) {
    if (y - height < margin) {
      newPage();
    }
  }

  function drawLine(text: string, font: PDFFont, size: number, indent = 0) {
    for (const line of wrappedLines(
      text,
      font,
      size,
      contentWidth - indent,
    )) {
      ensureSpace(lineHeight);
      page.drawText(line, {
        x: margin + indent,
        y,
        font,
        size,
        color: rgb(0.12, 0.16, 0.22),
      });
      y -= lineHeight;
    }
  }

  drawLine("Visit recap", bold, 22);
  y -= 10;

  for (const section of visitRecapLines(data)) {
    ensureSpace(lineHeight * 2);
    drawLine(section.heading, bold, 13);
    for (const line of section.lines) {
      drawLine(line, regular, 11, 12);
    }
    y -= 8;
  }

  document.setTitle(`Visit recap for ${data.school.name}`);
  document.setSubject("Joy for Books school visit recap");
  return await document.save();
}

export function visitRecapFilename(
  data: Pick<VisitRecapData, "school" | "occurredAt">,
) {
  const school = data.school.name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const date = new Date(data.occurredAt).toISOString().slice(0, 10);
  return `visit-recap-${school || "school"}-${date}.pdf`;
}
