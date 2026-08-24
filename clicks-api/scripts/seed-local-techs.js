/** Seed sample technicians for Live Map testing. Uses admin-api .env. */
const path = require("path");
require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-admin-api/.env"),
});
const mongoose = require("mongoose");
const bcrypt = require("../clicks-admin-api/node_modules/bcryptjs");
const Technician = require("../clicks-shared/models/Technician");

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const techs = [
    {
      firstName: "Omar",
      lastName: "Al-Thani",
      email: "omar.tech@clicks.local",
      phone: "+97411111111",
      password: bcrypt.hashSync("Tech123!", 10),
      expertise: ["Tires"],
      applicationStatus: "Approved",
      isActive: true,
      currentStatus: "Online",
      currentLocation: { type: "Point", coordinates: [51.531, 25.286] },
    },
    {
      firstName: "Sara",
      lastName: "Hassan",
      email: "sara.tech@clicks.local",
      phone: "+97422222222",
      password: bcrypt.hashSync("Tech123!", 10),
      expertise: ["Engines"],
      applicationStatus: "Approved",
      isActive: true,
      currentStatus: "On Job",
      currentLocation: { type: "Point", coordinates: [51.505, 25.27] },
    },
  ];
  for (const t of techs) {
    const existing = await Technician.findOne({ email: t.email });
    if (existing) {
      console.log("exists", t.email);
      continue;
    }
    await Technician.create(t);
    console.log("created", t.email);
  }
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
