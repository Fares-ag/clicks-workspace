/**
 * GET /api/config/public — unauthenticated runtime config for the customer
 * app, read at splash (WS-I item 2, WS-F item 6).
 *
 * Everything here is safe to publish: feature flags, the minimum supported
 * app version per platform, the support number and the coverage area.
 */
const express = require("express");
const { getLaunchFlags } = require("../utils/featureFlags");
const { minAppVersions, storeUrls } = require("../utils/appVersion");
const { QATAR_BOUNDS } = require("../../../clicks-shared/utils/qatarCoverage");
const { otpAllowedPrefixes } = require("../../../clicks-shared/utils/phone");

const router = express.Router();

const { getSupportPhone } = require("../../../clicks-shared/services/opsSettings");

/** Admin ops setting first, then env SUPPORT_PHONE (see opsSettings). */
async function supportPhone() {
  try {
    return (await getSupportPhone()) || null;
  } catch (_) {
    const raw = String(process.env.SUPPORT_PHONE || "").trim();
    return raw || null;
  }
}

async function buildPublicConfig() {
  const flags = getLaunchFlags();
  return {
    flags: {
      public_sos: flags.publicSos,
      public_signup: flags.publicSignup,
      customer_membership: flags.customerMembership,
      skipcash: flags.skipcash,
    },
    region: flags.region,
    min_app_version: minAppVersions(),
    store_url: storeUrls(),
    support_phone: await supportPhone(),
    // Dispatch is staffed 24/7 (decision, 7 Nov 2026).
    dispatch_hours: "24/7",
    coverage: {
      country: "QA",
      bounds: QATAR_BOUNDS,
    },
    otp_allowed_prefixes: otpAllowedPrefixes(),
    server_time: new Date().toISOString(),
  };
}

router.get("/public", async (_req, res) => {
  res.set("Cache-Control", "public, max-age=60");
  try {
    res.json(await buildPublicConfig());
  } catch (err) {
    res.status(500).json({ error: "Config unavailable", code: "CONFIG_UNAVAILABLE" });
  }
});

module.exports = router;
module.exports.buildPublicConfig = buildPublicConfig;
