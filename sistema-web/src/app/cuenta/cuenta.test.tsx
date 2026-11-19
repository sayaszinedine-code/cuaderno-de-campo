import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/auth/client", () => ({ signOut: vi.fn() }));
vi.mock("@/components/AccountGate", () => ({
  AccountGate: ({ children }: { children: ReactNode }) => <>{children}</>,
  useAccount: () => ({
    refresh: vi.fn(),
    profile: {
      id: "u1", firstNames: "Ana", lastNames: "Paz", email: "a@x.pe", institution: "", ugel: "", region: "",
      status: "suspended", role: "teacher",
    },
  }),
}));

import CuentaPage from "./page";

describe("Cuenta page", () => {
  it("does not send suspended accounts to the gated folder page", () => {
    render(<CuentaPage />);
    expect(
      screen.getByText("Tu cuenta está suspendida. La exportación de tus datos estará disponible pronto."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /carpeta/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeInTheDocument();
  });
});
