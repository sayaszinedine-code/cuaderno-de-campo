import { generate } from "./generate";
import { currentApiKey, type AiSettings } from "./settings";
import { AiError, type AiRequest } from "./types";

/**
 * The only entry point for UI code: needs the assistant enabled with recorded consent, and
 * sends only the key saved for the selected provider.
 */
export async function generateWithSettings(settings: AiSettings, req: AiRequest): Promise<string> {
  if (!settings.enabled || !settings.consentAt) throw new AiError("disabled");
  return generate(settings.provider, currentApiKey(settings), req);
}
