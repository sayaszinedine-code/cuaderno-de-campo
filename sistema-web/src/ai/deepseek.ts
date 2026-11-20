import { AiError, type AiRequest } from "./types";

const URL = "https://api.deepseek.com/chat/completions";

function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

export async function generateDeepseek(apiKey: string, req: AiRequest): Promise<string> {
  if (req.images && req.images.length > 0) throw new AiError("no-images");
  let res: Response;
  try {
    res = await fetch(URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "deepseek-chat",
        stream: true,
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.prompt },
        ],
      }),
      signal: req.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw abortError();
    if (e instanceof TypeError) throw new AiError("network");
    throw new AiError("other");
  }
  if (res.status === 401 || res.status === 403) throw new AiError("invalid-key");
  if (res.status === 429 || res.status === 402) throw new AiError("rate-limit");
  if (!res.ok || !res.body) throw new AiError("other");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  let done = false;
  let failed = false;

  const handleLine = (raw: string) => {
    const line = raw.trim();
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (data === "[DONE]") {
      done = true;
      return;
    }
    try {
      const json = JSON.parse(data) as { error?: unknown; choices?: { delta?: { content?: string | null } }[] };
      if (json.error) {
        failed = true;
        return;
      }
      const delta = json.choices?.[0]?.delta?.content;
      if (delta) {
        full += delta;
        req.onText?.(full);
      }
    } catch {
      // Ignore keep-alive or malformed lines.
    }
  };

  try {
    while (!done) {
      const { value, done: finished } = await reader.read();
      if (finished) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const l of lines) {
        handleLine(l);
        if (done || failed) break;
      }
      if (failed) break;
    }
    buffer += decoder.decode();
    if (!done && !failed && buffer) handleLine(buffer);
    if (done || failed) await reader.cancel().catch(() => undefined);
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw abortError();
    if (e instanceof TypeError) throw new AiError("network");
    throw new AiError("other");
  }
  if (failed || !full) throw new AiError("other");
  return full;
}
