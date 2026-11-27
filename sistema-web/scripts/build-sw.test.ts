// @vitest-environment node
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildServiceWorker, writeServiceWorker } from "./build-sw.mjs";

let outDir = "";

function put(rel: string, content: string | Buffer) {
  const file = path.join(outDir, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

beforeEach(() => {
  outDir = mkdtempSync(path.join(tmpdir(), "build-sw-"));
  put("index.html", '<script src="/_next/static/chunks/main-abc.js"></script>');
  put("index.txt", "rsc");
  put("inicio/index.html", '<script src="/_next/static/chunks/big-initial.js"></script>');
  put("inicio/index.txt", "rsc");
  put("404.html", "not found");
  put("404/index.html", "not found page");
  put("manifest.webmanifest", "{}");
  put("favicon.ico", "ico");
  put("icons/icon-192.png", "png");
  put("_next/static/chunks/main-abc.js", "js");
  put("_next/static/chunks/main-abc.js.map", "map");
  put("_next/static/css/app.css", "css");
  put("_next/static/media/font.woff2", "font");
  put("_next/static/media/profile.icc", "icc");
  // Large lazy chunk (dynamic import of the reports): precached too, so offline reports always work.
  put("_next/static/chunks/lazy-pdf.js", Buffer.alloc(400 * 1024, 1));
  // Large chunk a page needs on first paint: always precached.
  put("_next/static/chunks/big-initial.js", Buffer.alloc(400 * 1024, 2));
  put("sw.js", "old worker");
  // Netlify config files are not served, so they must never be precached.
  put("_headers", "/sw.js\n  Cache-Control: no-cache\n");
  put("_redirects", "");
});

afterEach(() => rmSync(outDir, { recursive: true, force: true }));

describe("buildServiceWorker", () => {
  it("precaches pages, every static asset (lazy report chunks and .icc too) but not maps, itself or 404.html", () => {
    const { files } = buildServiceWorker(outDir);
    expect(files).toEqual([
      "/",
      "/404/",
      "/_next/static/chunks/big-initial.js",
      "/_next/static/chunks/lazy-pdf.js",
      "/_next/static/chunks/main-abc.js",
      "/_next/static/css/app.css",
      "/_next/static/media/font.woff2",
      "/_next/static/media/profile.icc",
      "/favicon.ico",
      "/icons/icon-192.png",
      "/index.txt",
      "/inicio/",
      "/inicio/index.txt",
      "/manifest.webmanifest",
    ]);
  });

  it("never precaches the Android download", () => {
    put("descargas/cuaderno-de-campo.apk", Buffer.alloc(1024, 3));
    const { files } = buildServiceWorker(outDir);
    expect(files.some((f) => f.endsWith(".apk"))).toBe(false);
  });

  it("reports the precache total size", () => {
    const { totalBytes } = buildServiceWorker(outDir);
    expect(totalBytes).toBeGreaterThan(800 * 1024);
    expect(totalBytes).toBeLessThan(900 * 1024);
  });

  it("derives a stable version that changes with the content", () => {
    const a = buildServiceWorker(outDir).version;
    expect(buildServiceWorker(outDir).version).toBe(a);
    expect(a).toMatch(/^[0-9a-f]{12}$/);
    put("_next/static/css/app.css", "css v2");
    expect(buildServiceWorker(outDir).version).not.toBe(a);
  });

  it("embeds the host exclusions, the version and the precache list", () => {
    const { source, version } = buildServiceWorker(outDir);
    expect(source).toContain("supabase.co");
    expect(source).toContain("api.deepseek.com");
    expect(source).toContain("api.anthropic.com");
    expect(source).toContain("generativelanguage.googleapis.com");
    expect(source).toContain(version);
    expect(source).toContain('"/inicio/"');
    expect(source).not.toContain("main-abc.js.map");
    expect(source).toContain('"/_next/static/chunks/lazy-pdf.js"');
  });

  it("writes out/sw.js", () => {
    const result = writeServiceWorker(outDir);
    const written = readFileSync(path.join(outDir, "sw.js"), "utf8");
    expect(written).toBe(result.source);
    expect(existsSync(path.join(outDir, "sw.js"))).toBe(true);
  });

  it("fails when the export folder does not exist", () => {
    expect(() => buildServiceWorker(path.join(outDir, "missing"))).toThrow();
  });
});

// ---------- behaviour of the generated worker in a fake ServiceWorker scope ----------

type Handler = (event: FakeEvent) => void;
type FakeEvent = {
  request?: Request;
  data?: unknown;
  respondWith: (r: Promise<Response> | Response) => void;
  waitUntil: (p: Promise<unknown>) => void;
  responded?: Promise<Response> | Response;
  waited: Promise<unknown>[];
};
type MatchOptions = { ignoreSearch?: boolean; ignoreVary?: boolean };
type Network = (req: Request) => Promise<Response>;

const ORIGIN = "https://cuaderno.example";
const pathOf = (r: Request | string) => new URL(typeof r === "string" ? r : r.url, ORIGIN).pathname;

/** Answers like the static host: every exported file, with its path as the body. */
const host: Network = async (r) => new Response(`cached ${pathOf(r)}`);

function loadWorker(source: string) {
  const listeners = new Map<string, Handler>();
  const stores = new Map<string, Map<string, Response>>();
  const matchOptions: MatchOptions[] = [];
  const net: { current: Network } = { current: host };
  const keyOf = (req: Request | string, ignoreSearch = false) => {
    const url = new URL(typeof req === "string" ? req : req.url, ORIGIN);
    return ignoreSearch ? url.origin + url.pathname : url.href;
  };
  const openStore = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      match: async (req: Request | string, opts?: MatchOptions) => {
        if (opts) matchOptions.push(opts);
        if (opts?.ignoreSearch) {
          const k = keyOf(req, true);
          for (const [key, value] of store) if (keyOf(key, true) === k) return value.clone();
          return undefined;
        }
        return store.get(keyOf(req))?.clone();
      },
      put: async (req: Request | string, res: Response) => void store.set(keyOf(req), res),
      addAll: async () => {
        throw new Error("addAll must not be used: it would store redirected responses");
      },
    };
  };
  const caches = {
    open: async (name: string) => openStore(name),
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  };
  const skipped = { value: false };
  const self = {
    location: new URL(ORIGIN + "/sw.js"),
    addEventListener: (type: string, fn: Handler) => listeners.set(type, fn),
    skipWaiting: async () => void (skipped.value = true),
    clients: { claim: async () => undefined },
  };
  new Function("self", "caches", "fetch", source)(self, caches, (r: Request) => net.current(r));
  const dispatch = (type: string, init: Partial<FakeEvent>) => {
    const event: FakeEvent = {
      ...init,
      waited: [],
      respondWith(r) {
        event.responded = r;
      },
      waitUntil(p) {
        event.waited.push(p);
      },
    };
    listeners.get(type)!(event);
    return event;
  };
  const entries = () => [...stores.values()][0] ?? new Map<string, Response>();
  return { dispatch, stores, skipped, net, entries, matchOptions };
}

const req = (url: string, init: RequestInit & { navigate?: boolean } = {}) => {
  const { navigate, ...rest } = init;
  const r = new Request(new URL(url, ORIGIN), rest);
  if (navigate) Object.defineProperty(r, "mode", { value: "navigate" });
  return r;
};

const redirectedResponse = (body: string) => {
  const res = new Response(body, { headers: { "content-type": "text/html" } });
  Object.defineProperty(res, "redirected", { value: true });
  return res;
};

const offline: Network = () => Promise.reject(new TypeError("Failed to fetch"));
const flush = () => new Promise((r) => setTimeout(r, 0));

async function installed(network: Network = offline) {
  const { source } = buildServiceWorker(outDir);
  const worker = loadWorker(source);
  await Promise.all(worker.dispatch("install", {}).waited);
  await Promise.all(worker.dispatch("activate", {}).waited);
  worker.net.current = network;
  return worker;
}

describe("generated sw.js install", () => {
  it("fetches and stores every precached file", async () => {
    const w = await installed();
    expect(w.entries().size).toBe(buildServiceWorker(outDir).files.length);
    expect(w.entries().has(`${ORIGIN}/_next/static/chunks/lazy-pdf.js`)).toBe(true);
    expect(w.entries().has(`${ORIGIN}/_next/static/media/profile.icc`)).toBe(true);
  });

  it("stores a clean copy of a redirected response", async () => {
    const { source } = buildServiceWorker(outDir);
    const w = loadWorker(source);
    w.net.current = async (r) => (pathOf(r) === "/inicio/" ? redirectedResponse("inicio page") : host(r));
    await Promise.all(w.dispatch("install", {}).waited);
    const stored = w.entries().get(`${ORIGIN}/inicio/`)!;
    expect(stored.redirected).toBe(false);
    expect(stored.status).toBe(200);
    expect(stored.headers.get("content-type")).toBe("text/html");
    expect(await stored.text()).toBe("inicio page");
  });

  it("fails the install when any file is not OK", async () => {
    const { source } = buildServiceWorker(outDir);
    const w = loadWorker(source);
    w.net.current = async (r) => (pathOf(r) === "/favicon.ico" ? new Response("gone", { status: 404 }) : host(r));
    await expect(Promise.all(w.dispatch("install", {}).waited)).rejects.toThrow();
  });
});

describe("generated sw.js fetch", () => {
  it("never intercepts cross-origin, non-GET or Range requests", async () => {
    const w = await installed();
    for (const r of [
      req("https://abc.supabase.co/rest/v1/profiles"),
      req("https://api.deepseek.com/chat/completions"),
      req("https://api.anthropic.com/v1/messages"),
      req("https://otro.example/x.js"),
      req("/inicio/", { method: "POST", body: "x" }),
      req("/_next/static/chunks/main-abc.js", { headers: { Range: "bytes=0-10" } }),
    ]) {
      expect(w.dispatch("fetch", { request: r }).responded).toBeUndefined();
    }
  });

  it("serves hashed static assets cache-first, the lazy report chunk included", async () => {
    let calls = 0;
    const w = await installed(async () => {
      calls++;
      return new Response("fresh");
    });
    const res = await w.dispatch("fetch", { request: req("/_next/static/chunks/lazy-pdf.js") }).responded;
    expect(await res!.text()).toBe("cached /_next/static/chunks/lazy-pdf.js");
    expect(calls).toBe(0);
  });

  it("caches a missing static asset on use but never error or redirected responses", async () => {
    const w = await installed(async (r) => {
      if (r.url.endsWith("broken.js")) return new Response("nope", { status: 500 });
      if (r.url.endsWith("moved.js")) return redirectedResponse("moved");
      return new Response("new");
    });
    for (const name of ["extra.js", "broken.js", "moved.js"]) {
      await w.dispatch("fetch", { request: req(`/_next/static/chunks/${name}`) }).responded;
    }
    await flush();
    const keys = [...w.entries().keys()];
    expect(keys).toContain(`${ORIGIN}/_next/static/chunks/extra.js`);
    expect(keys).not.toContain(`${ORIGIN}/_next/static/chunks/broken.js`);
    expect(keys).not.toContain(`${ORIGIN}/_next/static/chunks/moved.js`);
  });

  it("serves pages network-first, refreshing only precached paths", async () => {
    const w = await installed(async (r) => new Response(`network ${pathOf(r)}`));
    const fresh = await w.dispatch("fetch", { request: req("/inicio/", { navigate: true }) }).responded;
    expect(await fresh!.text()).toBe("network /inicio/");
    await w.dispatch("fetch", { request: req("/otra/", { navigate: true }) }).responded;
    await flush();
    expect(await w.entries().get(`${ORIGIN}/inicio/`)!.clone().text()).toBe("network /inicio/");
    expect(w.entries().has(`${ORIGIN}/otra/`)).toBe(false);
  });

  it("falls back to the cached page offline, matching with ignoreVary", async () => {
    const w = await installed();
    const cached = await w.dispatch("fetch", { request: req("/inicio/?x=1", { navigate: true }) }).responded;
    expect(await cached!.text()).toBe("cached /inicio/");
    const noSlash = await w.dispatch("fetch", { request: req("/inicio", { navigate: true }) }).responded;
    expect(await noSlash!.text()).toBe("cached /inicio/");
    expect(w.matchOptions.length).toBeGreaterThan(0);
    expect(w.matchOptions.every((o) => o.ignoreVary === true)).toBe(true);
  });

  it("serves the exported 404 page for an unknown route offline", async () => {
    const w = await installed();
    const res = await w.dispatch("fetch", { request: req("/no-existe/", { navigate: true }) }).responded;
    expect(res!.status).toBe(404);
    expect(await res!.text()).toBe("cached /404/");
  });

  it("falls back to /inicio/ for an unknown route when the export has no 404 page", async () => {
    rmSync(path.join(outDir, "404"), { recursive: true });
    const w = await installed();
    const res = await w.dispatch("fetch", { request: req("/no-existe/", { navigate: true }) }).responded;
    expect(await res!.text()).toBe("cached /inicio/");
  });

  it("answers a slow navigation from the cache after 3 s and still refreshes it in the background", async () => {
    const w = await installed();
    let finish: (r: Response) => void = () => undefined;
    w.net.current = () => new Promise<Response>((resolve) => (finish = resolve));
    vi.useFakeTimers();
    try {
      const event = w.dispatch("fetch", { request: req("/inicio/", { navigate: true }) });
      let settled = false;
      void Promise.resolve(event.responded).then(() => (settled = true));
      await vi.advanceTimersByTimeAsync(2900);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(200);
      expect(await (await event.responded)!.text()).toBe("cached /inicio/");
      finish(new Response("late network"));
      await Promise.all(event.waited);
      await vi.advanceTimersByTimeAsync(10);
    } finally {
      vi.useRealTimers();
    }
    await flush();
    expect(await w.entries().get(`${ORIGIN}/inicio/`)!.clone().text()).toBe("late network");
  });

  it("serves RSC payloads from the cache offline ignoring the query", async () => {
    const w = await installed();
    const res = await w.dispatch("fetch", { request: req("/inicio/index.txt?_rsc=abc") }).responded;
    expect(await res!.text()).toBe("cached /inicio/index.txt");
  });

  it("drops old caches on activate and skips waiting only when asked", async () => {
    const w = await installed();
    w.stores.set("cuaderno-web-old", new Map());
    await Promise.all(w.dispatch("activate", {}).waited);
    expect([...w.stores.keys()]).toHaveLength(1);
    expect(w.skipped.value).toBe(false);
    w.dispatch("message", { data: { type: "SKIP_WAITING" } });
    expect(w.skipped.value).toBe(true);
  });
});
