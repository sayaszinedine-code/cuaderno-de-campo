import type { AiProviderId } from "./types";

export interface AiSettings {
  enabled: boolean;
  provider: AiProviderId;
  /** One key per provider: a key is only ever sent to the provider it was saved for. */
  apiKeys: Partial<Record<AiProviderId, string>>;
  consentAt?: string;
}

export const DEFAULT_AI_SETTINGS: AiSettings = { enabled: false, provider: "deepseek", apiKeys: {} };

const PROVIDERS: readonly AiProviderId[] = ["deepseek", "claude", "gemini"];

/** The key saved for the selected provider ("" when none). */
export const currentApiKey = (s: AiSettings): string => s.apiKeys[s.provider] ?? "";

const key = (userId: string) => `ai-settings:${userId}`;

function readKeys(raw: unknown): Partial<Record<AiProviderId, string>> {
  const out: Partial<Record<AiProviderId, string>> = {};
  if (typeof raw !== "object" || raw === null) return out;
  const r = raw as Record<string, unknown>;
  for (const p of PROVIDERS) {
    const v = r[p];
    if (typeof v === "string" && v) out[p] = v;
  }
  return out;
}

export function loadAiSettings(userId: string): AiSettings {
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return { ...DEFAULT_AI_SETTINGS, apiKeys: {} };
    const p = JSON.parse(raw) as Record<string, unknown>;
    const provider: AiProviderId = PROVIDERS.find((id) => id === p.provider) ?? "deepseek";
    const consentAt = typeof p.consentAt === "string" ? p.consentAt : undefined;
    const apiKeys = readKeys(p.apiKeys);
    // Older versions stored a single `apiKey`: it belongs to the provider saved with it.
    if (typeof p.apiKey === "string" && p.apiKey && apiKeys[provider] === undefined) apiKeys[provider] = p.apiKey;
    return {
      enabled: p.enabled === true && consentAt !== undefined,
      provider,
      apiKeys,
      ...(consentAt ? { consentAt } : {}),
    };
  } catch {
    return { ...DEFAULT_AI_SETTINGS, apiKeys: {} };
  }
}

/** Throws if enabling without consent or if storage is unavailable. */
export function saveAiSettings(userId: string, s: AiSettings): void {
  if (s.enabled && !s.consentAt) throw new Error("consent-required");
  localStorage.setItem(key(userId), JSON.stringify(s));
}
