import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FilterBar, type ActiveFilter } from "./FilterBar";

function setup(active: ActiveFilter[] = [], onClearAll = vi.fn()) {
  render(
    <FilterBar search={<input aria-label="Buscar" />} active={active} onClearAll={onClearAll}>
      <label>
        Tipo
        <select>
          <option value="">Todos</option>
        </select>
      </label>
    </FilterBar>,
  );
  return onClearAll;
}

describe("FilterBar", () => {
  it("keeps the search visible and the folded selects reachable by label", () => {
    setup();
    expect(screen.getByLabelText("Buscar")).toBeInTheDocument();
    expect(screen.getByLabelText("Tipo")).toBeInTheDocument();
  });

  it("shows how many filters are active", () => {
    setup([
      { key: "a", label: "Logro", onClear: vi.fn() },
      { key: "b", label: "B2", onClear: vi.fn() },
    ]);
    expect(screen.getByText("Filtros (2)")).toBeInTheDocument();
  });

  it("a chip clears only its own filter", () => {
    const a = vi.fn();
    const b = vi.fn();
    setup([
      { key: "a", label: "Logro", onClear: a },
      { key: "b", label: "B2", onClear: b },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Quitar filtro: Logro" }));
    expect(a).toHaveBeenCalledOnce();
    expect(b).not.toHaveBeenCalled();
  });

  it("Limpiar clears every filter", () => {
    const onClearAll = setup([{ key: "a", label: "Logro", onClear: vi.fn() }]);
    fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    expect(onClearAll).toHaveBeenCalledOnce();
  });

  it("shows no chips and no Limpiar when nothing is active", () => {
    setup();
    expect(screen.getByText("Filtros")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Quitar filtro/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Limpiar filtros" })).toBeNull();
  });

  it("Escape closes the open panel and returns focus to Filtros", () => {
    setup();
    const summary = screen.getByText("Filtros").closest("summary")!;
    const details = summary.parentElement as HTMLDetailsElement;
    details.open = true;
    fireEvent.keyDown(screen.getByLabelText("Tipo"), { key: "Escape" });
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(summary);
  });
});
