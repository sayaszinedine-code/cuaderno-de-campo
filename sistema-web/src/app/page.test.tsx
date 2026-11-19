import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("Home", () => {
  it("shows the title and a login link", () => {
    render(<Home />);
    expect(screen.getByText("Cuaderno de Campo")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Iniciar sesión" })).toHaveAttribute("href", "/login/");
  });
});
