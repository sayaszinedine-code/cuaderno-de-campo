import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiSettings } from "@/ai/settings";
import { AiError, type AiRequest } from "@/ai/types";
import { getPerformanceBands, getPerformances } from "@/curriculum";
import { activeCompetencies } from "@/domain/classrooms";
import { newNote } from "@/domain/notes";
import type { Classroom, FieldNote, Student } from "@/domain/schema";
import { AiNoteAction } from "./AiActions";

const generate = vi.fn<(s: AiSettings, r: AiRequest) => Promise<string>>();
vi.mock("@/ai", () => ({
  generateWithSettings: (s: AiSettings, r: AiRequest) => generate(s, r),
}));

const classroom: Classroom = {
  id: "c1",
  name: "Girasoles",
  cycle: "II",
  bands: ["4y"],
  disabledCompetencyIds: [],
  cycleIGrading: "descriptive",
};
const student = (
  id: string,
  firstNames: string,
  lastNames: string,
  active = true,
): Student =>
  ({
    id,
    classroomId: "c1",
    firstNames,
    lastNames,
    birthDate: "2021-05-01",
    active,
  }) as Student;
const students = [
  student("s1", "Valentina", "Quispe"),
  student("s2", "Mateo", "Huanca", false),
  { ...student("s3", "Gonzalo", "Ttito"), classroomId: "c2" },
];
const on: AiSettings = {
  enabled: true,
  provider: "deepseek",
  apiKeys: { deepseek: "k" },
  consentAt: "2026-01-01T00:00:00Z",
};
const base = (over: Partial<FieldNote> = {}): FieldNote => ({
  ...newNote({ classroomId: "c1" }),
  evidenceText: "Valentina dijo: quiero pintar. Mateo ayudó a Gonzalo Ttito.",
  ...over,
});

function setup(
  kind: "objective" | "suggest" | "interpretation" | "photo",
  note: FieldNote,
  settings = on,
  readFile = vi.fn(),
) {
  const onPatch = vi.fn();
  render(
    <AiNoteAction
      kind={kind}
      settings={settings}
      note={note}
      classroom={classroom}
      yearStudents={students}
      noteStudents={[]}
      schoolYear={2026}
      storage={{ readFile }}
      onPatch={onPatch}
    />,
  );
  return { onPatch, readFile };
}

/** The list sent for suggestions: default-band desempeños of every active competency, numbered globally. */
const sentList = () =>
  activeCompetencies(classroom).flatMap((c) =>
    getPerformanceBands(c.id).includes("4y")
      ? getPerformances(c.id, "4y").map((p) => ({ competency: c, text: p.text }))
      : [],
  );
/** Global 1-based number of the k-th desempeño of a competency. */
const globalIndex = (competencyId: string, k = 0) =>
  sentList().findIndex((x) => x.competency.id === competencyId) + k + 1;

beforeEach(() => {
  generate.mockReset();
});

describe("AiNoteAction", () => {
  it("shows nothing when the assistant is not enabled with consent", () => {
    setup("objective", base(), { ...on, consentAt: undefined });
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("never sends real names (active, archived or from another classroom) and does not touch the field until «Usar»", async () => {
    generate.mockResolvedValue("V. dijo: quiero pintar.");
    const { onPatch } = setup("objective", base());
    fireEvent.click(
      screen.getByRole("button", { name: "Redactar de forma objetiva" }),
    );
    expect(await screen.findByText("V. dijo: quiero pintar.")).toBeTruthy();
    expect(generate.mock.calls[0][1].prompt).toContain("V. Q. dijo");
    const sent = JSON.stringify(generate.mock.calls[0][1]);
    expect(sent).not.toMatch(/Valentina|Mateo|Quispe|Huanca|Gonzalo|Ttito/);
    expect(onPatch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Usar este texto" }));
    expect(onPatch).toHaveBeenCalledWith({
      evidenceText: "V. dijo: quiero pintar.",
    });
  });

  it("restores the children's names locally in the result box and in the applied text", async () => {
    generate.mockResolvedValue("V. Q. dijo: «quiero pintar». M. H. ayudó a G. T.");
    const { onPatch } = setup("objective", base());
    fireEvent.click(
      screen.getByRole("button", { name: "Redactar de forma objetiva" }),
    );
    const restored =
      "Valentina Quispe dijo: «quiero pintar». Mateo Huanca ayudó a Gonzalo Ttito.";
    expect(await screen.findByTestId("ai-result")).toHaveTextContent(restored);
    const sent = JSON.stringify(generate.mock.calls[0][1]);
    expect(sent).not.toMatch(/Valentina|Mateo|Gonzalo|Quispe|Huanca|Ttito/);
    fireEvent.click(screen.getByRole("button", { name: "Usar este texto" }));
    expect(onPatch).toHaveBeenCalledWith({ evidenceText: restored });
  });

  it("restores names in the streamed text too", async () => {
    let resolve: (t: string) => void = () => undefined;
    generate.mockImplementation(
      (_s, r) =>
        new Promise<string>((res) => {
          r.onText?.("V. Q. pinta");
          resolve = res;
        }),
    );
    setup("interpretation", base());
    fireEvent.click(
      screen.getByRole("button", { name: "Redactar interpretación" }),
    );
    expect(await screen.findByTestId("ai-result")).toHaveTextContent(
      "Valentina Quispe pinta",
    );
    resolve("V. Q. pinta.");
  });

  it("«Descartar» leaves the field intact", async () => {
    generate.mockResolvedValue("Texto");
    const { onPatch } = setup("objective", base());
    fireEvent.click(
      screen.getByRole("button", { name: "Redactar de forma objetiva" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Descartar" }));
    expect(onPatch).not.toHaveBeenCalled();
    expect(screen.queryByText("Texto")).toBeNull();
  });

  it("shows the error message and keeps the field", async () => {
    generate.mockImplementation(async () => {
      throw new AiError("rate-limit");
    });
    const { onPatch } = setup("objective", base());
    fireEvent.click(
      screen.getByRole("button", { name: "Redactar de forma objetiva" }),
    );
    expect((await screen.findByRole("alert")).textContent).toMatch(
      /límite de uso/,
    );
    expect(onPatch).not.toHaveBeenCalled();
  });

  it("suggestion sets area, competency and valid desempeños; ignores invalid indexes and other competencies' desempeños", async () => {
    const perfs = getPerformances("comunica-oralmente", "4y");
    generate.mockResolvedValue(
      JSON.stringify({
        competencyId: "comunica-oralmente",
        performanceIndexes: [
          globalIndex("comunica-oralmente"),
          999,
          0,
          globalIndex("lee"),
        ],
        reason: "habla",
      }),
    );
    const { onPatch } = setup(
      "suggest",
      base({ competencyId: "comunica-oralmente", areaId: "comunicacion" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Sugerir competencia y desempeños" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Usar este texto" }),
    );
    expect(onPatch).toHaveBeenCalledWith({
      areaId: expect.any(String),
      competencyId: "comunica-oralmente",
      performances: [
        { competencyId: "comunica-oralmente", band: "4y", text: perfs[0].text },
      ],
    });
    expect(JSON.stringify(generate.mock.calls[0][1])).not.toMatch(
      /Valentina|Mateo/,
    );
  });

  it("suggestion without a selected competency sends every active competency's desempeños and maps them back", async () => {
    const perfs = getPerformances("comunica-oralmente", "4y");
    generate.mockResolvedValueOnce(
      JSON.stringify({
        competencyId: "comunica-oralmente",
        performanceIndexes: [
          globalIndex("comunica-oralmente", 1),
          globalIndex("comunica-oralmente", 1),
        ],
        reason: "V. Q. conversa",
      }),
    );
    const { onPatch } = setup("suggest", base());
    fireEvent.click(
      screen.getByRole("button", { name: "Sugerir competencia y desempeños" }),
    );
    expect(await screen.findByTestId("ai-result")).toHaveTextContent(
      "Valentina Quispe conversa",
    );
    const prompt = generate.mock.calls[0][1].prompt;
    const list = sentList();
    const comps = new Set(list.map((x) => x.competency.id));
    expect(comps.size).toBeGreaterThan(1);
    list.forEach((x, i) =>
      expect(prompt).toContain(`[${i + 1}] ${x.competency.name} — ${x.text}`),
    );
    fireEvent.click(screen.getByRole("button", { name: "Usar este texto" }));
    expect(onPatch).toHaveBeenCalledWith({
      areaId: "comunicacion",
      competencyId: "comunica-oralmente",
      performances: [
        { competencyId: "comunica-oralmente", band: "4y", text: perfs[1].text },
      ],
    });
  });

  it("suggestion rejects unknown competencies", async () => {
    generate.mockResolvedValueOnce(
      JSON.stringify({ competencyId: "inventada", performanceIndexes: [1], reason: "" }),
    );
    const { onPatch } = setup("suggest", base());
    fireEvent.click(
      screen.getByRole("button", { name: "Sugerir competencia y desempeños" }),
    );
    expect((await screen.findByRole("alert")).textContent).toMatch(/sugerencia válida/);
    expect(onPatch).not.toHaveBeenCalled();
  });

  it("interpretation replaces the field only on «Usar»", async () => {
    generate.mockResolvedValue("Interpretación.");
    const { onPatch } = setup(
      "interpretation",
      base({ competencyId: "comunica-oralmente" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Redactar interpretación" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Usar este texto" }),
    );
    expect(onPatch).toHaveBeenCalledWith({ interpretation: "Interpretación." });
    expect(JSON.stringify(generate.mock.calls[0][1])).not.toMatch(
      /Valentina|Mateo/,
    );
  });

  it("photo description is hidden with DeepSeek or without photos", () => {
    setup("photo", base({ evidence: ["a/evidencia-1.jpg"] }));
    expect(
      screen.queryByRole("button", { name: "Describir la foto" }),
    ).toBeNull();
  });

  it("photo description is offered with Gemini", () => {
    setup("photo", base({ evidence: ["a/evidencia-1.jpg"] }), { ...on, provider: "gemini" });
    expect(screen.getByRole("button", { name: "Describir la foto" })).toBeInTheDocument();
  });

  it("photo description with Claude sends the first photo and appends on «Usar»", async () => {
    const blob = new Blob(["x"], { type: "image/jpeg" });
    const readFile = vi.fn().mockResolvedValue(blob);
    generate.mockResolvedValue("Un niño pinta.");
    const { onPatch } = setup(
      "photo",
      base({ evidence: ["a/evidencia-1.jpg", "a/evidencia-2.jpg"] }),
      { ...on, provider: "claude" },
      readFile,
    );
    fireEvent.click(screen.getByRole("button", { name: "Describir la foto" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Usar este texto" }),
    );
    expect(readFile).toHaveBeenCalledWith("a/evidencia-1.jpg");
    expect(generate.mock.calls[0][1].images).toEqual([blob]);
    expect(onPatch).toHaveBeenCalledWith({
      evidenceText:
        "Valentina dijo: quiero pintar. Mateo ayudó a Gonzalo Ttito.\n\nUn niño pinta.",
    });
  });

  it("«Cancelar» aborts and shows nothing", async () => {
    generate.mockImplementation(
      (_s, r) =>
        new Promise((_res, rej) =>
          r.signal?.addEventListener("abort", () =>
            rej(new AiError("network")),
          ),
        ),
    );
    setup("objective", base());
    fireEvent.click(
      screen.getByRole("button", { name: "Redactar de forma objetiva" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Redactar de forma objetiva",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByTestId("ai-result")).toBeNull();
  });

  it("late result: edited field asks before replacing", async () => {
    let resolve: (t: string) => void = () => undefined;
    generate.mockImplementation(
      () => new Promise<string>((r) => (resolve = r)),
    );
    const onPatch = vi.fn();
    const props = {
      kind: "objective" as const,
      settings: on,
      classroom,
      yearStudents: students,
      noteStudents: [],
      schoolYear: 2026,
      storage: { readFile: vi.fn() },
      onPatch,
    };
    const { rerender } = render(<AiNoteAction {...props} note={base()} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Redactar de forma objetiva" }),
    );
    await waitFor(() => expect(generate).toHaveBeenCalled());
    rerender(
      <AiNoteAction
        {...props}
        note={base({ evidenceText: "Texto nuevo del usuario" })}
      />,
    );
    resolve("Resultado IA");
    fireEvent.click(
      await screen.findByRole("button", { name: "Usar este texto" }),
    );
    expect(
      screen.getByText("El texto cambió mientras la IA respondía."),
    ).toBeTruthy();
    expect(onPatch).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Reemplazar de todos modos" }),
    );
    expect(onPatch).toHaveBeenCalledWith({ evidenceText: "Resultado IA" });
  });

  it("late suggestion maps indexes against what was sent, not the current note", async () => {
    let resolve: (t: string) => void = () => undefined;
    generate.mockImplementation(
      (_s, r) =>
        new Promise<string>((res) => {
          r.onText?.('{"competencyId": "comu');
          resolve = res;
        }),
    );
    const onPatch = vi.fn();
    const props = {
      kind: "suggest" as const,
      settings: on,
      classroom,
      yearStudents: students,
      noteStudents: [],
      schoolYear: 2026,
      storage: { readFile: vi.fn() },
      onPatch,
    };
    const { rerender } = render(
      <AiNoteAction
        {...props}
        note={base({
          areaId: "comunicacion",
          competencyId: "comunica-oralmente",
        })}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Sugerir competencia y desempeños" }),
    );
    await waitFor(() => expect(generate).toHaveBeenCalled());
    expect(await screen.findByTestId("ai-result")).toHaveTextContent(
      "Generando…",
    );
    rerender(
      <AiNoteAction
        {...props}
        note={base({ areaId: "comunicacion", competencyId: "lee" })}
      />,
    );
    resolve(
      JSON.stringify({
        competencyId: "comunica-oralmente",
        performanceIndexes: [globalIndex("comunica-oralmente")],
        reason: "",
      }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Usar este texto" }),
    );
    const first = getPerformances("comunica-oralmente", "4y")[0];
    expect(onPatch).toHaveBeenCalledWith({
      areaId: "comunicacion",
      competencyId: "comunica-oralmente",
      performances: [
        { competencyId: "comunica-oralmente", band: "4y", text: first.text },
      ],
    });
  });

  it("invalid final suggestion shows an error and no «Usar»", async () => {
    generate.mockResolvedValue("no es json");
    setup("suggest", base());
    fireEvent.click(
      screen.getByRole("button", { name: "Sugerir competencia y desempeños" }),
    );
    expect((await screen.findByRole("alert")).textContent).toMatch(
      /sugerencia válida/,
    );
    expect(
      screen.queryByRole("button", { name: "Usar este texto" }),
    ).toBeNull();
  });

  it("photo context does not contain real names", async () => {
    generate.mockResolvedValue("Descripción");
    setup(
      "photo",
      base({ evidence: ["a/evidencia-1.jpg"] }),
      { ...on, provider: "claude" },
      vi.fn().mockResolvedValue(new Blob(["x"])),
    );
    fireEvent.click(screen.getByRole("button", { name: "Describir la foto" }));
    await screen.findByText("Descripción");
    expect(JSON.stringify(generate.mock.calls[0][1].prompt)).not.toMatch(
      /Valentina|Mateo|Quispe|Huanca/,
    );
  });
});
