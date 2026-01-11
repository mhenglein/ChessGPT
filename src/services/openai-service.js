/**
 * OpenAI Chess Move Service
 * Handles communication with OpenAI API for chess move generation
 */

const OpenAI = require("openai");
const { backOff } = require("exponential-backoff");
const config = require("../config");
const logger = require("../config/logger");
const { getRandomMove } = require("../utils/chess-helpers");

// Validate API key at module load
if (!process.env.OPENAI_API_KEY) {
  const chalk = require("chalk");
  console.error(chalk.red("ERROR: OPENAI_API_KEY environment variable is required"));
  console.error(chalk.yellow("Create a .env file with: OPENAI_API_KEY=your_api_key_here"));
  process.exit(1);
}

// OpenAI v4 client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Get the next chess move from OpenAI
 * @param {string} fen - Current board position in FEN notation
 * @param {string} an - Algebraic notation history of moves
 * @param {Chess} chess - chess.js instance for the current position
 * @param {number} retryCount - Current retry attempt (internal)
 * @returns {Promise<string>} - Best move in SAN notation
 */
async function getNextMove(fen, an, chess, retryCount = 0) {
  const moves = chess.moves();

  try {
    const userMessage = {
      role: "user",
      content: `You are ChessGPT, a superintelligent chess computer. What is the optimal move based on the FEN and AN below? Answer in SAN (e.g. e4, Nf3, etc.). Don't provide any explanation.
      FEN: ${fen}.
      AN: ${an}.
      Are you (black) currently checked? ${chess.isCheck() ? "Yes" : "No"}
    The chess board represented as ASCII looks like this:
    ${chess.ascii()}

    The following are a list of your available moves: ${moves.join(", ")}`,
    };

    // OpenAI v4 API (using config values)
    const response = await backOff(() =>
      openai.chat.completions.create({
        model: config.OPENAI_MODEL,
        messages: [userMessage],
        temperature: config.OPENAI_TEMPERATURE,
        max_tokens: config.OPENAI_MAX_TOKENS,
        n: config.OPENAI_NUM_COMPLETIONS,
      })
    );

    if (!response.choices) {
      logger.warn("No choices from OpenAI, using random move");
      return getRandomMove(moves);
    }

    let possibleMoves = [];
    response.choices.forEach((choice) => {
      let possibleMove = choice.message.content;
      possibleMove = possibleMove.replace(" ", "").trim();
      possibleMove = possibleMove.replace(/(\r\n|\n|\r)/gm, "");
      possibleMove = possibleMove.replace("...", "");
      possibleMoves.push(possibleMove);
    });

    // Remove duplicates
    possibleMoves = [...new Set(possibleMoves)];

    // Remove all single-letter moves
    possibleMoves = possibleMoves.filter((move) => move.length > 1);

    // Find first valid move
    for (const possibleMove of possibleMoves) {
      if (moves.includes(possibleMove)) {
        return possibleMove;
      }
    }

    // Retry if no valid move found
    if (retryCount > config.MAX_OPENAI_RETRIES) {
      return getRandomMove(moves);
    }
    return getNextMove(fen, an, chess, retryCount + 1);
  } catch (error) {
    logger.error("OpenAI API error", {
      error: error.message,
      status: error.status,
      fen,
    });

    // Return random move after delay (with proper error handling)
    return new Promise((resolve) =>
      setTimeout(resolve, config.OPENAI_RETRY_DELAY_MS)
    )
      .then(() => getRandomMove(moves))
      .catch(() => getRandomMove(moves));
  }
}

module.exports = {
  getNextMove,
};
