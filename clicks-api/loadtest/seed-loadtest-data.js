/**
 * Bulk-insert synthetic jobs for staging load tests. Marks docs loadtest:true.
 */
const path = require("path");

require("../clicks-admin-api/node_modules/dotenv").config({
  path: path.join(__dirname, "../clicks-admin-api/.env"),
});

const mongoose = require("mongoose");
const { Job, Source } = require("../clicks-shared/models");

const TOTAL = Number(process.env.JOBS || 100000);
const BATCH = 5000;

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI required");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);

  let source = await Source.findOne({ mainSourceName: "Loadtest Source" });
  if (!source) {
    source = await Source.create({ mainSourceName: "Loadtest Source", isActive: true });
  }

  const statuses = ["completed", "completed", "completed", "completed", "pending", "cancelled", "in_progress"];
  let inserted = 0;

  while (inserted < TOTAL) {
    const size = Math.min(BATCH, TOTAL - inserted);
    const batch = [];
    const now = Date.now();
    for (let i = 0; i < size; i++) {
      const idx = inserted + i;
      const created = new Date(now - (idx % 730) * 86400000);
      const status = statuses[idx % statuses.length];
      batch.push({
        clientName: `Load Client ${idx}`,
        clientMobileNumber: `+9745${String(1000000 + (idx % 999999)).slice(-7)}`,
        issue: "Load test job",
        location: `${25.28 + (idx % 100) / 10000},${51.53 + (idx % 100) / 10000}`,
        dateTime: created,
        jobType: "Flat tire",
        price: 100 + (idx % 500),
        source: source._id,
        job_status: status,
        payment_status: status === "completed" ? "paid" : "unpaid",
        completed_at: status === "completed" ? created : null,
        finance_status: status === "completed" ? "audited" : "pending",
        loadtest: true,
        createdAt: created,
        updatedAt: created,
      });
    }
    await Job.insertMany(batch, { ordered: false });
    inserted += size;
    console.log(`Inserted ${inserted}/${TOTAL}`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
