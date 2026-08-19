/// <reference types="vite/client" />
import { PDFDocument } from "pdf-lib";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/!(*.*.*)*.*s");

describe("visit recap action", () => {
  it("requires authentication", async () => {
    const t = convexTest(schema, modules);
    const visitId = await t.run(async (ctx) => {
      const schoolId = await ctx.db.insert("schools", {
        name: "Joy School",
        normalizedName: "joy school",
        address: "1 Main Street",
        normalizedAddress: "1 main street",
      });
      return await ctx.db.insert("visits", {
        schoolId,
        occurredAt: 1,
        effectGeneration: 1,
      });
    });

    await expect(
      t.action(api.visitRecaps.generateRecap, { visitId }),
    ).rejects.toThrow("Authentication required");
  });

  it("returns PDF bytes from the staff visit query", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.staff.seedStaff, {
      clerkId: "staff_1",
      email: "coo@example.com",
    });
    const asStaff = t.withIdentity({ subject: "staff_1" });
    const schoolId = await asStaff.mutation(api.schools.createSchool, {
      name: "Joy School",
      address: "1 Main Street",
    });
    const readerId = await asStaff.mutation(api.people.createPerson, {
      name: "Rae Reader",
      roles: ["reader"],
    });
    const titleId = await asStaff.mutation(api.titles.createTitle, {
      title: "A Good Book",
      author: "Ann Author",
      isbn: "9780000000001",
    });
    await asStaff.mutation(api.inventory.recordOpeningBalance, {
      titleId,
      quantity: 10,
      reason: "Physical count",
    });
    const visitId = await asStaff.mutation(api.visits.saveVisit, {
      schoolId,
      occurredAt: new Date("2026-08-19T12:00:00Z").getTime(),
      followUp: "Send the reading list.",
      staffPersonIds: [],
      readerPersonIds: [readerId],
      books: [{ titleId, donatedQuantity: 2, readAloud: true }],
    });

    const recap = await asStaff.action(api.visitRecaps.generateRecap, {
      visitId,
    });
    const bytes = new Uint8Array(recap.bytes);
    const document = await PDFDocument.load(bytes);

    expect(recap.fileName).toBe("visit-recap-joy-school-2026-08-19.pdf");
    expect(recap.mimeType).toBe("application/pdf");
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("%PDF");
    expect(document.getPageCount()).toBe(1);
  });

  it("fails when the visit no longer exists", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.staff.seedStaff, {
      clerkId: "staff_1",
      email: "coo@example.com",
    });
    const asStaff = t.withIdentity({ subject: "staff_1" });
    const visitId = await t.run(async (ctx) => {
      const schoolId = await ctx.db.insert("schools", {
        name: "Joy School",
        normalizedName: "joy school",
        address: "1 Main Street",
        normalizedAddress: "1 main street",
      });
      const visitId = await ctx.db.insert("visits", {
        schoolId,
        occurredAt: 1,
        effectGeneration: 1,
      });
      await ctx.db.delete(visitId);
      return visitId;
    });

    await expect(
      asStaff.action(api.visitRecaps.generateRecap, { visitId }),
    ).rejects.toThrow("Visit not found");
  });
});
