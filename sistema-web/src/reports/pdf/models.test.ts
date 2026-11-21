import { describe, expect, it } from "vitest";
import {
  NOTEBOOK_DEFINITION,
  fmtDate,
  notebookModel,
  pdfText,
  portfolioModel,
  progressModel,
  type Field,
} from "./models";
import { attendance, descriptiveRoom, grades, note, periods, profile, scaleRoom, students } from "./test-fixtures";

const LEVEL_WORD = /(^|[^\p{L}])(AD|A|B|C)([^\p{L}]|$)/u;
const valueOf = (fields: Field[], label: string) => fields.find((f) => f.label === label)?.value;

describe("pdfText", () => {
  it("keeps Spanish letters and punctuation", () => {
    expect(pdfText("¿Ñandú? ¡Sí! Güeña «ok» – “bien”…")).toBe("¿Ñandú? ¡Sí! Güeña «ok» – “bien”…");
  });

  it("drops emoji and characters Helvetica cannot draw, folding accents when possible", () => {
    expect(pdfText("Pintó 🎨 con Ān ✔ colores")).toBe("Pintó con An colores");
  });

  it("keeps line breaks and turns tabs into spaces", () => {
    expect(pdfText("uno\r\n\tdos")).toBe("uno\n dos");
  });
});

describe("fmtDate", () => {
  it("formats ISO dates as dd/mm/yyyy", () => {
    expect(fmtDate("2026-04-07")).toBe("07/04/2026");
  });
});

describe("portfolioModel", () => {
  const notes = [
    note({
      id: "n2",
      date: "2026-04-20",
      competencyId: "construye-identidad",
      performances: [{ competencyId: "construye-identidad", band: "4y", text: "Reconoce sus intereses 🙂." }],
      interpretation: "Muestra autonomía.",
      evidence: ["a/1.jpg", "a/2.jpg"],
      level: "A",
    }),
    note({ id: "n1", date: "2026-03-10", moment: "Taller" }),
    note({ id: "group", date: "2026-04-01", studentIds: [], wholeGroup: true, evidenceText: "Todos cantaron." }),
    note({ id: "other", date: "2026-04-02", studentIds: ["s2"] }),
    note({ id: "late", date: "2026-06-01" }),
    note({ id: "otherRoom", date: "2026-04-03", classroomId: "c2", studentIds: [], wholeGroup: true }),
  ];
  const model = () =>
    portfolioModel({ profile, classroom: scaleRoom, student: students[0], students, notes, periods, from: "2026-03-01", to: "2026-04-30" });

  it("has a cover with the child, classroom, teacher and institution", () => {
    const m = model();
    expect(m.title).toBe("Portafolio de evidencias");
    expect(valueOf(m.cover, "Niño o niña")).toBe("Luz Rojas");
    expect(valueOf(m.cover, "Edad")).toBe("4 años 10 meses");
    expect(valueOf(m.cover, "Aula")).toBe("Aula Girasoles · Ciclo II · 4 años");
    expect(valueOf(m.cover, "Docente")).toBe("Rosa María Quispe Ñahui");
    expect(valueOf(m.cover, "Institución educativa")).toBe("IEI 123 Los Andes");
    expect(valueOf(m.cover, "Periodo")).toBe("Del 01/03/2026 al 30/04/2026");
  });

  it("lists the child's own and whole-group notes in the range, oldest first", () => {
    expect(model().entries.map((e) => e.id)).toEqual(["n1", "group", "n2"]);
  });

  it("shows date, moment, competency, performances, evidence and interpretation, never the level", () => {
    const e = model().entries[2];
    expect(e.fields.map((f) => f.label)).toEqual([
      "Fecha",
      "Momento de la jornada",
      "Competencia",
      "Desempeños",
      "Evidencias",
      "Interpretación en relación al desempeño",
    ]);
    expect(valueOf(e.fields, "Fecha")).toBe("20/04/2026");
    expect(valueOf(e.fields, "Competencia")).toBe("Construye su identidad");
    expect(e.fields.find((f) => f.label === "Desempeños")?.list).toEqual(["Reconoce sus intereses ."]);
    expect(e.photos).toEqual(["a/1.jpg", "a/2.jpg"]);
    expect(JSON.stringify(e)).not.toMatch(/Nivel/);
  });

  it("leaves out empty fields", () => {
    const labels = model().entries[0].fields.map((f) => f.label);
    expect(labels).toEqual(["Fecha", "Momento de la jornada", "Evidencias"]);
  });

  it("leaves teacher data blank without a profile", () => {
    const m = portfolioModel({ profile: null, classroom: scaleRoom, student: students[0], students, notes: [], periods, from: "2026-03-01", to: "2026-03-02" });
    expect(valueOf(m.cover, "Docente")).toBe("");
    expect(m.entries).toEqual([]);
    expect(m.empty).toBe("No hay registros de este niño o niña en estas fechas.");
  });
});

describe("progressModel", () => {
  const att = attendance([
    { date: "2026-03-02", classroomId: "c1", marks: { s1: "P", s2: "F" } },
    { date: "2026-03-03", classroomId: "c1", marks: { s1: "T" } },
    { date: "2026-03-04", classroomId: "c1", marks: { s1: "F" } },
    { date: "2026-03-05", classroomId: "c1", marks: { s1: "J" } },
    { date: "2026-06-01", classroomId: "c1", marks: { s1: "F" } },
  ]);

  it("shows the child and institution data", () => {
    const m = progressModel({ profile, classroom: scaleRoom, student: students[0], period: periods[0], grades: grades([]), attendance: att });
    expect(m.title).toBe("Informe de progreso");
    expect(m.periodName).toBe("I Bimestre");
    expect(valueOf(m.data, "Niño o niña")).toBe("Luz Rojas");
    expect(valueOf(m.data, "DNI")).toBe("71234567");
    expect(valueOf(m.data, "Edad")).toBe("4 años 11 meses");
    expect(valueOf(m.data, "Aula")).toBe("Aula Girasoles · Ciclo II · 4 años");
    expect(valueOf(m.data, "Institución educativa")).toBe("IEI 123 Los Andes");
    expect(valueOf(m.data, "UGEL")).toBe("UGEL Cusco");
    expect(valueOf(m.data, "Docente")).toBe("Rosa María Quispe Ñahui");
  });

  it("with the scale, lists each active competency with level and conclusion plus the legend", () => {
    const m = progressModel({
      profile,
      classroom: scaleRoom,
      student: students[0],
      period: periods[0],
      grades: grades([
        { studentId: "s1", competencyId: "construye-identidad", periodId: "B1", level: "A", conclusion: "Expresa lo que siente.", updatedAt: "" },
        { studentId: "s1", competencyId: "convive-participa", periodId: "B2", level: "C", conclusion: "Otro bimestre.", updatedAt: "" },
      ]),
      attendance: att,
    });
    expect(m.columns).toEqual(["Competencia", "Nivel de logro", "Conclusión descriptiva"]);
    expect(m.rows[0]).toEqual({ competency: "Construye su identidad", level: "A", conclusion: "Expresa lo que siente." });
    expect(m.rows[1]).toEqual({ competency: "Convive y participa democráticamente en la búsqueda del bien común", level: "", conclusion: "" });
    expect(m.rows.some((r) => r.competency.startsWith("Construye su identidad, como persona"))).toBe(true);
    const without = progressModel({
      profile,
      classroom: { ...scaleRoom, disabledCompetencyIds: ["construye-identidad-religion"] },
      student: students[0],
      period: periods[0],
      grades: grades([]),
      attendance: att,
    });
    expect(without.rows.some((r) => r.competency.startsWith("Construye su identidad, como persona"))).toBe(false);
    expect(m.legend).toEqual([
      { label: "AD", value: "Logro destacado" },
      { label: "A", value: "Logro esperado" },
      { label: "B", value: "En proceso" },
      { label: "C", value: "En inicio" },
    ]);
  });

  it("descriptive cycle I never shows AD/A/B/C, even if levels are stored", () => {
    const m = progressModel({
      profile,
      classroom: descriptiveRoom,
      student: students[2],
      period: periods[0],
      grades: grades([
        { studentId: "s4", competencyId: "construye-identidad", periodId: "B1", level: "AD", conclusion: "Se reconoce en el espejo.", updatedAt: "" },
      ]),
      attendance: att,
    });
    expect(m.columns).toEqual(["Competencia", "Conclusión descriptiva"]);
    expect(m.legend).toEqual([]);
    expect(m.rows[0]).toEqual({ competency: "Construye su identidad", conclusion: "Se reconoce en el espejo." });
    const all = [m.title, m.periodName, ...m.columns, ...m.data.flatMap((f) => [f.label, f.value]), ...m.rows.flatMap((r) => [r.competency, r.level ?? "", r.conclusion])];
    for (const t of all) expect(t).not.toMatch(LEVEL_WORD);
    expect(JSON.stringify(m)).not.toMatch(/Nivel de logro|Logro destacado/);
  });

  it("summarizes the attendance of the bimester", () => {
    const m = progressModel({ profile, classroom: scaleRoom, student: students[0], period: periods[0], grades: grades([]), attendance: att });
    expect(m.attendance).toEqual([
      { label: "Presente", value: "1" },
      { label: "Tardanza", value: "1" },
      { label: "Falta", value: "1" },
      { label: "Falta justificada", value: "1" },
      { label: "Asistencia", value: "50%" },
    ]);
  });

  it("says when there is no attendance", () => {
    const m = progressModel({ profile, classroom: scaleRoom, student: students[1], period: periods[1], grades: grades([]), attendance: att });
    expect(m.attendance).toEqual([]);
    expect(m.attendanceEmpty).toBe("Sin registros de asistencia en este bimestre.");
  });

  it("leaves room for the teacher's signature", () => {
    const m = progressModel({ profile, classroom: scaleRoom, student: students[0], period: periods[0], grades: grades([]), attendance: att });
    expect(m.signature).toEqual({ label: "Firma de la docente", name: "Rosa María Quispe Ñahui" });
    const blank = progressModel({ profile: null, classroom: scaleRoom, student: students[0], period: periods[0], grades: grades([]), attendance: att });
    expect(blank.signature.name).toBe("");
  });
});

describe("notebookModel", () => {
  const notes = [
    note({
      id: "n2",
      date: "2026-04-20",
      studentIds: ["s2", "s1"],
      competencyId: "resuelve-cantidad",
      performances: [
        { competencyId: "resuelve-cantidad", band: "4y", text: "Cuenta hasta cinco." },
        { competencyId: "resuelve-cantidad", band: "4y", text: "Compara cantidades." },
      ],
      interpretation: "Logra contar.",
      reflection: "Usar más material concreto.",
      evidence: ["a/1.jpg"],
    }),
    note({ id: "n1", date: "2026-03-10", studentIds: [], wholeGroup: true, areaId: "comunicacion" }),
    note({ id: "otherRoom", date: "2026-03-11", classroomId: "c2", studentIds: ["s4"] }),
    note({ id: "late", date: "2026-05-01" }),
  ];
  const model = () => notebookModel({ profile, classroom: scaleRoom, students, notes, year: 2026, from: "2026-03-01", to: "2026-04-30" });

  it("has the client cover with the open year", () => {
    expect(model().cover).toEqual({ title: "CUADERNO DE CAMPO", year: "2026" });
  });

  it("has the personal data page of slide 3", () => {
    const m = model();
    expect(m.personal.title).toBe("Datos personales");
    expect(m.personal.fields).toEqual([
      { label: "NOMBRES:", value: "Rosa María" },
      { label: "APELLIDOS:", value: "Quispe Ñahui" },
      { label: "TELÉFONO:", value: "984 123 456" },
      { label: "REGIÓN:", value: "Cusco" },
      { label: "DOMICILIO:", value: "Av. Sol 123" },
      { label: "CORREO:", value: "rosa@example.com" },
      { label: "NIVEL:", value: "Inicial" },
      { label: "UGEL:", value: "UGEL Cusco" },
      { label: "INSTITUCIÓN:", value: "IEI 123 Los Andes" },
    ]);
  });

  it("leaves the personal data blank without a profile", () => {
    const m = notebookModel({ profile: null, classroom: scaleRoom, students, notes: [], year: 2026, from: "2026-03-01", to: "2026-04-30" });
    expect(m.personal.fields.every((f) => f.value === "")).toBe(true);
    expect(m.personal.fields).toHaveLength(9);
  });

  it("has the definition page of slide 4, verbatim", () => {
    const d = model().definition;
    expect(d).toBe(NOTEBOOK_DEFINITION);
    expect(d.title).toBe("Cuaderno de Campo");
    expect(d.paragraph).toBe(
      "El cuaderno de campo es un instrumento pedagógico y reflexivo que utiliza la docente de Educación Inicial para registrar de manera sistemática sus observaciones, impresiones, análisis y reflexiones sobre las experiencias de aprendizaje, el comportamiento, el desarrollo de los niños y niñas, así como sobre su propia práctica pedagógica, en coherencia con el enfoque formativo del Currículo Nacional.",
    );
    expect(d.whenTitle).toBe("¿Cuándo se debe usar?");
    expect(d.whenIntro).toBe("El cuaderno de campo se utiliza cuando:");
    expect(d.bullets).toEqual([
      "La docente observa situaciones relevantes del desarrollo integral de los niños y niñas.",
      "Se desarrollan experiencias de aprendizaje que requieren análisis posterior.",
      "Se desea reflexionar sobre la práctica pedagógica y tomar decisiones de mejora.",
      "Se identifican necesidades, intereses o dificultades del grupo o de algún niño o niña.",
      "Se necesita sustentar ajustes en la planificación (estrategias, materiales, tiempos).",
    ]);
    expect(d.important).toBe(
      "Importante: el cuaderno de campo no es un registro administrativo, sino una herramienta personal y profesional de la docente, orientada a la mejora continua de la enseñanza y el acompañamiento oportuno a los niños y niñas.",
    );
  });

  it("has one ficha page per note of the classroom in the range, oldest first", () => {
    expect(model().pages.map((p) => p.id)).toEqual(["n1", "n2"]);
  });

  it("fills the slide 5 ficha", () => {
    const p = model().pages[1];
    expect(p.fields.map((f) => f.label)).toEqual([
      "FECHA:",
      "GRADO:",
      "SECCIÓN:",
      "NOMBRE COMPLETO:",
      "EVIDENCIAS:",
      "ÁREA:",
      "COMPETENCIA:",
      "DESEMPEÑO:",
      "INTERPRETACIÓN EN RELACIÓN AL DESEMPEÑO:",
      "REFLEXIÓN DOCENTE EN RELACIÓN A LA ACTIVIDAD:",
    ]);
    expect(valueOf(p.fields, "FECHA:")).toBe("20/04/2026");
    expect(valueOf(p.fields, "GRADO:")).toBe("4 años");
    expect(valueOf(p.fields, "SECCIÓN:")).toBe("Girasoles");
    expect(valueOf(p.fields, "NOMBRE COMPLETO:")).toBe("Mateo Díaz, Luz Rojas");
    expect(valueOf(p.fields, "EVIDENCIAS:")).toBe("Construyó una torre de seis bloques.");
    expect(valueOf(p.fields, "ÁREA:")).toBe("Matemática");
    expect(valueOf(p.fields, "COMPETENCIA:")).toBe("Resuelve problemas de cantidad");
    expect(p.fields.find((f) => f.label === "DESEMPEÑO:")?.list).toEqual(["Cuenta hasta cinco.", "Compara cantidades."]);
    expect(valueOf(p.fields, "INTERPRETACIÓN EN RELACIÓN AL DESEMPEÑO:")).toBe("Logra contar.");
    expect(valueOf(p.fields, "REFLEXIÓN DOCENTE EN RELACIÓN A LA ACTIVIDAD:")).toBe("Usar más material concreto.");
    expect(p.photos).toEqual(["a/1.jpg"]);
  });

  it("names the whole group and keeps empty ficha fields as blank lines", () => {
    const p = model().pages[0];
    expect(p.fields).toHaveLength(10);
    expect(valueOf(p.fields, "NOMBRE COMPLETO:")).toBe("Todo el grupo");
    expect(valueOf(p.fields, "ÁREA:")).toBe("Comunicación");
    expect(valueOf(p.fields, "COMPETENCIA:")).toBe("");
  });

  it("derives the cycle I area from the competency and lists every band of a multi-age room", () => {
    const room = { ...descriptiveRoom, bands: ["18m", "24m"] as typeof descriptiveRoom.bands };
    const m = notebookModel({
      profile,
      classroom: room,
      students,
      notes: [note({ id: "x", date: "2026-03-12", classroomId: "c2", studentIds: ["s4"], competencyId: "resuelve-cantidad" })],
      year: 2026,
      from: "2026-03-01",
      to: "2026-03-31",
    });
    expect(valueOf(m.pages[0].fields, "ÁREA:")).toBe("Descubrimiento del mundo");
    expect(valueOf(m.pages[0].fields, "GRADO:")).toBe("18 meses, 24 meses");
  });
});
