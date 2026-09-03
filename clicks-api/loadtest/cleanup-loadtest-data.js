const path = require("path");

require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-admin-api/.env"),
});

const mongoose = require("mongoose");
const { Job } = require("../clicks-shared/models");

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const result = await Job.deleteMany({ loadtest: true });
  console.log(`Deleted ${result.deletedCount} loadtest jobs`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
