const path = require("path");
const dns = require("dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);
require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-admin-api/.env"),
});
const mongoose = require("../clicks-shared/node_modules/mongoose");
const Technician = require("../clicks-shared/models/Technician");

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const r = await Technician.updateMany(
    { email: { $in: ["omar.tech@clicks.local", "sara.tech@clicks.local"] } },
    { $set: { currentStatus: "Offline" } }
  );
  console.log("Demo techs set offline:", r.modifiedCount);
  const all = await Technician.find({}).select(
    "firstName lastName email currentStatus"
  );
  all.forEach((t) =>
    console.log(t.firstName, t.lastName, t.currentStatus, t.email)
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
