/**
 * ChessGPT Cluster Manager
 *
 * Handles multi-process clustering for improved performance.
 * For production, prefer using PM2 (ecosystem.config.js) which handles
 * restart logic, monitoring, and logging automatically.
 *
 * This file is used by: npm start
 * PM2 alternative: pm2 start ecosystem.config.js
 */

const cluster = require("cluster");
const config = require("./src/config");
const logger = require("./src/config/logger");

// Clustering configuration
const WORKER_COUNT = config.WEB_CONCURRENCY;
const MAX_RESTART_COUNT = config.MAX_RESTART_COUNT;
const RESTART_WINDOW_MS = config.RESTART_WINDOW_MS;
const GC_INTERVAL_MINUTES = config.GC_INTERVAL_MINUTES;

let shuttingDown = false;
let restartCounts = new Map();

/**
 * Start a new worker process
 */
function startWorker() {
  if (shuttingDown) {
    logger.info("Shutdown in progress, not starting new worker");
    return null;
  }

  const worker = cluster.fork();
  logger.info(`Worker ${worker.id} started`);

  // Schedule GC if exposed
  scheduleGC();

  return worker;
}

/**
 * Check if a worker can be restarted (rate limiting)
 */
function canRestartWorker(workerId) {
  const now = Date.now();

  if (!restartCounts.has(workerId)) {
    restartCounts.set(workerId, []);
  }

  const timestamps = restartCounts.get(workerId);

  // Remove old entries outside the window
  const recent = timestamps.filter((t) => now - t < RESTART_WINDOW_MS);

  // Clean up empty entries to prevent memory leak
  if (recent.length === 0) {
    restartCounts.delete(workerId);
  } else {
    restartCounts.set(workerId, recent);
  }

  if (recent.length >= MAX_RESTART_COUNT) {
    logger.error(`Worker ${workerId} exceeded restart limit (${MAX_RESTART_COUNT} in ${RESTART_WINDOW_MS}ms)`);
    return false;
  }

  // Re-add entry with new timestamp if we deleted it above
  if (!restartCounts.has(workerId)) {
    restartCounts.set(workerId, [now]);
  } else {
    recent.push(now);
  }
  return true;
}

/**
 * Graceful shutdown of all workers
 */
function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info(`Received ${signal}, shutting down gracefully...`);

  // Disconnect all workers
  for (const id in cluster.workers) {
    cluster.workers[id].disconnect();
  }

  // Force kill after timeout
  setTimeout(() => {
    for (const id in cluster.workers) {
      cluster.workers[id].kill();
    }
    process.exit(0);
  }, 5000);
}

/**
 * Schedule garbage collection (for --expose-gc flag)
 */
function scheduleGC() {
  if (!global.gc) return;

  // Random interval between 15-45 minutes
  const intervalMinutes = Math.random() * 30 + 15;

  setTimeout(() => {
    if (global.gc) {
      global.gc();
      scheduleGC();
    }
  }, intervalMinutes * 60 * 1000);
}

// Master process
if (cluster.isMaster) {
  logger.info(`Master process started (PID: ${process.pid})`);
  logger.info(`Starting ${WORKER_COUNT} worker(s)...`);

  // Fork workers
  for (let i = 0; i < WORKER_COUNT; i++) {
    startWorker();
  }

  // Graceful shutdown handlers
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));

  // Worker disconnect event
  cluster.on("disconnect", (worker) => {
    logger.info(`Worker ${worker.id} disconnected`);
  });

  // Worker exit event - restart if appropriate
  cluster.on("exit", (worker, code, signal) => {
    logger.warn(`Worker ${worker.id} died (code: ${code}, signal: ${signal})`);

    if (!shuttingDown && canRestartWorker(worker.id)) {
      setTimeout(() => startWorker(), 1000);
    } else if (!shuttingDown && Object.keys(cluster.workers).length === 0) {
      logger.error("All workers dead, master exiting");
      process.exit(1);
    }
  });
} else {
  // Worker process - start the server
  require("./index");
}
