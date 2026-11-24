"use client";

import { AuthCard } from "@/components/AuthCard";
import { useEffect, useState, type FormEvent } from "react";
import { getSupabase, sendPasswordReset } from "@/auth/client";
import { authErrorMessage } from "@/auth/messages";

const input = "field";
const button = "btn-primary w-full";

export default function RecuperarPage() {
  const [recovering, setRecovering] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const { data } = getSupabase().auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY") setRecovering(true);
      });
      return () => data.subscription.unsubscribe();
    } catch (err) {
      setError(authErrorMessage(err));
    }
  }, []);

  async function run(action: () => Promise<void>, success: string) {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      await action();
      setMessage(success);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function onRequest(e: FormEvent) {
    e.preventDefault();
    void run(
      () => sendPasswordReset(email.trim()),
      "Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña.",
    );
  }

  function onUpdate(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError("La contraseña debe tener al menos 8 caracteres.");
    void run(async () => {
      const { error: updateError } = await getSupabase().auth.updateUser({ password });
      if (updateError) throw updateError;
    }, "Tu contraseña fue actualizada. Ya puedes iniciar sesión.");
  }

  return (
    <AuthCard title={recovering ? "Nueva contraseña" : "Recuperar contraseña"}>
      {recovering ? (
        <form onSubmit={onUpdate} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">Nueva contraseña (mínimo 8 caracteres)
            <input type="password" required minLength={8} autoComplete="new-password" value={password}
              onChange={(e) => setPassword(e.target.value)} className={input} />
          </label>
          <Feedback error={error} message={message} />
          <button type="submit" disabled={busy} className={button}>Guardar contraseña</button>
        </form>
      ) : (
        <form onSubmit={onRequest} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">Correo electrónico
            <input type="email" required autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)} className={input} />
          </label>
          <Feedback error={error} message={message} />
          <button type="submit" disabled={busy} className={button}>Enviar enlace</button>
        </form>
      )}
      <p className="mt-6">
        <a href="/login/" className="text-primary font-medium underline">Volver a iniciar sesión</a>
      </p>
    </AuthCard>
  );
}

function Feedback({ error, message }: { error: string; message: string }) {
  return (
    <div aria-live="polite" className="min-h-6">
      {error && <p role="alert" className="text-attention-foreground">{error}</p>}
      {message && <p role="status" className="bg-success-soft text-success-foreground rounded-xl p-3">{message}</p>}
    </div>
  );
}
