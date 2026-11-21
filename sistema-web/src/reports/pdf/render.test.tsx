// @vitest-environment node
import { unzlibSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import { notebookPdf, portfolioPdf, progressPdf } from "./generate";
import { renderPdf } from "./render";
import { PortfolioDocument } from "./Portfolio";
import { portfolioModel } from "./models";
import { attendance, descriptiveRoom, grades, note, periods, PNG_1PX, profile, scaleRoom, students } from "./test-fixtures";

const LEVEL_WORD = /(^|[^\p{L}])(AD|A|B|C)([^\p{L}]|$)/u;

/** Decompressed content streams of a PDF (react-pdf always compresses them). */
function contentStreams(bytes: Uint8Array): string[] {
  const raw = new TextDecoder("latin1").decode(bytes);
  const out: string[] = [];
  const re = /stream\r?\n/g;
  for (let m = re.exec(raw); m; m = re.exec(raw)) {
    const start = m.index + m[0].length;
    const end = raw.indexOf("endstream", start);
    try {
      out.push(new TextDecoder("latin1").decode(unzlibSync(bytes.subarray(start, end))));
    } catch {
      // Not a Flate stream (e.g. image data): ignore.
    }
  }
  return out;
}

/** Text drawn by the standard fonts: one line per `TJ`, hex strings decoded as WinAnsi. */
function textLines(streams: string[]): string[] {
  const lines: string[] = [];
  for (const s of streams) {
    for (const tj of s.matchAll(/\[([^\]]*)\]\s*TJ/g)) {
      const hex = [...tj[1].matchAll(/<([0-9a-fA-F]*)>/g)].map((h) => h[1]).join("");
      const bytes = Uint8Array.from(hex.match(/../g) ?? [], (b) => parseInt(b, 16));
      lines.push(new TextDecoder("latin1").decode(bytes));
    }
  }
  return lines;
}

async function inspect(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const streams = contentStreams(bytes);
  const lines = textLines(streams);
  return {
    bytes,
    lines,
    /** Runs concatenated: a wrapped sentence reads whole again (wrapped lines keep their trailing space). */
    flat: lines.join(""),
    imagesDrawn: streams.reduce((n, s) => n + (s.match(/\/I\w*\s+Do\b/g)?.length ?? 0), 0),
  };
}

function photoStorage(count: number) {
  const paths = Array.from({ length: count }, (_, i) => `2026/Aula/Cuaderno de campo/n/evidencia-${i + 1}.png`);
  const readFile = vi.fn(async (p: string) => (paths.includes(p) ? new Blob([PNG_1PX.slice()]) : null));
  return { paths, storage: { readFile } };
}

describe("renderPdf", () => {
  it("returns an application/pdf blob", async () => {
    const model = portfolioModel({ profile, classroom: scaleRoom, student: students[0], students, notes: [], periods, from: "2026-03-01", to: "2026-03-31" });
    const blob = await renderPdf(<PortfolioDocument model={model} photos={[]} />);
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBeGreaterThan(1024);
    expect(new TextDecoder().decode((await blob.arrayBuffer()).slice(0, 5))).toBe("%PDF-");
  });
});

describe("portfolioPdf", () => {
  it("prints the cover and each record, with at most four photos", async () => {
    const { paths, storage } = photoStorage(6);
    const r = await portfolioPdf({
      storage,
      profile,
      classroom: scaleRoom,
      student: students[0],
      students,
      periods,
      from: "2026-03-01",
      to: "2026-04-30",
      notes: [
        note({ id: "n1", date: "2026-03-05", evidence: paths, interpretation: "Muestra autonomía 🙂." }),
        note({ id: "out", date: "2026-05-05", evidence: ["2026/otro/foto.png"] }),
      ],
    });
    expect(r.blob.type).toBe("application/pdf");
    expect(r.blob.size).toBeGreaterThan(1024);
    const pdf = await inspect(r.blob);
    expect(pdf.flat).toContain("Portafolio de evidencias");
    expect(pdf.flat).toContain("Luz Rojas");
    expect(pdf.flat).toContain("Rosa María Quispe Ñahui");
    expect(pdf.flat).toContain("Momento de la jornada");
    expect(pdf.flat).toContain("Muestra autonomía .");
    expect(pdf.imagesDrawn).toBe(4);
    expect(storage.readFile).toHaveBeenCalledTimes(4);
    expect(storage.readFile).not.toHaveBeenCalledWith("2026/otro/foto.png");
  });

  it("skips unreadable photos and still renders", async () => {
    const storage = { readFile: vi.fn(async () => new Blob(["not an image"])) };
    const r = await portfolioPdf({
      storage,
      profile: null,
      classroom: scaleRoom,
      student: students[0],
      students,
      periods,
      from: "2026-03-01",
      to: "2026-04-30",
      notes: [note({ id: "n1", date: "2026-03-05", evidence: ["a/x.heic"] })],
    });
    expect(r.skippedPhotos).toBe(1);
    expect((await inspect(r.blob)).imagesDrawn).toBe(0);
  });
});

describe("progressPdf", () => {
  const att = attendance([{ date: "2026-03-02", classroomId: "c2", marks: { s4: "P" } }]);

  it("descriptive cycle I prints conclusions and no AD/A/B/C anywhere", async () => {
    const r = await progressPdf({
      profile,
      classroom: descriptiveRoom,
      student: students[2],
      period: periods[0],
      grades: grades([
        { studentId: "s4", competencyId: "construye-identidad", periodId: "B1", level: "AD", conclusion: "Se reconoce en el espejo.", updatedAt: "" },
      ]),
      attendance: att,
    });
    expect(r.blob.size).toBeGreaterThan(1024);
    const pdf = await inspect(r.blob);
    expect(pdf.flat).toContain("Informe de progreso");
    expect(pdf.flat).toContain("Conclusión descriptiva");
    expect(pdf.flat).toContain("Se reconoce en el espejo.");
    expect(pdf.flat).toContain("Asistencia del bimestre");
    expect(pdf.flat).toContain("Firma de la docente");
    expect(pdf.flat).not.toMatch(/Nivel de logro|Logro destacado/);
    for (const line of pdf.lines) expect(line).not.toMatch(LEVEL_WORD);
  });

  it("with the scale prints the level column and legend", async () => {
    const r = await progressPdf({
      profile,
      classroom: scaleRoom,
      student: students[0],
      period: periods[0],
      grades: grades([
        { studentId: "s1", competencyId: "construye-identidad", periodId: "B1", level: "A", conclusion: "Expresa lo que siente.", updatedAt: "" },
      ]),
      attendance: att,
    });
    const pdf = await inspect(r.blob);
    expect(pdf.flat).toContain("Nivel de logro");
    expect(pdf.lines).toContain("A");
    expect(pdf.flat).toContain("AD: Logro destacado");
  });
});

describe("notebookPdf", () => {
  it("prints the client cover, personal data, definition and one ficha per record", async () => {
    const { paths, storage } = photoStorage(2);
    const r = await notebookPdf({
      storage,
      profile,
      classroom: scaleRoom,
      students,
      year: 2026,
      from: "2026-03-01",
      to: "2026-04-30",
      notes: [
        note({ id: "n1", date: "2026-03-05", evidence: paths, reflection: "Usar más material." }),
        note({ id: "n2", date: "2026-03-06" }),
      ],
    });
    expect(r.blob.type).toBe("application/pdf");
    const pdf = await inspect(r.blob);
    for (const t of ["CUADERNO DE CAMPO", "2026", "Datos personales", "NOMBRES:", "Rosa María", "APELLIDOS:", "Quispe Ñahui", "INSTITUCIÓN:", "Cuaderno de Campo", "¿Cuándo se debe usar?", "SECCIÓN:", "Girasoles", "REFLEXIÓN DOCENTE EN RELACIÓN A LA ACTIVIDAD:", "Usar más material."]) {
      expect(pdf.flat).toContain(t);
    }
    expect(pdf.lines.filter((l) => l === "FECHA:")).toHaveLength(2);
    expect(pdf.imagesDrawn).toBe(2);
  });
});
