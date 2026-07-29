// Usage: node scripts/createVerifiedTechnician.js
const mongoose = require("clicks-shared/node_modules/mongoose");
const bcrypt = require('bcryptjs');
const path = require('path');

// Adjust the path if needed based on your project structure
const Technician = require(path.resolve(__dirname, '../../clicks-shared/models/Technician.js'));

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("Set MONGODB_URI in clicks-customer-tech-api/.env");
  process.exit(1);
}

async function createTechnician() {
  await mongoose.connect(MONGO_URI);

  const password = process.env.SEED_TECH_PASSWORD || "ChangeMe123!";
  const hashedPassword = await bcrypt.hash(password, 10);

  const technician = new Technician({
    phone: '9876543210',
    email: 'tech2@example.com',
    firstName: 'Alice',
    lastName: 'Johnson',
    password: hashedPassword,
    profilePicture: 'https://example.com/profile.jpg',
    drivingLicenseFront: 'https://example.com/license-front.jpg',
    drivingLicenseBack: 'https://example.com/license-back.jpg',
    workPermitFront: 'https://example.com/permit-front.jpg',
    workPermitBack: 'https://example.com/permit-back.jpg',
    applicationStatus: 'Approved',
    currentStatus: 'Online',
    performance: {
      totalEarnings: 0,
      completedJobs: 0
    }
  });

  await technician.save();
  console.log('Technician created and verified:', technician);
  await mongoose.disconnect();
}

createTechnician().catch(err => {
  console.error('Error creating technician:', err);
  process.exit(1);
});
