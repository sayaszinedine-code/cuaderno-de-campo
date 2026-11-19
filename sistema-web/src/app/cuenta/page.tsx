"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/auth/client";
import { authErrorMessage } from "@/auth/messages";
import type { ProfileStatus } from "@/auth/session";
import { AccountGate, useAccount } from "@/components/AccountGate";

const STATUS_LABEL: Record<ProfileStatus, string> = {
  pending: "Pendiente",
  active: "Activa",
  suspended: "Suspendida",
};

export default function CuentaPage() {
  // Pending and suspended accounts must still see their status and be able to sign out.
  return (
    <AccountGate allowInactive>
      <CuentaContent />
    </AccountGate>
  );
}

function CuentaContent() {
  const { profile } = useAccount();
  const router = useRouter();
  const [error, setError] = useState("");

  async function onSignOut() {
    setError("");
    try {
      await signOut();
      router.replace("/login/");
    } catch (err) {
      setError(authErrorMessage(err));
    }
  }

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="mb-6 text-2xl font-bold">Mi cuenta</h1>
      <dl className="mb-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        <dt className="font-semibold">Estado</dt>
        <dd>{STATUS_LABEL[profile.status]}</dd>
        <dt className="font-semibold">Correo</dt>
        <dd>{profile.email}</dd>
      </dl>
      {profile.status === "suspended" && (
        <p className="mb-6 rounded border border-gray-300 p-4">
          Tu cuenta está suspendida. Puedes abrir tu carpeta y exportar tus datos.{" "}
          <a href="/carpeta/" className="text-blue-700 underline">Ir a mi carpeta</a>
        </p>
      )}
      <p role="alert" aria-live="polite" className="min-h-6 text-red-700">{error}</p>
      <button type="button" onClick={onSignOut}
        className="rounded bg-gray-800 px-4 py-2 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
        Cerrar sesión
      </button>
    </main>
  );
}
