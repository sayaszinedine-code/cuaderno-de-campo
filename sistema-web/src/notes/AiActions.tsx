"use client";

import { useEffect, useRef, useState } from "react";
import { generateWithSettings } from "@/ai";
import type { AiSettings } from "@/ai/settings";
import { AI_ERROR_MESSAGES, AI_PROVIDERS, AiError } from "@/ai/types";
import { anonymize, deanonymize } from "@/ai/anonymize";
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
  /** Text shown in the box for the raw model output, also while streaming (default: as is). */
  show?: (text: string, snap: S) => string;
  /** Show «Generando…» instead of partial output while streaming. */
  hideStream?: boolean;
}) {
  const [running, setRunning] = useState(false);
  /** `final` is false while streaming: only a final result can be used. */
  const [result, setResult] = useState<{
    text: string;
    snap: S;
    final: boolean;
  } | null>(null);
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
          if (!ctrl.signal.aborted) setResult({ text: t, snap, final: false });
        },
      });
      if (ctrl.signal.aborted) return;
      const problem = check?.(full, snap) ?? null;
      if (problem) {
        setResult(null);
        setError(problem);
      } else {
        setResult({ text: full, snap, final: true });
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
    if (!result || !result.final) return;
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
              : show
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

/**
 * What was sent: the target field's value, the exact list suggestion indexes refer to, and the
 * legend to restore the children's names locally (the legend itself is never sent).
 */
interface Snap {
  field: string;
  items: SelectedPerformance[];
  legend: Record<string, string>;
}

/** AI action bound to one field of the note. Writes to the note only through `onPatch`, after «Usar». */
export function AiNoteAction({
  kind,
  settings,
  note,
  classroom,
  yearStudents,
  noteStudents,
  schoolYear,
  storage,
  onPatch,
}: {
  kind: AiKind;
  settings: AiSettings;
  note: FieldNote;
  classroom: Classroom;
  /** Every student of the school year (all classrooms, active and archived): all of them are anonymized. */
  yearStudents: Student[];
  /** Students selected in the note (used to pick the default age band). */
  noteStudents: Student[];
  schoolYear: number;
  storage: Pick<Storage, "readFile">;
  onPatch: (p: Partial<FieldNote>) => void;
}) {
  if (
    kind === "photo" &&
    (!AI_PROVIDERS[settings.provider].images || note.evidence.length === 0)
  )
    return null;

  const competencies = activeCompetencies(classroom);
  const selected = competencies.find((c) => c.id === note.competencyId);
  const currentField =
    kind === "interpretation" ? note.interpretation : note.evidenceText;

  /** Default-band desempeños of every active competency, in the order (and numbering) shown to the model. */
  const bandItems = (): SelectedPerformance[] =>
    competencies.flatMap((c) => {
      const band = performanceOptions({
        classroom,
        students: noteStudents,
        competencyId: c.id,
        date: note.date,
        schoolYear,
      }).defaultBand;
      return band
        ? getPerformances(c.id, band).map((p) => ({
            competencyId: c.id,
            band,
            text: p.text,
          }))
        : [];
    });

  const build = async (): Promise<
    { request: AiInput; snap: Snap } | string
  > => {
    const snap: Snap = { field: currentField, items: [], legend: {} };
    const clean = (t: string) => {
      const r = anonymize(t, yearStudents);
      Object.assign(snap.legend, r.legend);
      return r.text;
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
    const names = new Map(competencies.map((c) => [c.id, c.name]));
    const list = snap.items.map((p, i) => ({
      index: i + 1,
      competency: names.get(p.competencyId) ?? p.competencyId,
      text: p.text,
    }));
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

  const onUse = (raw: string, snap: Snap) => {
    const text = deanonymize(raw, snap.legend);
    if (kind === "objective") return onPatch({ evidenceText: text });
    if (kind === "interpretation") return onPatch({ interpretation: text });
    if (kind === "photo") {
      const current = note.evidenceText.trimEnd();
      return onPatch({
        evidenceText: current ? `${current}\n\n${text}` : text,
      });
    }
    const parsed = parse(raw);
    if (!parsed) return;
    // Indexes refer to the list sent; only desempeños of the suggested competency are kept.
    const performances = [...new Set(parsed.s.performanceIndexes)].flatMap(
      (i) => {
        const item = i >= 1 ? snap.items[i - 1] : undefined;
        return item && item.competencyId === parsed.comp.id ? [item] : [];
      },
    );
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
      show={(text, snap) => {
        if (kind !== "suggest") return deanonymize(text, snap.legend);
        const parsed = parse(text);
        return parsed
          ? `${parsed.comp.name}${parsed.s.reason ? `\n${deanonymize(parsed.s.reason, snap.legend)}` : ""}`
          : BAD_SUGGESTION;
      }}
      hideStream={kind === "suggest"}
    />
  );
}
