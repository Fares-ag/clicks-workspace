/**
 * Seed demo data so admin / tech / customer platforms aren't empty locally.
 * Safe to re-run: upserts by unique keys; skips duplicates.
 *
 * Usage: node scripts/seed-demo-data.js
 */
const path = require("path");
require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-admin-api/.env"),
});
const mongoose = require("../clicks-shared/node_modules/mongoose");
const bcrypt = require("../clicks-admin-api/node_modules/bcryptjs");

const {
  Admin,
  Technician,
  Customer,
  CustomerVehicle,
  Source,
  Job,
  VehicleMake,
  VehicleModel,
  VehicleType,
  FAQ,
  PrivacyPolicy,
  TermsAndConditions,
  TechnicianEarnings,
  Business,
  BusinessUser,
} = require("../clicks-shared/models");

async function upsert(Model, query, data) {
  const existing = await Model.findOne(query);
  if (existing) {
    Object.assign(existing, data);
    await existing.save();
    return existing;
  }
  return Model.create({ ...query, ...data });
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI missing");
  await mongoose.connect(uri);
  console.log("Connected");

  // Admin
  await upsert(
    Admin,
    { email: "admin@clicks.local" },
    {
      firstName: "Local",
      lastName: "Admin",
      role: "Super Admin",
      phone: "+97400000000",
      password: bcrypt.hashSync("Admin123!", 10),
      isActive: true,
    }
  );
  console.log("✓ admin@clicks.local / Admin123!");

  // Techs with Doha coords (Live Map)
  // Prefer email key; also clean duplicates that share demo phones
  await Technician.deleteMany({
    phone: { $in: ["+97411111111", "97411111111", "+97422222222", "97422222222"] },
    email: { $nin: ["omar.tech@clicks.local", "sara.tech@clicks.local"] },
  });

  const omar = await upsert(
    Technician,
    { email: "omar.tech@clicks.local" },
    {
      firstName: "Omar",
      lastName: "Al-Thani",
      phone: "+97411111111",
      password: bcrypt.hashSync("Tech123!", 10),
      expertise: ["Tires", "Engines", "Gearbox"],
      applicationStatus: "Approved",
      isActive: true,
      currentStatus: "Online",
      currentLocation: { type: "Point", coordinates: [51.531, 25.286] },
    }
  );
  const sara = await upsert(
    Technician,
    { email: "sara.tech@clicks.local" },
    {
      firstName: "Sara",
      lastName: "Hassan",
      phone: "+97422222222",
      password: bcrypt.hashSync("Tech123!", 10),
      expertise: ["Tires", "Engines", "Gearbox"],
      applicationStatus: "Approved",
      isActive: true,
      currentStatus: "On Job",
      currentLocation: { type: "Point", coordinates: [51.505, 25.27] },
    }
  );
  console.log("✓ techs Omar/Sara Tech123!");

  await upsert(
    TechnicianEarnings,
    { technician_id: omar._id },
    { total_earned: 450, cash_balance: 120, performance: { total_completed_jobs: 3 } }
  );
  await upsert(
    TechnicianEarnings,
    { technician_id: sara._id },
    { total_earned: 780, cash_balance: 200, performance: { total_completed_jobs: 5 } }
  );

  // Sources (required for jobs)
  const sourceDirect = await upsert(
    Source,
    { mainSourceName: "Direct" },
    {
      isActive: true,
      subSources: [{ name: "App SOS" }, { name: "Call Center" }],
    }
  );
  await upsert(
    Source,
    { mainSourceName: "Insurance" },
    {
      isActive: true,
      subSources: [{ name: "Partner A" }],
    }
  );
  const sourceBusiness = await upsert(
    Source,
    { mainSourceName: "Business Portal" },
    {
      isActive: true,
      subSources: [{ name: "Mobile App" }],
    }
  );
  console.log("✓ sources");

  // Business portal demo account
  const demoBusiness = await upsert(
    Business,
    { name: "Al-Mana Showroom" },
    {
      phone: "+97444440000",
      email: "business@clicks.local",
      address: "Salwa Road, Doha",
      cutType: "revenue",
      cutPercent: 10,
      defaultSource: sourceBusiness._id,
      isActive: true,
    }
  );
  await upsert(
    BusinessUser,
    { email: "business@clicks.local" },
    {
      business_id: demoBusiness._id,
      name: "Showroom Staff",
      phone: "+97444440001",
      password: bcrypt.hashSync("Business123!", 10),
      role: "owner",
      isActive: true,
    }
  );
  console.log("✓ business@clicks.local / Business123! (Al-Mana Showroom)");

  // Ensure at least one business-tagged job exists for admin tag demo
  const bizJob = await Job.findOne({ business_id: demoBusiness._id });
  if (!bizJob) {
    await Job.create({
      clientName: "Showroom Walk-in",
      clientMobileNumber: "+97466666666",
      issue: "Battery jump at dealership lot",
      location: "Al-Mana Showroom, Salwa Road",
      dateTime: new Date(),
      jobType: "Engines",
      price: 120,
      source: sourceBusiness._id,
      job_status: "pending",
      payment_status: "unpaid",
      business_id: demoBusiness._id,
      businessName: demoBusiness.name,
      businessCutType: demoBusiness.cutType,
      businessCutPercent: demoBusiness.cutPercent,
    });
    console.log("✓ sample business portal job");
  }

  // Vehicle catalog
  const typeSedan = await upsert(
    VehicleType,
    { typeName: "Sedan" },
    { isActive: true }
  );
  const makeToyota = await upsert(
    VehicleMake,
    { makeName: "Toyota" },
    { isActive: true }
  );
  const makeNissan = await upsert(
    VehicleMake,
    { makeName: "Nissan" },
    { isActive: true }
  );
  const modelCamry = await upsert(
    VehicleModel,
    { modelName: "Camry" },
    { makeId: makeToyota._id, isActive: true }
  );
  await upsert(
    VehicleModel,
    { modelName: "Altima" },
    { makeId: makeNissan._id, isActive: true }
  );
  console.log("✓ vehicle catalog");

  // Customer
  const customer = await upsert(
    Customer,
    { email: "customer@clicks.local" },
    {
      phone_number: "+97433333333",
      first_name: "Ahmed",
      last_name: "Khalil",
      password: bcrypt.hashSync("Customer123!", 10),
      status: "Active",
    }
  );
  console.log("✓ customer@clicks.local / Customer123! phone +97433333333");

  let custVehicle = await CustomerVehicle.findOne({ customer_id: customer._id });
  if (!custVehicle) {
    custVehicle = await CustomerVehicle.create({
      customer_id: customer._id,
      vehicle_make: makeToyota._id,
      vehicle_model: modelCamry._id,
      vehicle_type: typeSedan._id,
      year: 2021,
      vehicle_color: "White",
      plate_number: "123456",
    });
  }
  console.log("✓ customer vehicle");

  // Jobs — only seed if none exist
  const jobCount = await Job.countDocuments();
  if (jobCount === 0) {
    const now = new Date();
    await Job.create([
      {
        clientName: "Ahmed Khalil",
        clientMobileNumber: "+97433333333",
        customer_id: customer._id,
        customer_vehicle_id: custVehicle._id,
        issue: "Flat tire on Corniche",
        location: "Corniche, Doha",
        dateTime: now,
        jobType: "Tires",
        assignedTechnician: omar._id,
        price: 150,
        source: sourceDirect._id,
        job_status: "assigned",
        payment_status: "unpaid",
        assigned_at: now,
      },
      {
        clientName: "Fatima Ali",
        clientMobileNumber: "+97444444444",
        issue: "Engine won't start",
        location: "West Bay, Doha",
        dateTime: new Date(now.getTime() - 3600000),
        jobType: "Engines",
        assignedTechnician: sara._id,
        price: 250,
        source: sourceDirect._id,
        job_status: "in_progress",
        payment_status: "unpaid",
        assigned_at: new Date(now.getTime() - 3500000),
        accepted_at: new Date(now.getTime() - 3400000),
        started_at: new Date(now.getTime() - 3000000),
      },
      {
        clientName: "Walk-in Guest",
        clientMobileNumber: "+97455555555",
        issue: "Battery jump needed",
        location: "The Pearl, Doha",
        dateTime: new Date(now.getTime() + 7200000),
        jobType: "Engines",
        price: 100,
        source: sourceDirect._id,
        job_status: "pending",
        payment_status: "unpaid",
      },
      {
        clientName: "Ahmed Khalil",
        clientMobileNumber: "+97433333333",
        customer_id: customer._id,
        issue: "Gearbox noise (completed demo)",
        location: "Lusail",
        dateTime: new Date(now.getTime() - 86400000),
        jobType: "Gearbox",
        assignedTechnician: sara._id,
        price: 400,
        source: sourceDirect._id,
        job_status: "completed",
        payment_status: "paid",
        completed_at: new Date(now.getTime() - 80000000),
        paid_at: new Date(now.getTime() - 79000000),
        payment_method: "cash",
        rating: 5,
        rating_description: "Quick service",
      },
    ]);
    console.log("✓ 4 demo jobs");
  } else {
    console.log(`✓ jobs already present (${jobCount})`);
  }

  // CMS content
  if ((await FAQ.countDocuments()) === 0) {
    await FAQ.create([
      {
        question: "How do I request roadside help?",
        answer: "Open the Clicks app and tap SOS, or call our dispatch line.",
        isActive: true,
        order: 1,
      },
      {
        question: "What areas do you cover?",
        answer: "We currently operate across Doha and surrounding Qatar areas.",
        isActive: true,
        order: 2,
      },
    ]);
    console.log("✓ FAQs");
  }

  if ((await PrivacyPolicy.countDocuments()) === 0) {
    await PrivacyPolicy.create({
      content: "Clicks demo privacy policy for local staging.",
      isActive: true,
      version: "1.0",
      effectiveDate: new Date(),
    });
  }
  if ((await TermsAndConditions.countDocuments()) === 0) {
    await TermsAndConditions.create({
      content: "Clicks demo terms for local staging.",
      isActive: true,
      version: "1.0",
      effectiveDate: new Date(),
    });
  }
  console.log("✓ privacy / terms");

  console.log("\nDone. Refresh admin UI. Live Map should show Omar + Sara.");
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
