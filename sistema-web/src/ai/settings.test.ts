import { beforeEach, describe, expect, it } from "vitest";
import { loadAiSettings, saveAiSettings } from "./settings";

beforeEach(() => localStorage.clear());

describe("ai settings", () => {
  it("defaults to disabled", () => {
    expect(loadAiSettings("u1")).toEqual({ enabled: false, provider: "deepseek", apiKey: "" });
  });
  it("round-trips per user", () => {
    saveAiSettings("u1", { enabled: true, provider: "claude", apiKey: "sk-1", consentAt: "2026-11-19T10:00:00.000Z" });
    expect(loadAiSettings("u1")).toMatchObject({ enabled: true, provider: "claude", apiKey: "sk-1" });
    expect(loadAiSettings("u2").enabled).toBe(false);
  });
  it("rejects enabling without consent", () => {
    expect(() => saveAiSettings("u1", { enabled: false, provider: "claude", apiKey: "k" })).not.toThrow();
    expect(() => saveAiSettings("u1", { enabled: true, provider: "claude", apiKey: "k" })).toThrow();
  });
  it("tolerates corrupt storage", () => {
    localStorage.setItem("ai-settings:u1", "{bad");
    expect(loadAiSettings("u1").enabled).toBe(false);
  });
});
