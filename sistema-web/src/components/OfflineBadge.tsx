"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** Shown while the browser is offline: everything except accounts and AI keeps working. */
export function OfflineBadge() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  if (online) return null;
  return (
    <p role="status" className="bg-accent-soft text-foreground mx-4 rounded-xl px-4 py-2 text-sm md:mx-8">
      Sin conexión: tus datos se guardan en tu computadora.
    </p>
  );
}
