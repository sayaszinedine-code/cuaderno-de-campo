import { AiError, type AiRequest } from "./types";

const MODEL = "gemini-3.5-flash-lite";
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse`;
const BLOCKED = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "IMAGE_SAFETY", "RECITATION"]);

interface Chunk {
  error?: unknown;
  promptFeedback?: { blockReason?: string };
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
}

function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/** Google answers a bad key with 400 INVALID_ARGUMENT; tell it apart from other bad requests. */
async function badRequestCode(res: Response): Promise<AiError> {
  const body = await res.text().catch(() => "");
  return new AiError(/API_KEY_INVALID|API key not valid/i.test(body) ? "invalid-key" : "other");
}

export async function generateGemini(apiKey: string, req: AiRequest): Promise<string> {
  let res: Response;
  try {
    const images = await Promise.all(
      (req.images ?? []).map(async (blob) => ({
        inlineData: { mimeType: blob.type || "image/jpeg", data: await toBase64(blob) },
      })),
    );
    // The key goes in a header, never in the URL, so it doesn't end up in logs or history.
    res = await fetch(URL, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: "user", parts: [...images, { text: req.prompt }] }],
      }),
      signal: req.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw abortError();
    if (e instanceof TypeError) throw new AiError("network");
    throw new AiError("other");
  }
  if (res.status === 400) throw await badRequestCode(res);
  if (res.status === 401 || res.status === 403) throw new AiError("invalid-key");
  if (res.status === 429) throw new AiError("rate-limit");
  if (!res.ok || !res.body) throw new AiError("other");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  let failed = false;
  let blocked = false;

  const handleLine = (raw: string) => {
    const line = raw.trim();
    if (!line.startsWith("data:")) return;
    try {
      const json = JSON.parse(line.slice(5).trim()) as Chunk;
      if (json.error) {
        failed = true;
        return;
      }
      if (json.promptFeedback?.blockReason) blocked = true;
      const candidate = json.candidates?.[0];
      if (candidate?.finishReason && BLOCKED.has(candidate.finishReason)) blocked = true;
      const delta = (candidate?.content?.parts ?? [])
        .filter((p) => !p.thought && typeof p.text === "string")
        .map((p) => p.text)
        .join("");
      if (delta) {
        full += delta;
        req.onText?.(full);
      }
    } catch {
      // Ignore keep-alive or malformed lines.
    }
  };

  try {
    while (!failed) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const l of lines) {
        handleLine(l);
        if (failed) break;
      }
    }
    buffer += decoder.decode();
    if (!failed && buffer) handleLine(buffer);
    if (failed) await reader.cancel().catch(() => undefined);
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw abortError();
    if (e instanceof TypeError) throw new AiError("network");
    throw new AiError("other");
  }
  if (failed) throw new AiError("other");
  if (!full) throw new AiError(blocked ? "refused" : "other");
  return full;
}
