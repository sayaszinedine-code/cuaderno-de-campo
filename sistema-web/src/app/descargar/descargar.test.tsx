import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DescargarPage from "./page";

describe("Descargar", () => {
  it("offers the APK with three short steps", () => {
    render(<DescargarPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Instala la app en tu Android" })).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Descargar APK" });
    expect(link).toHaveAttribute("href", "/descargas/cuaderno-de-campo.apk");
    expect(link).toHaveAttribute("download");
    expect(within(screen.getByRole("list", { name: "Pasos" })).getAllByRole("listitem")).toHaveLength(3);
  });
});
