#!/usr/bin/env node
/**
 * QA: Google Play policy fixes (background location disclosure + privacy policy).
 *
 * Usage:
 *   node scripts/qa-play-store-compliance.js
 *
 * Env:
 *   ADMIN_URL, TECH_URL, PRIVACY_POLICY_URL, TECH_ROOT
 */
const fs = require("fs");
const path = require("path");

const ADMIN_URL = (process.env.ADMIN_URL || "https://clicks-admin-api-production.up.railway.app").replace(/\/$/, "");
const TECH_URL = (process.env.TECH_URL || "https://clicks-tech-api-production.up.railway.app").replace(/\/$/, "");
const PRIVACY_POLICY_URL = process.env.PRIVACY_POLICY_URL || "https://admin.clicks.qa/privacy-policy.html";
const PRIVACY_POLICY_SPA_URL = process.env.PRIVACY_POLICY_SPA_URL || "https://admin.clicks.qa/privacy-policy";
const TECH_ROOT = process.env.TECH_ROOT || path.join(__dirname, "..", "..", "clicks-technician");
const INTERFACE_ROOT = process.env.INTERFACE_ROOT || path.join(__dirname, "..", "..", "clicks-interface");

let passed = 0;
let failed = 0;
let warned = 0;

function pass(name, detail = "") {
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  passed++;
}

function fail(name, detail = "") {
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  failed++;
}

function warn(name, detail = "") {
  console.log(`WARN  ${name}${detail ? ` — ${detail}` : ""}`);
  warned++;
}

function readTech(rel) {
  return fs.readFileSync(path.join(TECH_ROOT, rel), "utf8");
}

function includesAll(text, phrases, label) {
  const lower = text.toLowerCase();
  const missing = phrases.filter((p) => !lower.includes(p.toLowerCase()));
  if (missing.length === 0) {
    pass(label);
    return true;
  }
  fail(label, `missing: ${missing.join(", ")}`);
  return false;
}

async function fetchJson(url) {
  const res = await fetch(url);
  const body = await res.text();
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    data = body;
  }
  return { ok: res.ok, status: res.status, data, raw: body };
}

async function checkPrivacyPolicyApi(label, url) {
  const { ok, status, data } = await fetchJson(url);
  if (!ok) {
    fail(`${label} reachable`, `HTTP ${status}`);
    return null;
  }
  const policy = data?.policy;
  if (!policy?.content) {
    fail(`${label} has content`);
    return null;
  }
  pass(`${label} reachable`, `v${policy.version}`);

  const content = policy.content;
  if (/demo privacy policy/i.test(content)) {
    fail(`${label} not placeholder`);
  } else {
    pass(`${label} not placeholder`);
  }

  includesAll(
    content,
    [
      "location",
      "background location",
      "Security and data handling",
      "HTTPS/TLS",
      "do not sell",
    ],
    `${label} covers Play-required topics`
  );

  if (content.length >= 2000) {
    pass(`${label} sufficient length`, `${content.length} chars`);
  } else {
    fail(`${label} sufficient length`, `${content.length} chars`);
  }

  return policy;
}

async function checkPublicPrivacyPage() {
  const staticLocal = path.join(INTERFACE_ROOT, "public/privacy-policy.html");
  if (fs.existsSync(staticLocal)) {
    const localHtml = fs.readFileSync(staticLocal, "utf8");
    pass("Static privacy policy file in repo");
    includesAll(
      localHtml,
      ["background location", "Location data", "Security and data handling"],
      "Static file includes location + security sections"
    );
  } else {
    fail("Static privacy policy file in repo", staticLocal);
  }

  const res = await fetch(PRIVACY_POLICY_URL);
  const html = await res.text();
  if (!res.ok) {
    fail("Production static privacy URL", `HTTP ${res.status} — deploy clicks-interface`);
    return;
  }
  pass("Production static privacy URL", PRIVACY_POLICY_URL);

  if (/Privacy Policy Unavailable|No Privacy Policy Found|demo privacy policy/i.test(html)) {
    fail("Production static page shows real policy");
  } else {
    pass("Production static page shows real policy");
  }

  includesAll(
    html,
    ["background location", "Location data", "Security and data handling"],
    "Production static page crawlable content"
  );

  const spaRes = await fetch(PRIVACY_POLICY_SPA_URL);
  const spaHtml = await spaRes.text();
  if (!/background location/i.test(spaHtml)) {
    warn(
      "SPA /privacy-policy route not crawlable",
      "use /privacy-policy.html in Play Console, not /privacy-policy"
    );
  }
}

function checkAppDisclosureWiring() {
  const disclosure = readTech("lib/core/permissions/background_location_disclosure.dart");
  const homeScreen = readTech("lib/features/home/ui/view/home_screen.dart");
  const setupSheet = readTech("lib/core/permissions/permissions_setup_sheet.dart");
  const manifest = readTech("android/app/src/main/AndroidManifest.xml");
  const pubspec = readTech("pubspec.yaml");

  if (manifest.includes("ACCESS_BACKGROUND_LOCATION")) {
    pass("AndroidManifest declares BACKGROUND_LOCATION");
  } else {
    fail("AndroidManifest declares BACKGROUND_LOCATION");
  }

  if (
    disclosure.includes("barrierDismissible: false") &&
    disclosure.includes("'Agree'") &&
    disclosure.includes("Background location access")
  ) {
    pass("Disclosure dialog is prominent (blocking + Agree)");
  } else {
    fail("Disclosure dialog is prominent (blocking + Agree)");
  }

  if (
    disclosure.includes("app is closed or not in use") &&
    disclosure.includes("do not sell") &&
    disclosure.includes("View Privacy Policy")
  ) {
    pass("Disclosure explains collection, use, sharing");
  } else {
    fail("Disclosure explains collection, use, sharing");
  }

  if (homeScreen.includes("BackgroundLocationDisclosure.ensureAccepted")) {
    pass("Go Online flow shows disclosure first");
  } else {
    fail("Go Online flow shows disclosure first");
  }

  if (
    setupSheet.includes("_ensureBackgroundLocationDisclosure") &&
    setupSheet.includes("PermissionSetupStep.locationAlways")
  ) {
    pass("Permission wizard gates location step with disclosure");
  } else {
    fail("Permission wizard gates location step with disclosure");
  }

  const versionMatch = pubspec.match(/^version:\s*(\S+)/m);
  const version = versionMatch?.[1] || "";
  const code = Number((version.split("+")[1] || "0"));
  if (code >= 14) {
    pass("App version code bumped for resubmit", version);
  } else {
    fail("App version code bumped for resubmit", version || "unknown");
  }

  const aabPath = path.join(TECH_ROOT, "build/app/outputs/bundle/release/app-release.aab");
  if (fs.existsSync(aabPath)) {
    const stat = fs.statSync(aabPath);
    pass("Release AAB exists", `${Math.round(stat.size / 1024 / 1024 * 10) / 10} MB`);
  } else {
    warn("Release AAB exists", "run scripts/build-aab-production.ps1");
  }

  // Foreground-only paths that bypass disclosure (acceptable for Play BACKGROUND_LOCATION policy).
  const welcome = readTech("lib/features/welcome/logic/services/welcome_service.dart");
  if (welcome.includes("Geolocator.requestPermission")) {
    warn(
      "Welcome screen requests foreground location before disclosure",
      "foreground only — not a BACKGROUND_LOCATION violation if user has not gone Online yet"
    );
  }

  const homeCubit = readTech("lib/features/home/ui/cubit/home_cubit.dart");
  if (
    homeCubit.includes("Geolocator.requestPermission") &&
    !homeCubit.includes("BackgroundLocationDisclosure")
  ) {
    warn(
      "HomeCubit can request location without calling disclosure directly",
      "OK if user always passes home_screen.ensureAccepted before going Online"
    );
  }
}

async function main() {
  console.log("\n=== Play Store compliance QA ===");
  console.log(`Admin API:  ${ADMIN_URL}`);
  console.log(`Tech API:   ${TECH_URL}`);
  console.log(`Public URL: ${PRIVACY_POLICY_URL}`);
  console.log(`Tech app:   ${TECH_ROOT}\n`);

  console.log("--- Privacy policy (Play Console URL + APIs) ---");
  await checkPrivacyPolicyApi("Admin active policy", `${ADMIN_URL}/api/privacy-policy/active`);
  await checkPrivacyPolicyApi("Tech in-app policy", `${TECH_URL}/api/content/privacy-policy`);
  await checkPublicPrivacyPage();

  console.log("\n--- App disclosure wiring (static) ---");
  checkAppDisclosureWiring();

  console.log("\n--- Summary ---");
  console.log(`PASS: ${passed}  FAIL: ${failed}  WARN: ${warned}`);
  if (failed > 0) {
    console.log("\nFix FAIL items before resubmitting to Play Store.");
    process.exit(1);
  }
  if (warned > 0) {
    console.log("\nReview WARN items — usually OK but worth a manual device check.");
  } else {
    console.log("\nAll checks passed. Manual device test: slide Online → Agree disclosure → grant location.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
