const cluster = require("cluster");

function startWorker() {
  const worker = cluster.fork();
  scheduleGc();
  console.log("CLUSTER: Worker %d started", worker.id);
}

if (cluster.isMaster) {
  // Count the machine's CPUs
  const cpuCount = process.env.WEB_CONCURRENCY || 1;
  // See: https://devcenter.heroku.com/articles/node-memory-use

  // Create a worker for each CPU
  for (let i = 0; i < cpuCount; i += 1) {
    startWorker();
  }

  // log any workers that disconnect; if a worker disconnects, it
  // should then exit, so we'll wait for the exit event to spawn
  // a new worker to replace it
  cluster.on("disconnect", function (worker) {
    console.log("CLUSTER: Worker %d disconnected from the cluster.", worker.id);
  });

  // when a worker dies (exits), create a worker to replace it
  cluster.on("exit", function (worker, code, signal) {
    console.log("CLUSTER: Worker %d died with exit code %d (%s)", worker.id, code, signal);
    startWorker();
  });
} else {
  require("./index");
}

// Sources: https://gist.github.com/learncodeacademy/954568155105f4ff3599
// Pages 132-133 of Ethan Brown's book

// Manually trigger GC whenever memory exceeds a set limit
function scheduleGc() {
  if (!global.gc) {
    console.log("Garbage collection is not exposed");
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
