import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TeacherProfile } from "@/domain/schema";

const account = vi.hoisted(() => ({ firstNames: "" }));
const ws = vi.hoisted(() => ({ profile: null as TeacherProfile | null }));

vi.mock("@/components/AccountGate", () => ({
  useAccount: () => ({ profile: { id: "u1", firstNames: account.firstNames } }),
}));
vi.mock("@/workspace/WorkspaceProvider", () => ({
  useWorkspace: () => ({
    storage: { label: "Cuaderno de Campo" },
    year: 2026,
    yearData: { classrooms: [], students: [] },
    profile: ws.profile,
  }),
}));

import InicioPage from "./page";

const local: TeacherProfile = {
  firstNames: "Rosa María", lastNames: "Quispe", phone: "", region: "", address: "", email: "",
  level: "Inicial", ugel: "", institution: "",
};

beforeEach(() => {
  account.firstNames = "";
  ws.profile = null;
});

describe("Inicio greeting", () => {
  it("uses the account first name", () => {
    account.firstNames = "Ana Lucía";
    render(<InicioPage />);
    expect(screen.getByRole("heading", { name: "¡Hola, Ana!" })).toBeInTheDocument();
  });

  it("falls back to the local profile when the account names are empty (offline)", () => {
    ws.profile = local;
    render(<InicioPage />);
    expect(screen.getByRole("heading", { name: "¡Hola, Rosa!" })).toBeInTheDocument();
  });

  it("says just ¡Hola! when no name is known", () => {
    render(<InicioPage />);
    expect(screen.getByRole("heading", { name: "¡Hola!" })).toBeInTheDocument();
  });
});
