// Usage: node scripts/resetPassword.js <technician|customer> <id> <newPassword>
const mongoose = require("mongoose");
const path = require('path');
const bcrypt = require('bcryptjs');

const type = process.argv[2];
const id = process.argv[3];
const newPassword = process.argv[4];

if (!type || !id || !newPassword) {
  console.error('Usage: node scripts/resetPassword.js <technician|customer> <id> <newPassword>');
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
  } else if (type === 'customer') {
    Model = require(path.resolve(__dirname, '../../clicks-shared/models/Customer.js'));
  } else {
    console.error('Unknown type:', type);
    process.exit(2);
  }

  const hashed = await bcrypt.hash(newPassword, 10);
  const updated = await Model.findByIdAndUpdate(id, { password: hashed }, { new: true }).lean();
  if (!updated) {
    console.error('No user found with id:', id);
    process.exit(1);
  }
  console.log('Password updated for', type, 'id', id);
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
