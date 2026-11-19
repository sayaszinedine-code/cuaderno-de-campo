import type { ReactNode } from "react";
import { AccountGate } from "@/components/AccountGate";
import { AccountWorkspace } from "@/workspace/AccountWorkspace";
import { AppShell } from "@/components/AppShell";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AccountGate>
      <AccountWorkspace>
        <AppShell>{children}</AppShell>
      </AccountWorkspace>
    </AccountGate>
  );
}
