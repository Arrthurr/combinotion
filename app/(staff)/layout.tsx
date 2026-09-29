import type { ReactNode } from "react";
import { StaffShell } from "@/components/staff/staff-shell";
import { UnconfiguredStaff } from "@/components/staff/unconfigured-staff";

export default function StaffLayout({ children }: { children: ReactNode }) {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return <UnconfiguredStaff />;
  }

  return <StaffShell>{children}</StaffShell>;
}
