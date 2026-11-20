import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const role = vi.hoisted(() => ({ value: "admin" }));
vi.mock("next/navigation", () => ({ usePathname: () => "/inicio/" }));
vi.mock("@/components/AccountGate", () => ({ useAccount: () => ({ profile: { role: role.value } }) }));
vi.mock("@/workspace/WorkspaceProvider", () => ({
  useWorkspace: () => ({ year: 2026, years: [2026], setYear: vi.fn() }),
}));

import { AppShell } from "./AppShell";

describe("AppShell mobile nav", () => {
  it("shows at most 5 top-level items and reaches admin through Más", () => {
    role.value = "admin";
    render(<AppShell>x</AppShell>);
    const nav = screen.getByRole("navigation", { name: "Principal móvil" });
    expect(nav.children.length).toBeLessThanOrEqual(5);
    expect(within(nav).queryByText("Administración")).toBeNull();
    fireEvent.click(within(nav).getByRole("button", { name: "Más" }));
    const menu = screen.getByRole("menu", { name: "Más opciones" });
    expect(within(menu).getByRole("link", { name: "Administración" })).toHaveAttribute("href", expect.stringMatching(/^\/admin\/?$/));
    expect(within(menu).getByRole("link", { name: "Perfil" })).toBeInTheDocument();
    expect(within(menu).getByRole("link", { name: "Mi cuenta" })).toHaveAttribute("href", expect.stringMatching(/^\/cuenta\/?$/));
    expect(within(menu).getByRole("link", { name: "Unidades" })).toHaveAttribute("href", expect.stringMatching(/^\/unidades\/?$/));
    expect(within(menu).getByRole("link", { name: "Asistencia" })).toHaveAttribute("href", expect.stringMatching(/^\/asistencia\/?$/));
  });

  it("keeps the full list on desktop and hides admin for teachers", () => {
    role.value = "teacher";
    render(<AppShell>x</AppShell>);
    const side = screen.getByRole("navigation", { name: "Principal" });
    expect(within(side).getByText("Unidades")).toBeInTheDocument();
    expect(within(side).queryByText("Administración")).toBeNull();
    expect(within(side).getByRole("link", { name: "Perfil" })).toHaveAttribute("href", expect.stringMatching(/^\/perfil\/?$/));
    expect(within(side).getByRole("link", { name: "Carpeta" })).toHaveAttribute("href", expect.stringMatching(/^\/carpeta\/?$/));
    expect(within(side).getByRole("link", { name: "Mi cuenta" })).toHaveAttribute("href", expect.stringMatching(/^\/cuenta\/?$/));
    expect(within(side).queryByText("Más")).toBeNull();
  });
});
