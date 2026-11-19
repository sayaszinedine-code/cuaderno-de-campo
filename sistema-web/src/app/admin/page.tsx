"use client";

import { useCallback, useEffect, useState } from "react";
import { listTeachers, setTeacherStatus, type TeacherRow } from "@/admin/admin-api";
import { authErrorMessage } from "@/auth/messages";
import type { ProfileStatus } from "@/auth/session";
import { AccountGate, useAccount } from "@/components/AccountGate";

const STATUS_LABEL: Record<ProfileStatus, string> = {
  pending: "Pendiente",
  active: "Activa",
  suspended: "Suspendida",
};

const ACTIONS: Record<ProfileStatus, { label: string; next: ProfileStatus }> = {
  pending: { label: "Aprobar", next: "active" },
  active: { label: "Suspender", next: "suspended" },
  suspended: { label: "Reactivar", next: "active" },
};

export default function AdminPage() {
  return (
    <AccountGate>
      <AdminPanel />
    </AccountGate>
  );
}

function AdminPanel() {
  const { profile } = useAccount();
  if (profile.role !== "admin") {
    return (
      <main className="mx-auto max-w-md p-8">
        <p role="alert">No tienes acceso a esta sección.</p>
      </main>
    );
  }
  return <TeacherTable />;
}

function TeacherTable() {
  const [status, setStatus] = useState<ProfileStatus | "">("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<TeacherRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setRows(await listTeachers({ status: status || undefined, q }));
      setError("");
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [status, q]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(row: TeacherRow) {
    try {
      await setTeacherStatus(row.id, ACTIONS[row.status].next);
      await load();
    } catch (err) {
      setError(authErrorMessage(err));
    }
  }

  return (
    <main className="mx-auto max-w-6xl p-8">
      <h1 className="mb-6 text-2xl font-bold">Administración de docentes</h1>
      <div className="mb-4 flex flex-wrap gap-4">
        <label className="flex flex-col gap-1">Estado
          <select value={status} onChange={(e) => setStatus(e.target.value as ProfileStatus | "")}
            className="rounded border border-gray-400 px-3 py-2 focus-visible:outline-2 focus-visible:outline-blue-600">
            <option value="">Todos</option>
            <option value="pending">Pendiente</option>
            <option value="active">Activa</option>
            <option value="suspended">Suspendida</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">Buscar
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Nombre, correo o institución"
            className="rounded border border-gray-400 px-3 py-2 focus-visible:outline-2 focus-visible:outline-blue-600" />
        </label>
      </div>
      <p role="alert" aria-live="polite" className="min-h-6 text-red-700">{error}</p>
      {loading ? (
        <p>Cargando…</p>
      ) : rows.length === 0 ? (
        <p>No hay docentes que coincidan.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b">
                <th className="p-2">Docente</th>
                <th className="p-2">Correo</th>
                <th className="p-2">Estado</th>
                <th className="p-2">Registro</th>
                <th className="p-2">Institución</th>
                <th className="p-2">UGEL</th>
                <th className="p-2">Región</th>
                <th className="p-2"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="p-2">{r.firstNames} {r.lastNames}</td>
                  <td className="p-2">{r.email}</td>
                  <td className="p-2">{STATUS_LABEL[r.status]}</td>
                  <td className="p-2">{new Date(r.createdAt).toLocaleDateString("es-PE")}</td>
                  <td className="p-2">{r.institution}</td>
                  <td className="p-2">{r.ugel}</td>
                  <td className="p-2">{r.region}</td>
                  <td className="p-2">
                    {r.role === "admin" ? null : (
                      <button type="button" onClick={() => void act(r)}
                        className="rounded bg-blue-600 px-3 py-1 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
                        {ACTIONS[r.status].label}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
