/**
 * Renders the Stage 2 style frames at 1920x1080 with the Chromium that
 * Playwright already has on this machine. The HTML here is the reference the
 * Remotion package in Stage 3 is built from: same tokens, same layout grid.
 *
 *   node tools/styleframes.mjs
 */
import { chromium } from "playwright-core";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME =
  "C:/Users/TS/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe";
const OUT = path.join(ROOT, "deliverables", "style-frames");
const url = (p) => pathToFileURL(path.join(ROOT, p)).href;

// Brand tokens, read off clicks-user/lib/core/theme/colors_manager.dart.
const TOKENS = `
  --crimson: #981F1F;
  --ink-900: #0C0D0F;
  --accent: #FFFFFF;
  --muted: rgba(255,255,255,.62);
`;

const FONTS = `
  @font-face { font-family: HN; src: url('${url("assets/fonts/HelveticaNeueLight.otf")}'); font-weight: 300; }
  @font-face { font-family: HN; src: url('${url("assets/fonts/HelveticaNeueRoman.otf")}'); font-weight: 400; }
  @font-face { font-family: HN; src: url('${url("assets/fonts/HelveticaNeueMedium.otf")}'); font-weight: 500; }
  @font-face { font-family: HN; src: url('${url("assets/fonts/HelveticaNeueBold.otf")}'); font-weight: 700; }
`;

const NOISE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'>" +
      "<filter id='n'><feTurbulence baseFrequency='.9' numOctaves='3'/></filter>" +
      "<rect width='120' height='120' filter='url(#n)'/></svg>"
  );

/**
 * The device screen is 1080x2400 with a 128px OS status bar we never show —
 * the phone chrome drawn here replaces it, so every shot starts at app content.
 */
const phone = (still, { scale = 1, patch = null } = {}) => {
  // Mirrors NAME_SPOTS in src/components/NameTag.jsx: the demo technician's
  // record reads "Omar Al-Thani" and the film's persona is Mohammed Khalil.
  const k = (430 * scale) / 1080;
  const chip = patch
    ? `<div style="position:absolute;left:${(patch.x - 6) * k}px;top:${(patch.y - 128 - 6) * k}px;` +
      `width:${(patch.w + 12) * k}px;height:${(patch.h + 12) * k}px;background:${patch.bg};` +
      `display:flex;align-items:center;padding-left:${6 * k}px;font-weight:500;` +
      `font-size:${patch.size * k}px;line-height:1;color:${patch.color};white-space:nowrap">` +
      `Mohammed Khalil</div>`
    : "";
  return (
    `<div class="phone" style="--s:${scale}">` +
    `<div class="screen"><img src="${url("footage/stills/final/" + still)}">${chip}</div>` +
    `<div class="bezel"></div></div>`
  );
};

const BASE = `
  * { margin:0; padding:0; box-sizing:border-box; }
  :root { ${TOKENS} }
  ${FONTS}
  body {
    width:1920px; height:1080px; overflow:hidden;
    font-family: HN, 'Helvetica Neue', Arial, sans-serif;
    background: var(--ink-900); color: #fff;
    -webkit-font-smoothing: antialiased;
  }
  .stage { position:relative; width:1920px; height:1080px; overflow:hidden; }
  .grain { position:absolute; inset:0; opacity:.045; pointer-events:none;
    background-image:url("${NOISE}"); }
  .phone {
    position:relative; width:calc(430px * var(--s)); height:calc(905px * var(--s));
    border-radius:calc(46px * var(--s));
    background:#000;
    box-shadow: 0 60px 120px rgba(0,0,0,.65), 0 0 0 calc(9px * var(--s)) #1b1c1f,
                0 0 0 calc(10px * var(--s)) rgba(255,255,255,.09);
  }
  .phone .screen { position:absolute; inset:0; border-radius:calc(40px * var(--s)); overflow:hidden; background:#fff; }
  /* Crop the OS status bar (128 of 2400 captured rows) so shots start at app UI. */
  .phone .screen img { width:100%; display:block; margin-top:calc(-1 * var(--s) * 430px * (128/1080)); }
  .phone .bezel { position:absolute; inset:0; border-radius:calc(46px * var(--s));
    background:linear-gradient(145deg, rgba(255,255,255,.14), transparent 28%, transparent 72%, rgba(255,255,255,.07));
    pointer-events:none; }
  .eyebrow { font-weight:500; font-size:19px; letter-spacing:.34em; text-transform:uppercase; color:var(--accent); }
  h1 { font-weight:700; font-size:92px; line-height:.98; letter-spacing:-.025em; }
  h1 em { font-style:normal; color:#FF6B6B; }
  .sub { font-weight:300; font-size:30px; line-height:1.45; color:var(--muted); max-width:640px; }
  .rule { width:92px; height:5px; background:var(--crimson); border-radius:3px; }
  .foot { position:absolute; left:120px; bottom:62px; display:flex; align-items:center; gap:22px;
          font-size:18px; font-weight:300; color:rgba(255,255,255,.4); letter-spacing:.06em; }
  .foot svg { height:30px; width:auto; }
`;

const LOGO = fs.readFileSync(path.join(ROOT, "assets/brand/Logo-white.svg"), "utf8");

const frames = {
  "01-opening": `
  <style>
    .stage { background:
      radial-gradient(760px 760px at 76% 50%, rgba(192,40,40,.50), transparent 66%),
      radial-gradient(1300px 900px at 82% 44%, rgba(152,31,31,.42), transparent 64%),
      radial-gradient(900px 620px at 6% 4%, rgba(152,31,31,.20), transparent 62%),
      var(--ink-900); }
    .copy { position:absolute; left:120px; top:238px; display:flex; flex-direction:column; gap:34px; }
    .art { position:absolute; right:168px; top:50%; transform:translateY(-50%) rotate(-5deg); }
  </style>
  <div class="stage">
    <div class="copy">
      <div class="eyebrow">Roadside assistance &middot; Qatar</div>
      <h1>One press.<br><em>Help on the way.</em></h1>
      <div class="rule"></div>
      <p class="sub">Clicks puts roadside assistance in your pocket &mdash; and shares your exact location with dispatch.</p>
    </div>
    <div class="art">${phone("s03-home-idle.png", { scale: 1.02 })}</div>
    <div class="foot">${LOGO}<span>clicks.qa</span></div>
    <div class="grain"></div>
  </div>`,

  "02-callout": `
  <style>
    .stage { background:
      radial-gradient(900px 700px at 20% 50%, rgba(152,31,31,.30), transparent 66%),
      linear-gradient(118deg, #121316 0%, #17181A 46%, #240B0B 100%); }
    .art { position:absolute; left:150px; top:50%; transform:translateY(-50%); }
    .side { position:absolute; left:790px; top:330px; width:960px; display:flex; flex-direction:column; gap:28px; }
    h1 { font-size:70px; }
    .steps { display:flex; flex-direction:column; gap:19px; margin-top:6px; }
    .step { display:flex; align-items:center; gap:20px; font-size:24px; font-weight:300; color:rgba(255,255,255,.80); }
    .step b { font-weight:500; color:#fff; }
    .dot { width:13px; height:13px; border-radius:50%; background:var(--crimson); flex:none;
           box-shadow:0 0 0 7px rgba(152,31,31,.22); }
    .step.on .dot { background:var(--accent); box-shadow:0 0 0 7px rgba(255,255,255,.22); }
    /* Points at the green "Technician Assigned" banner near the top of the screen. */
    .pointer { position:absolute; left:576px; top:214px; width:206px; height:2px;
               background:linear-gradient(90deg, rgba(255,255,255,0), var(--accent)); }
    .pointer::after { content:""; position:absolute; left:0; top:-4px; width:9px; height:9px;
                      border-radius:50%; background:var(--accent); }
    .tag { position:absolute; left:790px; top:196px; font-size:22px; font-weight:500; color:var(--accent);
           letter-spacing:.04em; }
  </style>
  <div class="stage">
    <div class="art">${phone("s09-technician-assigned.png", { scale: 0.94, patch: { x: 148, y: 524, w: 300, h: 36, size: 45, bg: "#07431F", color: "#C6D4C9" } })}</div>
    <div class="pointer"></div>
    <div class="tag">Dispatch names your technician</div>
    <div class="side">
      <div class="eyebrow">Chapter 03 &middot; The wait</div>
      <h1>You are never<br>left guessing.</h1>
      <div class="steps">
        <div class="step"><span class="dot"></span><span><b>Searching</b> &mdash; your request goes out to dispatch</span></div>
        <div class="step"><span class="dot"></span><span><b>In call</b> &mdash; a dispatcher picks it up</span></div>
        <div class="step on"><span class="dot"></span><span><b>Assigned</b> &mdash; your technician is named</span></div>
      </div>
    </div>
    <div class="foot">${LOGO}<span>clicks.qa</span></div>
    <div class="grain"></div>
  </div>`,

  "03-endcard": `
  <style>
    .stage { background:
      radial-gradient(1400px 900px at 50% 42%, #A82323 0%, #6B1414 38%, #230707 72%, #0C0D0F 100%);
      display:flex; align-items:center; justify-content:center; }
    .wrap { display:flex; flex-direction:column; align-items:center; gap:40px; text-align:center; }
    .wrap svg { height:86px; width:auto; }
    .tagline { font-weight:300; font-size:46px; letter-spacing:.012em; color:rgba(255,255,255,.93); }
    .site { font-weight:500; font-size:25px; letter-spacing:.3em; color:rgba(255,255,255,.72); }
    .hair { width:260px; height:1px; background:rgba(255,255,255,.26); }
  </style>
  <div class="stage">
    <div class="wrap">
      ${LOGO}
      <div class="hair"></div>
      <div class="tagline">Assisted anytime, anywhere.</div>
      <div class="site">CLICKS.QA</div>
    </div>
    <div class="grain"></div>
  </div>`,
};

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.join(ROOT, "build"), { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});
for (const [name, body] of Object.entries(frames)) {
  const html = `<!doctype html><meta charset="utf-8"><style>${BASE}</style>${body}`;
  const tmp = path.join(ROOT, "build", `${name}.html`);
  fs.writeFileSync(tmp, html);
  await page.goto(pathToFileURL(tmp).href);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const out = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: out });
  console.log("wrote", path.relative(ROOT, out));
}
await browser.close();
