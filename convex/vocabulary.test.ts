/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  CONSUMPTION_STATUSES,
  MATCH_STATUSES,
  MOVEMENT_KINDS,
  ORDER_STATUSES,
  REQUEST_STATUSES,
  ROLES,
  TABLE_COLUMNS,
  VISIT_PERSON_KINDS,
  VISIT_PLAN_STAGES,
  type MovementKind,
  type VisitPlanResolution,
} from "../lib/domain/vocabulary";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/!(*.*.*)*.*s");

describe("shared domain vocabulary", () => {
  it("preserves literal unions and visit ID types", () => {
    expectTypeOf<MovementKind>().toEqualTypeOf<(typeof MOVEMENT_KINDS)[number]>();
    expectTypeOf<string>().not.toMatchTypeOf<MovementKind>();
    expectTypeOf<Doc<"inventoryMovements">["kind"]>().toEqualTypeOf<MovementKind>();
    expectTypeOf<Doc<"visitPlans">["resolution"]>().toEqualTypeOf<
      VisitPlanResolution<Id<"visits">> | undefined
    >();
  });

  it("round-trips every persisted literal through the schema", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const schoolId = await ctx.db.insert("schools", {
        name: "School", normalizedName: "school", address: "1 Main", normalizedAddress: "1 main",
      });
      const titleId = await ctx.db.insert("titles", {
        title: "Title", author: "Author", isbn: "9780000000001",
        quantityOnHand: 0, activeReservedQuantity: 0, reorderNeeded: false,
      });
      const supplierId = await ctx.db.insert("suppliers", { name: "Supplier" });
      const visitId = await ctx.db.insert("visits", { schoolId, occurredAt: 1, effectGeneration: 0 });
      for (const role of ROLES) {
        const id = await ctx.db.insert("people", { name: role, roles: [role] });
        expect((await ctx.db.get(id))?.roles).toEqual([role]);
        for (const kind of VISIT_PERSON_KINDS) {
          const linkId = await ctx.db.insert("visitPeople", { visitId, personId: id, kind });
          expect((await ctx.db.get(linkId))?.kind).toBe(kind);
        }
      }
      for (const kind of MOVEMENT_KINDS) {
        const id = await ctx.db.insert("inventoryMovements", {
          titleId, kind, quantity: 1, sourceId: kind, createdAt: 1,
        });
        expect((await ctx.db.get(id))?.kind).toBe(kind);
      }
      for (const status of ORDER_STATUSES) {
        const id = await ctx.db.insert("orders", { supplierId, status });
        expect((await ctx.db.get(id))?.status).toBe(status);
      }
      for (const status of REQUEST_STATUSES) {
        for (const matchStatus of MATCH_STATUSES) {
          const id = await ctx.db.insert("schoolRequests", {
            schoolName: "School", schoolAddress: "1 Main", contactName: "Pat",
            email: "pat@example.com", status, matchStatus, reference: "request", createdAt: 1,
          });
          expect(await ctx.db.get(id)).toMatchObject({ status, matchStatus });
        }
      }
      for (const consumptionStatus of CONSUMPTION_STATUSES) {
        const id = await ctx.db.insert("visitBooks", {
          visitId, titleId, donatedQuantity: 0, readAloud: false, consumptionStatus, consumedQuantity: 0,
        });
        expect((await ctx.db.get(id))?.consumptionStatus).toBe(consumptionStatus);
      }
      for (const stage of VISIT_PLAN_STAGES) {
        for (const resolution of [{ kind: "archived" }, { kind: "visited", visitId }] as const) {
          const id = await ctx.db.insert("visitPlans", { schoolId, stage, resolution });
          expect(await ctx.db.get(id)).toMatchObject({ stage, resolution });
        }
      }
      // Simulate untyped input: the schema must not have widened to strings.
      await expect(ctx.db.insert("orders", { supplierId, status: "invalid" as never })).rejects.toThrow();
      await expect(ctx.db.insert("visitPlans", {
        schoolId, stage: "schoolContact", resolution: { kind: "visited" } as never,
      })).rejects.toThrow();
      await expect(ctx.db.insert("visitPlans", {
        schoolId, stage: "schoolContact", resolution: { kind: "visited", visitId: titleId as never },
      })).rejects.toThrow();
    });
  });

  it("accepts the vocabulary at mutation boundaries and retains legacy column sanitizing", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.staff.seedStaff, { clerkId: "staff_1", email: "staff@example.com" });
    const staff = t.withIdentity({ subject: "staff_1" });
    const personId = await staff.mutation(api.people.createPerson, { name: "Pat", roles: [...ROLES] });
    await staff.mutation(api.people.setRoles, { personId, roles: [...ROLES].reverse() });
    expect((await staff.query(api.people.listPeople, {}))[0].roles).toEqual([...ROLES].reverse());
    await staff.mutation(api.views.setTableColumns, { columns: [...TABLE_COLUMNS].reverse() });
    expect(await staff.query(api.views.getTableColumns, {})).toEqual([...TABLE_COLUMNS].reverse());
    const schoolId = await staff.mutation(api.schools.createSchool, { name: "School", address: "1 Main" });
    const planId = await staff.mutation(api.views.saveVisitPlan, { schoolId, stage: "readerConfirmation" });
    for (const stage of VISIT_PLAN_STAGES) {
      await staff.mutation(api.views.setVisitPlanStage, { planId, stage });
      expect((await staff.query(api.views.listVisitBoard, {})).columns[stage][0].stage).toBe(stage);
    }
    await staff.mutation(api.views.resolveVisitPlan, { planId, resolution: { kind: "archived" } });
    expect(await t.run((ctx) => ctx.db.get(planId))).toMatchObject({ resolution: { kind: "archived" } });

    const invalidStage = makeFunctionReference<"mutation", { planId: Id<"visitPlans">; stage: string }>("views:setVisitPlanStage");
    const invalidColumn = makeFunctionReference<"mutation", { columns: string[] }>("views:setTableColumns");
    await expect(staff.mutation(invalidStage, { planId, stage: "visited" })).rejects.toThrow();
    await expect(staff.mutation(invalidColumn, { columns: ["retiredColumn"] })).rejects.toThrow();
    await t.run(async (ctx) => {
      const config = await ctx.db.query("viewConfigs").unique();
      await ctx.db.patch(config!._id, { tableColumns: ["retiredColumn", "isbn", "isbn", "author"] });
    });
    expect(await staff.query(api.views.getTableColumns, {})).toEqual(["isbn", "author"]);
  });
});
