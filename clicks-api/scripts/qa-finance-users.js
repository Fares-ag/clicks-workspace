/**
 * QA: Admin creates a finance user → that user logs into the finance portal.
 *
 * Usage:
 *   node scripts/qa-finance-users.js
 *   ADMIN_URL=http://localhost:5000 node scripts/qa-finance-users.js
 *
 * Env:
 *   ADMIN_URL, ADMIN_EMAIL, ADMIN_PASSWORD
 */
const path = require("path");
require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-admin-api/.env"),
});

const ADMIN_URL = (process.env.ADMIN_URL || "http://localhost:5000").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@clicks.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin123!";
const STAMP = Date.now();
const QA_EMAIL = `qa.finance.${STAMP}@clicks.local`;
const QA_PASSWORD = "FinanceQa123!";
const QA_PASSWORD_2 = "FinanceQa456!";

let passed = 0;
let failed = 0;

function step(name, ok, detail = "") {
  const mark = ok ? "PASS" : "FAIL";
  console.log(`${mark}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (ok) passed += 1;
  else failed += 1;
  return ok;
}

async function json(method, urlPath, { token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${ADMIN_URL}${urlPath}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 300) };
  }
  return { status: res.status, data };
}

async function main() {
  console.log(`Finance users QA → ${ADMIN_URL}\n`);

  const health = await json("GET", "/api/health");
  if (!step("Admin API health", health.status === 200, `status=${health.status}`)) {
    process.exit(1);
  }

  const adminLogin = await json("POST", "/api/auth/login", {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  const adminToken = adminLogin.data?.accessToken || adminLogin.data?.token;
  if (!step("Admin login", adminLogin.status === 200 && !!adminToken, `status=${adminLogin.status}`)) {
    console.error(adminLogin.data);
    process.exit(1);
  }

  const missing = await json("POST", "/api/finance-users", {
    token: adminToken,
    body: { name: "Incomplete" },
  });
  step(
    "Create rejects missing fields",
    missing.status === 400,
    `status=${missing.status}`
  );

  const created = await json("POST", "/api/finance-users", {
    token: adminToken,
    body: {
      name: "QA Finance Operator",
      email: QA_EMAIL,
      phone: "+97444440999",
      password: QA_PASSWORD,
      role: "operator",
    },
  });
  const userId = created.data?.user?.id || created.data?.user?._id;
  if (
    !step(
      "Admin creates finance user",
      created.status === 201 && !!userId,
      `status=${created.status} email=${created.data?.user?.email || "n/a"}`
    )
  ) {
    console.error(created.data);
    process.exit(1);
  }

  const dup = await json("POST", "/api/finance-users", {
    token: adminToken,
    body: {
      name: "Dup",
      email: QA_EMAIL,
      password: QA_PASSWORD,
    },
  });
  step("Duplicate email rejected", dup.status === 409, `status=${dup.status}`);

  const listed = await json("GET", "/api/finance-users", { token: adminToken });
  const found = (listed.data?.users || []).some(
    (u) => String(u.id || u._id) === String(userId)
  );
  step("New user appears in admin list", listed.status === 200 && found);

  const unauthCreate = await json("POST", "/api/finance-users", {
    body: {
      name: "No Auth",
      email: `noauth.${STAMP}@clicks.local`,
      password: QA_PASSWORD,
    },
  });
  step(
    "Create without admin token is blocked",
    unauthCreate.status === 401 || unauthCreate.status === 403,
    `status=${unauthCreate.status}`
  );

  const financeLogin = await json("POST", "/api/finance/auth/login", {
    body: { email: QA_EMAIL, password: QA_PASSWORD },
  });
  const financeToken = financeLogin.data?.accessToken;
  if (
    !step(
      "Finance portal login with admin-created user",
      financeLogin.status === 200 && !!financeToken,
      `status=${financeLogin.status}`
    )
  ) {
    console.error(financeLogin.data);
  } else {
    const me = await json("GET", "/api/finance/me", { token: financeToken });
    step(
      "Finance /me returns created user",
      me.status === 200 && me.data?.user?.email === QA_EMAIL,
      me.data?.user?.email || `status=${me.status}`
    );

    const dash = await json("GET", "/api/finance/dashboard", { token: financeToken });
    step(
      "Finance dashboard loads",
      dash.status === 200 && typeof dash.data?.totalCompleted === "number",
      `completed=${dash.data?.totalCompleted}`
    );

    const jobs = await json("GET", "/api/finance/jobs?limit=1", { token: financeToken });
    step("Finance jobs list loads", jobs.status === 200 && Array.isArray(jobs.data?.jobs));
  }

  const wrongPass = await json("POST", "/api/finance/auth/login", {
    body: { email: QA_EMAIL, password: "WrongPassword!" },
  });
  step("Wrong password rejected", wrongPass.status === 401, `status=${wrongPass.status}`);

  const reset = await json("POST", `/api/finance-users/${userId}/reset-password`, {
    token: adminToken,
    body: { password: QA_PASSWORD_2 },
  });
  step("Admin resets finance password", reset.status === 200, `status=${reset.status}`);

  const oldPass = await json("POST", "/api/finance/auth/login", {
    body: { email: QA_EMAIL, password: QA_PASSWORD },
  });
  step("Old password no longer works", oldPass.status === 401, `status=${oldPass.status}`);

  const newPass = await json("POST", "/api/finance/auth/login", {
    body: { email: QA_EMAIL, password: QA_PASSWORD_2 },
  });
  step(
    "Login with reset password",
    newPass.status === 200 && !!newPass.data?.accessToken,
    `status=${newPass.status}`
  );

  const deactivated = await json("PATCH", `/api/finance-users/${userId}`, {
    token: adminToken,
    body: { isActive: false },
  });
  step(
    "Admin deactivates finance user",
    deactivated.status === 200 && deactivated.data?.user?.isActive === false,
    `status=${deactivated.status}`
  );

  const inactiveLogin = await json("POST", "/api/finance/auth/login", {
    body: { email: QA_EMAIL, password: QA_PASSWORD_2 },
  });
  step(
    "Inactive user cannot log into finance",
    inactiveLogin.status === 401 || inactiveLogin.status === 403,
    `status=${inactiveLogin.status}`
  );

  await json("PATCH", `/api/finance-users/${userId}`, {
    token: adminToken,
    body: { isActive: true },
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error("✗", err.message);
  process.exit(1);
});
