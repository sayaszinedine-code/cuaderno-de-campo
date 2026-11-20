import { generateClaude } from "./claude";
import { generateDeepseek } from "./deepseek";
import { AiError, type AiProviderId, type AiRequest } from "./types";

export async function generate(provider: AiProviderId, apiKey: string, req: AiRequest): Promise<string> {
  if (!apiKey.trim()) throw new AiError("no-key");
  return provider === "claude" ? generateClaude(apiKey.trim(), req) : generateDeepseek(apiKey.trim(), req);
}
