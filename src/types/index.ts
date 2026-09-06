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

// Server tracked game state used to validate leaderboard submissions.
export type TrackedGameStatus = "active" | "finished" | "expired";

export interface TrackedGame {
  gameId: string;
  stateFen: string;
  moves: string[];
  status: TrackedGameStatus;
  result: GameResult | null;
  version: number;
  clientKey: string;
  lastRequestFen: string | null;
  lastResponseMove: string | null;
  lastResponseFen: string | null;
  submittedNickname: string | null;
  expiresAt: Date;
}

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
export type LeaderboardPeriod = "week" | "month" | "all";

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
