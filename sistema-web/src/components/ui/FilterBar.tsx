"use client";

import { useRef, type ReactNode } from "react";
import { Icon } from "@/components/icons";

export type ActiveFilter = { key: string; label: string; onClear: () => void };

/**
 * Search always visible; the other filters folded behind «Filtros». On phones the panel opens as a
 * bottom sheet, on desktop inline. A native <details> keeps the labelled selects in the page while folded.
 */
export function FilterBar({
  search,
  active,
  onClearAll,
  children,
}: {
  search: ReactNode;
  active: ActiveFilter[];
  onClearAll: () => void;
  children: ReactNode;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  const close = () => details.current?.removeAttribute("open");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">{search}</div>
        <details ref={details} className="filter-bar">
          <summary className="btn-secondary cursor-pointer list-none gap-2">
            <Icon name="filtro" />
            {active.length > 0 ? `Filtros (${active.length})` : "Filtros"}
          </summary>
          <div className="filter-backdrop md:hidden" onClick={close} aria-hidden="true" />
          <div className="filter-panel">
            <div className="grid gap-3 sm:grid-cols-2">{children}</div>
            <div className="mt-4 md:hidden">
              <button type="button" className="btn-primary w-full" onClick={close}>
                Listo
              </button>
            </div>
          </div>
        </details>
      </div>
      {active.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {active.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-label={`Quitar filtro: ${f.label}`}
              className="chip"
              onClick={f.onClear}
            >
              {f.label}
              <Icon name="cerrar" className="size-4" />
            </button>
          ))}
          <button type="button" aria-label="Limpiar filtros" className="text-primary text-sm font-semibold underline" onClick={onClearAll}>
            Limpiar
          </button>
        </div>
      )}
    </div>
  );
}
