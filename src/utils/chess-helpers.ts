/**
 * Chess utility functions
 * Shared helpers for chess game logic
 */

import config from "../config";
import type { Chess, ChessConstructor, GameState, GameResult } from "../types";

export interface LegalWhiteMove {
  san: string;
  fen: string;
}

/**
 * Replays a server-owned SAN history from the standard starting position.
 * Returning null keeps malformed or tampered session data out of gameplay.
 */
export function replayHistory(
  moves: string[],
  ChessConstructor: ChessConstructor
): Chess | null {
  if (!Array.isArray(moves) || moves.length > config.MAX_TRACKED_GAME_MOVES) {
    return null;
  }

  try {
    const chess = new ChessConstructor();
    for (const san of moves) {
      if (typeof san !== "string" || !chess.move(san)) return null;
    }
    return chess;
  } catch {
    return null;
  }
}

/**
 * Finds the one legal white move that produced candidateFen from baseFen.
 * The comparison uses chess.js's canonical FEN, including move counters and
 * en-passant state, so callers cannot submit a merely similar board position.
 */
export function findLegalWhiteMove(
  baseFen: string,
  candidateFen: string,
  ChessConstructor: ChessConstructor
): LegalWhiteMove | null {
  if (!baseFen || !candidateFen) return null;

  try {
    const base = new ChessConstructor(baseFen);
    const candidate = new ChessConstructor(candidateFen);
    if (base.turn() !== "w" || candidate.turn() !== "b") return null;

    for (const san of base.moves()) {
      const next = new ChessConstructor(baseFen);
      const move = next.move(san);
      if (move && next.fen() === candidateFen) {
        return { san: move.san, fen: next.fen() };
      }
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Converts a terminal chess position into the leaderboard result for White.
 * A checkmate with Black to move means White won; all other terminal states
 * are either a Black win or a draw.
 */
export function getLeaderboardResult(chess: Chess): GameResult | null {
  if (!chess.isGameOver()) return null;
  if (chess.isCheckmate()) return chess.turn() === "b" ? "win" : "loss";
  return "draw";
}

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
