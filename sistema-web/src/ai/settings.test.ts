import { beforeEach, describe, expect, it } from "vitest";
import { currentApiKey, loadAiSettings, saveAiSettings } from "./settings";

beforeEach(() => localStorage.clear());

describe("ai settings", () => {
  it("defaults to disabled", () => {
    expect(loadAiSettings("u1")).toEqual({ enabled: false, provider: "deepseek", apiKeys: {} });
  });
  it("round-trips per user", () => {
    saveAiSettings("u1", { enabled: true, provider: "claude", apiKeys: { claude: "sk-1" }, consentAt: "2026-11-19T10:00:00.000Z" });
    expect(loadAiSettings("u1")).toMatchObject({ enabled: true, provider: "claude", apiKeys: { claude: "sk-1" } });
    expect(loadAiSettings("u2").enabled).toBe(false);
  });
  it("keeps one key per provider and uses only the current provider's key", () => {
    saveAiSettings("u1", { enabled: false, provider: "claude", apiKeys: { deepseek: "dk", claude: "ck" } });
    const s = loadAiSettings("u1");
    expect(s.apiKeys).toEqual({ deepseek: "dk", claude: "ck" });
    expect(currentApiKey(s)).toBe("ck");
    expect(currentApiKey({ ...s, provider: "deepseek" })).toBe("dk");
    expect(currentApiKey({ ...s, apiKeys: { deepseek: "dk" } })).toBe("");
  });
  it("migrates an old single apiKey to the provider it was saved with", () => {
    localStorage.setItem("ai-settings:u1", JSON.stringify({ enabled: false, provider: "claude", apiKey: "old" }));
    expect(loadAiSettings("u1").apiKeys).toEqual({ claude: "old" });
    localStorage.setItem("ai-settings:u1", JSON.stringify({ enabled: false, provider: "deepseek", apiKey: "old", apiKeys: { deepseek: "new" } }));
    expect(loadAiSettings("u1").apiKeys).toEqual({ deepseek: "new" });
  });
  it("ignores non-string or unknown-provider keys", () => {
    localStorage.setItem("ai-settings:u1", JSON.stringify({ provider: "claude", apiKeys: { claude: 3, other: "x", deepseek: "d" } }));
    expect(loadAiSettings("u1").apiKeys).toEqual({ deepseek: "d" });
  });
  it("rejects enabling without consent", () => {
    expect(() => saveAiSettings("u1", { enabled: false, provider: "claude", apiKeys: { claude: "k" } })).not.toThrow();
    expect(() => saveAiSettings("u1", { enabled: true, provider: "claude", apiKeys: { claude: "k" } })).toThrow();
  });
  it("tolerates corrupt storage", () => {
    localStorage.setItem("ai-settings:u1", "{bad");
    expect(loadAiSettings("u1").enabled).toBe(false);
  });
});
