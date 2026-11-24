"use client";

import { AuthCard } from "@/components/AuthCard";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "@/auth/client";
import { authErrorMessage } from "@/auth/messages";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      router.replace("/carpeta/");
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Iniciar sesión">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          Correo electrónico
          <input type="email" required autoComplete="email" value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field" />
        </label>
        <label className="flex flex-col gap-1">
          Contraseña
          <input type="password" required autoComplete="current-password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field" />
        </label>
        <p role="alert" aria-live="polite" className="min-h-6 text-attention-foreground">{error}</p>
        <button type="submit" disabled={busy}
          className="btn-primary w-full">
          {busy ? "Ingresando…" : "Ingresar"}
        </button>
      </form>
      <p className="mt-6 flex flex-col gap-2">
        <a href="/recuperar/" className="text-primary font-medium underline">¿Olvidaste tu contraseña?</a>
        <a href="/registro/" className="text-primary font-medium underline">Crear una cuenta</a>
      </p>
    </AuthCard>
  );
}
