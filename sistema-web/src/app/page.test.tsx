import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("Home", () => {
  it("shows the title and a login link", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { name: "Cuaderno de Campo" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Iniciar sesión" })).toHaveAttribute("href", "/login/");
  });

  it("offers to create an account", () => {
    render(<Home />);
    expect(screen.getByRole("link", { name: "Crear una cuenta" })).toHaveAttribute("href", "/registro/");
  });

  it("explains what the app does", () => {
    render(<Home />);
    expect(screen.getAllByRole("listitem").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByRole("link", { name: /privacidad/i })).toHaveAttribute("href", "/privacidad/");
  });

  it("shows no personal name", () => {
    render(<Home />);
    expect(screen.queryByText(/Yosselin/i)).toBeNull();
  });
});
