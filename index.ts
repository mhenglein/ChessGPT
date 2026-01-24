/**
 * ChessGPT Server Entry Point
 *
 * This is the main entry point that starts the Express server.
 * All application logic is modularized in the src/ directory.
 */

import "./instrument";

import chalk from "chalk";
import app from "./src/app";
import config from "./src/config";
import logger from "./src/config/logger";
import * as leaderboard from "./src/services/leaderboard-service";

// Configure host and port
app.set("host", config.HOST);
app.set("port", config.PORT);

// Initialize leaderboard database schema
leaderboard.initSchema().then((success) => {
  if (success) {
    logger.info("Leaderboard database ready");
  }
});

// Graceful shutdown handler
async function handleShutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down gracefully`);
  await leaderboard.close();
  await new Promise((resolve) => setTimeout(resolve, 100));
  process.exit(0);
}

process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("SIGINT", () => handleShutdown("SIGINT"));

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

export default server;
