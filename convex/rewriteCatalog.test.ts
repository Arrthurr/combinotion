/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/!(*.*.*)*.*s");

describe("catalog rewrite", () => {
  it("strips markdown authors and digit-only ISBNs in place", async () => {
    const t = convexTest(schema, modules);
    const titleId = await t.run(async (ctx) =>
      ctx.db.insert("titles", {
        title: "The Great Banned Books Bake Sale",
        author:
          "[Aya Khalil](https://www.amazon.com/Aya-Khalil/e/B07XWRSCJX/ref=dp_byline_cont_book_1)",
        isbn: "978-0823456386",
        quantityOnHand: 1,
        activeReservedQuantity: 0,
        reorderNeeded: false,
        synopsis: "A **classroom** favorite. See [notes](https://example.org).",
        notes: "Keep ~~near~~ the desk.",
        purchaseInfo: "Catalog **42**",
      }),
    );

    const report = await t.mutation(internal.migrations.rewriteCatalog.rewriteCatalog, {});
    expect(report).toEqual({ titles: 1, updated: 1 });
    expect(await t.run(async (ctx) => ctx.db.get(titleId))).toEqual(
      expect.objectContaining({
        author: "Aya Khalil",
        isbn: "9780823456386",
        synopsis: "A classroom favorite. See notes.",
        notes: "Keep near the desk.",
        purchaseInfo: "Catalog 42",
      }),
    );
  });

  it("refuses to collapse two titles onto the same ISBN", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("titles", {
        title: "Bake Sale hyphenated",
        author: "Aya Khalil",
        isbn: "978-0823456386",
        quantityOnHand: 1,
        activeReservedQuantity: 0,
        reorderNeeded: false,
      });
      await ctx.db.insert("titles", {
        title: "Bake Sale digits",
        author: "Aya Khalil",
        isbn: "9780823456386",
        quantityOnHand: 1,
        activeReservedQuantity: 0,
        reorderNeeded: false,
      });
    });
    await expect(
      t.mutation(internal.migrations.rewriteCatalog.rewriteCatalog, {}),
    ).rejects.toThrow("duplicate ISBNs");
  });
});
