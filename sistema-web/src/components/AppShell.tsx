"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useAccount } from "@/components/AccountGate";
import { useWorkspace } from "@/workspace/WorkspaceProvider";

type NavItem = { label: string; href?: string };

const NAV: NavItem[] = [
  { label: "Inicio", href: "/inicio/" },
  { label: "Cuaderno", href: "/cuaderno/" },
  { label: "Niños", href: "/ninos/" },
  { label: "Aulas", href: "/aulas/" },
  { label: "Notas", href: "/notas/" },
  { label: "Unidades", href: "/unidades/" },
  { label: "Asistencia", href: "/asistencia/" },
  { label: "Agenda", href: "/agenda/" },
];

/** Personal pages: on desktop after the main list, on mobile inside «Más». */
const PERSONAL: NavItem[] = [
  { label: "Perfil", href: "/perfil/" },
  { label: "Carpeta", href: "/carpeta/" },
  { label: "Mi cuenta", href: "/cuenta/" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { profile } = useAccount();
  const { year, years, setYear, backupWarning } = useWorkspace();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const admin: NavItem[] = profile.role === "admin" ? [{ label: "Administración", href: "/admin/" }] : [];
  const desktopItems: NavItem[] = [...NAV, ...PERSONAL, ...admin];
  const mobileItems = NAV.filter((i) => ["Inicio", "Cuaderno", "Niños", "Notas"].includes(i.label));
  const moreItems: NavItem[] = [
    ...NAV.filter((i) => ["Aulas", "Unidades", "Asistencia", "Agenda"].includes(i.label)),
    ...PERSONAL,
    ...admin,
  ];

  const renderItem = (item: NavItem, base: string, onNavigate?: () => void) => {
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
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={`${base} font-medium ${active ? "bg-accent-soft" : "hover:bg-accent-soft"}`}
      >
        {item.label}
      </Link>
    );
  };
  const itemBase = "flex shrink-0 flex-col px-3 py-2 text-sm md:rounded-xl md:text-base";

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <nav aria-label="Principal" className="card hidden w-56 flex-col rounded-none border-y-0 border-l-0 p-3 md:flex">
        {desktopItems.map((item) => renderItem(item, itemBase))}
      </nav>
      <nav
        aria-label="Principal móvil"
        className="card fixed inset-x-0 bottom-0 z-10 flex justify-around rounded-none border-x-0 border-b-0 md:hidden"
      >
        {mobileItems.map((item) => renderItem(item, itemBase))}
        <button
          type="button"
          aria-expanded={moreOpen}
          aria-controls="mas-menu"
          className={`${itemBase} font-medium`}
          onClick={() => setMoreOpen((o) => !o)}
        >
          Más
        </button>
      </nav>
      {moreOpen && (
        <div
          id="mas-menu"
          role="menu"
          aria-label="Más opciones"
          className="card fixed inset-x-3 bottom-20 z-20 flex flex-col p-2 md:hidden"
        >
          {moreItems.map((item) => renderItem(item, "flex flex-col rounded-xl px-3 py-2", () => setMoreOpen(false)))}
        </div>
      )}
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
        {backupWarning && (
          <p role="status" className="bg-accent-soft text-foreground mx-4 rounded-xl px-4 py-2 text-sm md:mx-8">
            Haz un respaldo de tus datos. Ve a Carpeta › Respaldos.
          </p>
        )}
        <main className="px-4 py-4 md:px-8">{children}</main>
      </div>
    </div>
  );
}
