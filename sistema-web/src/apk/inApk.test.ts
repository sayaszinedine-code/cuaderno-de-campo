import { describe, expect, it } from "vitest";
import { APK_URL, isInApk } from "./inApk";

describe("isInApk", () => {
  it("recognises the Android app by its user-agent marker", () => {
    expect(isInApk("Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile CuadernoDeCampoApp")).toBe(true);
    expect(isInApk("Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile")).toBe(false);
  });

  it("points to the published APK", () => {
    expect(APK_URL).toBe("/descargas/cuaderno-de-campo.apk");
  });
});
