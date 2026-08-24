/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  testTimeout: 60000,
  setupFiles: ["<rootDir>/tests/setupEnv.js"],
  setupFilesAfterEnv: ["<rootDir>/tests/setupMocks.js"],
  testMatch: ["<rootDir>/tests/integration/**/*.integration.test.js"],
  verbose: true,
};
