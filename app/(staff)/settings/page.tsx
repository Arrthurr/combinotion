import { OperationsSettings } from "@/components/settings/operations-settings";

export default function SettingsPage() {
  return (
    <main id="content" className="stack">
      <h1>Operations settings</h1>
      <p>
        Set the low-stock threshold, hold public requests closed until launch,
        and approve the Google Sheets feeds. Add staff with
        {" "}
        <code>npx convex run staff:seedStaff</code>
        .
      </p>
      <OperationsSettings />
    </main>
  );
}
