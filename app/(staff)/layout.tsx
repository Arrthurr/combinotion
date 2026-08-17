import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import type { ReactNode } from "react";

const nav = [
  { href: "/books", label: "Books" },
  { href: "/inventory", label: "Inventory" },
  { href: "/orders", label: "Orders" },
  { href: "/requests", label: "Requests" },
  { href: "/visits", label: "Visits" },
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Settings" },
] as const;

export default function StaffLayout({ children }: { children: ReactNode }) {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return (
      <main id="content" className="stack">
        <h1>Staff authentication is not configured</h1>
        <p>
          Add the Clerk environment values in <code>.env.local</code> before using
          the staff workspace.
        </p>
      </main>
    );
  }

  // Route protection is enforced in middleware.ts via auth.protect().
  // Authenticated users reach this layout; unauthenticated users are redirected.
  return (
    <>
      <header>
        <nav
          className="row"
          aria-label="Staff navigation"
          style={{ padding: "1rem", borderBottom: "1px solid #d9e0e5" }}
        >
          {nav.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
          <span style={{ marginLeft: "auto" }}>
            <UserButton afterSignOutUrl="/" />
          </span>
        </nav>
      </header>
      {children}
    </>
  );
}
