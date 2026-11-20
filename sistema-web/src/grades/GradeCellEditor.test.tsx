import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GradeCellEditor } from "./GradeCellEditor";

function setup(initial = { level: undefined as undefined | "A", conclusion: "base" }) {
  const onClose = vi.fn();
  render(
    <GradeCellEditor
      studentName="Luz"
      competencyName="Comp"
      scale
      initial={initial}
      mobile={false}
      evidence={null}
      onSave={async () => true}
      onClose={onClose}
    />,
  );
  return { onClose };
}

const backdrop = () => document.querySelector<HTMLElement>("div.fixed.inset-0")!;

describe("GradeCellEditor discard guard", () => {
  it("closes on backdrop and Escape when nothing changed", () => {
    const { onClose } = setup();
    fireEvent.click(backdrop());
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("asks before discarding unsaved changes (backdrop)", () => {
    const { onClose } = setup();
    fireEvent.change(screen.getByLabelText("Conclusión descriptiva"), { target: { value: "otro" } });
    fireEvent.click(backdrop());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("¿Descartar los cambios?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Seguir editando" }));
    expect(screen.queryByText("¿Descartar los cambios?")).toBeNull();
    expect(screen.getByLabelText("Conclusión descriptiva")).toHaveValue("otro");
    fireEvent.click(backdrop());
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("asks before discarding on Escape after a level change", () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByLabelText(/^AD/));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("¿Descartar los cambios?")).toBeInTheDocument();
  });
});
