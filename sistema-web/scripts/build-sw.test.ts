// @vitest-environment node
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
  put("manifest.webmanifest", "{}");
  put("favicon.ico", "ico");
  put("icons/icon-192.png", "png");
  put("_next/static/chunks/main-abc.js", "js");
  put("_next/static/chunks/main-abc.js.map", "map");
  put("_next/static/css/app.css", "css");
  put("_next/static/media/font.woff2", "font");
  put("_next/static/media/profile.icc", "icc");
  // Large lazy chunk (dynamic import, not referenced by any page): cached on first use.
  put("_next/static/chunks/lazy-pdf.js", Buffer.alloc(400 * 1024, 1));
  // Large chunk a page needs on first paint: always precached.
  put("_next/static/chunks/big-initial.js", Buffer.alloc(400 * 1024, 2));
  put("sw.js", "old worker");
});

afterEach(() => rmSync(outDir, { recursive: true, force: true }));

describe("buildServiceWorker", () => {
  it("precaches pages, scripts, styles, fonts and images but not maps, itself, 404.html or large lazy chunks", () => {
    const { files } = buildServiceWorker(outDir);
    expect(files).toEqual([
      "/",
      "/_next/static/chunks/big-initial.js",
      "/_next/static/chunks/main-abc.js",
      "/_next/static/css/app.css",
      "/_next/static/media/font.woff2",
      "/favicon.ico",
      "/icons/icon-192.png",
      "/index.txt",
      "/inicio/",
      "/inicio/index.txt",
      "/manifest.webmanifest",
    ]);
  });

  it("reports the precache total size", () => {
    const { totalBytes } = buildServiceWorker(outDir);
    expect(totalBytes).toBeGreaterThan(400 * 1024);
    expect(totalBytes).toBeLessThan(500 * 1024);
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
    expect(source).toContain(version);
    expect(source).toContain('"/inicio/"');
    expect(source).not.toContain("main-abc.js.map");
    expect(source).not.toContain("lazy-pdf.js");
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
  waited?: Promise<unknown>;
};

const ORIGIN = "https://cuaderno.example";

function loadWorker(source: string, network: (req: Request) => Promise<Response>) {
  const listeners = new Map<string, Handler>();
  const stores = new Map<string, Map<string, Response>>();
  const keyOf = (req: Request | string, ignoreSearch = false) => {
    const url = new URL(typeof req === "string" ? req : req.url, ORIGIN);
    return ignoreSearch ? url.origin + url.pathname : url.href;
  };
  const openStore = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      match: async (req: Request | string, opts?: { ignoreSearch?: boolean }) => {
        if (opts?.ignoreSearch) {
          const k = keyOf(req, true);
          for (const [key, value] of store) if (keyOf(key, true) === k) return value.clone();
          return undefined;
        }
        return store.get(keyOf(req))?.clone();
      },
      put: async (req: Request | string, res: Response) => void store.set(keyOf(req), res),
      addAll: async (urls: Array<Request | string>) => {
        for (const u of urls) store.set(keyOf(u), new Response(`cached ${new URL(keyOf(u)).pathname}`));
      },
    };
  };
  const caches = {
    open: async (name: string) => openStore(name),
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    match: async (req: Request | string, opts?: { ignoreSearch?: boolean }) => {
      for (const name of stores.keys()) {
        const hit = await openStore(name).match(req, opts);
        if (hit) return hit;
      }
      return undefined;
    },
  };
  const skipped = { value: false };
  const self = {
    location: new URL(ORIGIN + "/sw.js"),
    addEventListener: (type: string, fn: Handler) => listeners.set(type, fn),
    skipWaiting: async () => void (skipped.value = true),
    clients: { claim: async () => undefined },
  };
  new Function("self", "caches", "fetch", source)(self, caches, network);
  const dispatch = (type: string, init: Partial<FakeEvent>) => {
    const event: FakeEvent = {
      ...init,
      respondWith(r) {
        event.responded = r;
      },
      waitUntil(p) {
        event.waited = p;
      },
    };
    listeners.get(type)!(event);
    return event;
  };
  return { dispatch, stores, skipped };
}

const req = (url: string, init: RequestInit & { navigate?: boolean } = {}) => {
  const { navigate, ...rest } = init;
  const r = new Request(new URL(url, ORIGIN), rest);
  if (navigate) Object.defineProperty(r, "mode", { value: "navigate" });
  return r;
};

describe("generated sw.js", () => {
  const offline = () => Promise.reject(new TypeError("Failed to fetch"));

  async function installed(network: (r: Request) => Promise<Response>) {
    const { source } = buildServiceWorker(outDir);
    const worker = loadWorker(source, network);
    await worker.dispatch("install", {}).waited;
    await worker.dispatch("activate", {}).waited;
    return worker;
  }

  it("never intercepts cross-origin, non-GET or Range requests", async () => {
    const w = await installed(offline);
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

  it("serves hashed static assets cache-first", async () => {
    let calls = 0;
    const w = await installed(async () => {
      calls++;
      return new Response("fresh");
    });
    const res = await w.dispatch("fetch", { request: req("/_next/static/chunks/main-abc.js") }).responded;
    expect(await res!.text()).toBe("cached /_next/static/chunks/main-abc.js");
    expect(calls).toBe(0);
  });

  it("caches a lazy chunk on first use and never caches error responses", async () => {
    const w = await installed(async (r) =>
      r.url.endsWith("broken.js") ? new Response("nope", { status: 500 }) : new Response("lazy"),
    );
    await w.dispatch("fetch", { request: req("/_next/static/chunks/lazy-pdf.js") }).responded;
    await w.dispatch("fetch", { request: req("/_next/static/chunks/broken.js") }).responded;
    await new Promise((r) => setTimeout(r, 0));
    const keys = [...[...w.stores.values()][0].keys()];
    expect(keys).toContain(`${ORIGIN}/_next/static/chunks/lazy-pdf.js`);
    expect(keys).not.toContain(`${ORIGIN}/_next/static/chunks/broken.js`);
  });

  it("serves pages network-first and falls back to the cache offline", async () => {
    const online = await installed(async () => new Response("network page"));
    const fresh = await online.dispatch("fetch", { request: req("/inicio/", { navigate: true }) }).responded;
    expect(await fresh!.text()).toBe("network page");

    const w = await installed(offline);
    const cached = await w.dispatch("fetch", { request: req("/inicio/", { navigate: true }) }).responded;
    expect(await cached!.text()).toBe("cached /inicio/");
    const uncached = await w.dispatch("fetch", { request: req("/ninos/", { navigate: true }) }).responded;
    expect(await uncached!.text()).toBe("cached /inicio/");
  });

  it("serves RSC payloads from the cache offline ignoring the query", async () => {
    const w = await installed(offline);
    const res = await w.dispatch("fetch", { request: req("/inicio/index.txt?_rsc=abc") }).responded;
    expect(await res!.text()).toBe("cached /inicio/index.txt");
  });

  it("drops old caches on activate and skips waiting only when asked", async () => {
    const w = await installed(offline);
    w.stores.set("cuaderno-web-old", new Map());
    await w.dispatch("activate", {}).waited;
    expect([...w.stores.keys()]).toHaveLength(1);
    expect(w.skipped.value).toBe(false);
    w.dispatch("message", { data: { type: "SKIP_WAITING" } });
    expect(w.skipped.value).toBe(true);
  });
});
