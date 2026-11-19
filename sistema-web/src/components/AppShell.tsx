"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAccount } from "@/components/AccountGate";
import { useWorkspace } from "@/workspace/WorkspaceProvider";

type NavItem = { label: string; href?: string };

const NAV: NavItem[] = [
  { label: "Inicio", href: "/inicio/" },
  { label: "Cuaderno" },
  { label: "Niños", href: "/ninos/" },
  { label: "Notas" },
  { label: "Unidades" },
  { label: "Asistencia" },
  { label: "Agenda" },
  { label: "Más" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { profile } = useAccount();
  const { year, years, setYear } = useWorkspace();
  const pathname = usePathname();
  const items: NavItem[] = profile.role === "admin" ? [...NAV, { label: "Administración", href: "/admin/" }] : NAV;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <nav
        aria-label="Principal"
        className="card fixed inset-x-0 bottom-0 z-10 flex overflow-x-auto rounded-none border-x-0 border-b-0 md:static md:w-56 md:flex-col md:rounded-none md:border-y-0 md:border-l-0 md:p-3"
      >
        {items.map((item) => {
          const base = "flex shrink-0 flex-col px-3 py-2 text-sm md:rounded-xl md:text-base";
          if (!item.href) {
            return (
              <span key={item.label} aria-disabled="true" className={`${base} text-muted`}>
                {item.label}
                <small className="text-xs">Próximamente</small>
              </span>
            );
          }
          const active = pathname === item.href;
          return (
            <Link
              key={item.label}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`${base} font-medium ${active ? "bg-accent-soft" : "hover:bg-accent-soft"}`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex-1 pb-24 md:pb-0">
        <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8">
          <span className="font-semibold">Cuaderno de Campo</span>
          <div className="flex items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              Año escolar
              <select
                className="field !min-h-9 !w-auto"
                value={year}
                onChange={(e) => void setYear(Number(e.target.value))}
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <Link href="/perfil/" className="underline">
              Mi perfil
            </Link>
          </div>
        </header>
        <main className="px-4 py-4 md:px-8">{children}</main>
      </div>
    </div>
  );
}
