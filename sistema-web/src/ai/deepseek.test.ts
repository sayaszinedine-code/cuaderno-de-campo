import { afterEach, describe, expect, it, vi } from "vitest";
import { generate } from "./generate";
import { generateWithSettings } from "./index";
import { AiError } from "./types";

const enc = new TextEncoder();
function sse(chunks: string[], status = 200): Response {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      chunks.forEach((x) => c.enqueue(enc.encode(x)));
      c.close();
    },
  });
  return new Response(body, { status });
}
const line = (t: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`;

afterEach(() => vi.unstubAllGlobals());

describe("deepseek", () => {
  it("parses SSE chunks split mid-line and stops at [DONE]", async () => {
    const l = line("Hola") + line(" mundo");
    const fetchMock = vi.fn().mockResolvedValue(sse([l.slice(0, 20), l.slice(20), "data: [DONE]\n\n", line("ignorado")]));
    vi.stubGlobal("fetch", fetchMock);
    const seen: string[] = [];
    const out = await generate("deepseek", "k", { system: "s", prompt: "p", onText: (t) => seen.push(t) });
    expect(out).toBe("Hola mundo");
    expect(seen).toEqual(["Hola", "Hola mundo"]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer k");
    expect(JSON.parse(init.body as string)).toMatchObject({ model: "deepseek-chat", stream: true });
  });
  it.each([
    [401, "invalid-key"],
    [403, "invalid-key"],
    [429, "rate-limit"],
    [402, "rate-limit"],
    [500, "other"],
  ])("maps HTTP %i to %s", async (status, code) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("x", { status })));
    await expect(generate("deepseek", "k", { system: "s", prompt: "p" })).rejects.toMatchObject({ code });
  });
  it("maps TypeError to network", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(generate("deepseek", "k", { system: "s", prompt: "p" })).rejects.toMatchObject({ code: "network" });
  });
  it("rejects images before any request", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    await expect(
      generate("deepseek", "k", { system: "s", prompt: "p", images: [new Blob(["x"])] }),
    ).rejects.toMatchObject({ code: "no-images" });
    expect(f).not.toHaveBeenCalled();
  });
  it("requires a key", async () => {
    await expect(generate("deepseek", " ", { system: "s", prompt: "p" })).rejects.toBeInstanceOf(AiError);
    await expect(generate("claude", "", { system: "s", prompt: "p" })).rejects.toMatchObject({ code: "no-key" });
  });

  it("cancels the reader after [DONE]", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode(line("a") + "data: [DONE]\n\n"));
      },
      cancel,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
    expect(await generate("deepseek", "k", { system: "s", prompt: "p" })).toBe("a");
    expect(cancel).toHaveBeenCalled();
  });
  it("flushes a multibyte char split across chunks", async () => {
    const bytes = enc.encode(line("ñ") + "data: [DONE]\n\n");
    const cut = bytes.indexOf(0xc3) + 1;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.slice(0, cut));
        c.enqueue(bytes.slice(cut));
        c.close();
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
    expect(await generate("deepseek", "k", { system: "s", prompt: "p" })).toBe("ñ");
  });
  it("fails with other on empty text or error object", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sse(["data: [DONE]\n\n"])));
    await expect(generate("deepseek", "k", { system: "s", prompt: "p" })).rejects.toMatchObject({ code: "other" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sse([`data: ${JSON.stringify({ error: { message: "x" } })}\n\n`])));
    await expect(generate("deepseek", "k", { system: "s", prompt: "p" })).rejects.toMatchObject({ code: "other" });
  });
});

describe("generateWithSettings", () => {
  it("blocks without enabled and consent before any request", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const base = { provider: "deepseek" as const, apiKeys: { deepseek: "k" } };
    await expect(generateWithSettings({ ...base, enabled: false, consentAt: "2026-01-01T00:00:00Z" }, { system: "s", prompt: "p" })).rejects.toMatchObject({ code: "disabled" });
    await expect(generateWithSettings({ ...base, enabled: true }, { system: "s", prompt: "p" })).rejects.toMatchObject({ code: "disabled" });
    expect(f).not.toHaveBeenCalled();
  });
  it("runs when enabled with consent", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sse([line("ok"), "data: [DONE]\n\n"])));
    const out = await generateWithSettings({ enabled: true, provider: "deepseek", apiKeys: { deepseek: "k" }, consentAt: "2026-01-01T00:00:00Z" }, { system: "s", prompt: "p" });
    expect(out).toBe("ok");
  });
});
