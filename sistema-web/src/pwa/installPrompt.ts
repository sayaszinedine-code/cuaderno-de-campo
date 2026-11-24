/** Chrome/Edge event that lets the page show its own install button. */
export type InstallPromptEvent = Event & { prompt: () => Promise<void> };

/*
 * The browser fires `beforeinstallprompt` once per page load, often before the app shell mounts
 * (account check, folder choice). Capture it as soon as this module loads and keep it here.
 */
let offer: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function set(next: InstallPromptEvent | null) {
  offer = next;
  listeners.forEach((l) => l());
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    set(e as InstallPromptEvent);
  });
  window.addEventListener("appinstalled", () => set(null));
}

export function getInstallOffer(): InstallPromptEvent | null {
  return offer;
}

export function getServerInstallOffer(): InstallPromptEvent | null {
  return null;
}

export function subscribeInstallOffer(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Shows the browser's install dialog once; the saved event cannot be reused afterwards. */
export async function promptInstall(): Promise<void> {
  const current = offer;
  if (!current) return;
  set(null);
  await current.prompt();
}
