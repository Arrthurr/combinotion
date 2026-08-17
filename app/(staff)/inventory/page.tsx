import { InventoryReviewList } from "@/components/inventory/inventory-review-list";

export default function InventoryPage() {
  return (
    <main id="content" className="stack">
      <h1>Inventory</h1>
      <p>
        Review low-stock titles, shortage exceptions, and the movement history
        behind each on-hand count.
      </p>
      <InventoryReviewList />
    </main>
  );
}
