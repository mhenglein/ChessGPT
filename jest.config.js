/**
 * Jest Configuration
 */

module.exports = {
  testEnvironment: "node",
  preset: "ts-jest",
  testMatch: ["**/tests/**/*.test.ts", "**/*.spec.ts", "**/tests/**/*.test.js", "**/*.spec.js"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.spec.ts",
    "!src/**/*.test.ts",
    "!src/types/**/*",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html"],
  verbose: true,
  testTimeout: 10000,
  // Transform TypeScript files
  transform: {
    "^.+\\.tsx?$": "ts-jest",
  },
  // Transform ES modules if needed
  transformIgnorePatterns: [
    "node_modules/(?!(chess\\.js)/)",
  ],
};
