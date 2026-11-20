import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStorage } from "@/storage/memory";
import { agendaPath, yearDataPath } from "@/domain/paths";
import { SCHEMA_VERSION, type AgendaEvent, type YearData } from "@/domain/schema";

const pick = vi.hoisted(() => ({
  restoreStorage: vi.fn(),
  chooseFolder: vi.fn(),
  grantPermission: vi.fn(),
  supportsFolderAccess: vi.fn(() => true),
  openFallbackStorage: vi.fn(),
}));
vi.mock("@/storage/pick", () => pick);
vi.mock("@/components/AccountGate", () => ({
  useAccount: () => ({ refresh: vi.fn(), profile: { id: "u1" } }),
}));

import { WorkspaceProvider, useWorkspace } from "@/workspace/WorkspaceProvider";
import AgendaPage from "./page";

const year = new Date().getFullYear();
let storage: MemoryStorage;

const base = (y = year): YearData => ({
  version: SCHEMA_VERSION,
  schoolYear: y,
  periods: [
    { id: "B1", name: "I Bimestre", start: `${y}-03-01`, end: `${y}-05-15` },
    { id: "B2", name: "II Bimestre", start: `${y}-05-16`, end: `${y}-07-31` },
    { id: "B3", name: "III Bimestre", start: `${y}-08-01`, end: `${y}-10-15` },
    { id: "B4", name: "IV Bimestre", start: `${y}-10-16`, end: `${y}-12-20` },
  ],
  classrooms: [],
  students: [],
});
const ev = (id: string, date: string, title: string, time?: string): AgendaEvent => ({
  id, date, time, title, type: "Reunión", note: "", createdAt: "x", updatedAt: "x",
});

async function seed(events: AgendaEvent[] = [], y = year) {
  await storage.writeTextAtomic(yearDataPath(y), JSON.stringify(base(y)));
  await storage.writeTextAtomic(agendaPath(y), JSON.stringify({ version: SCHEMA_VERSION, schoolYear: y, events }));
}
const saved = async (y = year): Promise<{ events: AgendaEvent[] }> => JSON.parse((await storage.readText(agendaPath(y))) ?? "{}");

beforeEach(() => {
  storage = new MemoryStorage();
  pick.restoreStorage.mockResolvedValue({ status: "ready", storage });
  window.history.pushState({}, "", "/");
});
afterEach(() => cleanup());

const D = `${year}-04-14`;
const open = async (dia?: string) => {
  if (dia) window.history.pushState({}, "", `/agenda/?dia=${dia}`);
  render(<WorkspaceProvider userId="u1"><AgendaPage /></WorkspaceProvider>);
  await screen.findByRole("heading", { name: "Agenda" });
};
const dayBtn = (n: number) => within(screen.getByRole("grid", { name: "Calendario" })).getByRole("button", { name: new RegExp(`^${n}(\\D|$)`) });

describe("Agenda page", () => {
  it("renders a Monday-first calendar with Spanish headers and month title", async () => {
    await seed();
    await open(`${year}-11-20`);
    expect(screen.getByRole("heading", { name: `noviembre ${year}` })).toBeInTheDocument();
    const heads = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(heads).toEqual(["lun", "mar", "mié", "jue", "vie", "sáb", "dom"]);
  });

  it("marks days with events and labels the count", async () => {
    await seed([ev("a", D, "Reunión de padres"), ev("b", D, "Taller"), ev("c", `${year}-04-15`, "Otro")]);
    await open(D);
    expect(within(dayBtn(14)).getByText(/^, 2 eventos$/)).toBeInTheDocument();
    expect(within(dayBtn(15)).getByText(/^, 1 evento$/)).toBeInTheDocument();
    expect(within(dayBtn(16)).queryByText(/evento/)).toBeNull();
  });

  it("takes the selected day from ?dia", async () => {
    await seed([ev("a", D, "Reunión de padres")]);
    await open(D);
    expect(screen.getByRole("heading", { name: `abril ${year}` })).toBeInTheDocument();
    expect(dayBtn(14)).toHaveAttribute("aria-pressed", "true");
    const section = screen.getByRole("region", { name: "Eventos del día" });
    expect(within(section).getByText("Reunión de padres")).toBeInTheDocument();
  });

  it("ignores a ?dia outside the open year", async () => {
    await seed();
    await open(`${year - 1}-04-14`);
    expect(screen.getByRole("heading", { name: new RegExp(`^[a-zé]+ ${year}$`) })).toBeInTheDocument();
  });

  it("navigates between months and back to today", async () => {
    await seed();
    await open(D);
    fireEvent.click(screen.getByRole("button", { name: "Mes siguiente ›" }));
    expect(screen.getByRole("heading", { name: `mayo ${year}` })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "‹ Mes anterior" }));
    fireEvent.click(screen.getByRole("button", { name: "‹ Mes anterior" }));
    expect(screen.getByRole("heading", { name: `marzo ${year}` })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hoy" }));
    const m = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"][new Date().getMonth()];
    expect(screen.getByRole("heading", { name: `${m} ${year}` })).toBeInTheDocument();
  });

  it("adds an event", async () => {
    await seed();
    await open(D);
    fireEvent.click(screen.getByRole("button", { name: "Agregar evento" }));
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Reunión de padres" } });
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "Fecha cívica" } });
    fireEvent.change(screen.getByLabelText("Hora"), { target: { value: "09:30" } });
    fireEvent.change(screen.getByLabelText("Nota"), { target: { value: "Traer lista" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(async () => expect((await saved()).events).toHaveLength(1));
    const e = (await saved()).events[0];
    expect(e).toMatchObject({ date: D, title: "Reunión de padres", type: "Fecha cívica", time: "09:30", note: "Traer lista" });
    expect(await screen.findByText("Reunión de padres")).toBeInTheDocument();
    expect(screen.queryByLabelText("Título")).toBeNull();
  });

  it("validates the title", async () => {
    await seed();
    await open(D);
    fireEvent.click(screen.getByRole("button", { name: "Agregar evento" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("Escribe un título.")).toBeInTheDocument();
    expect((await saved()).events).toEqual([]);
  });

  it("edits an event", async () => {
    await seed([ev("a", D, "Reunión")]);
    await open(D);
    fireEvent.click(screen.getByRole("button", { name: "Editar Reunión" }));
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Reunión con UGEL" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(async () => expect((await saved()).events[0].title).toBe("Reunión con UGEL"));
    expect((await saved()).events).toHaveLength(1);
  });

  it("deletes only after confirming", async () => {
    await seed([ev("a", D, "Reunión")]);
    await open(D);
    fireEvent.click(screen.getByRole("button", { name: "Eliminar Reunión" }));
    expect((await saved()).events).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect((await saved()).events).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Eliminar Reunión" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));
    await waitFor(async () => expect((await saved()).events).toEqual([]));
  });

  it("keeps the form open and warns when the save fails", async () => {
    await seed();
    await open(D);
    fireEvent.click(screen.getByRole("button", { name: "Agregar evento" }));
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Reunión" } });
    vi.spyOn(storage, "writeTextAtomic").mockRejectedValue(new Error("disk"));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("No se guardó. Inténtalo de nuevo.")).toBeInTheDocument();
    expect(screen.getByLabelText("Título")).toHaveValue("Reunión");
  });

  it("does not confirm a failed delete", async () => {
    await seed([ev("a", D, "Reunión")]);
    await open(D);
    fireEvent.click(screen.getByRole("button", { name: "Eliminar Reunión" }));
    vi.spyOn(storage, "writeTextAtomic").mockRejectedValue(new Error("disk"));
    fireEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));
    expect(await screen.findByText("No se guardó. Inténtalo de nuevo.")).toBeInTheDocument();
    expect(screen.getAllByText("Reunión").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Editar Reunión" })).toBeInTheDocument();
  });

  it("refuses a date outside the open year", async () => {
    await seed();
    await open(D);
    fireEvent.click(screen.getByRole("button", { name: "Agregar evento" }));
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Reunión" } });
    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: `${year - 1}-04-14` } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("La fecha no pertenece al año abierto.")).toBeInTheDocument();
    expect((await saved()).events).toEqual([]);
  });

  it("lists upcoming activities", async () => {
    const today = new Date();
    const iso = `${year}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    await seed([ev("a", iso, "Hoy mismo"), ev("b", `${year - 1}-01-01`, "Viejo")]);
    await open();
    const list = screen.getByRole("region", { name: "Próximas actividades" });
    expect(within(list).getByText(/Hoy mismo/)).toBeInTheDocument();
  });

  it("follows the year switched to and closes the form", async () => {
    await seed();
    await seed([], year - 1);
    const Switch = () => {
      const ws = useWorkspace();
      return (
        <>
          <button onClick={() => void ws.setYear(year - 1)}>cambiar año</button>
          <output aria-label="año abierto">{ws.year}</output>
        </>
      );
    };
    render(<WorkspaceProvider userId="u1"><Switch /><AgendaPage /></WorkspaceProvider>);
    await screen.findByRole("heading", { name: "Agenda" });
    fireEvent.click(screen.getByRole("button", { name: "Agregar evento" }));
    fireEvent.click(screen.getByRole("button", { name: "cambiar año" }));
    await waitFor(() => expect(screen.getByLabelText("año abierto")).toHaveTextContent(String(year - 1)));
    expect(screen.getByRole("heading", { name: new RegExp(`^[a-zé]+ ${year - 1}$`) })).toBeInTheDocument();
    expect(screen.queryByLabelText("Título")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Agregar evento" }));
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Antes" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(async () => expect((await saved(year - 1)).events).toHaveLength(1));
    expect((await saved()).events).toEqual([]);
  });
});
