// Usage: node scripts/verifyCredentials.js <technician|customer> <phone_or_phone_number> <password>
const mongoose = require("clicks-shared/node_modules/mongoose");
const path = require('path');
const bcrypt = require('bcryptjs');

const type = process.argv[2];
const identifier = process.argv[3];
const password = process.argv[4];

if (!type || !identifier || !password) {
  console.error('Usage: node scripts/verifyCredentials.js <technician|customer> <phone_or_phone_number> <password>');
  process.exit(2);
}

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error("Set MONGODB_URI in clicks-customer-tech-api/.env");
  process.exit(1);
}

async function run() {
  await mongoose.connect(MONGO_URI);
  let Model;
  if (type === 'technician') {
    Model = require(path.resolve(__dirname, '../../clicks-shared/models/Technician.js'));
    // technicians use `phone`
    const user = await Model.findOne({ phone: identifier }).lean();
    if (!user) {
      console.error('No technician found with phone:', identifier);
      process.exit(1);
    }
    console.log('Found technician:', { id: user._id, phone: user.phone, email: user.email, applicationStatus: user.applicationStatus, currentStatus: user.currentStatus });
    const ok = await bcrypt.compare(password, user.password);
    console.log('Password match:', ok);
  } else if (type === 'customer') {
    Model = require(path.resolve(__dirname, '../../clicks-shared/models/Customer.js'));
    // customers use `phone_number`
    const user = await Model.findOne({ phone_number: identifier }).lean();
    if (!user) {
      console.error('No customer found with phone_number:', identifier);
      process.exit(1);
    }
    console.log('Found customer:', { id: user._id, phone_number: user.phone_number, email: user.email, status: user.status });
    const ok = await bcrypt.compare(password, user.password);
    console.log('Password match:', ok);
  } else {
    console.error('Unknown type:', type);
    process.exit(2);
  }
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
