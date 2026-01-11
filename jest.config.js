/**
 * Jest Configuration
 */

module.exports = {
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.js", "**/*.spec.js"],
  collectCoverageFrom: [
    "src/**/*.js",
    "!src/**/*.spec.js",
    "!src/**/*.test.js",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html"],
  verbose: true,
  testTimeout: 10000,
  // Transform ES modules if needed
  transformIgnorePatterns: [
    "node_modules/(?!(chess\\.js)/)",
  ],
};
