import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Logo, Wordmark } from "./Logo";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

describe("Logo", () => {
  it("is a decorative, scalable svg", () => {
    const { container } = render(<Logo size={40} />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("width", "40");
  });

  it("the wordmark reads Cuaderno de Campo with a colorful «Campo»", () => {
    const { container } = render(<Wordmark />);
    expect(container.textContent?.replace(/\s+/g, " ").trim()).toBe("Cuaderno de Campo");
    expect(container.querySelectorAll("[data-letter]").length).toBe(5);
  });
});

describe("logo in the app", () => {
  it("landing and account screens use the svg logo, not the old png", async () => {
    const { default: Home } = await import("@/app/page");
    const { AuthCard } = await import("./AuthCard");
    for (const ui of [<Home key="h" />, <AuthCard key="a" title="Iniciar sesión">x</AuthCard>]) {
      const { container, unmount } = render(ui);
      expect(container.querySelector('img[src="/icons/icon-192.png"]')).toBeNull();
      expect(container.querySelector("svg[data-logo]")).not.toBeNull();
      unmount();
    }
    expect(screen.queryByText("x")).toBeNull();
  });
});
