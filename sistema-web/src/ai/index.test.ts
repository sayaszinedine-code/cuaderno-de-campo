import { beforeEach, describe, expect, it, vi } from "vitest";

const providers = vi.hoisted(() => ({ generateClaude: vi.fn(), generateDeepseek: vi.fn() }));
vi.mock("./claude", () => ({ generateClaude: providers.generateClaude }));
vi.mock("./deepseek", () => ({ generateDeepseek: providers.generateDeepseek }));

import * as ai from "./index";
import { generateWithSettings } from "./index";

const consent = "2026-01-01T00:00:00Z";
const req = { system: "s", prompt: "p" };

beforeEach(() => {
  providers.generateClaude.mockReset().mockResolvedValue("c");
  providers.generateDeepseek.mockReset().mockResolvedValue("d");
});

describe("generateWithSettings", () => {
  it("never sends one provider's key to another", async () => {
    await expect(
      generateWithSettings({ enabled: true, provider: "claude", apiKeys: { deepseek: "dk" }, consentAt: consent }, req),
    ).rejects.toMatchObject({ code: "no-key" });
    expect(providers.generateClaude).not.toHaveBeenCalled();
    expect(providers.generateDeepseek).not.toHaveBeenCalled();

    await generateWithSettings({ enabled: true, provider: "claude", apiKeys: { deepseek: "dk", claude: "ck" }, consentAt: consent }, req);
    expect(providers.generateClaude).toHaveBeenCalledWith("ck", expect.anything());
    await generateWithSettings({ enabled: true, provider: "deepseek", apiKeys: { deepseek: "dk", claude: "ck" }, consentAt: consent }, req);
    expect(providers.generateDeepseek).toHaveBeenCalledWith("dk", expect.anything());
  });

  it("the public module exposes only the consent-gated entry point", () => {
    expect(Object.keys(ai)).toEqual(["generateWithSettings"]);
  });
});
