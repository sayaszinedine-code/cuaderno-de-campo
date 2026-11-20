import { AiError, type AiProviderId, type AiRequest } from "./types";

/**
 * Low-level provider call; does not check consent. Internal: only `generateWithSettings`
 * (and tests) may import it. UI code must go through `@/ai`.
 */
export async function generate(provider: AiProviderId, apiKey: string, req: AiRequest): Promise<string> {
  const key = apiKey.trim();
  if (!key) throw new AiError("no-key");
  if (provider === "claude") {
    const { generateClaude } = await import("./claude");
    return generateClaude(key, req);
  }
  const { generateDeepseek } = await import("./deepseek");
  return generateDeepseek(key, req);
}
