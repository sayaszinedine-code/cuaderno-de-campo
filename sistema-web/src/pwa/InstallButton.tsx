"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";

/** Chrome/Edge event that lets the page show its own install button. */
type InstallPromptEvent = Event & { prompt: () => Promise<void> };

function isInstalled(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches;
}

/** «Instalar app»: shown only when the browser offers installation and the app is not installed yet. */
export function InstallButton({ className = "" }: { className?: string }) {
  const [offer, setOffer] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    if (isInstalled()) return;
    const onOffer = (e: Event) => {
      e.preventDefault();
      setOffer(e as InstallPromptEvent);
    };
    const onInstalled = () => setOffer(null);
    window.addEventListener("beforeinstallprompt", onOffer);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onOffer);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!offer) return null;
  return (
    <button
      type="button"
      className={`btn-primary gap-2 ${className}`}
      onClick={async () => {
        await offer.prompt();
        setOffer(null);
      }}
    >
      <Icon name="instalar" />
      <span className="sr-only sm:not-sr-only">Instalar app</span>
    </button>
  );
}
