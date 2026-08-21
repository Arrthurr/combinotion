/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import type { Id } from "./_generated/dataModel";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/!(*.*.*)*.*s");

async function createStaffTest() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.staff.seedStaff, {
    clerkId: "staff_1",
    email: "coo@example.com",
  });
  await t.run(async (ctx) => {
    await ctx.db.insert("orgSettings", {
      key: "org",
      lowStockThreshold: 15,
      publicRequests: { kind: "open" },
    });
  });
  return {
    t,
    asStaff: t.withIdentity({ subject: "staff_1" }),
  };
}

type StaffTest = Awaited<ReturnType<typeof createStaffTest>>;

async function createSchool(asStaff: StaffTest["asStaff"]) {
  return await asStaff.mutation(api.schools.createSchool, {
    name: "Joy School",
    address: "1 Main Street",
  });
}

async function createPerson(
  asStaff: StaffTest["asStaff"],
  name: string,
  roles: ("reader" | "volunteer")[] = ["reader"],
) {
  return await asStaff.mutation(api.people.createPerson, {
    name,
    roles,
  });
}

async function createTitle(
  asStaff: StaffTest["asStaff"],
  quantity: number,
) {
  const titleId = await asStaff.mutation(api.titles.createTitle, {
    title: "A Good Book",
    author: "Ann Author",
    isbn: "9780000000001",
  });
  await asStaff.mutation(api.inventory.recordOpeningBalance, {
    titleId,
    quantity,
    reason: "Physical count",
  });
  return titleId;
}

function visitArgs({
  schoolId,
  readerPersonIds,
  titleId,
  donatedQuantity,
  visitId,
  followUp = "Send the class reading list.",
}: {
  schoolId: Id<"schools">;
  readerPersonIds: Id<"people">[];
  titleId: Id<"titles">;
  donatedQuantity: number;
  visitId?: Id<"visits">;
  followUp?: string;
}) {
  return {
    ...(visitId === undefined ? {} : { visitId }),
    schoolId,
    occurredAt: new Date("2026-08-01T12:00:00Z").getTime(),
    followUp,
    staffPersonIds: [],
    readerPersonIds,
    books: [{ titleId, donatedQuantity, readAloud: true }],
  };
}

async function submitRequest(
  t: StaffTest["t"],
  quantity: number,
  contactName: string,
) {
  return await t.mutation(internal.schoolRequests.internalSubmit, {
    schoolName: "Joy School",
    address: "1 Main Street",
    contactName,
    email: `${contactName.toLocaleLowerCase()}@example.com`,
    lines: [{ isbn: "9780000000001", quantity }],
  });
}

describe("visits", () => {
  it("applies and reverses AE4 donation and participation effects", async () => {
    const { t, asStaff } = await createStaffTest();
    const schoolId = await createSchool(asStaff);
    const firstReaderId = await createPerson(asStaff, "First Reader");
    const secondReaderId = await createPerson(asStaff, "Second Reader");
    const titleId = await createTitle(asStaff, 25);

    const visitId = await asStaff.mutation(
      api.visits.saveVisit,
      visitArgs({
        schoolId,
        readerPersonIds: [firstReaderId, secondReaderId],
        titleId,
        donatedQuantity: 20,
      }),
    );

    expect((await t.run(async (ctx) => ctx.db.get(titleId)))?.quantityOnHand)
      .toBe(5);
    await expect(
      asStaff.query(api.visits.listTitleParticipation, { titleId }),
    ).resolves.toEqual({
      donatedQuantity: 20,
      readAloudCount: 1,
    });
    for (const personId of [firstReaderId, secondReaderId]) {
      await expect(
        asStaff.query(api.visits.listPersonParticipation, { personId }),
      ).resolves.toEqual({
        readerVisitCount: 1,
        staffVisitCount: 0,
      });
    }
    await expect(
      asStaff.query(api.visits.getVisit, { visitId }),
    ).resolves.toEqual(
      expect.objectContaining({
        school: expect.objectContaining({
          name: "Joy School",
          address: "1 Main Street",
        }),
        staffPresent: [],
        readers: expect.arrayContaining([
          expect.objectContaining({ name: "First Reader" }),
          expect.objectContaining({ name: "Second Reader" }),
        ]),
        booksRead: [
          expect.objectContaining({ title: "A Good Book", readAloud: true }),
        ],
        booksDonated: [
          expect.objectContaining({
            title: "A Good Book",
            donatedQuantity: 20,
          }),
        ],
        followUp: "Send the class reading list.",
      }),
    );

    await asStaff.mutation(api.visits.deleteVisit, { visitId });

    expect((await t.run(async (ctx) => ctx.db.get(titleId)))?.quantityOnHand)
      .toBe(25);
    await expect(
      asStaff.query(api.visits.listTitleParticipation, { titleId }),
    ).resolves.toEqual({
      donatedQuantity: 0,
      readAloudCount: 0,
    });
    await expect(
      asStaff.query(api.visits.listPersonParticipation, {
        personId: firstReaderId,
      }),
    ).resolves.toEqual({
      readerVisitCount: 0,
      staffVisitCount: 0,
    });
  });

  it("consumes one matching active reservation without a request id", async () => {
    const { t, asStaff } = await createStaffTest();
    const schoolId = await createSchool(asStaff);
    const readerId = await createPerson(asStaff, "Pat Reader");
    const titleId = await createTitle(asStaff, 10);
    await submitRequest(t, 6, "Pat");

    const visitId = await asStaff.mutation(
      api.visits.saveVisit,
      visitArgs({
        schoolId,
        readerPersonIds: [readerId],
        titleId,
        donatedQuantity: 4,
      }),
    );

    const title = await t.run(async (ctx) => ctx.db.get(titleId));
    const reservations = await t.run(async (ctx) =>
      ctx.db.query("reservations").collect(),
    );
    const visit = await asStaff.query(api.visits.getVisit, { visitId });
    expect(title).toEqual(
      expect.objectContaining({
        quantityOnHand: 6,
        activeReservedQuantity: 2,
      }),
    );
    expect(reservations[0]).toEqual(
      expect.objectContaining({ quantity: 2, active: true }),
    );
    expect(visit?.books[0]).toEqual(
      expect.objectContaining({
        consumptionStatus: "consumed",
        consumedQuantity: 4,
      }),
    );
  });

  it("records an ambiguous reservation match without consuming either", async () => {
    const { t, asStaff } = await createStaffTest();
    const schoolId = await createSchool(asStaff);
    const readerId = await createPerson(asStaff, "Pat Reader");
    const titleId = await createTitle(asStaff, 10);
    await submitRequest(t, 2, "Pat");
    await submitRequest(t, 2, "Sam");

    const visitId = await asStaff.mutation(
      api.visits.saveVisit,
      visitArgs({
        schoolId,
        readerPersonIds: [readerId],
        titleId,
        donatedQuantity: 4,
      }),
    );

    const title = await t.run(async (ctx) => ctx.db.get(titleId));
    const reservations = await t.run(async (ctx) =>
      ctx.db.query("reservations").collect(),
    );
    const visit = await asStaff.query(api.visits.getVisit, { visitId });
    const exceptions = await asStaff.query(
      api.visits.listConsumptionExceptions,
      {},
    );
    expect(title).toEqual(
      expect.objectContaining({
        quantityOnHand: 6,
        activeReservedQuantity: 4,
      }),
    );
    expect(reservations).toEqual([
      expect.objectContaining({ quantity: 2, active: true }),
      expect.objectContaining({ quantity: 2, active: true }),
    ]);
    expect(visit?.books[0].consumptionStatus).toBe("ambiguous");
    expect(exceptions).toEqual([
      expect.objectContaining({
        visitId,
        titleId,
        schoolName: "Joy School",
        titleName: "A Good Book",
        consumptionStatus: "ambiguous",
      }),
    ]);
  });

  it("reverses the prior generation before applying an edited donation", async () => {
    const { t, asStaff } = await createStaffTest();
    const schoolId = await createSchool(asStaff);
    const readerId = await createPerson(asStaff, "Pat Reader");
    const titleId = await createTitle(asStaff, 25);
    const firstArgs = visitArgs({
      schoolId,
      readerPersonIds: [readerId],
      titleId,
      donatedQuantity: 20,
    });
    const visitId = await asStaff.mutation(
      api.visits.saveVisit,
      firstArgs,
    );

    await asStaff.mutation(
      api.visits.saveVisit,
      {
        ...firstArgs,
        visitId,
        books: [{ titleId, donatedQuantity: 10, readAloud: true }],
      },
    );

    const title = await t.run(async (ctx) => ctx.db.get(titleId));
    const history = await asStaff.query(api.inventory.listHistory, {
      titleId,
    });
    const visit = await asStaff.query(api.visits.getVisit, { visitId });
    expect(title?.quantityOnHand).toBe(15);
    expect(visit?.effectGeneration).toBe(2);
    expect(
      history.filter((movement) => movement.kind === "donation"),
    ).toHaveLength(2);
    expect(
      history.some(
        (movement) =>
          movement.sourceId ===
          `reverse:donation:${visitId}:${titleId}:1`,
      ),
    ).toBe(true);
  });

  it("restores a consumed reservation when the visit is deleted", async () => {
    const { t, asStaff } = await createStaffTest();
    const schoolId = await createSchool(asStaff);
    const readerId = await createPerson(asStaff, "Pat Reader");
    const titleId = await createTitle(asStaff, 10);
    await submitRequest(t, 6, "Pat");
    const visitId = await asStaff.mutation(
      api.visits.saveVisit,
      visitArgs({
        schoolId,
        readerPersonIds: [readerId],
        titleId,
        donatedQuantity: 4,
      }),
    );

    await asStaff.mutation(api.visits.deleteVisit, { visitId });
    await asStaff.mutation(api.visits.deleteVisit, { visitId });

    const title = await t.run(async (ctx) => ctx.db.get(titleId));
    const reservations = await t.run(async (ctx) =>
      ctx.db.query("reservations").collect(),
    );
    expect(title).toEqual(
      expect.objectContaining({
        quantityOnHand: 10,
        activeReservedQuantity: 6,
      }),
    );
    expect(reservations[0]).toEqual(
      expect.objectContaining({ quantity: 6, active: true }),
    );
  });

  it("reapplies a consumed reservation when the donated quantity is edited", async () => {
    const { t, asStaff } = await createStaffTest();
    const schoolId = await createSchool(asStaff);
    const readerId = await createPerson(asStaff, "Pat Reader");
    const titleId = await createTitle(asStaff, 10);
    await submitRequest(t, 6, "Pat");
    const firstArgs = visitArgs({
      schoolId,
      readerPersonIds: [readerId],
      titleId,
      donatedQuantity: 4,
    });
    const visitId = await asStaff.mutation(api.visits.saveVisit, firstArgs);

    await asStaff.mutation(api.visits.saveVisit, {
      ...firstArgs,
      visitId,
      books: [{ titleId, donatedQuantity: 3, readAloud: true }],
    });

    const title = await t.run(async (ctx) => ctx.db.get(titleId));
    const reservations = await t.run(async (ctx) =>
      ctx.db.query("reservations").collect(),
    );
    const visit = await asStaff.query(api.visits.getVisit, { visitId });
    const history = await asStaff.query(api.inventory.listHistory, {
      titleId,
    });
    expect(title).toEqual(
      expect.objectContaining({
        quantityOnHand: 7,
        activeReservedQuantity: 3,
      }),
    );
    expect(reservations[0]).toEqual(
      expect.objectContaining({ quantity: 3, active: true }),
    );
    expect(visit).toEqual(
      expect.objectContaining({
        effectGeneration: 2,
        books: [
          expect.objectContaining({
            consumptionStatus: "consumed",
            consumedQuantity: 3,
            consumedReservationId: reservations[0]?._id,
          }),
        ],
      }),
    );
    expect(
      history.some(
        (movement) =>
          movement.sourceId ===
          `reverse:reservationConsumption:${visitId}:${reservations[0]?._id}:1`,
      ),
    ).toBe(true);
    expect(
      history.some(
        (movement) =>
          movement.sourceId ===
          `reservationConsumption:${visitId}:${reservations[0]?._id}:2`,
      ),
    ).toBe(true);
  });

  it("restores a fully consumed reservation when the visit is deleted", async () => {
    const { t, asStaff } = await createStaffTest();
    const schoolId = await createSchool(asStaff);
    const readerId = await createPerson(asStaff, "Pat Reader");
    const titleId = await createTitle(asStaff, 10);
    await submitRequest(t, 4, "Pat");
    const visitId = await asStaff.mutation(
      api.visits.saveVisit,
      visitArgs({
        schoolId,
        readerPersonIds: [readerId],
        titleId,
        donatedQuantity: 4,
      }),
    );

    await asStaff.mutation(api.visits.deleteVisit, { visitId });

    const title = await t.run(async (ctx) => ctx.db.get(titleId));
    const reservations = await t.run(async (ctx) =>
      ctx.db.query("reservations").collect(),
    );
    expect(title).toEqual(
      expect.objectContaining({
        quantityOnHand: 10,
        activeReservedQuantity: 4,
      }),
    );
    expect(reservations[0]).toEqual(
      expect.objectContaining({ quantity: 4, active: true }),
    );
  });

  it("does not resurrect a reservation after the request is cancelled", async () => {
    const { t, asStaff } = await createStaffTest();
    const schoolId = await createSchool(asStaff);
    const readerId = await createPerson(asStaff, "Pat Reader");
    const titleId = await createTitle(asStaff, 10);
    await submitRequest(t, 6, "Pat");
    const firstArgs = visitArgs({
      schoolId,
      readerPersonIds: [readerId],
      titleId,
      donatedQuantity: 4,
    });
    const visitId = await asStaff.mutation(api.visits.saveVisit, firstArgs);
    const active = await asStaff.query(api.schoolRequests.listActive, {});
    await asStaff.mutation(api.schoolRequests.resolveRequest, {
      requestId: active[0]._id,
      resolution: "cancelled",
    });

    await asStaff.mutation(api.visits.deleteVisit, { visitId });

    const title = await t.run(async (ctx) => ctx.db.get(titleId));
    const reservations = await t.run(async (ctx) =>
      ctx.db.query("reservations").collect(),
    );
    expect(title).toEqual(
      expect.objectContaining({
        quantityOnHand: 10,
        activeReservedQuantity: 0,
      }),
    );
    expect(reservations[0]).toEqual(
      expect.objectContaining({ quantity: 2, active: false }),
    );
  });

  it("does not rematch a cancelled request when the visit is edited", async () => {
    const { t, asStaff } = await createStaffTest();
    const schoolId = await createSchool(asStaff);
    const readerId = await createPerson(asStaff, "Pat Reader");
    const titleId = await createTitle(asStaff, 10);
    await submitRequest(t, 6, "Pat");
    const firstArgs = visitArgs({
      schoolId,
      readerPersonIds: [readerId],
      titleId,
      donatedQuantity: 4,
    });
    const visitId = await asStaff.mutation(api.visits.saveVisit, firstArgs);
    const active = await asStaff.query(api.schoolRequests.listActive, {});
    await asStaff.mutation(api.schoolRequests.resolveRequest, {
      requestId: active[0]._id,
      resolution: "cancelled",
    });

    await asStaff.mutation(api.visits.saveVisit, {
      ...firstArgs,
      visitId,
      followUp: "Visit notes only.",
    });

    const title = await t.run(async (ctx) => ctx.db.get(titleId));
    const reservations = await t.run(async (ctx) =>
      ctx.db.query("reservations").collect(),
    );
    const visit = await asStaff.query(api.visits.getVisit, { visitId });
    expect(title).toEqual(
      expect.objectContaining({
        quantityOnHand: 6,
        activeReservedQuantity: 0,
      }),
    );
    expect(reservations[0]).toEqual(
      expect.objectContaining({ quantity: 2, active: false }),
    );
    expect(visit?.books[0]).toEqual(
      expect.objectContaining({
        consumptionStatus: "none",
        consumedQuantity: 0,
      }),
    );
  });

  it("keeps the original reservation when a notes-only edit follows a second request", async () => {
    const { t, asStaff } = await createStaffTest();
    const schoolId = await createSchool(asStaff);
    const readerId = await createPerson(asStaff, "Pat Reader");
    const titleId = await createTitle(asStaff, 10);
    await submitRequest(t, 6, "Pat");
    const firstArgs = visitArgs({
      schoolId,
      readerPersonIds: [readerId],
      titleId,
      donatedQuantity: 4,
    });
    const visitId = await asStaff.mutation(api.visits.saveVisit, firstArgs);
    const firstReservationId = (
      await t.run(async (ctx) => ctx.db.query("reservations").collect())
    )[0]?._id;
    await submitRequest(t, 2, "Sam");

    await asStaff.mutation(api.visits.saveVisit, {
      ...firstArgs,
      visitId,
      followUp: "Corrected the class list.",
    });

    const title = await t.run(async (ctx) => ctx.db.get(titleId));
    const reservations = await t.run(async (ctx) =>
      ctx.db.query("reservations").collect(),
    );
    const visit = await asStaff.query(api.visits.getVisit, { visitId });
    const exceptions = await asStaff.query(
      api.visits.listConsumptionExceptions,
      {},
    );
    expect(title).toEqual(
      expect.objectContaining({
        quantityOnHand: 6,
        activeReservedQuantity: 4,
      }),
    );
    expect(reservations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _id: firstReservationId,
          quantity: 2,
          active: true,
        }),
        expect.objectContaining({ quantity: 2, active: true }),
      ]),
    );
    expect(visit?.books[0]).toEqual(
      expect.objectContaining({
        consumptionStatus: "consumed",
        consumedQuantity: 4,
        consumedReservationId: firstReservationId,
      }),
    );
    expect(exceptions).toEqual([]);
  });

  it("rejects empty readers, missing schools, and empty book effects", async () => {
    const { t, asStaff } = await createStaffTest();
    const schoolId = await createSchool(asStaff);
    const readerId = await createPerson(asStaff, "Pat Reader");
    const titleId = await createTitle(asStaff, 10);

    await expect(
      asStaff.mutation(
        api.visits.saveVisit,
        visitArgs({
          schoolId,
          readerPersonIds: [],
          titleId,
          donatedQuantity: 4,
        }),
      ),
    ).rejects.toThrow("Choose at least one reader");

    await t.run(async (ctx) => ctx.db.delete(schoolId));
    await expect(
      asStaff.mutation(
        api.visits.saveVisit,
        visitArgs({
          schoolId,
          readerPersonIds: [readerId],
          titleId,
          donatedQuantity: 4,
        }),
      ),
    ).rejects.toThrow("School not found");

    const replacementSchoolId = await createSchool(asStaff);
    await expect(
      asStaff.mutation(api.visits.saveVisit, {
        ...visitArgs({
          schoolId: replacementSchoolId,
          readerPersonIds: [readerId],
          titleId,
          donatedQuantity: 0,
        }),
        books: [{ titleId, donatedQuantity: 0, readAloud: false }],
      }),
    ).rejects.toThrow("must be read aloud or donated");
  });

  it("rejects anonymous and non-staff callers", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.visits.listVisits, {})).rejects.toThrow(
      "Authentication required",
    );
    await expect(
      t
        .withIdentity({ subject: "user_1" })
        .query(api.visits.listConsumptionExceptions, {}),
    ).rejects.toThrow("Staff membership required");
  });
});
