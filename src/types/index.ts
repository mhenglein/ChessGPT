/**
 * Core type definitions for ChessGPT
 */

import type { Chess } from "chess.js";
export type { Chess };

// Chess.js constructor type
export type ChessConstructor = new (fen?: string) => Chess;

// Bot types
export type BotType = "chessgpt" | "stockfish" | "random";

// Game result types
export type GameResult = "win" | "loss" | "draw";

// Game state types
export type GameStateResult =
  | "Checkmate"
  | "Stalemate"
  | "Draw"
  | "Threefold repetition"
  | "Insufficient material"
  | "Game over";

export interface GameState {
  isOver: boolean;
  result: GameStateResult;
}

// Leaderboard types
export interface LeaderboardEntry {
  nickname: string;
  wins: number;
  losses: number;
  draws: number;
  total_games: number;
}

// Rate limiting types
export interface RateLimitRecord {
  totalHits: number;
  resetTime: number;
}

export interface RateLimitIncrementResult {
  totalHits: number;
  resetTime: Date;
}
