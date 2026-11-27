"use client";

import { useSyncExternalStore } from "react";
import { Icon } from "@/components/icons";
import { isInApk } from "@/apk/inApk";
import { getInstallOffer, getServerInstallOffer, promptInstall, subscribeInstallOffer } from "./installPrompt";

function isInstalled(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches;
}

/** «Instalar app»: shown only when the browser offers installation and the app is not installed yet. */
export function InstallButton({ className = "" }: { className?: string }) {
  const offer = useSyncExternalStore(subscribeInstallOffer, getInstallOffer, getServerInstallOffer);

  if (!offer || isInstalled() || isInApk()) return null;
  return (
    <button type="button" className={`btn-primary gap-2 ${className}`} onClick={() => void promptInstall()}>
      <Icon name="instalar" />
      <span className="sr-only sm:not-sr-only">Instalar app</span>
    </button>
  );
}
