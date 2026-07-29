/**
 * Quick local MVP auth smoke (no secrets printed).
 * Usage: node scripts/smoke-local-mvp.js
 */
const base = process.env.TECH_URL || "http://localhost:5001";

async function post(path, body) {
  const r = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ok: !!j.token, keys: Object.keys(j) };
}

(async () => {
  const customer = await post("/api/customers/login", {
    phone_number: "+97433333333",
    password: "Customer123!",
  });
  console.log("customer phone login", customer.status, "token=", customer.ok);

  const techPhone = await post("/api/technicians/login", {
    phone: "+97411111111",
    password: "Tech123!",
  });
  console.log("tech phone login", techPhone.status, "token=", techPhone.ok);

  const techEmail = await post("/api/technicians/login", {
    email: "omar.tech@clicks.local",
    password: "Tech123!",
  });
  console.log("tech email login", techEmail.status, "token=", techEmail.ok);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
