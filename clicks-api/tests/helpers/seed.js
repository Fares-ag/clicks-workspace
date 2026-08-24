const bcrypt = require("../../clicks-admin-api/node_modules/bcryptjs");
const {
  Customer,
  Job,
  Source,
  Technician,
  FinanceUser,
  OTPVerification,
  Admin,
} = require("../../clicks-shared/models");

const JOB_LAT = 25.2854;
const JOB_LNG = 51.531;

async function seedSource(name = "Test Source") {
  return Source.create({
    mainSourceName: `${name}-${Date.now()}`,
    isActive: true,
    subSources: [],
  });
}

async function seedTechnician(overrides = {}) {
  const suffix = Date.now();
  return Technician.create({
    firstName: "Test",
    lastName: "Technician",
    email: `tech-${suffix}@test.local`,
    phone: `+974555${String(suffix).slice(-6)}`,
    password: await bcrypt.hash("password123", 10),
    applicationStatus: "Approved",
    isActive: true,
    currentStatus: "Online",
    ...overrides,
  });
}

async function seedCustomer(overrides = {}) {
  const suffix = Date.now();
  return Customer.create({
    phone_number: `+974500${String(suffix).slice(-6)}`,
    first_name: "Test",
    last_name: "Customer",
    email: `customer-${suffix}@test.local`,
    password: await bcrypt.hash("password123", 10),
    status: "Active",
    ...overrides,
  });
}

async function seedCustomerJob({
  customer,
  technician,
  source,
  price = 150,
  lat = JOB_LAT,
  lng = JOB_LNG,
  jobStatus = "en_route",
} = {}) {
  const cust = customer || (await seedCustomer());
  const tech = technician || (await seedTechnician());
  const src = source || (await seedSource());

  return Job.create({
    customer_id: cust._id,
    clientName: "Test Client",
    clientMobileNumber: cust.phone_number,
    issue: "Flat tire",
    location: `${lat},${lng}`,
    locationCoordinates: {
      type: "Point",
      coordinates: [lng, lat],
    },
    dateTime: new Date(),
    jobType: "Flat tire",
    assignedTechnician: tech._id,
    price,
    source: src._id,
    job_status: jobStatus,
    payment_status: "unpaid",
  });
}

async function seedArrivedJob({ technician, source, price = 150, lat = JOB_LAT, lng = JOB_LNG } = {}) {
  const tech = technician || (await seedTechnician());
  const src = source || (await seedSource());

  return Job.create({
    clientName: "Test Client",
    clientMobileNumber: "+97450000001",
    issue: "Flat tire",
    location: `${lat},${lng}`,
    locationCoordinates: {
      type: "Point",
      coordinates: [lng, lat],
    },
    dateTime: new Date(),
    jobType: "Flat tire",
    assignedTechnician: tech._id,
    price,
    source: src._id,
    job_status: "arrived",
    payment_status: "unpaid",
  });
}

async function seedInProgressCompletableJob({ technician, source, price = 100 } = {}) {
  const job = await seedArrivedJob({ technician, source, price });
  job.job_status = "in_progress";
  job.payment_status = "paid";
  job.customerSignatureUrl = "https://test.local/signature.png";
  job.customerSignedAt = new Date();
  job.started_at = new Date();
  await job.save();
  return job;
}

async function seedCompletedJob({ technician, source, price = 200 } = {}) {
  const job = await seedInProgressCompletableJob({ technician, source, price });
  job.job_status = "completed";
  job.completed_at = new Date();
  await job.save();
  return job;
}

let financeUserSeq = 0;
let adminSeq = 0;

async function seedFinanceUser(password = "finance-pass-123", { role = "operator" } = {}) {
  // Counter as well as the clock: two users seeded in the same millisecond
  // would otherwise collide on the unique email index.
  const suffix = `${Date.now()}${(financeUserSeq += 1)}`;
  return FinanceUser.create({
    name: "Finance Tester",
    email: `finance-${suffix}@test.local`,
    phone: `+974777${String(suffix).slice(-6)}`,
    password: bcrypt.hashSync(password, 10),
    role,
    isActive: true,
  });
}

/**
 * The /admin socket namespace verifies the JWT subject is a real active Admin,
 * so a token alone is no longer enough — tests must seed the matching document.
 * Default _id matches the adminToken() default in helpers/tokens.js.
 */
async function seedAdmin({ _id = "507f1f77bcf86cd799439011", role = "Super Admin" } = {}) {
  const suffix = `${Date.now()}${(adminSeq += 1)}`;
  return Admin.create({
    _id,
    firstName: "Admin",
    lastName: "Tester",
    role,
    email: `admin-${suffix}@test.local`,
    phone: `+974666${String(suffix).slice(-6)}`,
    password: bcrypt.hashSync("admin-pass-123", 10),
    isActive: true,
  });
}

async function seedOtpRecord({ phone = "+97455500001", otp = "483920", purpose = "registration" } = {}) {
  await OTPVerification.deleteMany({ phone, purpose });
  return OTPVerification.create({
    phone,
    otp,
    purpose,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    verified: false,
    attempts: 0,
  });
}

/** Coordinates ~2 km north of JOB_LAT — beyond default 200 m gate. */
function farTechCoords() {
  return { latitude: JOB_LAT + 0.018, longitude: JOB_LNG };
}

/** Coordinates at the job site — within 200 m. */
function nearTechCoords() {
  return { latitude: JOB_LAT, longitude: JOB_LNG };
}

module.exports = {
  JOB_LAT,
  JOB_LNG,
  seedSource,
  seedTechnician,
  seedCustomer,
  seedCustomerJob,
  seedArrivedJob,
  seedInProgressCompletableJob,
  seedCompletedJob,
  seedFinanceUser,
  seedAdmin,
  seedOtpRecord,
  farTechCoords,
  nearTechCoords,
};
