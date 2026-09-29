"use client";

import { UserButton } from "@clerk/nextjs";
import {
  BarChart3,
  BookOpen,
  Boxes,
  Building2,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Inbox,
  LayoutDashboard,
  Menu,
  PackageCheck,
  Settings,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

type NavGroup = {
  label: string;
  items: readonly { href: Route; label: string; icon: LucideIcon }[];
};

const navGroups: readonly NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { href: "/books", label: "Books", icon: BookOpen },
      { href: "/inventory", label: "Inventory", icon: Boxes },
      { href: "/orders", label: "Orders", icon: PackageCheck },
      { href: "/requests", label: "Requests", icon: ClipboardList },
      { href: "/visits", label: "Visits", icon: CalendarDays },
      { href: "/views", label: "Views", icon: LayoutDashboard },
    ],
  },
  {
    label: "Directory",
    items: [
      { href: "/people", label: "People", icon: Users },
      { href: "/schools", label: "Schools", icon: Building2 },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/reviews", label: "Reviews", icon: ClipboardCheck },
      { href: "/intake", label: "Incoming forms", icon: Inbox },
      { href: "/reports", label: "Reports", icon: BarChart3 },
    ],
  },
];

function Brand() {
  return (
    <Link className="brand" href="/books" aria-label="Joy for Books operations home">
      <span className="brand-mark" aria-hidden="true">
        <BookOpen size={21} strokeWidth={2.2} />
      </span>
      <span>
        <strong>Joy for Books</strong>
        <small>Operations</small>
      </span>
    </Link>
  );
}

export function StaffShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const currentItem = navGroups
    .flatMap((group) => group.items)
    .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));

  return (
    <div className="staff-shell">
      <header className="mobile-header">
        <Brand />
        <button
          className="icon-button"
          type="button"
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>
      <aside className={`sidebar${menuOpen ? " sidebar-open" : ""}`}>
        <Brand />
        <nav aria-label="Staff navigation">
          {navGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <p>{group.label}</p>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={active ? "active" : undefined}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMenuOpen(false)}
                  >
                    <Icon size={18} strokeWidth={1.9} aria-hidden="true" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <Link
            href="/settings"
            className={pathname.startsWith("/settings") ? "active" : undefined}
            aria-current={pathname.startsWith("/settings") ? "page" : undefined}
          >
            <Settings size={18} strokeWidth={1.9} aria-hidden="true" />
            Settings
          </Link>
          <div className="account-row">
            <UserButton afterSignOutUrl="/" />
            <span>
              <strong>Staff account</strong>
              <small>Joy for Books</small>
            </span>
          </div>
        </div>
      </aside>
      {menuOpen ? (
        <button
          className="sidebar-scrim"
          type="button"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}
      <div className="staff-content">
        <div className="staff-topbar">
          <div>
            <span>Operations</span>
            <strong>{currentItem?.label ?? "Settings"}</strong>
          </div>
          <p>
            <span className="status-dot" aria-hidden="true" /> All systems ready
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
