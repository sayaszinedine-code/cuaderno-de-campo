"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { sectionColor } from "@/components/sections";

/** Common top of every screen: title with the section's color bar, optional subtitle and the main action. */
export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  const color = sectionColor(usePathname() ?? "/");
  return (
    <div className={`sec-${color} flex flex-wrap items-end justify-between gap-3`}>
      <div className="flex min-w-0 items-stretch gap-3">
        <span aria-hidden="true" className="w-1.5 shrink-0 rounded-full bg-[var(--sec)]" />
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold md:text-3xl">{title}</h1>
          {subtitle && <p className="text-muted text-sm">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}
