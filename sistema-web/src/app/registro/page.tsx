"use client";

import { AuthCard } from "@/components/AuthCard";
import { useState, type FormEvent } from "react";
import { signUp } from "@/auth/client";
import { authErrorMessage } from "@/auth/messages";
import { REGIONS } from "@/auth/regions";

const input = "field";

export default function RegistroPage() {
  const [form, setForm] = useState({
    firstNames: "", lastNames: "", email: "", password: "", institution: "", ugel: "", region: "",
  });
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (form.password.length < 8) return setError("La contraseña debe tener al menos 8 caracteres.");
    if (!accepted) return setError("Debes aceptar la política de privacidad.");
    setBusy(true);
    try {
      await signUp({ ...form, email: form.email.trim() });
      setDone(true);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <AuthCard title="¡Listo!">
        <p role="status" className="bg-success-soft text-success-foreground rounded-xl p-4">
          Revisa tu correo para confirmar tu cuenta. Luego un administrador revisará tu solicitud.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Crear cuenta">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">Nombres
          <input required autoComplete="given-name" value={form.firstNames} onChange={set("firstNames")} className={input} />
        </label>
        <label className="flex flex-col gap-1">Apellidos
          <input required autoComplete="family-name" value={form.lastNames} onChange={set("lastNames")} className={input} />
        </label>
        <label className="flex flex-col gap-1">Correo electrónico
          <input type="email" required autoComplete="email" value={form.email} onChange={set("email")} className={input} />
        </label>
        <label className="flex flex-col gap-1">Contraseña (mínimo 8 caracteres)
          <input type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={set("password")} className={input} />
        </label>
        <label className="flex flex-col gap-1">Institución educativa
          <input required value={form.institution} onChange={set("institution")} className={input} />
        </label>
        <label className="flex flex-col gap-1">UGEL
          <input required value={form.ugel} onChange={set("ugel")} className={input} />
        </label>
        <label className="flex flex-col gap-1">Región
          <select required value={form.region} onChange={set("region")} className={input}>
            <option value="">Selecciona tu región</option>
            {REGIONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" required checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-1" />
          <span>
            Acepto la <a href="/privacidad/" className="text-primary font-medium underline">política de privacidad</a>
          </span>
        </label>
        <p role="alert" aria-live="polite" className="min-h-6 text-attention-foreground">{error}</p>
        <button type="submit" disabled={busy}
          className="btn-primary w-full">
          {busy ? "Enviando…" : "Crear cuenta"}
        </button>
      </form>
      <p className="mt-6">
        ¿Ya tienes cuenta? <a href="/login/" className="text-primary font-medium underline">Iniciar sesión</a>
      </p>
    </AuthCard>
  );
}
