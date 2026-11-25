"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useAccount } from "@/components/AccountGate";
import { Icon, type IconName } from "@/components/icons";
import { sectionColor } from "@/components/sections";
import { ToastProvider } from "@/components/Toast";
import { OfflineBadge } from "@/components/OfflineBadge";
import { InstallButton } from "@/pwa/InstallButton";
import { useWorkspace } from "@/workspace/WorkspaceProvider";

type NavItem = { label: string; href?: string; icon: IconName };

const NAV: NavItem[] = [
  { label: "Inicio", href: "/inicio/", icon: "inicio" },
  { label: "Cuaderno", href: "/cuaderno/", icon: "cuaderno" },
  { label: "Niños", href: "/ninos/", icon: "ninos" },
  { label: "Aulas", href: "/aulas/", icon: "aulas" },
  { label: "Notas", href: "/notas/", icon: "notas" },
  { label: "Unidades", href: "/unidades/", icon: "unidades" },
  { label: "Asistencia", href: "/asistencia/", icon: "asistencia" },
  { label: "Agenda", href: "/agenda/", icon: "agenda" },
  { label: "Reportes", href: "/reportes/", icon: "reportes" },
];

/** Personal pages: on desktop after the main list, on mobile inside «Más». */
const PERSONAL: NavItem[] = [
  { label: "Perfil", href: "/perfil/", icon: "perfil" },
  { label: "Carpeta", href: "/carpeta/", icon: "carpeta" },
  { label: "Mi cuenta", href: "/cuenta/", icon: "cuenta" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { profile } = useAccount();
  const { year, years, setYear, backupWarning } = useWorkspace();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const admin: NavItem[] = profile.role === "admin" ? [{ label: "Administración", href: "/admin/", icon: "admin" }] : [];
  const desktopItems: NavItem[] = [...NAV, ...PERSONAL, ...admin];
  const mobileItems = NAV.filter((i) => ["Inicio", "Cuaderno", "Niños", "Notas"].includes(i.label));
  const moreItems: NavItem[] = [
    ...NAV.filter((i) => ["Aulas", "Unidades", "Asistencia", "Agenda", "Reportes"].includes(i.label)),
    ...PERSONAL,
    ...admin,
  ];

  const firstName = (profile.firstNames ?? "").trim().split(/\s+/)[0] ?? "";
  const greeting = firstName ? `Hola, ${firstName}` : "Hola";

  const renderItem = (item: NavItem, base: string, onNavigate?: () => void) => {
    if (!item.href) {
      return (
        <span key={item.label} aria-disabled="true" className={`${base} text-muted`}>
          <Icon name={item.icon} />
          {item.label}
          <small className="text-xs">Próximamente</small>
        </span>
      );
    }
    const here = pathname.endsWith("/") ? pathname : `${pathname}/`;
    const active = here.startsWith(item.href);
    return (
      <Link
        key={item.label}
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={`${base} sec-${sectionColor(item.href)} font-semibold transition-colors ${
          active ? "bg-[var(--sec-soft)] text-[var(--sec)]" : "hover:bg-[var(--sec-soft)]"
        }`}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-[var(--sec-soft)] text-[var(--sec)]">
          <Icon name={item.icon} className="size-5" />
        </span>
        {item.label}
      </Link>
    );
  };
  const sideBase = "flex items-center gap-3 rounded-xl px-3 py-2";
  const barBase = "flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-xs";
  const logo = (
    // eslint-disable-next-line @next/next/no-img-element -- static export, no image optimizer
    <img src="/icons/icon-192.png" alt="" width={36} height={36} className="size-9 rounded-xl" />
  );

  return (
    <ToastProvider>
      <div className="flex min-h-screen flex-col md:flex-row">
        <nav
          aria-label="Principal"
          className="card sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-1 overflow-y-auto rounded-none border-y-0 border-l-0 p-3 md:flex"
        >
          <div className="mb-3 flex items-center gap-2 px-2 py-1">
            {logo}
            <span className="font-bold leading-tight">Cuaderno de Campo</span>
          </div>
          {desktopItems.map((item) => renderItem(item, sideBase))}
        </nav>
        <nav
          aria-label="Principal móvil"
          className="card fixed inset-x-0 bottom-0 z-10 flex justify-around gap-1 rounded-none border-x-0 border-b-0 px-2 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] md:hidden"
        >
          {mobileItems.map((item) => renderItem(item, barBase))}
          <button
            type="button"
            aria-expanded={moreOpen}
            aria-controls="mas-menu"
            className={`${barBase} font-medium ${moreOpen ? "nav-active" : ""}`}
            onClick={() => setMoreOpen((o) => !o)}
          >
            <Icon name="mas" />
            Más
          </button>
        </nav>
        {moreOpen && (
          <div
            id="mas-menu"
            role="menu"
            aria-label="Más opciones"
            className="card page-enter fixed inset-x-3 bottom-20 z-20 flex flex-col p-2 shadow-xl md:hidden"
          >
            {moreItems.map((item) => renderItem(item, sideBase, () => setMoreOpen(false)))}
          </div>
        )}
        <div className="min-w-0 flex-1 pb-24 md:pb-0">
          <header className="app-header sticky top-0 z-[5] flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8">
            <div className="flex items-center gap-2">
              <span className="md:hidden">{logo}</span>
              <div className="flex flex-col leading-tight">
                <span className="text-lg font-bold">{greeting}</span>
                <span className="text-muted text-sm md:hidden">Cuaderno de Campo</span>
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <InstallButton className="!min-h-10 !px-3 sm:!px-5" />
              <label className="flex items-center gap-2">
                <span className="hidden sm:inline">Año escolar</span>
                <select
                  aria-label="Año escolar"
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
              <Link
                href="/perfil/"
                aria-label="Mi perfil"
                title="Mi perfil"
                className="bg-surface hover:bg-accent-soft flex size-10 items-center justify-center rounded-full border border-border"
              >
                <Icon name="perfil" className="size-6" />
              </Link>
            </div>
          </header>
          <OfflineBadge />
          {backupWarning && (
            <p role="status" className="bg-accent-soft text-foreground mx-4 rounded-xl px-4 py-2 text-sm md:mx-8">
              Haz un respaldo de tus datos. Ve a Carpeta › Respaldos.
            </p>
          )}
          <main key={pathname} className="page-enter isolate px-4 py-4 md:px-8">
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
