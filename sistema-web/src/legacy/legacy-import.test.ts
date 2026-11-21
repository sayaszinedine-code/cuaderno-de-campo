import { describe, expect, it } from "vitest";
import { MemoryStorage } from "@/storage/memory";
import type { AgendaFile, AttendanceFile, Classroom, NotesFile, TeacherProfile, YearData } from "@/domain/schema";
import { defaultPeriods } from "@/domain/workspace-repo";
import { markOf } from "@/domain/attendance";
import {
  LEGACY_INVALID,
  applyLegacyImport,
  parseLegacy,
  planLegacyImport,
  splitLegacyName,
  type ImportDeps,
  type LegacyData,
} from "./legacy-import";

const YEAR = 2026;
// 1x1 transparent PNG.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

/** Built from the shapes of `cargarEjemplo` / `respaldo` in cuaderno-app/www/index.html. */
function legacyFixture() {
  return {
    perfil: { nombre: "Rosa Elena Quispe Mamani", ie: "IEI N.° 123", aula: "Aula Girasoles · 4 años", ugel: "Puno" },
    ninos: [
      { id: "n1", nombre: "Valentina Quispe Huamán", nac: "2021-04-12", apo: "Rosa Huamán", tel: "987654321", notas: "(Ejemplo)" },
      { id: "n2", nombre: "Mateo Flores Ccori", nac: "2021-02-03", apo: "Luis Flores", tel: "", notas: "" },
      { id: "n3", nombre: "Thiago", nac: "", apo: "", tel: "", notas: "" },
    ],
    registros: {
      r1: {
        id: "r1", fecha: "2026-11-18", hora: "09:30", momento: "Juego libre en sectores", tipo: "obs",
        area: "Matematica", comp: "resuelve problemas de CANTIDAD", nivel: "A", ninos: ["n2"],
        hecho: "Agrupó los bloques por color.", interpretacion: "Compara cantidades.", acciones: "Ofrecer más material.",
        fotos: [{ src: PNG }, { fid: "local-only" }],
      },
      r2: {
        id: "r2", fecha: "2026-11-17", hora: "10:00", momento: "Experiencia de aprendizaje", tipo: "logro",
        area: "Comunicación", comp: "Se comunica oralmente en su lengua materna", ninos: ["n1", "n2"],
        hecho: "Contaron cómo sembraron una planta.", interpretacion: "", acciones: "", fotos: [],
      },
      r3: {
        id: "r3", fecha: "2026-11-16", momento: "Taller", tipo: "anec", area: "Arte", comp: "Competencia inventada",
        ninos: ["n1"], hecho: "Pintó con témperas.", interpretacion: "", acciones: "", fotos: [],
      },
      r4: {
        id: "r4", fecha: "2025-10-01", momento: "Taller", tipo: "obs", area: "", comp: "", ninos: ["n1"],
        hecho: "Registro del año pasado.", interpretacion: "", acciones: "", fotos: [],
      },
    },
    asis: {
      "2026-11": { "2026-11-18": { n1: "P", n2: "T", ghost: "P" }, "2026-11-17": { n1: "F", n2: "X" } },
      "2025-12": { "2025-12-01": { n1: "P" } },
    },
    agenda: [
      { id: "a1", fecha: "2026-11-22", hora: "15:00", titulo: "Reunión con familias", tipo: "reunion", nota: "Aula" },
      { id: "a2", fecha: "2026-11-29", hora: "", titulo: "Paseo", tipo: "Salida", nota: "" },
      { id: "a3", fecha: "2025-11-29", hora: "", titulo: "Viejo", tipo: "Reunión", nota: "" },
    ],
  };
}

const classroomII: Classroom = {
  id: "c2",
  name: "Girasoles",
  cycle: "II",
  bands: ["4y"],
  disabledCompetencyIds: [],
  cycleIGrading: "descriptive",
};
const classroomI: Classroom = { ...classroomII, id: "c1", name: "Pollitos", cycle: "I", bands: ["24m"] };

type State = {
  yearData: YearData;
  notes: NotesFile;
  attendance: AttendanceFile;
  agenda: AgendaFile;
  profile: TeacherProfile | null;
};

function initialState(classrooms: Classroom[] = [classroomII]): State {
  return {
    yearData: { version: 1, schoolYear: YEAR, periods: defaultPeriods(YEAR), classrooms, students: [] },
    notes: { version: 1, schoolYear: YEAR, notes: [] },
    attendance: { version: 1, schoolYear: YEAR, days: [] },
    agenda: { version: 1, schoolYear: YEAR, events: [] },
    profile: null,
  };
}

/** Mimics the provider: each update applies `fn` to the latest document and resolves true, or false on failure. */
function fakeWorkspace(state: State, fail: Partial<Record<"update" | "notes" | "attendance" | "agenda", boolean>> = {}) {
  const calls: string[] = [];
  const run = <D,>(key: keyof typeof fail, get: () => D, set: (d: D) => void) => async (fn: (d: D) => D, opts?: { year?: number }) => {
    calls.push(key);
    if (fail[key]) return false;
    if (opts?.year !== undefined && opts.year !== YEAR) return false;
    try {
      set(fn(get()));
      return true;
    } catch {
      return false;
    }
  };
  const storage = new MemoryStorage();
  const deps: ImportDeps = {
    storage,
    update: run("update", () => state.yearData, (d) => (state.yearData = d)),
    updateNotes: run("notes", () => state.notes, (d) => (state.notes = d)),
    updateAttendance: run("attendance", () => state.attendance, (d) => (state.attendance = d)),
    updateAgenda: run("agenda", () => state.agenda, (d) => (state.agenda = d)),
    saveProfile: async (p) => {
      state.profile = p;
    },
  };
  return { deps, calls, storage };
}

function target(state: State, classroom: Classroom = classroomII) {
  return {
    classroom,
    year: YEAR,
    yearData: state.yearData,
    notes: state.notes.notes,
    attendance: state.attendance,
    agenda: state.agenda,
    profile: state.profile,
  };
}

function parsed(json: unknown = legacyFixture()): LegacyData {
  const d = parseLegacy(json);
  if ("error" in d) throw new Error(d.error);
  return d;
}

describe("parseLegacy", () => {
  it("accepts the legacy backup and defaults missing parts", () => {
    const d = parsed({ ninos: [{ id: "n1", nombre: "Ana Lucía Pérez Ríos" }], registros: {} });
    expect(d.ninos).toHaveLength(1);
    expect(d.agenda).toEqual([]);
    expect(d.asis).toEqual({});
    expect(d.registros).toEqual([]);
  });

  it.each([null, 42, "x", {}, { ninos: {}, registros: {} }, { ninos: [], registros: null }, { ninos: [] }])(
    "rejects %j with the Spanish message",
    (json) => {
      expect(parseLegacy(json)).toEqual({ error: LEGACY_INVALID });
    },
  );
});

describe("splitLegacyName", () => {
  it("puts the last two words in the surnames", () => {
    expect(splitLegacyName("Valentina Quispe Huamán")).toEqual({ firstNames: "Valentina", lastNames: "Quispe Huamán" });
    expect(splitLegacyName("  Ana  Lucía Pérez Ríos ")).toEqual({ firstNames: "Ana Lucía", lastNames: "Pérez Ríos" });
  });

  it("keeps a single word as first names", () => {
    expect(splitLegacyName("Thiago")).toEqual({ firstNames: "Thiago", lastNames: "" });
  });
});

describe("planLegacyImport", () => {
  it("counts what will be added", () => {
    const state = initialState();
    const plan = planLegacyImport(parsed(), target(state));
    expect(plan).toEqual({
      students: 3,
      notes: 3,
      photos: 1,
      attendanceDays: 2,
      events: 2,
      alreadyImported: false,
      unmatchedCompetencies: ["Competencia inventada"],
      unmatchedNotes: 1,
      otherYearNotes: 1,
    });
  });
});

describe("applyLegacyImport", () => {
  it("imports children, notes with photos, attendance, agenda and the profile", async () => {
    const state = initialState();
    const { deps, calls, storage } = fakeWorkspace(state);
    const progress: [number, number][] = [];
    const result = await applyLegacyImport(parsed(), target(state), { ...deps, onPhoto: (i, n) => progress.push([i, n]) });

    expect(calls).toEqual(["update", "notes", "attendance", "agenda"]);
    expect(result.students).toBe(3);

    const [vale, mateo, thiago] = state.yearData.students;
    expect(vale).toMatchObject({
      classroomId: "c2",
      firstNames: "Valentina",
      lastNames: "Quispe Huamán",
      birthDate: "2021-04-12",
      guardian: "Rosa Huamán",
      guardianPhone: "987654321",
      healthNotes: "(Ejemplo)",
      active: true,
      importedFrom: "n1",
    });
    expect(mateo.guardianPhone).toBeUndefined();
    expect(thiago).toMatchObject({ firstNames: "Thiago", lastNames: "", importedFrom: "n3" });
    expect(thiago.birthDate).toBeUndefined();

    const notes = state.notes.notes;
    expect(notes).toHaveLength(3);
    const r1 = notes.find((n) => n.importedFrom === "r1")!;
    expect(r1).toMatchObject({
      date: "2026-11-18",
      classroomId: "c2",
      moment: "Juego libre en sectores",
      kind: "obs",
      areaId: "matematica",
      competencyId: "resuelve-cantidad",
      level: "A",
      studentIds: [mateo.id],
      wholeGroup: false,
      evidenceText: "Agrupó los bloques por color.",
      interpretation: "Compara cantidades.",
      reflection: "Acciones: Ofrecer más material.",
    });
    expect(r1.evidence).toHaveLength(1);
    expect(r1.evidence[0]).toMatch(/Cuaderno de campo\/2026-11-18 - .+\/evidencia-1\.jpg$/);
    const blob = await storage.readFile(r1.evidence[0]);
    expect(blob?.size).toBeGreaterThan(0);
    expect(progress).toEqual([[1, 1]]);

    const r2 = notes.find((n) => n.importedFrom === "r2")!;
    expect(r2).toMatchObject({ areaId: "comunicacion", kind: "logro", reflection: "" });
    expect(r2.studentIds).toEqual([vale.id, mateo.id]);
    const r3 = notes.find((n) => n.importedFrom === "r3")!;
    expect(r3.competencyId).toBeUndefined();
    expect(result.unmatchedNotes).toBe(1);
    expect(result.otherYearNotes).toBe(1);

    expect(markOf(state.attendance, "c2", "2026-11-18", vale.id)).toBe("P");
    expect(markOf(state.attendance, "c2", "2026-11-18", mateo.id)).toBe("T");
    expect(markOf(state.attendance, "c2", "2026-11-17", vale.id)).toBe("F");
    expect(markOf(state.attendance, "c2", "2026-11-17", mateo.id)).toBeUndefined();
    expect(state.attendance.days.every((d) => d.date.startsWith("2026-"))).toBe(true);

    expect(state.agenda.events).toHaveLength(2);
    expect(state.agenda.events[0]).toMatchObject({
      date: "2026-11-22", time: "15:00", title: "Reunión con familias", type: "Reunión", note: "Aula", importedFrom: "a1",
    });
    expect(state.agenda.events[1]).toMatchObject({ type: "Personal", importedFrom: "a2" });
    expect(state.agenda.events[1].time).toBeUndefined();

    expect(state.profile).toMatchObject({ firstNames: "Rosa Elena", lastNames: "Quispe Mamani", institution: "IEI N.° 123", ugel: "Puno", level: "Inicial" });
  });

  it("drops levels for a descriptive cycle I classroom and maps Matemática to its cycle I area", async () => {
    const state = initialState([classroomI]);
    const { deps } = fakeWorkspace(state);
    await applyLegacyImport(parsed(), target(state, classroomI), deps);
    const r1 = state.notes.notes.find((n) => n.importedFrom === "r1")!;
    expect(r1.level).toBeUndefined();
    expect(r1.competencyId).toBe("resuelve-cantidad");
    expect(r1.areaId).toBe("descubrimiento-mundo");
  });

  it("does not overwrite an existing profile or attendance mark", async () => {
    const state = initialState();
    const profile: TeacherProfile = {
      firstNames: "Ana", lastNames: "Ríos", phone: "", region: "", address: "", email: "", level: "Inicial", ugel: "", institution: "",
    };
    state.profile = profile;
    const { deps } = fakeWorkspace(state);
    await applyLegacyImport(parsed(), target(state), deps);
    expect(state.profile).toBe(profile);
  });

  it("a second import adds nothing and is reported as already imported", async () => {
    const state = initialState();
    const { deps, storage } = fakeWorkspace(state);
    await applyLegacyImport(parsed(), target(state), deps);
    const before = JSON.stringify(state);

    const plan = planLegacyImport(parsed(), target(state));
    expect(plan).toMatchObject({ students: 0, notes: 0, photos: 0, attendanceDays: 0, events: 0, alreadyImported: true });

    const again = fakeWorkspace(state);
    again.deps.storage = storage;
    const result = await applyLegacyImport(parsed(), target(state), again.deps);
    expect(result).toMatchObject({ students: 0, notes: 0, events: 0 });
    expect(JSON.stringify(state)).toBe(before);
  });

  it("a newer backup only adds what is new", async () => {
    const state = initialState();
    const { deps } = fakeWorkspace(state);
    await applyLegacyImport(parsed(), target(state), deps);
    const json = legacyFixture();
    json.ninos.push({ id: "n4", nombre: "Camila Rojas Mamani", nac: "2021-08-21", apo: "", tel: "", notas: "" });
    const plan = planLegacyImport(parsed(json), target(state));
    expect(plan).toMatchObject({ students: 1, notes: 0, alreadyImported: true });
  });

  it("stops on a failed save, reports it and keeps what was already saved", async () => {
    const state = initialState();
    const { deps, calls } = fakeWorkspace(state, { notes: true });
    await expect(applyLegacyImport(parsed(), target(state), deps)).rejects.toThrow(/No se pudo completar la importación/);
    expect(calls).toEqual(["update", "notes"]);
    expect(state.yearData.students).toHaveLength(3);
    expect(state.notes.notes).toHaveLength(0);
    expect(state.attendance.days).toHaveLength(0);
    expect(state.agenda.events).toHaveLength(0);

    // Retrying completes the rest without duplicating the children.
    const retry = fakeWorkspace(state);
    await applyLegacyImport(parsed(), target(state), retry.deps);
    expect(state.yearData.students).toHaveLength(3);
    expect(state.notes.notes).toHaveLength(3);
  });

  it("refuses a target classroom that does not exist", async () => {
    const state = initialState([]);
    const { deps } = fakeWorkspace(state);
    await expect(applyLegacyImport(parsed(), target(state), deps)).rejects.toThrow(/No se pudo completar la importación/);
    expect(state.yearData.students).toHaveLength(0);
  });
});
