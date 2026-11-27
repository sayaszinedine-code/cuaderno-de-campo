// Renders the launcher icons and splash screens from the web logo (sistema-web/public/logo.svg).
// Uses the Playwright installed in ../sistema-web. Run: npm run assets
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../sistema-web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

const logo = readFileSync(new URL("../../sistema-web/public/logo.svg", import.meta.url), "utf8");
// The notebook and crayon without the logo's rounded pink tile (adaptive icons draw their own background).
const artwork = logo.replace(/<rect width="64" height="64" rx="16" fill="#FFE0F0"\/>/, "");
const res = (p) => new URL(`../android/app/src/main/res/${p}`, import.meta.url).pathname;

const PINK_SOFT = "#FFE0F0";
const CREAM = "#FFF9F0";
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

const browser = await chromium.launch();
const page = await browser.newPage();

async function render(file, w, h, svg, { scale = 1, background = "transparent", round = false } = {}) {
  await page.setViewportSize({ width: w, height: h });
  const box = Math.round(Math.min(w, h) * scale);
  await page.setContent(
    `<body style="margin:0;width:${w}px;height:${h}px;display:flex;align-items:center;justify-content:center;background:transparent">
       <div style="width:${round ? Math.min(w, h) : w}px;height:${round ? Math.min(w, h) : h}px;display:flex;align-items:center;justify-content:center;background:${background};${round ? "border-radius:50%;" : ""}">
         <div style="width:${box}px;height:${box}px">${svg.replace("<svg ", '<svg width="100%" height="100%" ')}</div>
       </div>
     </body>`,
  );
  await page.screenshot({ path: res(file), omitBackground: background === "transparent" || round });
}

for (const [d, k] of Object.entries(DENSITIES)) {
  const icon = Math.round(48 * k);
  const fg = Math.round(108 * k);
  await render(`mipmap-${d}/ic_launcher.png`, icon, icon, logo);
  await render(`mipmap-${d}/ic_launcher_round.png`, icon, icon, artwork, { scale: 0.78, background: PINK_SOFT, round: true });
  // Adaptive foreground: keep the drawing inside the 66 dp safe zone of the 108 dp canvas.
  await render(`mipmap-${d}/ic_launcher_foreground.png`, fg, fg, artwork, { scale: 0.62 });
}

const SPLASH = {
  "drawable/splash.png": [480, 320],
  "drawable-land-mdpi/splash.png": [480, 320],
  "drawable-land-hdpi/splash.png": [800, 480],
  "drawable-land-xhdpi/splash.png": [1280, 720],
  "drawable-land-xxhdpi/splash.png": [1600, 960],
  "drawable-land-xxxhdpi/splash.png": [1920, 1280],
  "drawable-port-mdpi/splash.png": [320, 480],
  "drawable-port-hdpi/splash.png": [480, 800],
  "drawable-port-xhdpi/splash.png": [720, 1280],
  "drawable-port-xxhdpi/splash.png": [960, 1600],
  "drawable-port-xxxhdpi/splash.png": [1280, 1920],
};
for (const [file, [w, h]] of Object.entries(SPLASH)) await render(file, w, h, logo, { scale: 0.32, background: CREAM });

await browser.close();
console.log("android assets written");
