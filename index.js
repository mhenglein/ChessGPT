/**
 * ChessGPT Server Entry Point
 *
 * This is the main entry point that starts the Express server.
 * All application logic is modularized in the src/ directory.
 */

const chalk = require("chalk");
const app = require("./src/app");
const config = require("./src/config");
const logger = require("./src/config/logger");

// Configure host and port
app.set("host", config.HOST);
app.set("port", config.PORT);

// Graceful shutdown handler
process.on("SIGTERM", async () => {
  logger.info("Received SIGTERM, shutting down gracefully");
  await new Promise((resolve) => setTimeout(resolve, 100));
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("Received SIGINT, shutting down gracefully");
  await new Promise((resolve) => setTimeout(resolve, 100));
  process.exit(0);
});

// Start Express server
const server = app.listen(app.get("port"), () => {
  console.log(
    "%s App is running at http://localhost:%d in %s mode",
    chalk.green("✓"),
    app.get("port"),
    app.get("env")
  );
  console.log("Press CTRL-C to stop\n");
});

module.exports = server;
