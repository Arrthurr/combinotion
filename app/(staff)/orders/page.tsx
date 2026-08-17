import { OrderEditor } from "@/components/orders/order-editor";

export default function OrdersPage() {
  return (
    <main id="content" className="stack">
      <h1>Supplier orders</h1>
      <p>
        Create one-supplier orders, record cumulative receipts, and keep
        undelivered copies outstanding.
      </p>
      <OrderEditor />
    </main>
  );
}
