/**
 * Upsert production login accounts (admin + techs + customer).
 * Does NOT create sample jobs or wipe data.
 *
 * Usage (from clicks-api):
 *   node scripts/seed-production-accounts.js
 *
 * Uses MONGODB_URI from clicks-admin-api/.env (or env override).
 * Confirm that URI is the PRODUCTION Atlas DB before running.
 */
const path = require("path");
const dns = require("dns");
// Windows resolvers sometimes refuse SRV lookups for mongodb+srv
dns.setServers(["8.8.8.8", "1.1.1.1"]);
require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-admin-api/.env"),
});
const mongoose = require("../clicks-shared/node_modules/mongoose");
const bcrypt = require("../clicks-admin-api/node_modules/bcryptjs");
const {
  Admin,
  Technician,
  Customer,
  TechnicianEarnings,
} = require("../clicks-shared/models");

async function upsert(Model, query, data) {
  const existing = await Model.findOne(query);
  if (existing) {
    Object.assign(existing, data);
    await existing.save();
    return { doc: existing, created: false };
  }
  const doc = await Model.create({ ...query, ...data });
  return { doc, created: true };
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI missing (set in clicks-admin-api/.env)");

  // Never print the full URI — only a safe fingerprint
  const dbMatch = uri.match(/mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)/);
  const dbName = dbMatch ? dbMatch[1] : "(default)";
  console.log(`Connecting… db=${dbName}`);

  await mongoose.connect(uri);

  const adminHash = bcrypt.hashSync("Admin123!", 10);
  const techHash = bcrypt.hashSync("Tech123!", 10);
  const customerHash = bcrypt.hashSync("Customer123!", 10);

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
    }
  );
  console.log(
    `${admin.created ? "Created" : "Updated"} admin: admin@clicks.local / Admin123!`
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
    }
  );
  console.log(
    `${omar.created ? "Created" : "Updated"} tech Omar: 11111111 / Tech123!`
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
    }
  );
  console.log(
    `${sara.created ? "Created" : "Updated"} tech Sara: 22222222 / Tech123!`
  );

  await upsert(
    TechnicianEarnings,
    { technician_id: omar.doc._id },
    {
      total_earned: 0,
      cash_balance: 0,
      performance: { total_completed_jobs: 0, total_rejected_jobs: 0 },
    }
  );
  await upsert(
    TechnicianEarnings,
    { technician_id: sara.doc._id },
    {
      total_earned: 0,
      cash_balance: 0,
      performance: { total_completed_jobs: 0, total_rejected_jobs: 0 },
    }
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
    }
  );
  console.log(
    `${customer.created ? "Created" : "Updated"} customer: 33333333 / Customer123!`
  );

  await mongoose.disconnect();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
