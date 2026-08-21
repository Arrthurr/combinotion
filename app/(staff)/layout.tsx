import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import type { ReactNode } from "react";
import { UnconfiguredStaff } from "@/components/staff/unconfigured-staff";

const nav = [
  { href: "/books", label: "Books" },
  { href: "/inventory", label: "Inventory" },
  { href: "/orders", label: "Orders" },
  { href: "/requests", label: "Requests" },
  { href: "/visits", label: "Visits" },
  { href: "/views", label: "Views" },
  { href: "/people", label: "People" },
  { href: "/schools", label: "Schools" },
  { href: "/reviews", label: "Reviews" },
  { href: "/intake", label: "Incoming forms" },
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Settings" },
] as const;

export default function StaffLayout({ children }: { children: ReactNode }) {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return <UnconfiguredStaff />;
  }

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
