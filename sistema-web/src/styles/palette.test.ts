import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "theme.css"), "utf8");
const COLORS = ["rosa", "celeste", "naranja", "lima", "lila", "amarillo"] as const;

/** Variables of the first block whose selector starts with `selector`. */
function block(selector: string): Record<string, string> {
  const i = css.indexOf(selector);
  expect(i, selector).toBeGreaterThanOrEqual(0);
  const body = css.slice(css.indexOf("{", i) + 1, css.indexOf("}", i));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe.each([
  ["light", ":root {"],
  ["dark", ':root[data-theme="dark"] {'],
])("palette (%s)", (_name, selector) => {
  const v = block(selector);
  it("body text is readable", () => {
    expect(contrast(v["--foreground"], v["--background"])).toBeGreaterThanOrEqual(4.5);
  });
  it.each(COLORS)("%s text is readable on its soft background and on the surface", (c) => {
    const strong = v[`--c-${c}`];
    const soft = v[`--c-${c}-soft`];
    expect(strong, c).toBeDefined();
    expect(soft, c).toBeDefined();
    expect(contrast(strong, soft)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(strong, v["--surface"])).toBeGreaterThanOrEqual(4.5);
  });
});
