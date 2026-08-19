/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/!(*.*.*)*.*s");

async function createOrderTest() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.staff.seedStaff, {
    clerkId: "staff_1",
    email: "coo@example.com",
  });
  const asStaff = t.withIdentity({ subject: "staff_1" });
  const supplierId = await asStaff.mutation(api.suppliers.createSupplier, {
    name: "Book Distributor",
    contact: "orders@example.com",
  });
  const firstTitleId = await asStaff.mutation(api.titles.createTitle, {
    title: "First Book",
    author: "Ann",
    isbn: "1",
  });
  const secondTitleId = await asStaff.mutation(api.titles.createTitle, {
    title: "Second Book",
    author: "Bea",
    isbn: "2",
  });
  const orderId = await asStaff.mutation(api.orders.createOrder, {
    supplierId,
    lines: [
      { titleId: firstTitleId, orderedQuantity: 5 },
      { titleId: secondTitleId, orderedQuantity: 3 },
    ],
  });
  return {
    t,
    asStaff,
    supplierId,
    firstTitleId,
    secondTitleId,
    orderId,
  };
}

describe("supplier orders", () => {
  it("rejects anonymous and non-staff callers", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.suppliers.listSuppliers, {})).rejects.toThrow(
      "Authentication required",
    );
    await expect(
      t.withIdentity({ subject: "user_1" }).query(api.orders.listOrders, {}),
    ).rejects.toThrow("Staff membership required");
  });

  it("tracks a partial receipt and completes every line", async () => {
    const { asStaff, firstTitleId, secondTitleId, orderId } =
      await createOrderTest();
    let order = await asStaff.query(api.orders.getOrder, { orderId });
    expect(order).toEqual(
      expect.objectContaining({
        supplierName: "Book Distributor",
        status: "needed",
      }),
    );
    expect(order.lines).toHaveLength(2);
    const firstLine = order.lines.find(
      (line) => line.titleId === firstTitleId,
    );
    const secondLine = order.lines.find(
      (line) => line.titleId === secondTitleId,
    );
    if (!firstLine || !secondLine) {
      throw new Error("Expected both order lines");
    }

    await asStaff.mutation(api.orders.receiveLine, {
      orderLineId: firstLine._id,
      receivedQuantity: 2,
    });

    order = await asStaff.query(api.orders.getOrder, { orderId });
    const partialLine = order.lines.find(
      (line) => line.titleId === firstTitleId,
    );
    expect(order.status).toBe("ordered");
    expect(partialLine).toEqual(
      expect.objectContaining({
        receivedQuantity: 2,
        outstandingQuantity: 3,
      }),
    );
    const review = await asStaff.query(api.inventory.listReview, {});
    expect(
      review.find((title) => title._id === firstTitleId)?.quantityOnHand,
    ).toBe(2);
    expect(
      review.find((title) => title._id === secondTitleId)?.quantityOnHand,
    ).toBe(0);

    await asStaff.mutation(api.orders.receiveLine, {
      orderLineId: firstLine._id,
      receivedQuantity: 5,
    });
    await asStaff.mutation(api.orders.receiveLine, {
      orderLineId: secondLine._id,
      receivedQuantity: 3,
    });

    order = await asStaff.query(api.orders.getOrder, { orderId });
    expect(order.status).toBe("received");
    expect(order.displayStatus).toBe("received");
    expect(
      order.lines.every((line) => line.outstandingQuantity === 0),
    ).toBe(true);
  });

  it("records when an order transitions to ordered", async () => {
    const { asStaff, orderId } = await createOrderTest();
    const before = Date.now();
    await asStaff.mutation(api.orders.markOrdered, {
      orderId,
      expectedAt: before + 86_400_000,
    });
    const after = Date.now();

    const order = await asStaff.query(api.orders.getOrder, { orderId });
    expect(order.status).toBe("ordered");
    expect(order.orderedAt).toBeGreaterThanOrEqual(before);
    expect(order.orderedAt).toBeLessThanOrEqual(after);
  });

  it("treats the same cumulative receipt as a no-op", async () => {
    const { asStaff, firstTitleId, orderId } = await createOrderTest();
    const order = await asStaff.query(api.orders.getOrder, { orderId });
    const line = order.lines.find(
      (candidate) => candidate.titleId === firstTitleId,
    );
    if (!line) {
      throw new Error("Expected the first order line");
    }

    await asStaff.mutation(api.orders.receiveLine, {
      orderLineId: line._id,
      receivedQuantity: 2,
    });
    await asStaff.mutation(api.orders.receiveLine, {
      orderLineId: line._id,
      receivedQuantity: 2,
    });

    const review = await asStaff.query(api.inventory.listReview, {});
    const history = await asStaff.query(api.inventory.listHistory, {
      titleId: firstTitleId,
    });
    expect(
      review.find((title) => title._id === firstTitleId)?.quantityOnHand,
    ).toBe(2);
    expect(history).toHaveLength(1);
  });

  it("rejects receiving more than the ordered quantity", async () => {
    const { asStaff, firstTitleId, orderId } = await createOrderTest();
    const order = await asStaff.query(api.orders.getOrder, { orderId });
    const line = order.lines.find(
      (candidate) => candidate.titleId === firstTitleId,
    );
    if (!line) {
      throw new Error("Expected the first order line");
    }

    await expect(
      asStaff.mutation(api.orders.receiveLine, {
        orderLineId: line._id,
        receivedQuantity: 6,
      }),
    ).rejects.toThrow("cannot exceed");
    const review = await asStaff.query(api.inventory.listReview, {});
    expect(
      review.find((title) => title._id === firstTitleId)?.quantityOnHand,
    ).toBe(0);
  });
});
