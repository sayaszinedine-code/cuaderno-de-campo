import { describe, expect, it, vi } from "vitest";
import { registerServiceWorker, type SwContainer, type SwRegistration, type SwWorker } from "./register";

class FakeTarget {
  private handlers = new Map<string, Array<() => void>>();
  addEventListener(type: string, fn: () => void) {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), fn]);
  }
  emit(type: string) {
    for (const fn of this.handlers.get(type) ?? []) fn();
  }
}

class FakeWorker extends FakeTarget implements SwWorker {
  state = "installing";
  postMessage = vi.fn();
}

class FakeRegistration extends FakeTarget implements SwRegistration {
  installing: FakeWorker | null = null;
  waiting: FakeWorker | null = null;
}

class FakeContainer extends FakeTarget implements SwContainer {
  controller: object | null = null;
  registration = new FakeRegistration();
  register = vi.fn(async () => this.registration);
}

describe("registerServiceWorker", () => {
  it("does nothing outside production", async () => {
    const container = new FakeContainer();
    const result = await registerServiceWorker({ production: false, container, onUpdate: vi.fn(), reload: vi.fn() });
    expect(result).toBeNull();
    expect(container.register).not.toHaveBeenCalled();
  });

  it("does nothing when the browser has no service worker API", async () => {
    const result = await registerServiceWorker({ production: true, container: undefined, onUpdate: vi.fn(), reload: vi.fn() });
    expect(result).toBeNull();
  });

  it("registers /sw.js for the whole site in production", async () => {
    const container = new FakeContainer();
    await registerServiceWorker({ production: true, container, onUpdate: vi.fn(), reload: vi.fn() });
    expect(container.register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
  });

  it("does not announce the first install", async () => {
    const container = new FakeContainer();
    const onUpdate = vi.fn();
    await registerServiceWorker({ production: true, container, onUpdate, reload: vi.fn() });
    const worker = new FakeWorker();
    container.registration.installing = worker;
    container.registration.emit("updatefound");
    worker.state = "installed";
    worker.emit("statechange");
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("announces a new version and reloads only after the user applies it", async () => {
    const container = new FakeContainer();
    container.controller = {};
    const onUpdate = vi.fn<(apply: () => void) => void>();
    const reload = vi.fn();
    await registerServiceWorker({ production: true, container, onUpdate, reload });
    const worker = new FakeWorker();
    container.registration.installing = worker;
    container.registration.emit("updatefound");
    worker.state = "installed";
    worker.emit("statechange");
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();

    container.emit("controllerchange");
    expect(reload).not.toHaveBeenCalled();

    onUpdate.mock.calls[0][0]();
    expect(worker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    container.emit("controllerchange");
    container.emit("controllerchange");
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("announces a version that was already waiting", async () => {
    const container = new FakeContainer();
    container.controller = {};
    container.registration.waiting = new FakeWorker();
    const onUpdate = vi.fn();
    await registerServiceWorker({ production: true, container, onUpdate, reload: vi.fn() });
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("swallows registration failures", async () => {
    const container = new FakeContainer();
    container.register.mockRejectedValueOnce(new Error("blocked"));
    const result = await registerServiceWorker({ production: true, container, onUpdate: vi.fn(), reload: vi.fn() });
    expect(result).toBeNull();
  });
});
