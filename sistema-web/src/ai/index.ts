import type { AiSettings } from "./settings";
import { AiError, type AiProviderId, type AiRequest } from "./types";

/** Low-level call; does not check consent. UI code must use generateWithSettings. */
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

/** Every request from the UI goes through here: needs the assistant enabled with recorded consent. */
export async function generateWithSettings(settings: AiSettings, req: AiRequest): Promise<string> {
  if (!settings.enabled || !settings.consentAt) throw new AiError("disabled");
  return generate(settings.provider, settings.apiKey, req);
}
