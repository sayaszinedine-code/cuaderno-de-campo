import type { AiProviderId } from "./types";

export interface AiSettings {
  enabled: boolean;
  provider: AiProviderId;
  apiKey: string;
  consentAt?: string;
}

export const DEFAULT_AI_SETTINGS: AiSettings = { enabled: false, provider: "deepseek", apiKey: "" };

const key = (userId: string) => `ai-settings:${userId}`;

export function loadAiSettings(userId: string): AiSettings {
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return { ...DEFAULT_AI_SETTINGS };
    const p = JSON.parse(raw) as Partial<AiSettings>;
    const provider: AiProviderId = p.provider === "claude" ? "claude" : "deepseek";
    const consentAt = typeof p.consentAt === "string" ? p.consentAt : undefined;
    return {
      enabled: p.enabled === true && consentAt !== undefined,
      provider,
      apiKey: typeof p.apiKey === "string" ? p.apiKey : "",
      ...(consentAt ? { consentAt } : {}),
    };
  } catch {
    return { ...DEFAULT_AI_SETTINGS };
  }
}

/** Throws if enabling without consent or if storage is unavailable. */
export function saveAiSettings(userId: string, s: AiSettings): void {
  if (s.enabled && !s.consentAt) throw new Error("consent-required");
  localStorage.setItem(key(userId), JSON.stringify(s));
}
