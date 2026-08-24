const path = require("path");
const { MongoMemoryReplSet } = require("mongodb-memory-server");

/** Same resolution order clicks-shared/models/*.js uses when requiring mongoose. */
function resolveMongoose() {
  const searchPaths = [
    path.join(__dirname, "../../clicks-shared/node_modules"),
    path.join(__dirname, "..", "node_modules"),
    path.join(__dirname, "../../clicks-admin-api/node_modules"),
    path.join(__dirname, "../../clicks-customer-tech-api/node_modules"),
  ];
  return require(require.resolve("mongoose", { paths: searchPaths }));
}

const mongoose = resolveMongoose();

let replSet;

const MONGOMS_VERSION = process.env.MONGOMS_VERSION || "7.0.14";

async function connectTestDb() {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    binary: { version: MONGOMS_VERSION },
  });
  await replSet.waitUntilRunning();
  const uri = replSet.getUri();
  process.env.MONGODB_URI = uri;

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  await mongoose.connect(uri);

  const TechnicianEarningEntry = require("../../clicks-shared/models/TechnicianEarningEntry");
  await TechnicianEarningEntry.syncIndexes();
}

async function disconnectTestDb() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (replSet) {
    await replSet.stop();
    replSet = null;
  }
}

async function clearCollections() {
  const { collections } = mongoose.connection;
  await Promise.all(
    Object.values(collections).map((col) => col.deleteMany({}))
  );
}

module.exports = {
  mongoose,
  connectTestDb,
  disconnectTestDb,
  clearCollections,
};
