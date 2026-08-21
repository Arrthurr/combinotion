/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/!(*.*.*)*.*s");

describe("staff titles", () => {
  it("rejects anonymous createTitle", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.titles.createTitle, { title: "Book", author: "Ann", isbn: "1" })).rejects.toThrow(
      "Authentication required",
    );
  });

  it("rejects signed-in non-staff createTitle", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.withIdentity({ subject: "user_1" }).mutation(api.titles.createTitle, { title: "Book", author: "Ann", isbn: "1" }),
    ).rejects.toThrow("Staff membership required");
  });

  it("rejects signed-in non-staff listTitles and getTitle", async () => {
    const t = convexTest(schema, modules);
    const titleId = await t.run(async (ctx) =>
      ctx.db.insert("titles", {
        title: "Book",
        author: "Ann",
        isbn: "1",
        quantityOnHand: 0,
        activeReservedQuantity: 0,
        reorderNeeded: false,
      }),
    );
    const asUser = t.withIdentity({ subject: "user_1" });
    await expect(asUser.query(api.titles.listTitles, {})).rejects.toThrow("Staff membership required");
    await expect(asUser.query(api.titles.getTitle, { titleId })).rejects.toThrow("Staff membership required");
  });

  it("lets staff create a title and list it", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.staff.seedStaff, { clerkId: "staff_1", email: "coo@example.com" });
    const asStaff = t.withIdentity({ subject: "staff_1" });
    const titleId = await asStaff.mutation(api.titles.createTitle, { title: "Book", author: "Ann", isbn: "1" });
    const titles = await asStaff.query(api.titles.listTitles, {});
    expect(titles).toEqual([
      expect.objectContaining({
        _id: titleId,
        title: "Book",
        author: "Ann",
        isbn: "1",
        quantityOnHand: 0,
        activeReservedQuantity: 0,
        reorderNeeded: false,
      }),
    ]);
  });

  it("returns only the public requestable-title projection", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("orgSettings", {
        key: "org",
        lowStockThreshold: 15,
        publicRequests: { kind: "open" },
      });
      await ctx.db.insert("titles", {
        title: "Book",
        author: "Ann",
        isbn: "1",
        quantityOnHand: 2,
        activeReservedQuantity: 0,
        reorderNeeded: false,
        notes: "private",
      });
    });
    const requestable = await t.query(api.titles.listRequestable, {});
    expect(requestable).toEqual([
      {
        title: "Book",
        author: "Ann",
        isbn: "1",
        availableQuantity: 2,
      },
    ]);
  });

  it("hides a title with no availability from listRequestable", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.staff.seedStaff, { clerkId: "staff_1", email: "coo@example.com" });
    await t.withIdentity({ subject: "staff_1" }).mutation(api.titles.createTitle, { title: "Book", author: "Ann", isbn: "1" });
    expect(await t.query(api.titles.listRequestable, {})).toEqual([]);
  });

  it("rejects a duplicate ISBN", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.staff.seedStaff, { clerkId: "staff_1", email: "coo@example.com" });
    const asStaff = t.withIdentity({ subject: "staff_1" });
    await asStaff.mutation(api.titles.createTitle, { title: "Book", author: "Ann", isbn: "1" });
    await expect(asStaff.mutation(api.titles.createTitle, { title: "Other", author: "Bea", isbn: "1" })).rejects.toThrow(
      "A title with this ISBN already exists",
    );
  });

  it("updates only catalog fields and returns the joined title workspace", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.staff.seedStaff, {
      clerkId: "staff_1",
      email: "coo@example.com",
    });
    const asStaff = t.withIdentity({ subject: "staff_1" });
    const supplierId = await asStaff.mutation(
      api.suppliers.createSupplier,
      {
        name: "Book Distributor",
      },
    );
    const schoolId = await asStaff.mutation(api.schools.createSchool, {
      name: "Joy School",
      address: "1 Main Street",
    });
    const titleId = await asStaff.mutation(api.titles.createTitle, {
      title: "A Good Book",
      author: "Ann Author",
      isbn: "9780000000001",
      supplierIds: [supplierId],
      purchaseInfo: "Old catalog code",
    });
    await asStaff.mutation(api.inventory.recordOpeningBalance, {
      titleId,
      quantity: 10,
      reason: "Physical count",
    });
    await asStaff.mutation(api.orgSettings.update, {
      lowStockThreshold: 15,
      publicRequests: { kind: "open" },
    });
    await t.mutation(internal.schoolRequests.internalSubmit, {
      schoolName: "Joy School",
      address: "1 Main Street",
      contactName: "Pat Reader",
      email: "pat@example.com",
      lines: [{ isbn: "9780000000001", quantity: 2 }],
    });
    const orderId = await asStaff.mutation(api.orders.createOrder, {
      supplierId,
      lines: [{ titleId, orderedQuantity: 5 }],
    });
    await t.run(async (ctx) => {
      const visitId = await ctx.db.insert("visits", {
        schoolId,
        occurredAt: 20,
        effectGeneration: 1,
      });
      await ctx.db.insert("visitBooks", {
        visitId,
        titleId,
        donatedQuantity: 4,
        readAloud: true,
        consumptionStatus: "none",
        consumedQuantity: 0,
      });
      await ctx.db.insert("reviews", {
        titleId,
        reviewer: "Sam Reviewer",
        feedback: "Ready for the classroom.",
        score: 5,
        approved: true,
      });
    });

    await asStaff.mutation(api.titles.updateTitle, {
      titleId,
      title: "A Better Book",
      author: "Ann Author",
      isbn: "9780000000001",
      synopsis: "A classroom favorite.",
      notes: "Keep near the front desk.",
      purchaseInfo: "Catalog 42",
      supplierIds: [supplierId, supplierId],
      enrichmentSource: {
        source: "openLibrary",
        fetchedAt: 100,
      },
    });

    const storedTitle = await t.run(async (ctx) => ctx.db.get(titleId));
    expect(storedTitle).toEqual(
      expect.objectContaining({
        title: "A Better Book",
        quantityOnHand: 10,
        activeReservedQuantity: 2,
        supplierIds: [supplierId],
        enrichmentSource: {
          source: "openLibrary",
          fetchedAt: 100,
        },
      }),
    );
    const workspace = await asStaff.query(
      api.titles.getTitleWorkspace,
      { titleId },
    );
    expect(workspace).toEqual({
      titleId,
      identity: {
        title: "A Better Book",
        author: "Ann Author",
        isbn: "9780000000001",
        synopsis: "A classroom favorite.",
        notes: "Keep near the front desk.",
        purchaseInfo: "Catalog 42",
      },
      stock: {
        quantityOnHand: 10,
        activeReservedQuantity: 2,
        availableQuantity: 8,
        lowStock: true,
        shortage: false,
        reorderNeeded: false,
      },
      suppliers: [{ supplierId, name: "Book Distributor" }],
      openOrderLines: [
        {
          orderId,
          supplierName: "Book Distributor",
          status: "needed",
          orderedQuantity: 5,
          receivedQuantity: 0,
          outstandingQuantity: 5,
        },
      ],
      activeRequests: [
        expect.objectContaining({
          schoolName: "Joy School",
          quantity: 2,
        }),
      ],
      participation: {
        readAloudCount: 1,
        donatedQuantity: 4,
      },
      reviews: [
        expect.objectContaining({
          reviewer: "Sam Reviewer",
          feedback: "Ready for the classroom.",
          score: 5,
          approved: true,
        }),
      ],
    });
    expect(workspace).not.toHaveProperty("movements");
  });

  it("rejects unauthorized title workspace writes and duplicate ISBN edits", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.staff.seedStaff, {
      clerkId: "staff_1",
      email: "coo@example.com",
    });
    const asStaff = t.withIdentity({ subject: "staff_1" });
    const firstTitleId = await asStaff.mutation(
      api.titles.createTitle,
      { title: "First", author: "Ann", isbn: "1" },
    );
    await asStaff.mutation(api.titles.createTitle, {
      title: "Second",
      author: "Bea",
      isbn: "2",
    });

    await expect(
      t.withIdentity({ subject: "user_1" }).mutation(
        api.titles.updateTitle,
        {
          titleId: firstTitleId,
          title: "First",
          author: "Ann",
          isbn: "1",
        },
      ),
    ).rejects.toThrow("Staff membership required");
    await expect(
      t.query(api.titles.getTitleWorkspace, {
        titleId: firstTitleId,
      }),
    ).rejects.toThrow("Authentication required");
    await expect(
      asStaff.mutation(api.titles.updateTitle, {
        titleId: firstTitleId,
        title: "First",
        author: "Ann",
        isbn: "2",
      }),
    ).rejects.toThrow("A title with this ISBN already exists");
  });

  it("does not insert a second staff row for the same clerkId", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.staff.seedStaff, { clerkId: "staff_1", email: "coo@example.com" });
    await t.mutation(internal.staff.seedStaff, { clerkId: "staff_1", email: "coo@example.com" });
    const staff = await t.run(async (ctx) => await ctx.db.query("staff").collect());
    expect(staff).toHaveLength(1);
  });
});
