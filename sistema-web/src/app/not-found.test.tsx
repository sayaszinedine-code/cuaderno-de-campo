import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NotFound from "./not-found";

describe("NotFound", () => {
  it("explains in Spanish and links to Inicio", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { name: "No encontramos esta página." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir a Inicio" })).toHaveAttribute("href", "/inicio/");
  });
});
