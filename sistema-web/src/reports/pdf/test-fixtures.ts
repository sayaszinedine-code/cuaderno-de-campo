import {
  SCHEMA_VERSION,
  type AttendanceFile,
  type Classroom,
  type FieldNote,
  type GradesFile,
  type Period,
  type Student,
  type TeacherProfile,
} from "@/domain/schema";

export const profile: TeacherProfile = {
  firstNames: "Rosa María",
  lastNames: "Quispe Ñahui",
  phone: "984 123 456",
  region: "Cusco",
  address: "Av. Sol 123",
  email: "rosa@example.com",
  level: "Inicial",
  ugel: "UGEL Cusco",
  institution: "IEI 123 Los Andes",
};

export const scaleRoom: Classroom = {
  id: "c1",
  name: "Girasoles",
  cycle: "II",
  bands: ["4y"],
  disabledCompetencyIds: [],
  cycleIGrading: "descriptive",
};

export const descriptiveRoom: Classroom = {
  id: "c2",
  name: "Ositos",
  cycle: "I",
  bands: ["24m"],
  disabledCompetencyIds: [],
  cycleIGrading: "descriptive",
};

export const students: Student[] = [
  { id: "s1", classroomId: "c1", firstNames: "Luz", lastNames: "Rojas", birthDate: "2021-06-10", dni: "71234567", active: true },
  { id: "s2", classroomId: "c1", firstNames: "Mateo", lastNames: "Díaz", active: true },
  { id: "s4", classroomId: "c2", firstNames: "Ana", lastNames: "Soto", birthDate: "2024-01-05", active: true },
];

export const periods: Period[] = [
  { id: "B1", name: "I Bimestre", start: "2026-03-01", end: "2026-05-15" },
  { id: "B2", name: "II Bimestre", start: "2026-05-16", end: "2026-07-31" },
];

export function note(over: Partial<FieldNote> & Pick<FieldNote, "id" | "date">): FieldNote {
  return {
    classroomId: "c1",
    studentIds: ["s1"],
    wholeGroup: false,
    moment: "Juego libre en sectores",
    kind: "obs",
    performances: [],
    evidenceText: "Construyó una torre de seis bloques.",
    evidence: [],
    interpretation: "",
    reflection: "",
    createdAt: `${over.date}T10:00:00.000Z`,
    updatedAt: `${over.date}T10:00:00.000Z`,
    ...over,
  };
}

export const grades = (entries: GradesFile["entries"]): GradesFile => ({
  version: SCHEMA_VERSION,
  schoolYear: 2026,
  entries,
  finals: [],
});

export const attendance = (days: AttendanceFile["days"]): AttendanceFile => ({
  version: SCHEMA_VERSION,
  schoolYear: 2026,
  days,
});

/** Smallest valid PNG (1×1, transparent). */
export const PNG_1PX = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0),
);
