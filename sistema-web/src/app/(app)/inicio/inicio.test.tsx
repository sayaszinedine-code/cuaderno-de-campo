import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TeacherProfile } from "@/domain/schema";

const account = vi.hoisted(() => ({ firstNames: "" }));
const ws = vi.hoisted(() => ({
  profile: null as TeacherProfile | null,
  year: new Date().getFullYear(),
  students: [] as { id: string; classroomId: string; firstNames: string; lastNames: string; active: boolean }[],
}));

vi.mock("@/components/AccountGate", () => ({
  useAccount: () => ({ profile: { id: "u1", firstNames: account.firstNames } }),
}));
vi.mock("@/workspace/WorkspaceProvider", () => ({
  useWorkspace: () => ({
    storage: { label: "Cuaderno de Campo" },
    year: ws.year,
    yearData: { classrooms: [], students: ws.students },
    notes: [],
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
  ws.year = new Date().getFullYear();
  ws.students = [];
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

describe("Inicio neglected warning", () => {
  const kid = { id: "s1", classroomId: "c1", firstNames: "Luz", lastNames: "Paz", active: true };
  it("shows children without recent notes in the current year", () => {
    ws.students = [kid];
    render(<InicioPage />);
    expect(screen.getByText(/sin observaciones en las últimas 2/)).toBeInTheDocument();
  });
  it("hides the warning when another school year is open", () => {
    ws.students = [kid];
    ws.year = new Date().getFullYear() - 1;
    render(<InicioPage />);
    expect(screen.queryByText(/sin observaciones en las últimas 2/)).toBeNull();
  });
});
