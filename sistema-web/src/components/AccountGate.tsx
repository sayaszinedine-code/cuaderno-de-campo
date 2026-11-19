"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { fetchOwnProfile, readLocalSession } from "@/auth/client";
import { createLocalStorageCache, resolveAccountState, type AccountState, type Profile } from "@/auth/session";

type AccountContextValue = { profile: Profile; refresh: () => void };

const AccountContext = createContext<AccountContextValue | null>(null);

export function useAccount(): AccountContextValue {
  const value = useContext(AccountContext);
  if (!value) throw new Error("useAccount debe usarse dentro de <AccountGate>.");
  return value;
}

function defaultResolve(): Promise<AccountState> {
  return resolveAccountState({
    fetchProfile: fetchOwnProfile,
    online: navigator.onLine,
    cache: createLocalStorageCache(),
    now: new Date(),
    localSession: readLocalSession(),
  });
}

type Loaded = { state: AccountState } | { error: true } | null;

export function AccountGate({
  children,
  resolve = defaultResolve,
  allowInactive = false,
}: {
  children: ReactNode;
  /** Render children for pending/suspended accounts too (e.g. the account page). */
  allowInactive?: boolean;
  resolve?: () => Promise<AccountState>;
}) {
  const router = useRouter();
  const [loaded, setLoaded] = useState<Loaded>(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    resolve().then(
      (state) => {
        if (cancelled) return;
        if (state.kind === "signed-out") router.replace("/login/");
        setLoaded({ state });
      },
      () => {
        if (!cancelled) setLoaded({ error: true });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [resolve, router, tick]);

  if (!loaded) return <Notice>Verificando tu cuenta…</Notice>;
  if ("error" in loaded) {
    return (
      <Notice role="alert">No pudimos verificar tu cuenta. Recarga la página e inténtalo de nuevo.</Notice>
    );
  }
  const { state } = loaded;
  if (allowInactive && (state.kind === "pending" || state.kind === "suspended")) {
    return (
      <AccountContext.Provider value={{ profile: state.profile, refresh }}>{children}</AccountContext.Provider>
    );
  }
  switch (state.kind) {
    case "active":
      return (
        <AccountContext.Provider value={{ profile: state.profile, refresh }}>{children}</AccountContext.Provider>
      );
    case "pending":
      return <Notice>Tu cuenta está en revisión. Te avisaremos cuando sea aprobada.</Notice>;
    case "suspended":
      return (
        <Notice>
          Tu cuenta está suspendida. Puedes abrir tu carpeta y exportar tus datos.
          <a href="/cuenta/" className="mt-3 block text-blue-700 underline">
            Ir a mi cuenta
          </a>
        </Notice>
      );
    case "offline-expired":
      return <Notice>Conéctate a internet para verificar tu cuenta.</Notice>;
    case "signed-out":
      return <Notice>Redirigiendo…</Notice>;
  }
}

function Notice({ children, role }: { children: ReactNode; role?: "alert" }) {
  return (
    <main className="mx-auto max-w-md p-8">
      <div role={role} aria-live="polite" className="rounded border border-gray-300 p-4">
        {children}
      </div>
    </main>
  );
}
