/** Quick connectivity check using admin-api .env (gitignored). */
const path = require("path");
require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-admin-api/.env"),
});
const mongoose = require("mongoose");

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI missing");
  process.exit(1);
}

mongoose
  .connect(uri, { serverSelectionTimeoutMS: 20000 })
  .then(async () => {
    console.log("connected db=", mongoose.connection.name);
    const ping = await mongoose.connection.db.admin().command({ ping: 1 });
    console.log("ping ok", !!ping.ok);
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch((err) => {
    console.error("FAIL", err.message);
    process.exit(1);
  });
