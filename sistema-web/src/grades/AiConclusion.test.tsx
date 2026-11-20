import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiSettings } from "@/ai/settings";
import type { AiRequest } from "@/ai/types";
import { newNote } from "@/domain/notes";
import type { FieldNote, Student } from "@/domain/schema";
import { AiConclusion } from "./AiConclusion";

const generate = vi.fn<(s: AiSettings, r: AiRequest) => Promise<string>>();
vi.mock("@/ai", () => ({
  generateWithSettings: (s: AiSettings, r: AiRequest) => generate(s, r),
}));

const student = (id: string, firstNames: string, lastNames: string, classroomId = "c1"): Student =>
  ({ id, classroomId, firstNames, lastNames, birthDate: "2021-05-01", active: true }) as Student;
const students = [
  student("s1", "Valentina", "Quispe"),
  student("s2", "Mateo", "Huanca"),
  student("s3", "Gonzalo", "Ttito", "c2"),
];
const on: AiSettings = { enabled: true, provider: "deepseek", apiKeys: { deepseek: "k" }, consentAt: "2026-01-01T00:00:00Z" };

const note = (over: Partial<FieldNote> = {}): FieldNote => ({
  ...newNote({ classroomId: "c1" }),
  date: "2026-03-02",
  competencyId: "comunica-oralmente",
  evidenceText: "Valentina Quispe dijo: quiero pintar. Mateo ayudó a Gonzalo Ttito.",
  interpretation: "Valentina expresa lo que quiere.",
  performances: [
    { competencyId: "comunica-oralmente", band: "4y", text: "Expresa sus necesidades." },
    { competencyId: "otra", band: "4y", text: "Desempeño de otra competencia." },
  ],
  ...over,
});

function setup(over: Partial<Parameters<typeof AiConclusion>[0]> = {}) {
  const onUse = vi.fn();
  render(
    <AiConclusion
      settings={on}
      competencyId="comunica-oralmente"
      competencyName="Se comunica oralmente"
      level="A"
      notes={[note()]}
      yearStudents={students}
      current=""
      onUse={onUse}
      {...over}
    />,
  );
  return { onUse };
}
const BTN = "Redactar conclusión con IA";

beforeEach(() => generate.mockReset());
afterEach(() => cleanup());

describe("AiConclusion", () => {
  it("is hidden when the assistant is off or there is no evidence", () => {
    setup({ settings: { ...on, enabled: false } });
    expect(screen.queryByRole("button", { name: BTN })).toBeNull();
    cleanup();
    setup({ notes: [] });
    expect(screen.queryByRole("button", { name: BTN })).toBeNull();
  });

  it("sends the evidence without real names and applies restored names only after «Usar»", async () => {
    generate.mockResolvedValue("V. Q. logra expresarse. M. H. la apoya.");
    const { onUse } = setup();
    fireEvent.click(screen.getByRole("button", { name: BTN }));
    expect(await screen.findByTestId("ai-result")).toHaveTextContent("Valentina Quispe logra expresarse. Mateo Huanca la apoya.");
    const sent = JSON.stringify(generate.mock.calls[0][1]);
    expect(sent).not.toMatch(/Valentina|Mateo|Gonzalo|Quispe|Huanca|Ttito/);
    expect(sent).toContain("quiero pintar");
    expect(sent).toContain("Expresa sus necesidades.");
    expect(sent).not.toContain("Desempeño de otra competencia.");
    expect(sent).toContain("2026-03-02");
    expect(onUse).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Usar este texto" }));
    expect(onUse).toHaveBeenCalledWith("Valentina Quispe logra expresarse. Mateo Huanca la apoya.");
  });

  it("sends only the 15 most recent notes", async () => {
    generate.mockResolvedValue("ok");
    const many = Array.from({ length: 20 }, (_, i) =>
      note({ id: `n${i}`, evidenceText: `hecho-${String(i).padStart(2, "0")}` }),
    );
    setup({ notes: many });
    fireEvent.click(screen.getByRole("button", { name: BTN }));
    await screen.findByTestId("ai-result");
    const prompt = generate.mock.calls[0][1].prompt;
    expect(prompt).toContain("hecho-00");
    expect(prompt).toContain("hecho-14");
    expect(prompt).not.toContain("hecho-15");
  });
});
