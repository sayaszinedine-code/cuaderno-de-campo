"use client";

import { anonymize, deanonymize } from "@/ai/anonymize";
import { descriptiveConclusion } from "@/ai/prompts";
import type { AiSettings } from "@/ai/settings";
import { LEVEL_LABELS, type FieldNote, type Level, type Student } from "@/domain/schema";
import { AiAction, aiAvailable, type AiInput } from "@/notes/AiActions";

/** Most recent notes sent to the model, to bound the prompt size. */
export const MAX_EVIDENCES = 15;

/** Legend to restore the children's names locally (never sent) and the conclusion the request was based on. */
interface Snap {
  conclusion: string;
  legend: Record<string, string>;
}

/** Text of one note for the prompt: date, evidence, interpretation and the desempeños of the competency. */
function noteText(n: FieldNote, competencyId: string): string {
  const lines = [`Fecha: ${n.date}`];
  if (n.evidenceText.trim()) lines.push(`Evidencia: ${n.evidenceText.trim()}`);
  if (n.interpretation.trim()) lines.push(`Interpretación: ${n.interpretation.trim()}`);
  const perfs = n.performances.filter((p) => p.competencyId === competencyId).map((p) => `- ${p.text}`);
  if (perfs.length > 0) lines.push(`Desempeños:\n${perfs.join("\n")}`);
  return lines.join("\n");
}

/**
 * «Redactar conclusión con IA»: drafts the descriptive conclusion from the cuaderno evidences (newest
 * first). Names are anonymized with every student of the year; the result only reaches the field through
 * `onUse`, after the teacher clicks «Usar este texto».
 */
export function AiConclusion({
  settings,
  competencyId,
  competencyName,
  level,
  notes,
  yearStudents,
  current,
  onUse,
}: {
  settings: AiSettings;
  competencyId: string;
  competencyName: string;
  level?: Level;
  /** Evidence notes, newest first. */
  notes: FieldNote[];
  /** Every student of the school year: all of them are anonymized. */
  yearStudents: Student[];
  /** Current value of the conclusion field. */
  current: string;
  onUse: (text: string) => void;
}) {
  if (!aiAvailable(settings) || notes.length === 0) return null;

  const build = async (): Promise<{ request: AiInput; snap: Snap }> => {
    const snap: Snap = { conclusion: current, legend: {} };
    const evidences = notes.slice(0, MAX_EVIDENCES).map((n) => {
      const r = anonymize(noteText(n, competencyId), yearStudents);
      Object.assign(snap.legend, r.legend);
      return r.text;
    });
    const request = descriptiveConclusion({
      competency: competencyName,
      level: level ? `${level} — ${LEVEL_LABELS[level]}` : undefined,
      evidences,
    });
    return { request, snap };
  };

  return (
    <AiAction<Snap>
      label="Redactar conclusión con IA"
      settings={settings}
      build={build}
      onUse={(raw, snap) => onUse(deanonymize(raw, snap.legend))}
      isStale={(snap) => snap.conclusion !== current}
      show={(text, snap) => deanonymize(text, snap.legend)}
    />
  );
}
