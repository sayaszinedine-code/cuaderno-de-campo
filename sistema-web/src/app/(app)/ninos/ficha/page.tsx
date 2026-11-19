"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { archiveStudent, classroomLabel, restoreStudent, todayISO, updateStudent } from "@/domain/classrooms";
import { formatAge } from "@/domain/age";
import { studentDir } from "@/domain/paths";
import { compressPhoto, PHOTO_ERROR } from "@/domain/photo";
import type { Student } from "@/domain/schema";
import { useWorkspace } from "@/workspace/WorkspaceProvider";

type Details = Pick<Student, "dni" | "guardian" | "guardianPhone" | "motherTongue" | "healthNotes">;

export default function FichaPage() {
  const [id, setId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    setId(new URLSearchParams(window.location.search).get("id"));
  }, []);

  const { yearData } = useWorkspace();
  if (id === undefined) return null;
  const student = yearData.students.find((s) => s.id === id);
  if (!student) {
    return (
      <div className="space-y-3">
        <p>No se encontró al niño.</p>
        <Link href="/ninos/" className="underline">
          Volver a Niños
        </Link>
      </div>
    );
  }
  return <Ficha key={student.id} student={student} />;
}

function Ficha({ student }: { student: Student }) {
  const { yearData, year, storage, update } = useWorkspace();
  const classroom = yearData.classrooms.find((c) => c.id === student.classroomId);
  const [form, setForm] = useState<Details>({
    dni: student.dni ?? "",
    guardian: student.guardian ?? "",
    guardianPhone: student.guardianPhone ?? "",
    motherTongue: student.motherTongue ?? "",
    healthNotes: student.healthNotes ?? "",
  });
  const [message, setMessage] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const set = (key: keyof Details) => (e: { target: { value: string } }) => {
    setMessage("");
    setForm((f) => ({ ...f, [key]: e.target.value }));
  };

  useEffect(() => {
    if (!student.photo) {
      setPhotoUrl(null);
      return;
    }
    let url: string | null = null;
    let cancelled = false;
    storage
      .readFile(student.photo)
      .then((blob) => {
        if (cancelled || !blob) return;
        url = URL.createObjectURL(blob);
        setPhotoUrl(url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [storage, student.photo]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    const clean = (v: string | undefined) => (v?.trim() ? v.trim() : undefined);
    await update((d) =>
      updateStudent(d, student.id, {
        dni: clean(form.dni),
        guardian: clean(form.guardian),
        guardianPhone: clean(form.guardianPhone),
        motherTongue: clean(form.motherTongue),
        healthNotes: clean(form.healthNotes),
      }),
    );
    setMessage("Ficha guardada.");
  }

  async function onPhoto(file: File | undefined) {
    if (!file || !classroom) return;
    setPhotoError("");
    let blob: Blob;
    try {
      blob = await compressPhoto(file);
    } catch {
      setPhotoError(PHOTO_ERROR);
      return;
    }
    const path = `${studentDir(year, classroom, student)}foto.jpg`;
    try {
      await storage.writeFile(path, blob);
    } catch {
      setPhotoError("No se pudo guardar la foto. Revisa que la carpeta siga disponible.");
      return;
    }
    await update((d) => updateStudent(d, student.id, { photo: path }));
  }

  const age = student.birthDate ? formatAge(student.birthDate, todayISO()) : "";

  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/ninos/" className="underline">
        Volver a Niños
      </Link>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">
          {student.lastNames}, {student.firstNames}
        </h1>
        <p className="text-muted">
          {[age, classroom ? classroomLabel(classroom) : ""].filter(Boolean).join(" · ")}
          {!student.active && " · Archivado"}
        </p>
      </header>

      <section className="card space-y-3 p-4">
        <h2 className="text-lg font-semibold">Foto</h2>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {photoUrl && <img src={photoUrl} alt="Foto del niño" className="h-40 w-40 rounded-xl object-cover" />}
        <label className="block space-y-1">
          <span>{student.photo ? "Cambiar foto" : "Subir foto (opcional)"}</span>
          <input
            type="file"
            accept="image/*"
            className="field"
            onChange={(e) => {
              void onPhoto(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        {photoError && (
          <p role="alert" className="rounded-xl bg-danger-soft p-3">
            {photoError}
          </p>
        )}
      </section>

      <form onSubmit={onSave} className="card space-y-4 p-4">
        <h2 className="text-lg font-semibold">Datos</h2>
        <Field label="DNI" value={form.dni ?? ""} onChange={set("dni")} />
        <Field label="Apoderado" value={form.guardian ?? ""} onChange={set("guardian")} />
        <Field label="Teléfono del apoderado" type="tel" value={form.guardianPhone ?? ""} onChange={set("guardianPhone")} />
        <Field label="Lengua materna" value={form.motherTongue ?? ""} onChange={set("motherTongue")} />
        <label className="block space-y-1">
          <span>Salud / NEE</span>
          <textarea className="field" rows={3} value={form.healthNotes ?? ""} onChange={set("healthNotes")} />
        </label>
        {message && <p role="status">{message}</p>}
        <button type="submit" className="btn-primary">
          Guardar
        </button>
      </form>

      <button
        type="button"
        className="btn-secondary"
        onClick={() => void update((d) => (student.active ? archiveStudent(d, student.id) : restoreStudent(d, student.id)))}
      >
        {student.active ? "Archivar niño" : "Restaurar niño"}
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (e: { target: { value: string } }) => void;
  type?: string;
}) {
  return (
    <label className="block space-y-1">
      <span>{label}</span>
      <input className="field" type={type} value={value} onChange={onChange} />
    </label>
  );
}
