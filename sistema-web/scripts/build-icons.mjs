// Renders public/logo.svg into the PNG app icons (run after changing the logo):
//   node scripts/build-icons.mjs
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const svg = readFileSync(new URL("../public/logo.svg", import.meta.url), "utf8");
const out = (name) => new URL(`../public/icons/${name}`, import.meta.url).pathname;

const browser = await chromium.launch();
const page = await browser.newPage();
async function shot(size, file, { maskable = false } = {}) {
  await page.setViewportSize({ width: size, height: size });
  // Maskable icons are cropped to a circle: keep the logo inside the 80% safe zone on its own background.
  const inner = maskable ? Math.round(size * 0.8) : size;
  await page.setContent(
    `<body style="margin:0;display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;background:${maskable ? "#FFE0F0" : "transparent"}">
       <div style="width:${inner}px;height:${inner}px">${svg.replace("<svg ", '<svg width="100%" height="100%" ')}</div>
     </body>`,
  );
  await page.screenshot({ path: out(file), omitBackground: !maskable });
}
await shot(192, "icon-192.png");
await shot(512, "icon-512.png");
await shot(512, "icon-maskable-512.png", { maskable: true });
await browser.close();
console.log("icons written");
