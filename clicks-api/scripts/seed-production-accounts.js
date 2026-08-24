/**
 * Upsert production login accounts (admin + techs + customer).
 * Does NOT create sample jobs or wipe data.
 *
 * Usage (from clicks-api):
 *   SEED_ADMIN_PASSWORD=... SEED_TECH_PASSWORD=... SEED_CUSTOMER_PASSWORD=... \
 *     node scripts/seed-production-accounts.js --confirm
 *
 * Uses MONGODB_URI from clicks-admin-api/.env (or env override).
 * There are no default passwords — every SEED_*_PASSWORD must be supplied.
 * A non-localhost MONGODB_URI additionally requires SEED_ALLOW_PRODUCTION=true.
 * Existing accounts keep their stored password and active flag: a re-run
 * refreshes profile fields only and can never restore a rotated credential.
 */
const path = require("path");
const dns = require("dns");
// Windows resolvers sometimes refuse SRV lookups for mongodb+srv
dns.setServers(["8.8.8.8", "1.1.1.1"]);
require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-admin-api/.env"),
});
const mongoose = require("mongoose");
const bcrypt = require("../clicks-admin-api/node_modules/bcryptjs");
const {
  Admin,
  Technician,
  Customer,
  TechnicianEarnings,
} = require("../clicks-shared/models");

function requiredSecret(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required (this script ships no default passwords)`);
  }
  return value;
}

// Fields named in createOnly are written when the document is created and are
// never overwritten on a re-run (passwords, activation flags, money balances).
async function upsert(Model, query, data, createOnly = []) {
  const existing = await Model.findOne(query);
  if (existing) {
    const updates = { ...data };
    for (const field of createOnly) delete updates[field];
    Object.assign(existing, updates);
    await existing.save();
    return { doc: existing, created: false };
  }
  const doc = await Model.create({ ...query, ...data });
  return { doc, created: true };
}

async function main() {
  if (!process.argv.includes("--confirm")) {
    throw new Error(
      "Refusing to run without --confirm (this writes login accounts to MONGODB_URI)"
    );
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI missing (set in clicks-admin-api/.env)");

  // Never print the full URI — only a safe fingerprint
  const dbMatch = uri.match(/mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)/);
  const dbName = dbMatch ? dbMatch[1] : "(default)";

  // Anything that is not an explicit localhost target is treated as production.
  const hostMatch = uri.match(/^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)/i);
  const hosts = hostMatch ? hostMatch[1].split(",") : [];
  const isLocal =
    hosts.length > 0 &&
    hosts.every((h) => /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(h.trim()));
  if (!isLocal && process.env.SEED_ALLOW_PRODUCTION !== "true") {
    throw new Error(
      `Refusing to seed non-local database (db=${dbName}); set SEED_ALLOW_PRODUCTION=true to override`
    );
  }

  // Hash before connecting so a missing secret fails without touching the DB.
  const adminHash = bcrypt.hashSync(requiredSecret("SEED_ADMIN_PASSWORD"), 10);
  const techHash = bcrypt.hashSync(requiredSecret("SEED_TECH_PASSWORD"), 10);
  const customerHash = bcrypt.hashSync(requiredSecret("SEED_CUSTOMER_PASSWORD"), 10);

  console.log(`Connecting… db=${dbName}`);

  await mongoose.connect(uri);

  const admin = await upsert(
    Admin,
    { email: "admin@clicks.local" },
    {
      firstName: "Clicks",
      lastName: "Admin",
      role: "Super Admin",
      phone: "+97400000000",
      password: adminHash,
      isActive: true,
    },
    ["password", "isActive"]
  );
  console.log(
    `${admin.created ? "Created" : "Updated (password + isActive kept)"} admin: admin@clicks.local`
  );

  const omar = await upsert(
    Technician,
    { email: "omar.tech@clicks.local" },
    {
      firstName: "Omar",
      lastName: "Al-Thani",
      phone: "+97411111111",
      password: techHash,
      expertise: ["Tires", "Engines", "Gearbox"],
      applicationStatus: "Approved",
      isActive: true,
      currentStatus: "Online",
      currentLocation: { type: "Point", coordinates: [51.531, 25.286] },
    },
    ["password", "isActive"]
  );
  console.log(
    `${omar.created ? "Created" : "Updated (password + isActive kept)"} tech Omar: 11111111`
  );

  const sara = await upsert(
    Technician,
    { email: "sara.tech@clicks.local" },
    {
      firstName: "Sara",
      lastName: "Hassan",
      phone: "+97422222222",
      password: techHash,
      expertise: ["Tires", "Engines", "Gearbox"],
      applicationStatus: "Approved",
      isActive: true,
      currentStatus: "Online",
      currentLocation: { type: "Point", coordinates: [51.505, 25.27] },
    },
    ["password", "isActive"]
  );
  console.log(
    `${sara.created ? "Created" : "Updated (password + isActive kept)"} tech Sara: 22222222`
  );

  // Balances/performance are create-only: re-seeding must not zero real earnings.
  const earningsCreateOnly = ["total_earned", "cash_balance", "performance"];
  await upsert(
    TechnicianEarnings,
    { technician_id: omar.doc._id },
    {
      total_earned: 0,
      cash_balance: 0,
      performance: { total_completed_jobs: 0, total_rejected_jobs: 0 },
    },
    earningsCreateOnly
  );
  await upsert(
    TechnicianEarnings,
    { technician_id: sara.doc._id },
    {
      total_earned: 0,
      cash_balance: 0,
      performance: { total_completed_jobs: 0, total_rejected_jobs: 0 },
    },
    earningsCreateOnly
  );

  const customer = await upsert(
    Customer,
    { email: "customer@clicks.local" },
    {
      first_name: "Demo",
      last_name: "Customer",
      phone_number: "+97433333333",
      password: customerHash,
      is_active: true,
    },
    ["password", "is_active"]
  );
  console.log(
    `${customer.created ? "Created" : "Updated (password + is_active kept)"} customer: 33333333`
  );

  await mongoose.disconnect();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
