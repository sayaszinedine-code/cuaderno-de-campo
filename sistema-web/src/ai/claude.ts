import Anthropic from "@anthropic-ai/sdk";
import { AiError, type AiRequest } from "./types";

type StreamParams = Parameters<Anthropic["beta"]["messages"]["stream"]>[0];

export interface ClaudeDeps {
  createClient(apiKey: string): Anthropic;
}

export const defaultClaudeDeps: ClaudeDeps = {
  createClient: (apiKey) => new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 }),
};

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function mapError(e: unknown): Error {
  if (e instanceof AiError) return e;
  if (e instanceof Anthropic.APIUserAbortError || (e instanceof DOMException && e.name === "AbortError")) {
    return new DOMException("Aborted", "AbortError");
  }
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return new AiError("invalid-key");
  }
  if (e instanceof Anthropic.RateLimitError) return new AiError("rate-limit");
  if (e instanceof Anthropic.APIConnectionError) return new AiError("network");
  return new AiError("other");
}

export async function generateClaude(
  apiKey: string,
  req: AiRequest,
  deps: ClaudeDeps = defaultClaudeDeps,
): Promise<string> {
  try {
    const client = deps.createClient(apiKey);
    const imageBlocks = await Promise.all(
      (req.images ?? []).map(async (blob) => ({
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: (blob.type || "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
          data: await toBase64(blob),
        },
      })),
    );
    const params: StreamParams = {
      model: "claude-opus-5-5",
      max_tokens: 4000,
      system: req.system,
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content: [...imageBlocks, { type: "text", text: req.prompt }] }],
    } as StreamParams;
    const stream = client.beta.messages.stream(params, { signal: req.signal });
    let full = "";
    stream.on("text", (delta: string) => {
      full += delta;
      req.onText?.(full);
    });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === "refusal") throw new AiError("refused");
    return msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  } catch (e) {
    throw mapError(e);
  }
}
