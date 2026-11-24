import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { avatarHue, initials, Avatar } from "./Avatar";
import { EmptyState } from "./EmptyState";
import { Fab } from "./Fab";
import { PageHeader } from "./PageHeader";
import { Skeleton } from "./Skeleton";

describe("Avatar", () => {
  it("uses the first and last word initials", () => {
    expect(initials("ana lucía quispe")).toBe("AQ");
    expect(initials("Ana")).toBe("A");
    expect(initials("Ñusta Ávila")).toBe("ÑÁ");
  });

  it("never shows an empty avatar", () => {
    expect(initials("  ")).toBe("?");
    expect(initials("")).toBe("?");
  });

  it("gives the same name the same color", () => {
    const hue = avatarHue("Ana");
    expect(avatarHue("Ana")).toBe(hue);
    expect(hue).toBeGreaterThanOrEqual(0);
    expect(hue).toBeLessThan(360);
  });

  it("is decorative", () => {
    const { container } = render(<Avatar name="Ana Quispe" />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(container.textContent).toBe("AQ");
  });
});

describe("PageHeader", () => {
  it("shows the title, subtitle and action", () => {
    render(<PageHeader title="Cuaderno" subtitle="2 registros" action={<a href="/x/">Nuevo</a>} />);
    expect(screen.getByRole("heading", { level: 1, name: "Cuaderno" })).toBeInTheDocument();
    expect(screen.getByText("2 registros")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Nuevo" })).toBeInTheDocument();
  });
});

describe("Fab", () => {
  it("is a named link to the main action", () => {
    render(<Fab href="/cuaderno/registro/" label="Nuevo registro" />);
    expect(screen.getByRole("link", { name: "Nuevo registro" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/cuaderno\/registro\/?$/),
    );
  });
});

describe("EmptyState", () => {
  it("shows the exact text and the action", () => {
    render(<EmptyState icon="cuaderno" text="Todavía no hay registros." action={<button>Crear</button>} />);
    expect(screen.getByText("Todavía no hay registros.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear" })).toBeInTheDocument();
  });
});

describe("Skeleton", () => {
  it("is hidden from assistive technology", () => {
    const { container } = render(<Skeleton lines={3} />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelectorAll(".skeleton").length).toBe(3);
  });
});
