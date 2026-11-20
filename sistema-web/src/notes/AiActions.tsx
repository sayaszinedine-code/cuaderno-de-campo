"use client";

import { useEffect, useRef, useState } from "react";
import { generateWithSettings } from "@/ai";
import type { AiSettings } from "@/ai/settings";
import { AI_ERROR_MESSAGES, AiError } from "@/ai/types";
import { anonymize } from "@/ai/anonymize";
import {
  describePhoto,
  interpretation,
  objectiveEvidence,
  parseSuggestion,
  suggestCompetency,
  type BuiltPrompt,
} from "@/ai/prompts";
import { areaIdFor, getPerformances } from "@/curriculum";
import { activeCompetencies } from "@/domain/classrooms";
import { performanceOptions } from "@/domain/notes";
import type {
  Classroom,
  FieldNote,
  SelectedPerformance,
  Student,
} from "@/domain/schema";
import type { Storage } from "@/storage/types";

/** Settings that allow any AI call: enabled with recorded consent. */
export const aiAvailable = (s: AiSettings): boolean =>
  s.enabled && Boolean(s.consentAt);

export type AiInput = BuiltPrompt & { images?: Blob[] };

/**
 * One AI button with its result box. The text only reaches the form when the
 * teacher clicks «Usar este texto»; nothing is written otherwise.
 * `build` returns the request (already anonymized) or a message to show when
 * there is nothing to send.
 */
export function AiAction({
  label,
  settings,
  build,
  onUse,
  show,
}: {
  label: string;
  settings: AiSettings;
  build: () => Promise<AiInput | string> | AiInput | string;
  onUse: (text: string) => void;
  /** Text shown in the box for the raw model output (default: as is). */
  show?: (text: string) => string;
}) {
  const [running, setRunning] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  if (!aiAvailable(settings)) return null;

  async function run() {
    if (running) return;
    setError("");
    setText(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setRunning(true);
    try {
      const built = await build();
      if (typeof built === "string") {
        setError(built);
        return;
      }
      const full = await generateWithSettings(settings, {
        ...built,
        signal: ctrl.signal,
        onText: (t) => {
          if (!ctrl.signal.aborted) setText(t);
        },
      });
      if (!ctrl.signal.aborted) setText(full);
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setText(null);
      setError(
        e instanceof AiError
          ? AI_ERROR_MESSAGES[e.code]
          : AI_ERROR_MESSAGES.other,
      );
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
      setRunning(false);
    }
  }

  function cancel() {
    abortRef.current?.abort();
    abortRef.current = null;
    setText(null);
    setRunning(false);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-secondary"
          disabled={running}
          onClick={() => void run()}
        >
          {label}
        </button>
        {running && (
          <button type="button" className="btn-secondary" onClick={cancel}>
            Cancelar
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft p-3">
          {error}
        </p>
      )}
      {text !== null && (
        <div className="card space-y-2 p-3" aria-live="polite">
          <p className="whitespace-pre-wrap" data-testid="ai-result">
            {show ? show(text) : text}
          </p>
          {!running && (
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  onUse(text);
                  setText(null);
                }}
              >
                Usar este texto
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setText(null)}
              >
                Descartar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export type AiKind = "objective" | "suggest" | "interpretation" | "photo";

const LABELS: Record<AiKind, string> = {
  objective: "Redactar de forma objetiva",
  suggest: "Sugerir competencia y desempeños",
  interpretation: "Redactar interpretación",
  photo: "Describir la foto",
};
const NO_EVIDENCE = "Escribe primero la evidencia.";
const NO_PHOTO = "No se pudo leer la foto.";
const BAD_SUGGESTION =
  "La IA no devolvió una sugerencia válida. Intenta de nuevo.";

/** AI action bound to one field of the note. Writes to the note only through `onPatch`, after «Usar». */
export function AiNoteAction({
  kind,
  settings,
  note,
  classroom,
  classroomStudents,
  noteStudents,
  schoolYear,
  storage,
  onPatch,
}: {
  kind: AiKind;
  settings: AiSettings;
  note: FieldNote;
  classroom: Classroom;
  /** Every student of the classroom (active and archived): all of them are anonymized. */
  classroomStudents: Student[];
  /** Students selected in the note (used to pick the default age band). */
  noteStudents: Student[];
  schoolYear: number;
  storage: Pick<Storage, "readFile">;
  onPatch: (p: Partial<FieldNote>) => void;
}) {
  if (
    kind === "photo" &&
    (settings.provider !== "claude" || note.evidence.length === 0)
  )
    return null;

  const clean = (t: string) => anonymize(t, classroomStudents).text;
  const competencies = activeCompetencies(classroom);
  const selected = competencies.find((c) => c.id === note.competencyId);

  /** Desempeños of the default band for the selected competency, in the order shown to the model. */
  const bandItems = (): SelectedPerformance[] => {
    if (!selected) return [];
    const band = performanceOptions({
      classroom,
      students: noteStudents,
      competencyId: selected.id,
      date: note.date,
      schoolYear,
    }).defaultBand;
    if (!band) return [];
    return getPerformances(selected.id, band).map((p) => ({
      competencyId: selected.id,
      band,
      text: p.text,
    }));
  };

  const build = async (): Promise<AiInput | string> => {
    if (kind === "photo") {
      const blob = await storage.readFile(note.evidence[0]);
      if (!blob) return NO_PHOTO;
      const context = note.evidenceText.trim()
        ? clean(note.evidenceText)
        : undefined;
      return { ...describePhoto(context), images: [blob] };
    }
    if (!note.evidenceText.trim()) return NO_EVIDENCE;
    const evidence = clean(note.evidenceText);
    if (kind === "objective") return objectiveEvidence(evidence);
    if (kind === "interpretation") {
      return interpretation(
        evidence,
        selected?.name ?? "Sin competencia",
        note.performances.map((p) => p.text),
      );
    }
    const list = bandItems().map((p, i) => ({ index: i + 1, text: p.text }));
    return suggestCompetency(
      evidence,
      competencies.map((c) => ({ id: c.id, name: c.name })),
      list,
    );
  };

  const onUse = (text: string) => {
    if (kind === "objective") return onPatch({ evidenceText: text });
    if (kind === "interpretation") return onPatch({ interpretation: text });
    if (kind === "photo") {
      const current = note.evidenceText.trimEnd();
      return onPatch({
        evidenceText: current ? `${current}\n\n${text}` : text,
      });
    }
    const s = parseSuggestion(text);
    const comp = s && competencies.find((c) => c.id === s.competencyId);
    if (!s || !comp) return;
    // Indexes refer to the list sent, which belongs to the competency selected at that moment.
    const items = bandItems();
    const performances: SelectedPerformance[] =
      selected && comp.id === selected.id
        ? [...new Set(s.performanceIndexes)].flatMap((i) =>
            Number.isInteger(i) && items[i - 1] ? [items[i - 1]] : [],
          )
        : [];
    onPatch({
      areaId: areaIdFor(comp, classroom.cycle),
      competencyId: comp.id,
      performances,
    });
  };

  const show = (text: string): string => {
    if (kind !== "suggest") return text;
    const s = parseSuggestion(text);
    const comp = s && competencies.find((c) => c.id === s.competencyId);
    return comp
      ? `${comp.name}${s.reason ? `\n${s.reason}` : ""}`
      : BAD_SUGGESTION;
  };

  return (
    <AiAction
      label={LABELS[kind]}
      settings={settings}
      build={build}
      onUse={onUse}
      show={show}
    />
  );
}
