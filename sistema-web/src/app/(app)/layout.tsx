import type { ReactNode } from "react";
import { AccountGate } from "@/components/AccountGate";
import { WorkspaceProvider } from "@/workspace/WorkspaceProvider";
import { AppShell } from "@/components/AppShell";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AccountGate>
      <WorkspaceProvider>
        <AppShell>{children}</AppShell>
      </WorkspaceProvider>
    </AccountGate>
  );
}
