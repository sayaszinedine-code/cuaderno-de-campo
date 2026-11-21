import { afterEach, describe, expect, it, vi } from "vitest";
import { generate } from "./generate";

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
const chunk = (obj: unknown) => `data: ${JSON.stringify(obj)}\r\n\r\n`;
const text = (t: string, extra: Record<string, unknown> = {}) =>
  chunk({ candidates: [{ content: { role: "model", parts: [{ text: t }] }, ...extra }] });

afterEach(() => vi.unstubAllGlobals());

describe("gemini", () => {
  it("streams text from SSE chunks split mid-line and sends the key in a header", async () => {
    const l = text("Hola") + text(" mundo", { finishReason: "STOP" });
    const fetchMock = vi.fn().mockResolvedValue(sse([l.slice(0, 25), l.slice(25)]));
    vi.stubGlobal("fetch", fetchMock);
    const seen: string[] = [];
    const out = await generate("gemini", "k", { system: "s", prompt: "p", onText: (t) => seen.push(t) });
    expect(out).toBe("Hola mundo");
    expect(seen).toEqual(["Hola", "Hola mundo"]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:streamGenerateContent?alt=sse",
    );
    expect(url).not.toContain("key=");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("k");
    expect(JSON.parse(init.body as string)).toEqual({
      systemInstruction: { parts: [{ text: "s" }] },
      contents: [{ role: "user", parts: [{ text: "p" }] }],
    });
  });

  it("sends images inline as base64 before the text", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sse([text("Una niña juega.")]));
    vi.stubGlobal("fetch", fetchMock);
    const img = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
    await generate("gemini", "k", { system: "s", prompt: "p", images: [img] });
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.contents[0].parts).toEqual([{ inlineData: { mimeType: "image/png", data: "AQID" } }, { text: "p" }]);
  });

  it("skips thought parts", async () => {
    const thought = chunk({ candidates: [{ content: { parts: [{ text: "pensando", thought: true }, { text: "Listo" }] } }] });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sse([thought])));
    await expect(generate("gemini", "k", { system: "s", prompt: "p" })).resolves.toBe("Listo");
  });

  it.each([
    [chunk({ promptFeedback: { blockReason: "SAFETY" } })],
    [chunk({ candidates: [{ finishReason: "PROHIBITED_CONTENT" }] })],
    [chunk({ candidates: [{ content: { parts: [] }, finishReason: "SAFETY" }] })],
  ])("maps a blocked answer to refused", async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sse([body])));
    await expect(generate("gemini", "k", { system: "s", prompt: "p" })).rejects.toMatchObject({ code: "refused" });
  });

  it.each([
    [400, { error: { code: 400, status: "INVALID_ARGUMENT", details: [{ reason: "API_KEY_INVALID" }] } }, "invalid-key"],
    [400, { error: { code: 400, message: "API key not valid. Please pass a valid API key." } }, "invalid-key"],
    [400, { error: { code: 400, status: "INVALID_ARGUMENT", message: "bad request" } }, "other"],
    [401, {}, "invalid-key"],
    [403, {}, "invalid-key"],
    [429, { error: { status: "RESOURCE_EXHAUSTED" } }, "rate-limit"],
    [500, {}, "other"],
  ])("maps HTTP %i to %s", async (status, body, code) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));
    await expect(generate("gemini", "k", { system: "s", prompt: "p" })).rejects.toMatchObject({ code });
  });

  it("maps a mid-stream error to other", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sse([text("Ho"), chunk({ error: { code: 500 } })])));
    await expect(generate("gemini", "k", { system: "s", prompt: "p" })).rejects.toMatchObject({ code: "other" });
  });

  it("maps TypeError to network and keeps AbortError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(generate("gemini", "k", { system: "s", prompt: "p" })).rejects.toMatchObject({ code: "network" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError")));
    await expect(generate("gemini", "k", { system: "s", prompt: "p" })).rejects.toMatchObject({ name: "AbortError" });
  });

  it("requires a key", async () => {
    await expect(generate("gemini", "  ", { system: "s", prompt: "p" })).rejects.toMatchObject({ code: "no-key" });
  });
});
