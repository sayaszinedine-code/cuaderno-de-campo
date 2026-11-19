"use client";

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
    <main className="mx-auto max-w-md p-8">
      <h1 className="mb-6 text-2xl font-bold">Iniciar sesión</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          Correo electrónico
          <input type="email" required autoComplete="email" value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded border border-gray-400 px-3 py-2 focus-visible:outline-2 focus-visible:outline-blue-600" />
        </label>
        <label className="flex flex-col gap-1">
          Contraseña
          <input type="password" required autoComplete="current-password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded border border-gray-400 px-3 py-2 focus-visible:outline-2 focus-visible:outline-blue-600" />
        </label>
        <p role="alert" aria-live="polite" className="min-h-6 text-red-700">{error}</p>
        <button type="submit" disabled={busy}
          className="rounded bg-blue-600 px-4 py-2 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-60">
          {busy ? "Ingresando…" : "Ingresar"}
        </button>
      </form>
      <p className="mt-6 flex flex-col gap-2">
        <a href="/recuperar/" className="text-blue-700 underline">¿Olvidaste tu contraseña?</a>
        <a href="/registro/" className="text-blue-700 underline">Crear una cuenta</a>
      </p>
    </main>
  );
}
