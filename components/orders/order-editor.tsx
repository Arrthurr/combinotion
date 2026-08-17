"use client";

import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { OrderStatus } from "@/lib/domain/types";

const convexConfigured = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

type DraftLine = {
  key: number;
  titleId: Id<"titles"> | "";
  orderedQuantity: number;
};

type OrderLineView = Doc<"orderLines"> & {
  titleName: string;
  outstandingQuantity: number;
};

type OrderView = Doc<"orders"> & {
  supplierName: string;
  lines: OrderLineView[];
  displayStatus: OrderStatus;
};

function OrderCard({ order }: { order: OrderView }) {
  const markOrdered = useMutation(api.orders.markOrdered);
  const receiveLine = useMutation(api.orders.receiveLine);
  const [status, setStatus] = useState("");

  async function markAsOrdered() {
    setStatus("Marking order as ordered…");
    try {
      await markOrdered({ orderId: order._id });
      setStatus("Order marked as ordered.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not update order.",
      );
    }
  }

  async function receive(
    event: FormEvent<HTMLFormElement>,
    orderLineId: Id<"orderLines">,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setStatus("Recording receipt…");
    try {
      await receiveLine({
        orderLineId,
        receivedQuantity: Number(data.get("receivedQuantity")),
      });
      form.reset();
      setStatus("Receipt recorded.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not record receipt.",
      );
    }
  }

  return (
    <article className="card stack">
      <div className="row">
        <h3>{order.supplierName}</h3>
        <strong>Status: {order.displayStatus}</strong>
      </div>
      {order.expectedAt ? (
        <p className="muted">
          Expected {new Date(order.expectedAt).toLocaleDateString()}
        </p>
      ) : null}
      {order.status === "needed" ? (
        <button className="button" type="button" onClick={markAsOrdered}>
          Mark ordered
        </button>
      ) : null}
      <ul className="stack">
        {order.lines.map((line) => (
          <li key={line._id}>
            <strong>{line.titleName}</strong>
            <p>
              Ordered: {line.orderedQuantity} · Received:{" "}
              {line.receivedQuantity} · Outstanding:{" "}
              {line.outstandingQuantity}
            </p>
            {line.outstandingQuantity > 0 ? (
              <form
                className="row"
                onSubmit={(event) => receive(event, line._id)}
              >
                <label>
                  Cumulative received quantity
                  <input
                    required
                    min={line.receivedQuantity + 1}
                    max={line.orderedQuantity}
                    step="1"
                    name="receivedQuantity"
                    type="number"
                  />
                </label>
                <button className="button">Record receipt</button>
              </form>
            ) : (
              <span className="muted">Line received in full.</span>
            )}
          </li>
        ))}
      </ul>
      <p className="muted" role="status" aria-live="polite">
        {status}
      </p>
    </article>
  );
}

export function OrderEditor() {
  if (!convexConfigured) {
    return (
      <section className="card stack" aria-labelledby="orders-fallback">
        <h2 id="orders-fallback">Supplier orders are not configured</h2>
        <p>
          Connect Convex to create suppliers, place orders, and record
          receipts.
        </p>
      </section>
    );
  }
  return <OrderEditorLive />;
}

function OrderEditorLive() {
  const suppliers = useQuery(api.suppliers.listSuppliers);
  const titles = useQuery(api.inventory.listReview);
  const orders = useQuery(api.orders.listOrders);
  const createSupplier = useMutation(api.suppliers.createSupplier);
  const createOrder = useMutation(api.orders.createOrder);
  const [supplierStatus, setSupplierStatus] = useState("");
  const [orderStatus, setOrderStatus] = useState("");
  const [supplierId, setSupplierId] = useState<Id<"suppliers"> | "">("");
  const [lines, setLines] = useState<DraftLine[]>([
    { key: 0, titleId: "", orderedQuantity: 1 },
  ]);
  const [nextLineKey, setNextLineKey] = useState(1);

  async function saveSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSupplierStatus("Saving supplier…");
    try {
      await createSupplier({
        name: String(data.get("name") ?? ""),
        contact: String(data.get("contact") ?? ""),
      });
      form.reset();
      setSupplierStatus("Supplier saved.");
    } catch (error) {
      setSupplierStatus(
        error instanceof Error ? error.message : "Could not save supplier.",
      );
    }
  }

  async function saveOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (supplierId === "") {
      setOrderStatus("Choose a supplier.");
      return;
    }
    const completeLines = lines.flatMap((line) =>
      line.titleId === ""
        ? []
        : [
            {
              titleId: line.titleId,
              orderedQuantity: line.orderedQuantity,
            },
          ],
    );
    if (completeLines.length !== lines.length) {
      setOrderStatus("Choose a title for every order line.");
      return;
    }

    setOrderStatus("Creating order…");
    try {
      await createOrder({ supplierId, lines: completeLines });
      setLines([
        { key: nextLineKey, titleId: "", orderedQuantity: 1 },
      ]);
      setNextLineKey((current) => current + 1);
      setOrderStatus("Order created.");
    } catch (error) {
      setOrderStatus(
        error instanceof Error ? error.message : "Could not create order.",
      );
    }
  }

  function selectSupplier(value: string) {
    const supplier = suppliers?.find((candidate) => candidate._id === value);
    setSupplierId(supplier?._id ?? "");
  }

  function selectTitle(key: number, value: string) {
    const title = titles?.find((candidate) => candidate._id === value);
    setLines((current) =>
      current.map((line) =>
        line.key === key ? { ...line, titleId: title?._id ?? "" } : line,
      ),
    );
  }

  function changeQuantity(key: number, orderedQuantity: number) {
    setLines((current) =>
      current.map((line) =>
        line.key === key ? { ...line, orderedQuantity } : line,
      ),
    );
  }

  function addLine() {
    setLines((current) => [
      ...current,
      { key: nextLineKey, titleId: "", orderedQuantity: 1 },
    ]);
    setNextLineKey((current) => current + 1);
  }

  function removeLine(key: number) {
    setLines((current) => current.filter((line) => line.key !== key));
  }

  if (
    suppliers === undefined ||
    titles === undefined ||
    orders === undefined
  ) {
    return (
      <p className="muted" role="status">
        Loading supplier orders…
      </p>
    );
  }

  const orderableTitles = [...titles].sort(
    (left, right) =>
      Number(right.reorderNeeded) - Number(left.reorderNeeded) ||
      left.title.localeCompare(right.title),
  );

  return (
    <>
      <section className="stack" aria-labelledby="supplier-heading">
        <h2 id="supplier-heading">Suppliers</h2>
        <form className="card stack" onSubmit={saveSupplier}>
          <label>
            Supplier name
            <input required name="name" />
          </label>
          <label>
            Contact
            <input name="contact" />
          </label>
          <button className="button">Save supplier</button>
          <p className="muted" role="status" aria-live="polite">
            {supplierStatus}
          </p>
        </form>
      </section>
      <section className="stack" aria-labelledby="create-order-heading">
        <h2 id="create-order-heading">Create order</h2>
        <form className="card stack" onSubmit={saveOrder}>
          <label>
            Supplier
            <select
              required
              value={supplierId}
              onChange={(event) => selectSupplier(event.target.value)}
            >
              <option value="">Choose a supplier</option>
              {suppliers.map((supplier) => (
                <option key={supplier._id} value={supplier._id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </label>
          {lines.map((line, index) => (
            <div className="row" key={line.key}>
              <label>
                Title for line {index + 1}
                <select
                  required
                  value={line.titleId}
                  onChange={(event) =>
                    selectTitle(line.key, event.target.value)
                  }
                >
                  <option value="">Choose a title</option>
                  {orderableTitles.map((title) => (
                    <option key={title._id} value={title._id}>
                      {title.title}
                      {title.reorderNeeded ? " · reorder needed" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Ordered quantity
                <input
                  required
                  min="1"
                  step="1"
                  type="number"
                  value={line.orderedQuantity}
                  onChange={(event) =>
                    changeQuantity(line.key, Number(event.target.value))
                  }
                />
              </label>
              {lines.length > 1 ? (
                <button
                  className="button"
                  type="button"
                  onClick={() => removeLine(line.key)}
                >
                  Remove line
                </button>
              ) : null}
            </div>
          ))}
          <div className="row">
            <button className="button" type="button" onClick={addLine}>
              Add another title
            </button>
            <button className="button">Create order</button>
          </div>
          <p className="muted" role="status" aria-live="polite">
            {orderStatus}
          </p>
        </form>
      </section>
      <section className="stack" aria-labelledby="orders-heading">
        <h2 id="orders-heading">Orders</h2>
        {orders.length === 0 ? (
          <p className="muted">No supplier orders yet.</p>
        ) : (
          <div className="stack">
            {orders.map((order) => (
              <OrderCard key={order._id} order={order} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
