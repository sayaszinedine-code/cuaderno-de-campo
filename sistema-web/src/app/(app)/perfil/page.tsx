"use client";

import { useState, type FormEvent } from "react";
import { updateOwnProfile } from "@/auth/client";
import { REGIONS } from "@/auth/regions";
import { useAccount } from "@/components/AccountGate";
import type { TeacherProfile } from "@/domain/schema";
import { useWorkspace } from "@/workspace/WorkspaceProvider";

const OFFLINE_SAVE_MESSAGE =
  "Guardado en tu computadora. Se actualizará en tu cuenta cuando tengas conexión.";

type Message = { kind: "ok" | "error"; text: string } | null;

export default function PerfilPage() {
  const { profile: account, refresh } = useAccount();
  const { profile: saved, saveProfile } = useWorkspace();
  const [form, setForm] = useState<TeacherProfile>(
    () =>
      saved ?? {
        firstNames: account.firstNames,
        lastNames: account.lastNames,
        phone: "",
        region: account.region,
        address: "",
        email: account.email,
        level: "Inicial",
        ugel: account.ugel,
        institution: account.institution,
      },
  );
  // The offline cached account has no email: keep the one already saved in the folder.
  const email = account.email || saved?.email || "";
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  const set = (key: keyof TeacherProfile) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const data: TeacherProfile = { ...form, email, level: "Inicial" };
    try {
      await saveProfile(data);
    } catch {
      setMessage({ kind: "error", text: "No se pudo guardar. Revisa que la carpeta siga disponible." });
      setBusy(false);
      return;
    }
    try {
      await updateOwnProfile({
        firstNames: data.firstNames,
        lastNames: data.lastNames,
        institution: data.institution,
        ugel: data.ugel,
        region: data.region,
      });
      refresh();
      setMessage({ kind: "ok", text: "Perfil guardado." });
    } catch {
      setMessage({ kind: "ok", text: OFFLINE_SAVE_MESSAGE });
    }
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} className="card max-w-2xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Mi perfil</h1>
      <Field label="Nombres" value={form.firstNames} onChange={set("firstNames")} required />
      <Field label="Apellidos" value={form.lastNames} onChange={set("lastNames")} required />
      <Field label="Teléfono" type="tel" value={form.phone} onChange={set("phone")} />
      <label className="block space-y-1">
        <span>Región</span>
        <select className="field" value={form.region} onChange={set("region")}>
          <option value="">Selecciona…</option>
          {REGIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <Field label="Domicilio" value={form.address} onChange={set("address")} />
      <Field label="Correo" value={email} readOnly />
      <Field label="Nivel" value="Inicial" readOnly />
      <Field label="UGEL" value={form.ugel} onChange={set("ugel")} />
      <Field label="Institución educativa" value={form.institution} onChange={set("institution")} />
      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className="rounded-xl bg-accent-soft p-3">
          {message.text}
        </p>
      )}
      <button type="submit" className="btn-primary" disabled={busy}>
        {busy ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  readOnly,
  required,
  type = "text",
}: {
  label: string;
  value: string;
  onChange?: (e: { target: { value: string } }) => void;
  readOnly?: boolean;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="block space-y-1">
      <span>{label}</span>
      <input className="field" type={type} value={value} onChange={onChange} readOnly={readOnly} required={required} />
    </label>
  );
}
