import { describe, expect, it } from "vitest";
import {
  exportPeople,
  exportRequests,
  exportReviews,
  exportSchools,
  exportTitles,
  exportVisits,
  rowsFromNotionDump,
} from "@/lib/domain/notionExport";
import { dryRunImport } from "@/lib/domain/notionImport";

const personUrl = "https://app.notion.com/p/11111111111111111111111111111111";
const schoolUrl = "https://app.notion.com/p/22222222222222222222222222222222";
const titleUrl = "https://app.notion.com/p/33333333333333333333333333333333";
const requestUrl = "https://app.notion.com/p/44444444444444444444444444444444";
const reviewUrl = "https://app.notion.com/p/55555555555555555555555555555555";
const visitUrl = "https://app.notion.com/p/66666666666666666666666666666666";
const readerUrl = "https://app.notion.com/p/77777777777777777777777777777777";

describe("Notion launch export", () => {
  it("maps people roles and infers missing ones from relations", () => {
    expect(
      exportPeople([
        {
          url: personUrl,
          "Full Name": "**Ada Reviewer**",
          "Email Address": "ada@example.org",
          "Role (s)": '["Reviewer","Donor"]',
        },
        {
          url: "https://app.notion.com/p/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          "Full Name": "No Roles",
          "Full Name 2": `["${requestUrl}"]`,
        },
        {
          url: "https://app.notion.com/p/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          "Full Name": "",
          "Role (s)": '["Donor"]',
        },
      ]),
    ).toEqual([
      {
        kind: "person",
        notionId: "11111111-1111-1111-1111-111111111111",
        name: "Ada Reviewer",
        email: "ada@example.org",
        roles: ["reviewer", "donor"],
      },
      {
        kind: "person",
        notionId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        name: "No Roles",
        roles: ["schoolStaff"],
      },
    ]);
  });

  it("keeps school-named orgs and composes city-state addresses", () => {
    expect(
      exportSchools([
        {
          url: schoolUrl,
          "Organization Name": "River Elementary",
          "Organization Type": "School",
          City: "Phoenix",
          State: " AZ ",
        },
        {
          url: "https://app.notion.com/p/cccccccccccccccccccccccccccccccc",
          "Organization Name": "United Way",
          "Organization Type": "Non-profit",
        },
        {
          url: "https://app.notion.com/p/dddddddddddddddddddddddddddddddd",
          "Organization Name": "Laveen Leadership Academy",
          City: "Phoenix",
        },
      ]),
    ).toEqual([
      {
        kind: "school",
        notionId: "22222222-2222-2222-2222-222222222222",
        name: "River Elementary",
        address: "Phoenix, AZ",
      },
      {
        kind: "school",
        notionId: "dddddddd-dddd-dddd-dddd-dddddddddddd",
        name: "Laveen Leadership Academy",
        address: "Phoenix",
      },
    ]);
  });

  it("drops titles without an ISBN and keeps stored ISBN text", () => {
    expect(
      exportTitles([
        {
          url: titleUrl,
          Name: "Hands",
          Author: "Lois Ehlert",
          "Hardcover ISBN": "978-0593323793",
        },
        { url: "https://app.notion.com/p/eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", Name: "No ISBN" },
      ]),
    ).toEqual([
      {
        kind: "title",
        notionId: "33333333-3333-3333-3333-333333333333",
        title: "Hands",
        author: "Lois Ehlert",
        isbn: "978-0593323793",
      },
    ]);
  });

  it("treats closed applications as historical and declined when rejected", () => {
    expect(
      exportRequests([
        {
          url: requestUrl,
          Name: "APP-0001",
          "Applicant Name 1": "Pat Contact",
          "Your email address": "pat@school.edu",
          "Date Submitted": "8/14/2024 14:48",
          Status: "Selected",
          "School or Organization": `["${schoolUrl}"]`,
        },
        {
          url: "https://app.notion.com/p/ffffffffffffffffffffffffffffffff",
          Name: "APP-0002",
          "Applicant Name 1": "Declined Contact",
          "Your email address": "no@school.edu",
          "Date Submitted": "2023-04",
          Status: "Not Selected",
          "School or Organization": `["${schoolUrl}"]`,
        },
      ]),
    ).toEqual([
      {
        kind: "request",
        notionId: "44444444-4444-4444-4444-444444444444",
        schoolNotionId: "22222222-2222-2222-2222-222222222222",
        contactName: "Pat Contact",
        email: "pat@school.edu",
        createdAt: Date.UTC(2024, 7, 14, 14, 48),
        disposition: { kind: "historicalContext", status: "fulfilled" },
      },
      {
        kind: "request",
        notionId: "ffffffff-ffff-ffff-ffff-ffffffffffff",
        schoolNotionId: "22222222-2222-2222-2222-222222222222",
        contactName: "Declined Contact",
        email: "no@school.edu",
        createdAt: Date.parse("2023-04"),
        disposition: { kind: "historicalContext", status: "declined" },
      },
    ]);
  });

  it("resolves review ISBNs from related titles and scales percent scores", () => {
    const titles = new Map([
      ["33333333-3333-3333-3333-333333333333", "978-0593323793"],
    ]);
    expect(
      exportReviews(
        [
          {
            url: reviewUrl,
            "Your name": "Riley",
            Score: 0.9,
            "Book title 1": `["${titleUrl}"]`,
            "Overall thoughts and comments.": "Keep it.",
          },
          {
            url: "https://app.notion.com/p/99999999999999999999999999999999",
            Name: "Catalog stub",
            "Hardcover ISBN": "978-1536229561",
          },
        ],
        titles,
      ),
    ).toEqual([
      {
        kind: "review",
        notionId: "55555555-5555-5555-5555-555555555555",
        isbn: "978-0593323793",
        reviewer: "Riley",
        score: 90,
        feedback: "Keep it.",
      },
    ]);
  });

  it("fills an empty school address from the related visit street", () => {
    const rows = rowsFromNotionDump({
      people: [],
      organizations: [
        {
          url: schoolUrl,
          "Organization Name": "River Elementary",
          "Organization Type": "School",
        },
      ],
      titles: [],
      requests: [],
      reviews: [],
      visits: [
        {
          url: visitUrl,
          "School or Organization Name": `["${schoolUrl}"]`,
          "Event Location/Address": "3736 W Osborn Rd, Phoenix, AZ 85019",
          "date:Event Date:start": "2024-11-04",
          "Lead Volunteer": `["${readerUrl}"]`,
          "Number of Books Distributed": 30,
        },
      ],
    });
    expect(rows.filter((row) => row.kind === "school")).toEqual([
      {
        kind: "school",
        notionId: "22222222-2222-2222-2222-222222222222",
        name: "River Elementary",
        address: "3736 W Osborn Rd, Phoenix, AZ 85019",
      },
    ]);
    expect(rows.filter((row) => row.kind === "visit")).toEqual([]);
  });

  it("fills an empty school address from the related request city and state", () => {
    const rows = rowsFromNotionDump({
      people: [],
      organizations: [
        {
          url: schoolUrl,
          "Organization Name": "River Elementary",
          "Organization Type": "School",
        },
      ],
      titles: [],
      requests: [
        {
          url: requestUrl,
          "Applicant Name 1": "Pat Contact",
          "Your email address": "pat@school.edu",
          "Date Submitted": "2024-08-14",
          Status: "Selected",
          "School or Organization": `["${schoolUrl}"]`,
          City: "Buckeye",
          State: "AZ",
        },
      ],
      reviews: [],
      visits: [],
    });
    expect(rows.filter((row) => row.kind === "school")).toEqual([
      {
        kind: "school",
        notionId: "22222222-2222-2222-2222-222222222222",
        name: "River Elementary",
        address: "Buckeye, AZ",
      },
    ]);
  });

  it("omits a school with no org, visit, or request address", () => {
    expect(
      rowsFromNotionDump({
        people: [],
        organizations: [
          {
            url: schoolUrl,
            "Organization Name": "River Elementary",
            "Organization Type": "School",
          },
        ],
        titles: [],
        requests: [],
        reviews: [],
        visits: [],
      }),
    ).toEqual([]);
  });

  it("keeps the organization city and state when a visit or request also has an address", () => {
    const rows = rowsFromNotionDump({
      people: [],
      organizations: [
        {
          url: schoolUrl,
          "Organization Name": "River Elementary",
          "Organization Type": "School",
          City: "Phoenix",
          State: "AZ",
        },
      ],
      titles: [],
      requests: [
        {
          url: requestUrl,
          "Applicant Name 1": "Pat Contact",
          "Your email address": "pat@school.edu",
          "Date Submitted": "2024-08-14",
          Status: "Selected",
          "School or Organization": `["${schoolUrl}"]`,
          City: "Chicago",
          State: "IL",
        },
      ],
      reviews: [],
      visits: [
        {
          url: visitUrl,
          "School or Organization Name": `["${schoolUrl}"]`,
          "Event Location/Address": "3736 W Osborn Rd, Phoenix, AZ 85019",
          "date:Event Date:start": "2024-11-04",
          "Number of Books Distributed": 30,
        },
      ],
    });
    expect(rows.filter((row) => row.kind === "school")).toEqual([
      {
        kind: "school",
        notionId: "22222222-2222-2222-2222-222222222222",
        name: "River Elementary",
        address: "Phoenix, AZ",
      },
    ]);
  });

  it("omits a visit without a resolvable book title", () => {
    expect(
      exportVisits(
        [
          {
            url: visitUrl,
            "School or Organization Name": `["${schoolUrl}"]`,
            "date:Event Date:start": "2024-11-04 16:00:00Z",
            "Lead Volunteer": `["${readerUrl}"]`,
            "Number of Books Distributed": 30,
          },
        ],
        new Map(),
        new Set(["22222222-2222-2222-2222-222222222222"]),
      ),
    ).toEqual([]);
  });

  it("builds a rows document the importer can dry-run", () => {
    const rows = rowsFromNotionDump({
      people: [
        {
          url: personUrl,
          "Full Name": "Ada Reviewer",
          "Role (s)": '["Reviewer"]',
        },
        {
          url: readerUrl,
          "Full Name": "Lead Reader",
          "Role (s)": '["Reader"]',
        },
      ],
      organizations: [
        {
          url: schoolUrl,
          "Organization Name": "River Elementary",
          "Organization Type": "School",
          City: "Phoenix",
          State: "AZ",
        },
      ],
      titles: [
        {
          url: titleUrl,
          Name: "Hands",
          Author: "Lois Ehlert",
          "Hardcover ISBN": "978-0593323793",
        },
      ],
      requests: [
        {
          url: requestUrl,
          "Applicant Name 1": "Pat Contact",
          "Your email address": "pat@school.edu",
          "Date Submitted": "2024-08-14",
          Status: "Selected",
          "School or Organization": `["${schoolUrl}"]`,
        },
      ],
      reviews: [
        {
          url: reviewUrl,
          "Your name": "Riley",
          Score: 1,
          "Hardcover ISBN": "978-0593323793",
          "Comments 1": "Yes.",
        },
      ],
      visits: [
        {
          url: visitUrl,
          "School or Organization Name": `["${schoolUrl}"]`,
          "date:Event Date:start": "2024-11-04",
          "Lead Volunteer": `["${readerUrl}"]`,
          "Book Title for Read Aloud": "Hands",
          "Number of Books Distributed": 30,
        },
      ],
    });
    const report = dryRunImport(rows);
    expect(report.invalid).toEqual([]);
    expect(report.validCount).toBe(7);
    expect(rows.map((row) => row.kind)).toEqual([
      "person",
      "person",
      "school",
      "title",
      "request",
      "review",
      "visit",
    ]);
  });
});
