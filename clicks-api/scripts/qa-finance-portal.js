/**
 * Smoke test: finance portal login → list completed jobs → save costs → audit.
 *
 * Usage:
 *   node scripts/qa-finance-portal.js
 *   FINANCE_API=http://localhost:5000 node scripts/qa-finance-portal.js
 */
const path = require("path");
require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-admin-api/.env"),
});

const BASE = (process.env.FINANCE_API || "http://localhost:5000").replace(/\/$/, "");

async function request(method, urlPath, { token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(data?.message || `${method} ${urlPath} → ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function main() {
  console.log("Finance portal smoke test →", BASE);

  const login = await request("POST", "/api/finance/auth/login", {
    body: { email: "finance@clicks.local", password: "Finance123!" },
  });
  const token = login.accessToken;
  if (!token) throw new Error("No accessToken from login");
  console.log("✓ Login");

  const me = await request("GET", "/api/finance/me", { token });
  if (!me.user?.email) throw new Error("/me missing user");
  console.log("✓ Me:", me.user.email);

  const dashboard = await request("GET", "/api/finance/dashboard", { token });
  console.log(
    "✓ Dashboard:",
    `completed=${dashboard.totalCompleted}`,
    `pending=${dashboard.pendingAudit}`,
    `audited=${dashboard.audited}`
  );

  const list = await request("GET", "/api/finance/jobs?limit=5", { token });
  const jobs = list.jobs || [];
  if (!jobs.length) {
    console.warn("⚠ No completed jobs in DB — skipping audit flow");
    return;
  }

  const job = jobs.find((j) => j.finance_status !== "audited") || jobs[0];
  const jobId = job._id;
  console.log("✓ Using job", jobId, "status:", job.finance_status);

  const detail = await request("GET", `/api/finance/jobs/${jobId}`, { token });
  const repairs = detail.repairs || [];
  const repairCosts = repairs.map((r) => ({
    id: r._id,
    cost: r.cost ?? 10,
  }));
  const extraCosts = [{ label: "Smoke test extra", amount: 5 }];
  const notes = "QA finance smoke test";

  let vendorId = null;
  const vendors = await request("GET", "/api/finance/vendors", { token });
  vendorId = vendors.vendors?.[0]?._id || null;
  if (!vendorId) {
    const createdVendor = await request("POST", "/api/finance/vendors", {
      token,
      body: { name: `QA Vendor ${Date.now()}` },
    });
    vendorId = createdVendor.vendor?._id;
  }
  if (!vendorId) throw new Error("Could not resolve a vendor for purchase smoke test");

  const purchases = [
    {
      description: "QA brake pads",
      vendor_id: vendorId,
      quantity: 2,
      unit_cost: 12.5,
      receipt_ref: "QA-INV-1",
    },
  ];

  const purchaseList = await request("GET", "/api/finance/purchases?limit=5", { token });
  console.log("✓ Purchases list:", purchaseList.total ?? purchaseList.purchases?.length ?? 0);

  if (job.finance_status !== "audited") {
    const saved = await request("PATCH", `/api/finance/jobs/${jobId}/finance`, {
      token,
      body: { repairCosts, extraCosts, purchases, notes },
    });
    console.log(
      "✓ Saved finance preview netProfit:",
      saved.finance?.netProfit
    );

    const audited = await request("POST", `/api/finance/jobs/${jobId}/audit`, {
      token,
      body: { repairCosts, extraCosts, purchases, notes },
    });
    console.log(
      "✓ Audited snapshots:",
      audited.job?.finance_net_profit,
      audited.job?.finance_status
    );
  } else {
    console.log("✓ Job already audited — list/detail OK");
  }

  const listAfter = await request(
    "GET",
    "/api/finance/jobs?finance_status=audited&limit=5",
    { token }
  );
  const found = (listAfter.jobs || []).some(
    (j) => String(j._id) === String(jobId) && j.finance_status === "audited"
  );
  if (job.finance_status !== "audited" && !found) {
    throw new Error("Audited job not found in filtered list");
  }
  console.log("✓ Finance portal smoke test passed");
}

main().catch((e) => {
  console.error("✗", e.message);
  if (e.data) console.error(e.data);
  process.exit(1);
});
