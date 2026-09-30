/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { dryRunImport, type ImportRow } from "../lib/domain/notionImport";

const modules = import.meta.glob("./**/!(*.*.*)*.*s");

async function createStaffTest() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.staff.seedStaff, {
    clerkId: "staff_1",
    email: "coo@example.com",
  });
  return {
    t,
    asStaff: t.withIdentity({ subject: "staff_1" }),
  };
}

const rows: ImportRow[] = [
  {
    kind: "title",
    notionId: "title-1",
    title: "A Good Book",
    author: "Ann Author",
    isbn: "9780000000001",
  },
  {
    kind: "school",
    notionId: "school-1",
    name: "Joy School",
    address: "1 Main Street",
  },
  {
    kind: "person",
    notionId: "person-1",
    name: "Rae Reader",
    roles: ["reader"],
  },
  {
    kind: "visit",
    notionId: "visit-1",
    schoolNotionId: "school-1",
    occurredAt: 1,
    staffNotionIds: [],
    readerNotionIds: ["person-1"],
    books: [{ isbn: "9780000000001", donatedQuantity: 4, readAloud: true }],
  },
  {
    kind: "openingBalance",
    isbn: "9780000000001",
    quantity: 12,
    reason: "Physical count",
  },
];

describe("Notion import", () => {
  it("dry-run reports rows and writes nothing", async () => {
    const { t, asStaff } = await createStaffTest();
    const report = await asStaff.mutation(api.migrations.notionImport.dryRun, {
      rows,
    });
    expect(report.validCount).toBe(5);
    expect(report.invalid).toEqual([]);
    expect(await t.run(async (ctx) => ctx.db.query("titles").collect())).toEqual(
      [],
    );
    expect(await t.run(async (ctx) => ctx.db.query("visits").collect())).toEqual(
      [],
    );
  });

  it("rejects a stale apply digest", async () => {
    const { asStaff } = await createStaffTest();
    await expect(
      asStaff.mutation(api.migrations.notionImport.apply, {
        rows,
        expectedDigest: "stale",
      }),
    ).rejects.toThrow("Import preview is stale");
  });

  it("imports history without stock effects and keeps the first opening balance", async () => {
    const { t, asStaff } = await createStaffTest();
    const report = dryRunImport(rows);
    await asStaff.mutation(api.migrations.notionImport.apply, {
      rows,
      expectedDigest: report.digest,
    });
    const titles = await asStaff.query(api.titles.listTitles, {});
    expect(titles).toEqual([
      expect.objectContaining({
        isbn: "9780000000001",
        quantityOnHand: 12,
        activeReservedQuantity: 0,
      }),
    ]);
    const visits = await t.run(async (ctx) => ctx.db.query("visits").collect());
    expect(visits).toEqual([
      expect.objectContaining({ origin: "notionImport" }),
    ]);
    await asStaff.mutation(api.migrations.notionImport.apply, {
      rows: [
        ...rows.slice(0, 4),
        {
          kind: "openingBalance",
          isbn: "9780000000001",
          quantity: 99,
          reason: "Physical count",
        },
      ],
      expectedDigest: dryRunImport([
        ...rows.slice(0, 4),
        {
          kind: "openingBalance",
          isbn: "9780000000001",
          quantity: 99,
          reason: "Physical count",
        },
      ]).digest,
    });
    const again = await asStaff.query(api.titles.listTitles, {});
    expect(again[0]?.quantityOnHand).toBe(12);
    await expect(
      asStaff.mutation(api.visits.saveVisit, {
        visitId: visits[0]?._id,
        schoolId: visits[0]!.schoolId,
        occurredAt: 2,
        staffPersonIds: [],
        readerPersonIds: [
          (await asStaff.query(api.people.listPeople, {}))[0]!._id,
        ],
        books: [
          {
            titleId: titles[0]!._id,
            donatedQuantity: 1,
            readAloud: true,
          },
        ],
      }),
    ).rejects.toThrow("Imported visits are read-only");
  });

  it("reuses an existing title when the import ISBN only differs by hyphens", async () => {
    const { t, asStaff } = await createStaffTest();
    const existingId = await t.run(async (ctx) =>
      ctx.db.insert("titles", {
        title: "The Great Banned Books Bake Sale",
        author: "Aya Khalil",
        isbn: "978-0823456386",
        quantityOnHand: 1,
        activeReservedQuantity: 0,
        reorderNeeded: false,
      }),
    );
    const hyphenated: ImportRow[] = [
      {
        kind: "title",
        notionId: "title-bake",
        title: "The Great Banned Books Bake Sale",
        author: "Aya Khalil",
        isbn: "9780823456386",
      },
    ];
    await asStaff.mutation(api.migrations.notionImport.apply, {
      rows: hyphenated,
      expectedDigest: dryRunImport(hyphenated).digest,
    });
    const titles = await t.run(async (ctx) => ctx.db.query("titles").collect());
    expect(titles).toHaveLength(1);
    expect(titles[0]?._id).toBe(existingId);
  });

  it("preserves historical person and school identities and replays by source id", async () => {
    const { asStaff } = await createStaffTest();
    const personId = await asStaff.mutation(api.people.createPerson, {
      name: "Live Ada", email: "ada@example.com", roles: ["donor"],
    });
    const schoolId = await asStaff.mutation(api.schools.createSchool, {
      name: "Joy School", address: "1 Main Street",
    });
    const historical: ImportRow[] = [
      { kind: "person", notionId: "historical-ada", name: "Historical Ada", email: "ADA@example.com", roles: ["reader"] },
      { kind: "school", notionId: "historical-joy", name: "Joy School", address: "1 Main Street" },
    ];
    const args = { rows: historical, expectedDigest: dryRunImport(historical).digest };
    await asStaff.mutation(api.migrations.notionImport.apply, args);
    await asStaff.mutation(api.migrations.notionImport.apply, args);
    const people = await asStaff.query(api.people.listPeople, {});
    const schools = await asStaff.query(api.schools.listSchools, {});
    expect(people).toHaveLength(2);
    expect(people.find((person) => person._id !== personId)).toMatchObject({ name: "Historical Ada", roles: ["reader"] });
    expect(schools).toHaveLength(2);
    expect(schools.find((school) => school._id !== schoolId)).toMatchObject({ name: "Joy School" });
  });

  it("does not add an opening balance after a live stock movement", async () => {
    const { t, asStaff } = await createStaffTest();
    const historyRows = rows.filter((row) => row.kind !== "openingBalance");
    await asStaff.mutation(api.migrations.notionImport.apply, {
      rows: historyRows,
      expectedDigest: dryRunImport(historyRows).digest,
    });
    const titles = await asStaff.query(api.titles.listTitles, {});
    await asStaff.mutation(api.inventory.correctOnHand, {
      titleId: titles[0]!._id,
      quantityOnHand: 3,
      reason: "Shelf count",
    });

    await expect(
      asStaff.mutation(api.migrations.notionImport.apply, {
        rows,
        expectedDigest: dryRunImport(rows).digest,
      }),
    ).rejects.toThrow("no movements");

    const again = await asStaff.query(api.titles.listTitles, {});
    expect(again[0]?.quantityOnHand).toBe(3);
  });
});
