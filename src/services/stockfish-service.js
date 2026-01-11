/**
 * Stockfish Chess Engine Service
 * Handles communication with Stockfish for chess move generation
 */

const stockfish = require("stockfish");
const config = require("../config");
const logger = require("../config/logger");
const { getRandomMove } = require("../utils/chess-helpers");

// FEN validation regex
const FEN_REGEX = /^([rnbqkpRNBQKP1-8]+\/){7}([rnbqkpRNBQKP1-8]+)\s[bw]\s(-|K?Q?k?q?)\s(-|[a-h][36])\s(0|[1-9][0-9]*)\s([1-9][0-9]*)/;

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
 * Ask Stockfish engine for the best move
 * @param {string} fen - Current board position
 * @param {object} engine - Stockfish engine instance
 * @returns {Promise<string>} - Stockfish output containing best move
 */
function askStockfish(fen, engine) {
  return new Promise((resolve, reject) => {
    if (!fen.match(FEN_REGEX)) {
      reject(new Error("Invalid fen string"));
      return;
    }

    let messageBuffer = [];
    let resolved = false;

    const messageHandler = function (msg) {
      if (typeof msg === "string") {
        messageBuffer.push(msg);

        if (msg.includes("bestmove")) {
          resolved = true;
          engine.onmessage = null;
          messageBuffer.length = 0; // Clear buffer to prevent memory leak
          resolve(msg);
        }
      }
    };

    engine.onmessage = messageHandler;

    engine.postMessage("ucinewgame");
    engine.postMessage("position fen " + fen);
    engine.postMessage(`go depth ${config.STOCKFISH_DEPTH}`);
    // Note: Timeout handled by Promise.race in getStockfishMove()
  });
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

/**
 * Cleanup helper for Stockfish engine
 * @param {object} engine - Stockfish engine instance
 */
function cleanupEngine(engine) {
  try {
    engine.postMessage("quit");
  } catch (e) {
    // Ignore quit errors
  }
  try {
    if (typeof engine.terminate === "function") {
      engine.terminate();
    }
  } catch (e) {
    // Ignore terminate errors
  }
}

/**
 * Get the best move from Stockfish
 * @param {string} fen - Current board position in FEN notation
 * @param {function} ChessConstructor - Chess class constructor for fallback
 * @returns {Promise<string>} - Best move in SAN notation
 */
async function getStockfishMove(fen, ChessConstructor) {
  const engine = stockfish();

  // Initialize timeout promise separately to avoid race condition
  let timeoutId = null;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error("Stockfish timeout")),
      config.STOCKFISH_TIMEOUT_MS
    );
  });

  try {
    const result = await Promise.race([askStockfish(fen, engine), timeoutPromise]);

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
  } finally {
    // Always cleanup - this prevents memory leaks
    clearTimeout(timeoutId);
    cleanupEngine(engine);
  }
}

module.exports = {
  getStockfishMove,
  convertUCItoSAN,
  FEN_REGEX,
};
