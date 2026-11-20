import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiSettings } from "@/ai/settings";
import { AiError, type AiRequest } from "@/ai/types";
import { getPerformances } from "@/curriculum";
import { newNote } from "@/domain/notes";
import type { Classroom, FieldNote, Student } from "@/domain/schema";
import { AiNoteAction } from "./AiActions";

const generate = vi.fn<(s: AiSettings, r: AiRequest) => Promise<string>>();
vi.mock("@/ai", () => ({ generateWithSettings: (s: AiSettings, r: AiRequest) => generate(s, r) }));

const classroom: Classroom = {
  id: "c1", name: "Girasoles", cycle: "II", bands: ["4y"], disabledCompetencyIds: [], cycleIGrading: "descriptive",
};
const student = (id: string, firstNames: string, lastNames: string, active = true): Student => ({
  id, classroomId: "c1", firstNames, lastNames, birthDate: "2021-05-01", active,
} as Student);
const students = [student("s1", "Valentina", "Quispe"), student("s2", "Mateo", "Huanca", false)];
const on: AiSettings = { enabled: true, provider: "deepseek", apiKey: "k", consentAt: "2026-01-01T00:00:00Z" };
const base = (over: Partial<FieldNote> = {}): FieldNote => ({
  ...newNote({ classroomId: "c1" }), evidenceText: "Valentina dijo: quiero pintar. Mateo ayudó.", ...over,
});

function setup(kind: "objective" | "suggest" | "interpretation" | "photo", note: FieldNote, settings = on, readFile = vi.fn()) {
  const onPatch = vi.fn();
  render(
    <AiNoteAction
      kind={kind}
      settings={settings}
      note={note}
      classroom={classroom}
      classroomStudents={students}
      noteStudents={[]}
      schoolYear={2026}
      storage={{ readFile }}
      onPatch={onPatch}
    />,
  );
  return { onPatch, readFile };
}

beforeEach(() => {
  generate.mockReset();
});

describe("AiNoteAction", () => {
  it("shows nothing when the assistant is not enabled with consent", () => {
    setup("objective", base(), { ...on, consentAt: undefined });
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("never sends real names (active or archived) and does not touch the field until «Usar»", async () => {
    generate.mockResolvedValue("V. dijo: quiero pintar.");
    const { onPatch } = setup("objective", base());
    fireEvent.click(screen.getByRole("button", { name: "Redactar de forma objetiva" }));
    expect(await screen.findByText("V. dijo: quiero pintar.")).toBeTruthy();
    const sent = JSON.stringify(generate.mock.calls[0][1]);
    expect(sent).not.toMatch(/Valentina|Mateo|Quispe|Huanca/);
    expect(onPatch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Usar este texto" }));
    expect(onPatch).toHaveBeenCalledWith({ evidenceText: "V. dijo: quiero pintar." });
  });

  it("«Descartar» leaves the field intact", async () => {
    generate.mockResolvedValue("Texto");
    const { onPatch } = setup("objective", base());
    fireEvent.click(screen.getByRole("button", { name: "Redactar de forma objetiva" }));
    fireEvent.click(await screen.findByRole("button", { name: "Descartar" }));
    expect(onPatch).not.toHaveBeenCalled();
    expect(screen.queryByText("Texto")).toBeNull();
  });

  it("shows the error message and keeps the field", async () => {
    generate.mockImplementation(async () => {
      throw new AiError("rate-limit");
    });
    const { onPatch } = setup("objective", base());
    fireEvent.click(screen.getByRole("button", { name: "Redactar de forma objetiva" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/límite de uso/);
    expect(onPatch).not.toHaveBeenCalled();
  });

  it("suggestion sets area, competency and valid desempeños; ignores invalid indexes", async () => {
    const perfs = getPerformances("comunica-oralmente", "4y");
    generate.mockResolvedValue(
      JSON.stringify({ competencyId: "comunica-oralmente", performanceIndexes: [1, 999, 0], reason: "habla" }),
    );
    const { onPatch } = setup("suggest", base({ competencyId: "comunica-oralmente", areaId: "comunicacion" }));
    fireEvent.click(screen.getByRole("button", { name: "Sugerir competencia y desempeños" }));
    fireEvent.click(await screen.findByRole("button", { name: "Usar este texto" }));
    expect(onPatch).toHaveBeenCalledWith({
      areaId: expect.any(String),
      competencyId: "comunica-oralmente",
      performances: [{ competencyId: "comunica-oralmente", band: "4y", text: perfs[0].text }],
    });
    expect(JSON.stringify(generate.mock.calls[0][1])).not.toMatch(/Valentina|Mateo/);
  });

  it("suggestion without a selected competency leaves desempeños empty and rejects unknown competencies", async () => {
    generate.mockResolvedValueOnce(JSON.stringify({ competencyId: "comunica-oralmente", performanceIndexes: [1], reason: "" }));
    const { onPatch } = setup("suggest", base());
    fireEvent.click(screen.getByRole("button", { name: "Sugerir competencia y desempeños" }));
    fireEvent.click(await screen.findByRole("button", { name: "Usar este texto" }));
    expect(onPatch.mock.calls[0][0]).toMatchObject({ competencyId: "comunica-oralmente", performances: [] });
  });

  it("interpretation replaces the field only on «Usar»", async () => {
    generate.mockResolvedValue("Interpretación.");
    const { onPatch } = setup("interpretation", base({ competencyId: "comunica-oralmente" }));
    fireEvent.click(screen.getByRole("button", { name: "Redactar interpretación" }));
    fireEvent.click(await screen.findByRole("button", { name: "Usar este texto" }));
    expect(onPatch).toHaveBeenCalledWith({ interpretation: "Interpretación." });
    expect(JSON.stringify(generate.mock.calls[0][1])).not.toMatch(/Valentina|Mateo/);
  });

  it("photo description is hidden with DeepSeek or without photos", () => {
    setup("photo", base({ evidence: ["a/evidencia-1.jpg"] }));
    expect(screen.queryByRole("button", { name: "Describir la foto" })).toBeNull();
  });

  it("photo description with Claude sends the first photo and appends on «Usar»", async () => {
    const blob = new Blob(["x"], { type: "image/jpeg" });
    const readFile = vi.fn().mockResolvedValue(blob);
    generate.mockResolvedValue("Un niño pinta.");
    const { onPatch } = setup("photo", base({ evidence: ["a/evidencia-1.jpg", "a/evidencia-2.jpg"] }), { ...on, provider: "claude" }, readFile);
    fireEvent.click(screen.getByRole("button", { name: "Describir la foto" }));
    fireEvent.click(await screen.findByRole("button", { name: "Usar este texto" }));
    expect(readFile).toHaveBeenCalledWith("a/evidencia-1.jpg");
    expect(generate.mock.calls[0][1].images).toEqual([blob]);
    expect(onPatch).toHaveBeenCalledWith({ evidenceText: "Valentina dijo: quiero pintar. Mateo ayudó.\n\nUn niño pinta." });
  });

  it("«Cancelar» aborts and shows nothing", async () => {
    generate.mockImplementation((_s, r) => new Promise((_res, rej) => r.signal?.addEventListener("abort", () => rej(new AiError("network")))));
    setup("objective", base());
    fireEvent.click(screen.getByRole("button", { name: "Redactar de forma objetiva" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Redactar de forma objetiva" }) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByTestId("ai-result")).toBeNull();
  });
});
