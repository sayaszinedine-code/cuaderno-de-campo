import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { generateClaude, type ClaudeDeps } from "./claude";

function deps(opts: { texts?: string[]; stop?: string; error?: unknown }) {
  const stream = vi.fn<(p: unknown, o: unknown) => unknown>(() => {
    let handler: (d: string) => void = () => {};
    return {
      on: (_e: string, h: (d: string) => void) => {
        handler = h;
      },
      finalMessage: async () => {
        if (opts.error) throw opts.error;
        (opts.texts ?? []).forEach(handler);
        return { stop_reason: opts.stop ?? "end_turn", content: [{ type: "text", text: (opts.texts ?? []).join("") }] };
      },
    };
  });
  const d = { createClient: vi.fn(() => ({ beta: { messages: { stream } } })) } as unknown as ClaudeDeps;
  return { d, stream };
}
const req = { system: "s", prompt: "p" };

describe("claude", () => {
  it("streams text and sends the required params with images first", async () => {
    const { d, stream } = deps({ texts: ["Ho", "la"] });
    const seen: string[] = [];
    const out = await generateClaude("k", { ...req, images: [new Blob(["abc"], { type: "image/png" })], onText: (t) => seen.push(t) }, d);
    expect(out).toBe("Hola");
    expect(seen).toEqual(["Ho", "Hola"]);
    const params = stream.mock.calls[0][0] as {
      model: string; fallbacks: string; betas: string[]; messages: { content: { type: string; source?: { data: string; media_type: string } }[] }[];
    };
    expect(params).toMatchObject({ model: "claude-opus-5-5", max_tokens: 4000, fallbacks: "default", betas: ["server-side-fallback-2026-07-01"] });
    expect(params.messages[0].content.map((b) => b.type)).toEqual(["image", "text"]);
    expect(params.messages[0].content[0].source).toEqual({ type: "base64", media_type: "image/png", data: "YWJj" });
  });
  it("maps refusal", async () => {
    await expect(generateClaude("k", req, deps({ stop: "refusal" }).d)).rejects.toMatchObject({ code: "refused" });
  });
  const h = new Headers();
  it.each([
    [new Anthropic.AuthenticationError(401, {}, "x", h), "invalid-key"],
    [new Anthropic.PermissionDeniedError(403, {}, "x", h), "invalid-key"],
    [new Anthropic.RateLimitError(429, {}, "x", h), "rate-limit"],
    [new Anthropic.APIConnectionError({ message: "x" }), "network"],
    [new Error("boom"), "other"],
  ])("maps SDK error %#", async (error, code) => {
    await expect(generateClaude("k", req, deps({ error }).d)).rejects.toMatchObject({ code });
  });
  it("throws AbortError on abort", async () => {
    await expect(generateClaude("k", req, deps({ error: new Anthropic.APIUserAbortError() }).d)).rejects.toMatchObject({ name: "AbortError" });
  });
});
