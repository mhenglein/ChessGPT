/**
 * Stockfish Chess Engine Service
 * Handles communication with Stockfish for chess move generation
 *
 * Uses a SINGLETON engine pattern to prevent memory leaks.
 * The stockfish npm package adds process-level event listeners
 * (uncaughtException, unhandledRejection) on each engine creation.
 * Creating one engine and queuing requests eliminates this leak.
 */

const stockfish = require("stockfish");
const config = require("../config");
const logger = require("../config/logger");
const { getRandomMove } = require("../utils/chess-helpers");

// FEN validation regex
const FEN_REGEX = /^([rnbqkpRNBQKP1-8]+\/){7}([rnbqkpRNBQKP1-8]+)\s[bw]\s(-|K?Q?k?q?)\s(-|[a-h][36])\s(0|[1-9][0-9]*)\s([1-9][0-9]*)/;

// ============================================
// SINGLETON ENGINE WITH REQUEST QUEUING
// ============================================

let singletonEngine = null;
let currentRequest = null;
const requestQueue = [];

/**
 * Get or create the singleton Stockfish engine
 * @returns {object} - Stockfish engine instance
 */
function getEngine() {
  if (!singletonEngine) {
    logger.info("Creating singleton Stockfish engine");
    singletonEngine = stockfish();
  }
  return singletonEngine;
}

/**
 * Process the next request in the queue
 */
function processQueue() {
  // Already processing a request or queue is empty
  if (currentRequest || requestQueue.length === 0) return;

  currentRequest = requestQueue.shift();
  const { fen, resolve, reject, timeoutId } = currentRequest;

  const engine = getEngine();

  const messageHandler = function (msg) {
    if (typeof msg === "string" && msg.includes("bestmove")) {
      // Clear the handler before resolving
      engine.onmessage = null;
      clearTimeout(timeoutId);

      const result = msg;
      currentRequest = null;

      resolve(result);

      // Process next request in queue
      setImmediate(processQueue);
    }
  };

  engine.onmessage = messageHandler;
  engine.postMessage("ucinewgame");
  engine.postMessage("position fen " + fen);
  engine.postMessage(`go depth ${config.STOCKFISH_DEPTH}`);
}

/**
 * Queue a request to the singleton Stockfish engine
 * @param {string} fen - Current board position
 * @returns {Promise<string>} - Raw Stockfish output with bestmove
 */
function queueStockfishRequest(fen) {
  return new Promise((resolve, reject) => {
    if (!fen.match(FEN_REGEX)) {
      reject(new Error("Invalid fen string"));
      return;
    }

    const timeoutId = setTimeout(() => {
      // Remove this request from queue if still pending
      const idx = requestQueue.findIndex((r) => r.timeoutId === timeoutId);
      if (idx !== -1) {
        requestQueue.splice(idx, 1);
      }

      // If this is the current request, clear it
      if (currentRequest && currentRequest.timeoutId === timeoutId) {
        const engine = getEngine();
        engine.onmessage = null;
        engine.postMessage("stop");
        currentRequest = null;
        // Process next in queue
        setImmediate(processQueue);
      }

      reject(new Error("Stockfish timeout"));
    }, config.STOCKFISH_TIMEOUT_MS);

    requestQueue.push({ fen, resolve, reject, timeoutId });
    processQueue();
  });
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Convert UCI move format (e2e4) to SAN format (e4)
 * @param {string} fen - Current board position
 * @param {string} uciMove - Move in UCI format
 * @param {function} ChessConstructor - Chess class constructor
 * @returns {Promise<string|null>} - Move in SAN format or null
 */
async function convertUCItoSAN(fen, uciMove, ChessConstructor) {
  if (!uciMove) return null;

  const chess = new ChessConstructor(fen);

  // Parse UCI move (e.g., "e2e4" or "e7e8q" for promotion)
  const from = uciMove.substring(0, 2);
  const to = uciMove.substring(2, 4);
  const promotion = uciMove.substring(4, 5);

  try {
    const move = chess.move({
      from,
      to,
      promotion: promotion || undefined,
    });

    return move ? move.san : null;
  } catch (err) {
    logger.error("Failed to convert UCI to SAN", {
      fen,
      uciMove,
      error: err.message,
    });
    return null;
  }
}

/**
 * Extract best move from Stockfish output
 * @param {string} stockfishOutput - Raw output from Stockfish
 * @returns {string|null} - UCI move or null
 */
function extractBestMove(stockfishOutput) {
  const match = stockfishOutput.match(/bestmove\s(\w{4,5})/);
  return match ? match[1] : null;
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Get the best move from Stockfish
 * @param {string} fen - Current board position in FEN notation
 * @param {function} ChessConstructor - Chess class constructor for fallback
 * @returns {Promise<string>} - Best move in SAN notation
 */
async function getStockfishMove(fen, ChessConstructor) {
  try {
    const result = await queueStockfishRequest(fen);

    const bestMove = extractBestMove(result);
    if (!bestMove) {
      throw new Error("No best move found in Stockfish output");
    }

    // Convert UCI to SAN format
    const sanMove = await convertUCItoSAN(fen, bestMove, ChessConstructor);

    if (!sanMove) {
      throw new Error("Failed to convert UCI move to SAN");
    }

    return sanMove;
  } catch (error) {
    logger.error("Stockfish error", { error: error.message, fen });

    // Return random valid move as fallback
    const chess = new ChessConstructor(fen);
    const fallbackMove = getRandomMove(chess.moves());

    logger.info("Using fallback random move", { move: fallbackMove, fen });
    return fallbackMove;
  }
}

module.exports = {
  getStockfishMove,
  convertUCItoSAN,
  FEN_REGEX,
};
