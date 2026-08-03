#!/usr/bin/env node
/**
 * QA: SMSala live send using production Railway (clicks-tech-api) credentials.
 *
 * Usage:
 *   node scripts/qa-smsala.js
 *
 * Env:
 *   SMS_TO           default +97430403038
 *   TECH_SERVICE     default clicks-tech-api
 *   TECH_URL         default https://clicks-tech-api-production.up.railway.app
 *   SMSALA_API_TOKEN optional override if Railway CLI unavailable
 *   SMSALA_API_URL / SMSALA_SOURCE_ADDRESS / SMS_FROM / SMS_PROVIDER
 *                    used only with token override path
 *
 * Requires: railway CLI logged in + project linked (same as deploy scripts).
 */
const { execFileSync } = require("child_process");
const path = require("path");

const TECH_URL = (process.env.TECH_URL || "https://clicks-tech-api-production.up.railway.app").replace(/\/$/, "");
const TECH_SERVICE = process.env.TECH_SERVICE || "clicks-tech-api";
const SMS_TO = process.env.SMS_TO || "+97430403038";
const API_ROOT = path.join(__dirname, "..");

let passed = 0;
let failed = 0;

function step(name, ok, detail = "") {
  const mark = ok ? "PASS" : "FAIL";
  console.log(`${mark}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (ok) passed++;
  else failed++;
  return ok;
}

function maskToken(token) {
  const t = String(token || "");
  if (t.length <= 6) return "***";
  return `${t.slice(0, 3)}…${t.slice(-3)} (len=${t.length})`;
}

function normalizePhone(to) {
  const digits = String(to || "").replace(/\D/g, "");
  if (!digits) throw new Error("Invalid phone number for SMS");
  return digits;
}

function loadRailwayVars(service) {
  const args = ["variable", "list", "--service", service, "--json"];
  let out;
  try {
    out = execFileSync("railway", args, {
      cwd: API_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    });
  } catch (e) {
    throw new Error(`railway variable list failed: ${e.stderr || e.message}`);
  }
  const parsed = JSON.parse(out);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed;
  }
  if (Array.isArray(parsed)) {
    const map = {};
    for (const row of parsed) {
      const k = row.name || row.key;
      if (k) map[k] = row.value;
    }
    return map;
  }
  throw new Error("Unexpected railway variable list JSON shape");
}

function extractMessageId(raw) {
  const m = String(raw).match(/"MessageId"\s*:\s*(\d+)/);
  return m ? m[1] : null;
}

async function fetchDlr(token, messageId, attempts = 6) {
  let last = null;
  for (let i = 0; i < attempts; i++) {
    await new Promise((r) => setTimeout(r, i === 0 ? 5000 : 8000));
    try {
      const res = await fetch(
        `https://api2.smsala.com/Dlr/GetDetails?apiToken=${encodeURIComponent(
          token
        )}&messageId=${messageId}`
      );
      const text = await res.text();
      last = { status: res.status, text };
      if (res.ok && /Delivered|Rejected|Undeliverable|Expired/i.test(text)) {
        return last;
      }
    } catch (e) {
      last = { status: 0, text: e.message };
    }
  }
  return last;
}

function resolveSmsConfig() {
  if (process.env.SMSALA_API_TOKEN) {
    return {
      source: "env-override",
      SMS_PROVIDER: process.env.SMS_PROVIDER || "smsala",
      SMSALA_API_TOKEN: process.env.SMSALA_API_TOKEN,
      SMSALA_API_URL: process.env.SMSALA_API_URL || "https://api2.smsala.com/SendSmsV2",
      SMSALA_SOURCE_ADDRESS:
        process.env.SMSALA_SOURCE_ADDRESS || process.env.SMS_FROM || "Sanad RSA",
      SMSALA_MESSAGE_TYPE: process.env.SMSALA_MESSAGE_TYPE || "3",
      SMSALA_MESSAGE_ENCODING: process.env.SMSALA_MESSAGE_ENCODING || "1",
    };
  }

  const vars = loadRailwayVars(TECH_SERVICE);
  return {
    source: `railway:${TECH_SERVICE}`,
    SMS_PROVIDER: vars.SMS_PROVIDER || "",
    SMSALA_API_TOKEN: vars.SMSALA_API_TOKEN || "",
    SMSALA_API_URL: vars.SMSALA_API_URL || "https://api2.smsala.com/SendSmsV2",
    SMSALA_SOURCE_ADDRESS:
      vars.SMSALA_SOURCE_ADDRESS || vars.SMS_FROM || "Sanad RSA",
    SMSALA_MESSAGE_TYPE: vars.SMSALA_MESSAGE_TYPE || "3",
    SMSALA_MESSAGE_ENCODING: vars.SMSALA_MESSAGE_ENCODING || "1",
  };
}

async function main() {
  console.log("\n=== SMSala production live-send QA ===");
  console.log(`Tech API:  ${TECH_URL}`);
  console.log(`Service:   ${TECH_SERVICE}`);
  console.log(`SMS_TO:    ${SMS_TO}\n`);

  try {
    const health = await fetch(`${TECH_URL}/api/health`);
    step("production tech-api health", health.ok, `status=${health.status}`);
  } catch (e) {
    step("production tech-api health", false, e.message);
  }

  let cfg;
  try {
    cfg = resolveSmsConfig();
    step("load SMS config", true, cfg.source);
  } catch (e) {
    step("load SMS config", false, e.message);
    console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
    process.exit(1);
  }

  step(
    "SMS_PROVIDER is smsala",
    String(cfg.SMS_PROVIDER).toLowerCase() === "smsala",
    cfg.SMS_PROVIDER || "(empty)"
  );
  step("SMSALA_API_TOKEN present", !!cfg.SMSALA_API_TOKEN, maskToken(cfg.SMSALA_API_TOKEN));
  step(
    "source address present",
    !!cfg.SMSALA_SOURCE_ADDRESS,
    cfg.SMSALA_SOURCE_ADDRESS || "(empty)"
  );
  step(
    "messageType OTP/Transactional",
    ["2", "3"].includes(String(cfg.SMSALA_MESSAGE_TYPE)),
    `type=${cfg.SMSALA_MESSAGE_TYPE}`
  );

  try {
    const listRes = await fetch(
      `https://api2.smsala.com/sender/List?apiToken=${encodeURIComponent(
        cfg.SMSALA_API_TOKEN
      )}`
    );
    const listBody = await listRes.json();
    const senders = listBody?.ReturnData || [];
    const approved = senders.filter((s) => /approved/i.test(s.StatusName || ""));
    const match = approved.find(
      (s) =>
        String(s.SenderId || "").toLowerCase() ===
        String(cfg.SMSALA_SOURCE_ADDRESS || "").toLowerCase()
    );
    step(
      "source address approved for account",
      !!match,
      match
        ? `${match.SenderId} (${match.CountryName})`
        : `configured=${cfg.SMSALA_SOURCE_ADDRESS}; approved=${approved
            .map((s) => s.SenderId)
            .join(", ") || "none"}`
    );
  } catch (e) {
    step("source address approved for account", false, e.message);
  }

  let destination;
  try {
    destination = normalizePhone(SMS_TO);
    step("phone normalizes", destination === "97430403038" || !!destination, destination);
  } catch (e) {
    step("phone normalizes", false, e.message);
    console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
    process.exit(1);
  }

  if (!cfg.SMSALA_API_TOKEN || String(cfg.SMS_PROVIDER).toLowerCase() !== "smsala") {
    console.log("\nSkipping live send — provider/token checks failed.\n");
    console.log(`=== Results: ${passed} passed, ${failed} failed ===\n`);
    process.exit(1);
  }

  const messageText = `Your Clicks OTP is: ${Math.floor(
    100000 + Math.random() * 900000
  )}. Valid for 5 minutes.`;
  const payload = [
    {
      apiToken: cfg.SMSALA_API_TOKEN,
      messageType: cfg.SMSALA_MESSAGE_TYPE || "3",
      messageEncoding: cfg.SMSALA_MESSAGE_ENCODING || "1",
      destinationAddress: destination,
      sourceAddress: cfg.SMSALA_SOURCE_ADDRESS,
      messageText,
    },
  ];

  let res;
  let text;
  try {
    res = await fetch(cfg.SMSALA_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    text = await res.text();
  } catch (e) {
    step("live SendSmsV2", false, e.message);
    console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
    process.exit(1);
  }

  const messageId = extractMessageId(text);
  const sendOk = res.ok && /"Status"\s*:\s*"Success"/i.test(text) && !!messageId;
  step(
    "live SendSmsV2",
    sendOk,
    `http=${res.status} messageId=${messageId || "none"} body=${text.slice(0, 180)}`
  );

  if (sendOk && messageId) {
    const dlr = await fetchDlr(cfg.SMSALA_API_TOKEN, messageId);
    const dlrText = dlr?.text || "";
    const delivered = /"DlrStatus"\s*:\s*"Delivered"/i.test(dlrText);
    step(
      "DLR Delivered (not Rejected)",
      delivered,
      dlrText.slice(0, 280) || `http=${dlr?.status}`
    );
    if (delivered) {
      console.log(`\nSMS delivered to ${destination}. Check the handset (sender: ${cfg.SMSALA_SOURCE_ADDRESS}).`);
    }
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("QA aborted:", err.message);
  process.exit(1);
});
