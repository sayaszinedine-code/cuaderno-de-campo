import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION, type AgendaEvent, type AgendaFile } from "./schema";
import { eventsOn, newEvent, removeEvent, upcoming, upsertEvent, validateEvent } from "./agenda";

const ev = (id: string, date: string, time?: string, title = "T"): AgendaEvent => ({
  id, date, time, title, type: "Reunión", note: "", createdAt: "x", updatedAt: "x",
});
const file = (events: AgendaEvent[]): AgendaFile => ({ version: SCHEMA_VERSION, schoolYear: 2026, events });

describe("agenda domain", () => {
  it("newEvent builds an empty event on the date", () => {
    const e = newEvent("2026-11-20", () => "id1", new Date("2026-11-20T10:00:00Z"));
    expect(e).toMatchObject({ id: "id1", date: "2026-11-20", title: "", type: "Reunión", note: "" });
    expect(e.time).toBeUndefined();
  });

  it("validateEvent", () => {
    expect(validateEvent(ev("a", "2026-11-20", undefined, "  "))).toBe("Escribe un título.");
    expect(validateEvent(ev("a", "", undefined, "Hola"))).toBe("Elige una fecha.");
    expect(validateEvent(ev("a", "2026-02-31", undefined, "Hola"))).toBe("Elige una fecha.");
    expect(validateEvent(ev("a", "2026-11-20", "25:00", "Hola"))).toBe("La hora no es válida.");
    expect(validateEvent(ev("a", "2026-11-20", "08:30", "Hola"))).toBeNull();
    expect(validateEvent(ev("a", "2026-11-20", undefined, "Hola"))).toBeNull();
  });

  it("upsertEvent adds, replaces by id and collapses duplicates", () => {
    const added = upsertEvent(file([]), ev("a", "2026-11-20"), new Date("2026-11-20T10:00:00Z"));
    expect(added.events).toHaveLength(1);
    expect(added.events[0].updatedAt).toBe("2026-11-20T10:00:00.000Z");
    const dup = file([ev("a", "2026-11-20"), ev("b", "2026-11-21"), ev("a", "2026-11-22")]);
    const out = upsertEvent(dup, ev("a", "2026-12-01", undefined, "Nuevo"));
    expect(out.events.filter((e) => e.id === "a")).toHaveLength(1);
    expect(out.events.find((e) => e.id === "a")?.title).toBe("Nuevo");
    expect(out.events).toHaveLength(2);
  });

  it("removeEvent drops every event with the id", () => {
    expect(removeEvent(file([ev("a", "2026-11-20"), ev("b", "2026-11-20")]), "a").events.map((e) => e.id)).toEqual(["b"]);
  });

  it("eventsOn sorts by time, untimed first", () => {
    const f = file([ev("a", "2026-11-20", "10:00"), ev("b", "2026-11-20"), ev("c", "2026-11-20", "08:00"), ev("d", "2026-11-21")]);
    expect(eventsOn(f, "2026-11-20").map((e) => e.id)).toEqual(["b", "c", "a"]);
  });

  it("upcoming covers today through today+days-1 ordered by date and time", () => {
    const f = file([
      ev("past", "2026-11-19"), ev("late", "2026-11-22", "09:00"), ev("today", "2026-11-20", "15:00"),
      ev("early", "2026-11-22", "08:00"), ev("edge", "2026-12-03"), ev("out", "2026-12-04"),
    ]);
    expect(upcoming(f, "2026-11-20").map((e) => e.id)).toEqual(["today", "early", "late", "edge"]);
    expect(upcoming(f, "2026-11-20", 3).map((e) => e.id)).toEqual(["today", "early", "late"]);
  });
});
