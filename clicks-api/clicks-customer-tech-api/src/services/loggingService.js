const fs = require("fs");
const path = require("path");

const LOG_DIR = path.join(__dirname, "../../logs");
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const logFile = path.join(LOG_DIR, "app.log");

const logInfo = (message) => {
  const entry = `[INFO] ${new Date().toISOString()} - ${message}\n`;
  fs.appendFileSync(logFile, entry);
  console.log(entry.trim());
};

const logError = (error) => {
  const entry = `[ERROR] ${new Date().toISOString()} - ${error}\n`;
  fs.appendFileSync(logFile, entry);
  console.error(entry.trim());
};

const trackPerformance = (metric, value) => {
  const entry = `[PERF] ${new Date().toISOString()} - ${metric}: ${value}\n`;
  fs.appendFileSync(logFile, entry);
  console.log(entry.trim());
};

module.exports = {
  logInfo,
  logError,
  trackPerformance
};
