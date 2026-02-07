/**
 * OpenAI Chess Move Service
 * Handles communication with OpenAI API for chess move generation
 */

import OpenAI from "openai";
import { backOff } from "exponential-backoff";
import config from "../config";
import logger from "../config/logger";
import { getRandomMove } from "../utils/chess-helpers";
import type { Chess } from "../types";

// Validate API key at module load
if (!process.env.OPENAI_API_KEY) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const chalk = require("chalk");
  console.error(
    chalk.red("ERROR: OPENAI_API_KEY environment variable is required")
  );
  console.error(
    chalk.yellow("Create a .env file with: OPENAI_API_KEY=your_api_key_here")
  );
  process.exit(1);
}

// OpenAI v4 client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  organization: process.env.OPENAI_ORG_ID,
});

/**
 * Get the next chess move from OpenAI
 */
export async function getNextMove(
  fen: string,
  an: string,
  chess: Chess
): Promise<string> {
  const moves = chess.moves();

  // Iterative retry loop (prevents stack accumulation from recursion)
  for (let attempt = 0; attempt <= config.MAX_OPENAI_RETRIES; attempt++) {
    try {
      const userMessage: OpenAI.Chat.ChatCompletionMessageParam = {
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

      let possibleMoves: string[] = [];
      response.choices.forEach((choice) => {
        let possibleMove = choice.message.content || "";
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

      // No valid move found, continue to next attempt
      if (attempt < config.MAX_OPENAI_RETRIES) {
        logger.warn("No valid move from OpenAI, retrying", {
          attempt: attempt + 1,
        });
      }
    } catch (error) {
      const err = error as Error & { status?: number };
      logger.error("OpenAI API error", {
        error: err.message,
        status: err.status,
        fen,
        attempt,
      });

      // On error, wait then try again or fall through to random move
      if (attempt < config.MAX_OPENAI_RETRIES) {
        await new Promise((resolve) =>
          setTimeout(resolve, config.OPENAI_RETRY_DELAY_MS)
        );
      }
    }
  }

  // All retries exhausted, return random move
  return getRandomMove(moves);
}
