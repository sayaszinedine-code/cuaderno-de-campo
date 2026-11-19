"use client";

import type { ReactNode } from "react";
import { useAccount } from "@/components/AccountGate";
import { WorkspaceProvider } from "./WorkspaceProvider";

/** Binds the workspace (remembered folder, browser storage) to the signed-in account. */
export function AccountWorkspace({ children }: { children: ReactNode }) {
  const { profile } = useAccount();
  // Keyed so switching accounts never reuses the previous account's in-memory workspace.
  return (
    <WorkspaceProvider key={profile.id} userId={profile.id}>
      {children}
    </WorkspaceProvider>
  );
}
