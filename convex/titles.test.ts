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

  it("does not insert a second staff row for the same clerkId", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.staff.seedStaff, { clerkId: "staff_1", email: "coo@example.com" });
    await t.mutation(internal.staff.seedStaff, { clerkId: "staff_1", email: "coo@example.com" });
    const staff = await t.run(async (ctx) => await ctx.db.query("staff").collect());
    expect(staff).toHaveLength(1);
  });
});
