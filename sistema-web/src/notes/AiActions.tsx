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
 * `build` returns the request (already anonymized) plus a snapshot of what was
 * sent, or a message to show when there is nothing to send. The snapshot comes
 * back in `onUse`/`isStale`, so a late answer is never applied to newer data.
 */
export function AiAction<S>({
  label,
  settings,
  build,
  onUse,
  isStale,
  check,
  show,
  hideStream,
}: {
  label: string;
  settings: AiSettings;
  build: () => Promise<{ request: AiInput; snap: S } | string>;
  onUse: (text: string, snap: S) => void;
  /** True when the target field changed since the request started. */
  isStale?: (snap: S) => boolean;
  /** Error message when the final text cannot be used; the box is not shown. */
  check?: (text: string, snap: S) => string | null;
  /** Text shown in the box for the raw model output (default: as is). */
  show?: (text: string, snap: S) => string;
  /** Show «Generando…» instead of partial output while streaming. */
  hideStream?: boolean;
}) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ text: string; snap: S | null } | null>(
    null,
  );
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  if (!aiAvailable(settings)) return null;

  async function run() {
    if (running) return;
    setError("");
    setResult(null);
    setConfirming(false);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setRunning(true);
    try {
      const built = await build();
      if (ctrl.signal.aborted) return;
      if (typeof built === "string") {
        setError(built);
        return;
      }
      const { request, snap } = built;
      const full = await generateWithSettings(settings, {
        ...request,
        signal: ctrl.signal,
        onText: (t) => {
          if (!ctrl.signal.aborted) setResult({ text: t, snap: null });
        },
      });
      if (ctrl.signal.aborted) return;
      const problem = check?.(full, snap) ?? null;
      if (problem) {
        setResult(null);
        setError(problem);
      } else {
        setResult({ text: full, snap });
      }
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setResult(null);
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
    setResult(null);
    setRunning(false);
  }

  function close() {
    setResult(null);
    setConfirming(false);
  }

  function use(force: boolean) {
    if (!result || result.snap === null) return;
    if (!force && isStale?.(result.snap)) {
      setConfirming(true);
      return;
    }
    onUse(result.text, result.snap);
    close();
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
      {result !== null && (
        <div className="card space-y-2 p-3" aria-live="polite">
          <p className="whitespace-pre-wrap" data-testid="ai-result">
            {running && hideStream
              ? "Generando…"
              : show && result.snap !== null
                ? show(result.text, result.snap)
                : result.text}
          </p>
          {!running && confirming && (
            <>
              <p role="alert">El texto cambió mientras la IA respondía.</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => use(true)}
                >
                  Reemplazar de todos modos
                </button>
                <button type="button" className="btn-secondary" onClick={close}>
                  Descartar
                </button>
              </div>
            </>
          )}
          {!running && !confirming && (
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-primary"
                onClick={() => use(false)}
              >
                Usar este texto
              </button>
              <button type="button" className="btn-secondary" onClick={close}>
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

/** What was sent: the target field's value and, for suggestions, the exact lists the indexes refer to. */
interface Snap {
  field: string;
  competencyId?: string;
  items: SelectedPerformance[];
}

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
  const currentField =
    kind === "interpretation" ? note.interpretation : note.evidenceText;

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

  const build = async (): Promise<
    { request: AiInput; snap: Snap } | string
  > => {
    const snap: Snap = {
      field: currentField,
      competencyId: selected?.id,
      items: [],
    };
    if (kind === "photo") {
      const blob = await storage.readFile(note.evidence[0]);
      if (!blob) return NO_PHOTO;
      const context = note.evidenceText.trim()
        ? clean(note.evidenceText)
        : undefined;
      return { request: { ...describePhoto(context), images: [blob] }, snap };
    }
    if (!note.evidenceText.trim()) return NO_EVIDENCE;
    const evidence = clean(note.evidenceText);
    if (kind === "objective")
      return { request: objectiveEvidence(evidence), snap };
    if (kind === "interpretation") {
      const prompt = interpretation(
        evidence,
        selected?.name ?? "Sin competencia",
        note.performances.map((p) => p.text),
      );
      return { request: prompt, snap };
    }
    snap.items = bandItems();
    const list = snap.items.map((p, i) => ({ index: i + 1, text: p.text }));
    const prompt = suggestCompetency(
      evidence,
      competencies.map((c) => ({ id: c.id, name: c.name })),
      list,
    );
    return { request: prompt, snap };
  };

  const parse = (text: string) => {
    const s = parseSuggestion(text);
    const comp = s && competencies.find((c) => c.id === s.competencyId);
    return s && comp ? { s, comp } : null;
  };

  const onUse = (text: string, snap: Snap) => {
    if (kind === "objective") return onPatch({ evidenceText: text });
    if (kind === "interpretation") return onPatch({ interpretation: text });
    if (kind === "photo") {
      const current = note.evidenceText.trimEnd();
      return onPatch({
        evidenceText: current ? `${current}\n\n${text}` : text,
      });
    }
    const parsed = parse(text);
    if (!parsed) return;
    // Indexes refer to the list sent, which belongs to the competency selected when the request started.
    const performances =
      snap.competencyId === parsed.comp.id
        ? [...new Set(parsed.s.performanceIndexes)].flatMap((i) =>
            snap.items[i - 1] ? [snap.items[i - 1]] : [],
          )
        : [];
    onPatch({
      areaId: areaIdFor(parsed.comp, classroom.cycle),
      competencyId: parsed.comp.id,
      performances,
    });
  };

  const replaces = kind === "objective" || kind === "interpretation";

  return (
    <AiAction<Snap>
      label={LABELS[kind]}
      settings={settings}
      build={build}
      onUse={onUse}
      isStale={replaces ? (snap) => snap.field !== currentField : undefined}
      check={
        kind === "suggest"
          ? (text) => (parse(text) ? null : BAD_SUGGESTION)
          : undefined
      }
      show={
        kind === "suggest"
          ? (text) => {
              const parsed = parse(text);
              return parsed
                ? `${parsed.comp.name}${parsed.s.reason ? `\n${parsed.s.reason}` : ""}`
                : BAD_SUGGESTION;
            }
          : undefined
      }
      hideStream={kind === "suggest"}
    />
  );
}
