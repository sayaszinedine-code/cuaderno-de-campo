/** Minimal views of the Service Worker API, so the flow can be tested without a browser. */
export type SwWorker = {
  readonly state: string;
  postMessage(message: { type: "SKIP_WAITING" }): void;
  addEventListener(type: "statechange", listener: () => void): void;
};

export type SwRegistration = {
  readonly installing: SwWorker | null;
  readonly waiting: SwWorker | null;
  addEventListener(type: "updatefound", listener: () => void): void;
};

export type SwContainer = {
  readonly controller: object | null;
  register(url: string, options: { scope: string }): Promise<SwRegistration>;
  addEventListener(type: "controllerchange", listener: () => void): void;
};

export type RegisterOptions = {
  production: boolean;
  /** `navigator.serviceWorker`, or undefined when the browser has no Service Worker API. */
  container: SwContainer | undefined;
  /** Called when a new version is installed; `apply` activates it and then reloads. */
  onUpdate: (apply: () => void) => void;
  reload: () => void;
};

/**
 * Registers `/sw.js` in production builds. A new version never reloads on its own (the teacher
 * may be editing): it is announced through `onUpdate` and applied only when she chooses to.
 */
export async function registerServiceWorker(options: RegisterOptions): Promise<SwRegistration | null> {
  const { production, container, onUpdate, reload } = options;
  if (!production || !container) return null;
  let registration: SwRegistration;
  try {
    registration = await container.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }

  let applied = false;
  container.addEventListener("controllerchange", () => {
    if (!applied) return;
    applied = false;
    reload();
  });
  const announce = (worker: SwWorker) =>
    onUpdate(() => {
      applied = true;
      worker.postMessage({ type: "SKIP_WAITING" });
    });

  // Without a controller this is the first install, not an update.
  if (registration.waiting && container.controller) announce(registration.waiting);
  registration.addEventListener("updatefound", () => {
    const worker = registration.installing;
    if (!worker) return;
    worker.addEventListener("statechange", () => {
      if (worker.state === "installed" && container.controller) announce(worker);
    });
  });
  return registration;
}

/** Browser wiring used by the app. */
export function registerInBrowser(onUpdate: (apply: () => void) => void): Promise<SwRegistration | null> {
  return registerServiceWorker({
    production: process.env.NODE_ENV === "production",
    container: typeof navigator !== "undefined" && "serviceWorker" in navigator ? navigator.serviceWorker : undefined,
    onUpdate,
    reload: () => window.location.reload(),
  });
}
