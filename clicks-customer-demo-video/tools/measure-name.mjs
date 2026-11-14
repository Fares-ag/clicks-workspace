/**
 * Measures, in device pixels (1080x2400), where text sits on a captured screen
 * and what colour is behind it — so the name overlay in the Remotion phone can
 * be placed exactly over the text it replaces instead of guessed by eye.
 *
 * Scans a tall band and reports every run of rows that contains ink, so the
 * right line can be picked off the list rather than hunted for.
 *
 *   node tools/measure-name.mjs [file] [x] [y] [w] [h]
 */
import { chromium } from "playwright-core";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME =
  "C:/Users/TS/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe";

const DEFAULTS = [
  ["s09-technician-assigned.png", 100, 440, 820, 180],
  ["s14-enroute.png", 300, 1560, 760, 200],
  ["s15-arrived.png", 300, 1540, 760, 200],
  ["s16-in-progress.png", 200, 950, 860, 250],
  ["s18-rating.png", 200, 1520, 760, 200],
  ["s17-details.png", 100, 1200, 860, 220],
];

const argv = process.argv.slice(2);
const TARGETS = argv.length
  ? [[argv[0], ...argv.slice(1, 5).map(Number)]]
  : DEFAULTS;

const browser = await chromium.launch({
  executablePath: CHROME,
  // file:// canvases are tainted otherwise, and getImageData throws.
  args: ["--allow-file-access-from-files"],
});
const page = await browser.newPage();
await page.goto(pathToFileURL(ROOT).href + "/");

for (const [file, bx, by, bw, bh] of TARGETS) {
  const src = pathToFileURL(
    file.includes("/") ? path.join(ROOT, file) : path.join(ROOT, "footage/stills/final", file)
  ).href;
  const bands = await page.evaluate(
    async ([src, bx, by, bw, bh]) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = bw;
      c.height = bh;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, bx, by, bw, bh, 0, 0, bw, bh);
      const d = ctx.getImageData(0, 0, bw, bh).data;

      const counts = new Map();
      for (let i = 0; i < d.length; i += 4) {
        const k = `${d[i]},${d[i + 1]},${d[i + 2]}`;
        counts.set(k, (counts.get(k) || 0) + 1);
      }
      let bg = "0,0,0";
      let best = 0;
      for (const [k, n] of counts) if (n > best) ((best = n), (bg = k));
      const [br, bgr, bb] = bg.split(",").map(Number);
      let ink = null, inkDist = -1;
      const inky = (x, y) => {
        const i = (y * bw + x) * 4;
        const dist = Math.abs(d[i] - br) + Math.abs(d[i + 1] - bgr) + Math.abs(d[i + 2] - bb);
        if (dist > inkDist) { inkDist = dist; ink = `rgb(${d[i]},${d[i + 1]},${d[i + 2]})`; }
        return dist > 110;
      };

      const out = [];
      let run = null;
      for (let y = 0; y < bh; y++) {
        let x0 = bw, x1 = -1;
        for (let x = 0; x < bw; x++)
          if (inky(x, y)) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
          }
        if (x1 >= 0) {
          if (!run) run = { y0: y, y1: y, x0, x1 };
          else {
            run.y1 = y;
            run.x0 = Math.min(run.x0, x0);
            run.x1 = Math.max(run.x1, x1);
          }
        } else if (run) {
          out.push(run);
          run = null;
        }
      }
      if (run) out.push(run);

      // Column runs reveal the icon-gap-text structure inside a row.
      const cols = [];
      let crun = null;
      for (let x = 0; x < bw; x++) {
        let hit = false;
        for (let y = 0; y < bh && !hit; y++) if (inky(x, y)) hit = true;
        if (hit) {
          if (!crun) crun = { x0: x, x1: x };
          else crun.x1 = x;
        } else if (crun) {
          // Treat gaps narrower than 8px as inter-letter spacing.
          if (cols.length && crun.x0 - cols[cols.length - 1].x1 < 8) cols[cols.length - 1].x1 = crun.x1;
          else cols.push(crun);
          crun = null;
        }
      }
      if (crun) {
        if (cols.length && crun.x0 - cols[cols.length - 1].x1 < 8) cols[cols.length - 1].x1 = crun.x1;
        else cols.push(crun);
      }
      return { bg: `rgb(${bg})`, ink, bands: out.filter((b) => b.y1 - b.y0 >= 6), cols };
    },
    [src, bx, by, bw, bh]
  );

  console.log(`\n${file}   window ${bx},${by} ${bw}x${bh}   bg ${bands.bg}`);
  for (const b of bands.bands) {
    console.log(
      `   row  x ${bx + b.x0}..${bx + b.x1} (w ${b.x1 - b.x0 + 1})   y ${by + b.y0}..${by + b.y1} (h ${b.y1 - b.y0 + 1})`
    );
  }
  if (bands.cols.length <= 14) {
    console.log(
      "   cols " + bands.cols.map((c) => `${bx + c.x0}-${bx + c.x1}`).join("  ")
    );
  }
}

await browser.close();
