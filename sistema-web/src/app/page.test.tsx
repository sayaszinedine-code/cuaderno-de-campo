import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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

describe("Home colors", () => {
  it("each feature card has its own section color", () => {
    render(<Home />);
    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => [...li.classList].find((c) => c.startsWith("sec-")))).toEqual([
      "sec-rosa",
      "sec-naranja",
      "sec-lila",
      "sec-lima",
    ]);
  });
});

describe("Home Android download", () => {
  it("links to the Android download", () => {
    render(<Home />);
    expect(screen.getByRole("link", { name: /Descargar para Android/ })).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/descargar\/?$/),
    );
  });

  it("hides the download inside the Android app", async () => {
    const spy = vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 CuadernoDeCampoApp");
    render(<Home />);
    await waitFor(() => expect(screen.queryByRole("link", { name: /Descargar para Android/ })).toBeNull());
    spy.mockRestore();
  });
});
