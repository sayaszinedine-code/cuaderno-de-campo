import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getPerformances } from "@/curriculum";
import type { Classroom, SelectedPerformance } from "@/domain/schema";
import { PerformancePicker } from "./PerformancePicker";

const classroom = (bands: Classroom["bands"]): Classroom => ({
  id: "c1", name: "Girasoles", cycle: "II", bands, disabledCompetencyIds: [], cycleIGrading: "descriptive",
});

function setup(over: { bands?: Classroom["bands"]; selected?: SelectedPerformance[]; competencyId?: string } = {}) {
  const onChange = vi.fn();
  render(
    <PerformancePicker
      classroom={classroom(over.bands ?? ["4y"])}
      students={[]}
      competencyId={over.competencyId ?? "comunica-oralmente"}
      date="2026-06-10"
      schoolYear={2026}
      selected={over.selected ?? []}
      onChange={onChange}
    />,
  );
  return onChange;
}

describe("PerformancePicker", () => {
  it("lists the default band's desempeños as checkboxes and toggles one", () => {
    const onChange = setup();
    const first = getPerformances("comunica-oralmente", "4y")[0];
    fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(first.text.slice(0, 20)) }));
    expect(onChange).toHaveBeenCalledWith([{ competencyId: "comunica-oralmente", band: "4y", text: first.text }]);
  });

  it("unchecks a selected desempeño", () => {
    const first = getPerformances("comunica-oralmente", "4y")[0];
    const onChange = setup({ selected: [{ competencyId: "comunica-oralmente", band: "4y", text: first.text }] });
    fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(first.text.slice(0, 20)) }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("switching the reference age shows that band's list and keeps other bands' selections", () => {
    const four = getPerformances("comunica-oralmente", "4y")[0];
    const five = getPerformances("comunica-oralmente", "5y")[0];
    const onChange = setup({
      bands: ["4y", "5y"],
      selected: [{ competencyId: "comunica-oralmente", band: "4y", text: four.text }],
    });
    fireEvent.change(screen.getByLabelText("Edad de referencia"), { target: { value: "5y" } });
    fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(five.text.slice(0, 20)) }));
    expect(onChange).toHaveBeenCalledWith([
      { competencyId: "comunica-oralmente", band: "4y", text: four.text },
      { competencyId: "comunica-oralmente", band: "5y", text: five.text },
    ]);
  });

  it("says so when the competency has no desempeños for these ages", () => {
    setup({ bands: ["3y"], competencyId: "no-existe" });
    expect(screen.getByText("No hay desempeños registrados para esta competencia en estas edades.")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});
