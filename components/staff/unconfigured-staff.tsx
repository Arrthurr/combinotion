"use client";

import { usePathname } from "next/navigation";
import { VisitEditor } from "@/components/visits/visit-editor";

export function UnconfiguredStaff() {
  const pathname = usePathname();
  return (
    <main id="content" className="stack">
      <h1>Staff authentication is not configured</h1>
      <p>
        Add the Clerk environment values in <code>.env.local</code> before
        using the staff workspace.
      </p>
      {pathname.startsWith("/visits") ? <VisitEditor /> : null}
    </main>
  );
}
