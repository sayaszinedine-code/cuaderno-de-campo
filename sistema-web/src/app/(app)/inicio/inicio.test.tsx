import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TeacherProfile } from "@/domain/schema";

const account = vi.hoisted(() => ({ firstNames: "" }));
const ws = vi.hoisted(() => ({
  profile: null as TeacherProfile | null,
  year: new Date().getFullYear(),
  events: [] as { id: string; date: string; title: string; time?: string }[],
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
    agenda: { events: ws.events },
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
  ws.events = [];
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

describe("Inicio upcoming events", () => {
  const iso = (add: number) => {
    const d = new Date();
    d.setDate(d.getDate() + add);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  it("lists up to 5 upcoming events linking to the agenda day", () => {
    ws.events = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ id: `e${i}`, date: iso(i), title: `Evento ${i}` }));
    ws.events.push({ id: "far", date: iso(30), title: "Lejano" });
    render(<InicioPage />);
    expect(screen.getByRole("heading", { name: "Próximos 14 días" })).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Evento 0/ });
    expect(link.getAttribute("href")).toMatch(new RegExp(`^/agenda/?\\?dia=${iso(0)}$`));
    expect(screen.getByRole("link", { name: /Evento 4/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Evento 5/ })).toBeNull();
    expect(screen.queryByText(/Lejano/)).toBeNull();
  });
  it("shows nothing without upcoming events", () => {
    render(<InicioPage />);
    expect(screen.queryByRole("heading", { name: "Próximos 14 días" })).toBeNull();
  });
});
