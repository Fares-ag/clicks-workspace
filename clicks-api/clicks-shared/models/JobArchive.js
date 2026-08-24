const mongoose = require("mongoose");
const Job = require("./Job");

module.exports = mongoose.model("JobArchive", Job.schema, "jobarchives");
