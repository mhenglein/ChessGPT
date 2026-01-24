/**
 * Chess utility functions
 * Shared helpers for chess game logic
 */

import type { Chess, GameState } from "../types";

/**
 * Get the game result/state from a chess instance
 */
export function getGameState(chess: Chess): GameState | null {
  if (!chess.isGameOver()) {
    return null;
  }

  if (chess.isCheckmate()) {
    return { isOver: true, result: "Checkmate" };
  }
  if (chess.isStalemate()) {
    return { isOver: true, result: "Stalemate" };
  }
  if (chess.isDraw()) {
    return { isOver: true, result: "Draw" };
  }
  if (chess.isThreefoldRepetition()) {
    return { isOver: true, result: "Threefold repetition" };
  }
  if (chess.isInsufficientMaterial()) {
    return { isOver: true, result: "Insufficient material" };
  }

  return { isOver: true, result: "Game over" };
}

/**
 * Get a random move from available moves
 */
export function getRandomMove(moves: string[]): string {
  return moves[Math.floor(Math.random() * moves.length)];
}

/**
 * Sanitize algebraic notation to prevent prompt injection
 */
export function sanitizeAN(an: string, maxLength: number = 2000): string {
  if (!an || typeof an !== "string") return "";
  // Allow only safe chess notation characters: letters, numbers, spaces, common notation symbols
  return an.replace(/[^\w\s,.\-+#=()x]/gi, "").substring(0, maxLength);
}
