import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const role = vi.hoisted(() => ({ value: "admin", warning: false, firstNames: "Ana Lucía" }));
vi.mock("next/navigation", () => ({ usePathname: () => "/inicio/" }));
vi.mock("@/components/AccountGate", () => ({ useAccount: () => ({ profile: { role: role.value, firstNames: role.firstNames } }) }));
vi.mock("@/workspace/WorkspaceProvider", () => ({
  useWorkspace: () => ({ year: 2026, years: [2026], setYear: vi.fn(), backupWarning: role.warning }),
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
    expect(within(menu).getByRole("link", { name: "Agenda" })).toHaveAttribute("href", expect.stringMatching(/^\/agenda\/?$/));
    expect(within(menu).getByRole("link", { name: "Asistencia" })).toHaveAttribute("href", expect.stringMatching(/^\/asistencia\/?$/));
    expect(within(menu).getByRole("link", { name: "Reportes" })).toHaveAttribute("href", expect.stringMatching(/^\/reportes\/?$/));
  });

  it("keeps the full list on desktop and hides admin for teachers", () => {
    role.value = "teacher";
    render(<AppShell>x</AppShell>);
    const side = screen.getByRole("navigation", { name: "Principal" });
    expect(within(side).getByText("Unidades")).toBeInTheDocument();
    expect(within(side).getByRole("link", { name: "Reportes" })).toHaveAttribute("href", expect.stringMatching(/^\/reportes\/?$/));
    expect(within(side).queryByText("Administración")).toBeNull();
    expect(within(side).getByRole("link", { name: "Perfil" })).toHaveAttribute("href", expect.stringMatching(/^\/perfil\/?$/));
    expect(within(side).getByRole("link", { name: "Carpeta" })).toHaveAttribute("href", expect.stringMatching(/^\/carpeta\/?$/));
    expect(within(side).getByRole("link", { name: "Mi cuenta" })).toHaveAttribute("href", expect.stringMatching(/^\/cuenta\/?$/));
    expect(within(side).queryByText("Más")).toBeNull();
  });
});

describe("AppShell backup banner", () => {
  it("shows the banner only when there is a backup warning", () => {
    role.value = "teacher";
    role.warning = false;
    const { unmount } = render(<AppShell>x</AppShell>);
    expect(screen.queryByText("Haz un respaldo de tus datos. Ve a Carpeta › Respaldos.")).toBeNull();
    unmount();
    role.warning = true;
    render(<AppShell>x</AppShell>);
    expect(screen.getByText("Haz un respaldo de tus datos. Ve a Carpeta › Respaldos.")).toBeInTheDocument();
    role.warning = false;
  });
});

describe("AppShell offline badge", () => {
  it("tells the teacher her data stays on her computer while offline", () => {
    role.value = "teacher";
    const spy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(<AppShell>x</AppShell>);
    expect(screen.getByText("Sin conexión: tus datos se guardan en tu computadora.")).toBeInTheDocument();
    spy.mockRestore();
  });
});

describe("AppShell app feel", () => {
  it("greets the signed-in teacher by first name", () => {
    role.value = "teacher";
    role.firstNames = "Ana Lucía";
    render(<AppShell>x</AppShell>);
    expect(within(screen.getByRole("banner")).getByText("Hola, Ana")).toBeInTheDocument();
  });

  it("greets without a name when the profile has none", () => {
    role.value = "teacher";
    role.firstNames = "";
    render(<AppShell>x</AppShell>);
    expect(within(screen.getByRole("banner")).getByText("Hola")).toBeInTheDocument();
    expect(screen.queryByText(/Hola,/)).toBeNull();
    role.firstNames = "Ana Lucía";
  });

  it("every nav link shows an icon", () => {
    role.value = "admin";
    render(<AppShell>x</AppShell>);
    const links = within(screen.getByRole("navigation", { name: "Principal" })).getAllByRole("link");
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link.querySelector("svg")).not.toBeNull();
  });

  it("keeps the profile shortcut reachable from the header", () => {
    role.value = "teacher";
    render(<AppShell>x</AppShell>);
    expect(within(screen.getByRole("banner")).getByRole("link", { name: "Mi perfil" })).toHaveAttribute("href", expect.stringMatching(/^\/perfil\/?$/));
  });
});

describe("AppShell layering", () => {
  it("keeps page content (e.g. sticky table columns) below the sticky header", () => {
    role.value = "teacher";
    render(<AppShell>x</AppShell>);
    expect(screen.getByRole("main")).toHaveClass("isolate");
  });
});
