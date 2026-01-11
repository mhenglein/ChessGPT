const cluster = require("cluster");
const winston = require("winston");

// Configure winston logger for cluster
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
      return `${timestamp} [${level}] ${message} ${metaStr}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/cluster.log' })
  ]
});

let shuttingDown = false;
let restartCount = {};
const MAX_RESTART_COUNT = 10;
const RESTART_WINDOW = 60000; // 1 minute

function startWorker() {
  if (shuttingDown) {
    logger.info("Shutdown in progress, not starting new worker");
    return;
  }
  
  const worker = cluster.fork();
  scheduleGc();
  logger.info(`CLUSTER: Worker ${worker.id} started`);
  
  // Track restart counts
  worker.on('exit', () => {
    const now = Date.now();
    if (!restartCount[worker.id]) {
      restartCount[worker.id] = [];
    }
    
    // Clean old restart entries
    restartCount[worker.id] = restartCount[worker.id].filter(time => now - time < RESTART_WINDOW);
    restartCount[worker.id].push(now);
    
    if (restartCount[worker.id].length > MAX_RESTART_COUNT) {
      logger.error(`Worker ${worker.id} restarted too many times, not restarting`);
      delete restartCount[worker.id];
      if (Object.keys(cluster.workers).length === 0) {
        logger.error("All workers dead, exiting master");
        process.exit(1);
      }
    }
  });
}

if (cluster.isMaster) {
  // Count the machine's CPUs
  const cpuCount = process.env.WEB_CONCURRENCY || 1;
  // See: https://devcenter.heroku.com/articles/node-memory-use

  // Create a worker for each CPU
  for (let i = 0; i < cpuCount; i += 1) {
    startWorker();
  }

  // Handle graceful shutdown
  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
  
  function gracefulShutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    
    logger.info('Master received shutdown signal, gracefully shutting down workers...');
    
    // Stop accepting new connections
    for (const id in cluster.workers) {
      cluster.workers[id].disconnect();
    }
    
    // Give workers time to finish
    setTimeout(() => {
      for (const id in cluster.workers) {
        cluster.workers[id].kill();
      }
      process.exit(0);
    }, 5000);
  }
  
  // log any workers that disconnect; if a worker disconnects, it
  // should then exit, so we'll wait for the exit event to spawn
  // a new worker to replace it
  cluster.on("disconnect", function (worker) {
    logger.info(`CLUSTER: Worker ${worker.id} disconnected from the cluster.`);
  });

  // when a worker dies (exits), create a worker to replace it
  cluster.on("exit", function (worker, code, signal) {
    logger.warn(`CLUSTER: Worker ${worker.id} died with exit code ${code} (${signal})`);
    
    if (!shuttingDown && restartCount[worker.id] && restartCount[worker.id].length <= MAX_RESTART_COUNT) {
      setTimeout(() => {
        startWorker();
      }, 1000); // Delay restart by 1 second
    }
  });
} else {
  require("./index");
}

// Sources: https://gist.github.com/learncodeacademy/954568155105f4ff3599
// Pages 132-133 of Ethan Brown's book

// Manually trigger GC whenever memory exceeds a set limit
function scheduleGc() {
  if (!global.gc) {
    logger.warn("Garbage collection is not exposed");
    return;
  }

  global.gc();

  var nextMinutes = Math.random() * 30 + 15;

  setTimeout(function () {
    global.gc();
    // console.log("Manual gc", process.memoryUsage());
    scheduleGc();
  }, nextMinutes * 60 * 1000);
}
// Based on: https://serverfault.com/questions/714534/heroku-error-r14-memory-quota-exceeded-using-node-js
