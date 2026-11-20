"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { LEVELS, LEVEL_LABELS, type Level } from "@/domain/schema";

export type GradeFormValues = { level?: Level; conclusion: string };

const FOCUSABLE = "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]";

/**
 * Editor of one grade cell: side panel on wide screens, bottom sheet on mobile. Form state is copied from
 * `initial` on mount (the parent re-keys it per cell). `children` is the slot for extra actions (AI).
 */
export function GradeCellEditor({
  studentName,
  competencyName,
  scale,
  initial,
  mobile,
  evidence,
  onSave,
  onReset,
  onClose,
  opener,
  children,
}: {
  studentName: string;
  competencyName: string;
  /** Whether the classroom grades with the AD/A/B/C scale. */
  scale: boolean;
  initial: GradeFormValues;
  mobile: boolean;
  evidence: ReactNode;
  /** Resolves true when the grade was saved. */
  onSave: (values: GradeFormValues) => Promise<boolean>;
  /** When given, shows «Volver al automático»; resolves true when the override was removed. */
  onReset?: () => Promise<boolean>;
  onClose: () => void;
  /** Element that opened the editor; gets focus back on close. */
  opener?: HTMLElement | null;
  children?: (api: { values: GradeFormValues; setConclusion: (text: string) => void }) => ReactNode;
}) {
  const [level, setLevel] = useState<Level | undefined>(initial.level);
  const [conclusion, setConclusion] = useState(initial.conclusion);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const dirty = level !== initial.level || conclusion !== initial.conclusion;
  const busy = useRef(false);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => opener?.focus?.();
  }, [opener]);

  /** Backdrop click / Escape: closes, unless there are unsaved changes (then asks first). */
  const requestClose = () => {
    if (dirty) setConfirmDiscard(true);
    else onClose();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      requestClose();
      return;
    }
    if (e.key !== "Tab" || !panel.current) return;
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const save = async () => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setFailed(false);
    const ok = await onSave({ level: scale ? level : undefined, conclusion });
    if (!ok) {
      busy.current = false;
      setFailed(true);
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!onReset || busy.current) return;
    busy.current = true;
    setSaving(true);
    setFailed(false);
    const ok = await onReset();
    if (!ok) {
      busy.current = false;
      setFailed(true);
      setSaving(false);
    }
  };

  const position = mobile
    ? "inset-x-0 bottom-0 max-h-[85vh] rounded-b-none"
    : "inset-y-0 right-0 w-full max-w-md rounded-r-none";

  return (
    <>
      <div className="fixed inset-0 z-30 bg-foreground/30" aria-hidden="true" onClick={requestClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="grade-editor-title"
        onKeyDown={onKeyDown}
        className={`card fixed z-40 space-y-4 overflow-y-auto p-4 ${position}`}
      >
        <header>
          <h2 id="grade-editor-title" className="text-lg font-semibold">
            {studentName}
          </h2>
          <p className="text-sm text-muted">{competencyName}</p>
        </header>
        {scale && (
          <fieldset className="space-y-1">
            <legend className="font-medium">Nivel de logro</legend>
            {LEVELS.map((l) => (
              <label key={l} className="flex items-center gap-2">
                <input type="radio" name="level" checked={level === l} onChange={() => setLevel(l)} />
                {`${l} — ${LEVEL_LABELS[l]}`}
              </label>
            ))}
            <label className="flex items-center gap-2">
              <input type="radio" name="level" checked={level === undefined} onChange={() => setLevel(undefined)} />
              Sin nivel
            </label>
          </fieldset>
        )}
        <label className="block">
          Conclusión descriptiva
          <textarea
            className="field"
            rows={4}
            value={conclusion}
            onChange={(e) => setConclusion(e.target.value)}
          />
        </label>
        {children?.({ values: { level, conclusion }, setConclusion })}
        {evidence}
        {confirmDiscard && (
          <div role="alertdialog" aria-label="Descartar los cambios" className="space-y-2 rounded-xl bg-danger-soft p-3">
            <p className="font-medium">¿Descartar los cambios?</p>
            <div className="flex flex-wrap gap-3">
              <button type="button" className="btn-secondary" onClick={onClose}>
                Descartar
              </button>
              <button type="button" className="btn-primary" onClick={() => setConfirmDiscard(false)}>
                Seguir editando
              </button>
            </div>
          </div>
        )}
        {failed && (
          <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm">
            No se pudo guardar la nota. Tus datos siguen aquí; inténtalo de nuevo.
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn-primary" disabled={saving} onClick={() => void save()}>
            Guardar
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          {onReset && (
            <button type="button" className="btn-secondary" disabled={saving} onClick={() => void reset()}>
              Volver al automático
            </button>
          )}
        </div>
      </div>
    </>
  );
}
