"use client";

import { useEffect, useState } from "react";
import { registerInBrowser } from "./register";
// Starts listening for the install offer on the very first page load.
import "./installPrompt";

/** Registers the service worker and offers a new version without reloading on its own. */
export function PwaUpdater() {
  const [apply, setApply] = useState<(() => void) | null>(null);

  useEffect(() => {
    void registerInBrowser((next) => setApply(() => next));
  }, []);

  if (!apply) return null;
  return (
    <div
      role="status"
      className="card fixed inset-x-3 bottom-24 z-30 mx-auto max-w-md px-4 py-3 text-sm md:bottom-6"
    >
      Hay una nueva versión.{" "}
      <button type="button" className="font-semibold underline" onClick={apply}>
        Recargar.
      </button>
    </div>
  );
}
