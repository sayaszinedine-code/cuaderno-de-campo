import { CYCLE_BANDS, getCompetencies, type AgeBand, type Competency, type Cycle } from "@/curriculum";
import type { Classroom, Period, Student, YearData } from "./schema";

type IdGen = () => string;
const newId: IdGen = () => crypto.randomUUID();

export type ClassroomInput = { name: string; cycle: Cycle; bands: AgeBand[] };
export type ClassroomPatch = Partial<Pick<Classroom, "name" | "disabledCompetencyIds" | "cycleIGrading">>;
export type StudentInput = {
  classroomId: string;
  firstNames: string;
  lastNames: string;
  birthDate?: string;
};
export type StudentPatch = Partial<Omit<Student, "id" | "active">>;

function findClassroom(d: YearData, id: string): Classroom {
  const c = d.classrooms.find((x) => x.id === id);
  if (!c) throw new Error("No se encontró el aula.");
  return c;
}

function cleanName(name: string): string {
  const n = name.trim();
  if (!n) throw new Error("Escribe el nombre del aula.");
  return n;
}

const DUPLICATE_NAME = "Ya existe un aula con ese nombre.";

function assertUniqueName(d: YearData, name: string, exceptId?: string): void {
  const key = name.toLocaleLowerCase("es");
  if (d.classrooms.some((c) => c.id !== exceptId && c.name.trim().toLocaleLowerCase("es") === key)) {
    throw new Error(DUPLICATE_NAME);
  }
}

export function createClassroom(d: YearData, input: ClassroomInput, genId: IdGen = newId): YearData {
  const name = cleanName(input.name);
  assertUniqueName(d, name);
  if (input.bands.length === 0) throw new Error("Elige al menos una edad.");
  if (new Set(input.bands).size !== input.bands.length) throw new Error("Las edades no pueden repetirse.");
  if (!input.bands.every((b) => CYCLE_BANDS[input.cycle].includes(b))) {
    throw new Error(`Las edades no corresponden al ciclo ${input.cycle}`);
  }
  const classroom: Classroom = {
    id: genId(),
    name,
    cycle: input.cycle,
    bands: input.bands,
    disabledCompetencyIds: [],
    cycleIGrading: "descriptive",
  };
  return { ...d, classrooms: [...d.classrooms, classroom] };
}

export function activeCompetencies(c: Classroom): Competency[] {
  return getCompetencies(c.cycle).filter((x) => !c.disabledCompetencyIds.includes(x.id));
}

export function updateClassroom(d: YearData, id: string, patch: ClassroomPatch): YearData {
  const current = findClassroom(d, id);
  const next: Classroom = { ...current };
  if (patch.name !== undefined) {
    next.name = cleanName(patch.name);
    assertUniqueName(d, next.name, id);
  }
  if (patch.cycleIGrading !== undefined) next.cycleIGrading = patch.cycleIGrading;
  if (patch.disabledCompetencyIds !== undefined) {
    const optional = new Set(
      getCompetencies(current.cycle)
        .filter((x) => x.optional)
        .map((x) => x.id),
    );
    if (!patch.disabledCompetencyIds.every((x) => optional.has(x))) {
      throw new Error("Esa competencia no se puede desactivar.");
    }
    next.disabledCompetencyIds = [...new Set(patch.disabledCompetencyIds)];
  }
  return { ...d, classrooms: d.classrooms.map((c) => (c.id === id ? next : c)) };
}

export function deleteClassroom(d: YearData, id: string): YearData {
  findClassroom(d, id);
  if (d.students.some((s) => s.classroomId === id)) {
    throw new Error("No puedes eliminar un aula con niños registrados.");
  }
  return { ...d, classrooms: d.classrooms.filter((c) => c.id !== id) };
}

export function addStudent(d: YearData, input: StudentInput, genId: IdGen = newId): YearData {
  findClassroom(d, input.classroomId);
  const firstNames = input.firstNames.trim();
  const lastNames = input.lastNames.trim();
  if (!firstNames) throw new Error("Escribe los nombres del niño.");
  if (!lastNames) throw new Error("Escribe los apellidos del niño.");
  const student: Student = {
    id: genId(),
    classroomId: input.classroomId,
    firstNames,
    lastNames,
    ...(input.birthDate ? { birthDate: input.birthDate } : {}),
    active: true,
  };
  return { ...d, students: [...d.students, student] };
}

export function updateStudent(d: YearData, id: string, patch: StudentPatch): YearData {
  if (!d.students.some((s) => s.id === id)) throw new Error("No se encontró al niño.");
  if (patch.classroomId !== undefined) findClassroom(d, patch.classroomId);
  return { ...d, students: d.students.map((s) => (s.id === id ? { ...s, ...patch } : s)) };
}

const setActive = (d: YearData, id: string, active: boolean): YearData => {
  if (!d.students.some((s) => s.id === id)) throw new Error("No se encontró al niño.");
  return { ...d, students: d.students.map((s) => (s.id === id ? { ...s, active } : s)) };
};

/** Marks the child inactive; never deletes data. */
export const archiveStudent = (d: YearData, id: string): YearData => setActive(d, id, false);
export const restoreStudent = (d: YearData, id: string): YearData => setActive(d, id, true);

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function updatePeriods(d: YearData, periods: Period[]): YearData {
  periods.forEach((p, i) => {
    const n = i + 1;
    if (!ISO.test(p.start) || !ISO.test(p.end)) throw new Error(`El bimestre ${n} necesita fechas de inicio y fin`);
    if (p.start > p.end) throw new Error(`El bimestre ${n} termina antes de empezar`);
    const prev = periods[i - 1];
    if (prev && p.start <= prev.end) {
      throw new Error(`El bimestre ${n} empieza antes de que termine el bimestre ${n - 1}`);
    }
  });
  return { ...d, periods };
}

/** Local (not UTC) date as YYYY-MM-DD. */
export function todayISO(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function bandLabel(b: AgeBand): string {
  return b.endsWith("y") ? `${b.slice(0, -1)} años` : `${b.slice(0, -1)} meses`;
}

/** «Aula Girasoles · Ciclo II · 4 años» (several bands → «multiedad»). */
export function classroomLabel(c: Pick<Classroom, "name" | "cycle" | "bands">): string {
  const ages = c.bands.length === 1 ? bandLabel(c.bands[0]) : "multiedad";
  return `Aula ${c.name} · Ciclo ${c.cycle} · ${ages}`;
}
