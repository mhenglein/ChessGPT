/**
 * Centralized configuration for ChessGPT
 * All magic numbers and environment-dependent values should be defined here
 */

export interface Config {
  // Server configuration
  PORT: number | string;
  HOST: string;
  NODE_ENV: string;

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;
  RATE_LIMIT_MAX_KEYS: number;
  RATE_LIMIT_CLEANUP_INTERVAL_MS: number;

  // Input validation
  MAX_FEN_LENGTH: number;
  MAX_AN_LENGTH: number;

  // Stockfish engine
  STOCKFISH_TIMEOUT_MS: number;
  STOCKFISH_DEPTH: number;

  // OpenAI configuration
  OPENAI_MODEL: string;
  OPENAI_TEMPERATURE: number;
  OPENAI_MAX_TOKENS: number;
  OPENAI_NUM_COMPLETIONS: number;
  OPENAI_RETRY_DELAY_MS: number;
  MAX_OPENAI_RETRIES: number;

  // Game configuration
  EVOLUTION_MOVE_THRESHOLD: number;
  GAME_SESSION_TTL_MS: number;
  GAME_SESSION_MAX_STARTS: number;
  GAME_SESSION_START_WINDOW_MS: number;
  GAME_SESSION_MAX_SCORES: number;
  GAME_SESSION_SCORE_WINDOW_MS: number;
  GAME_SESSION_CLEANUP_BATCH: number;
  MAX_TRACKED_GAME_MOVES: number;

  // Logging
  LOG_LEVEL: string;

  // Process management
  WEB_CONCURRENCY: number;
  MEMORY_LIMIT_MB: number;
  GC_INTERVAL_MINUTES: number;
  MAX_RESTART_COUNT: number;
  RESTART_WINDOW_MS: number;
}

const config: Config = {
  // Server configuration
  PORT: process.env.PORT || process.env.OPENSHIFT_NODEJS_PORT || 3500,
  HOST: process.env.OPENSHIFT_NODEJS_IP || "0.0.0.0",
  NODE_ENV: process.env.NODE_ENV || "development",

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: 60 * 1000, // 1 minute
  RATE_LIMIT_MAX_REQUESTS: 30,
  RATE_LIMIT_MAX_KEYS: 10000, // Max unique IPs to track (prevents memory leak)
  RATE_LIMIT_CLEANUP_INTERVAL_MS: 60 * 1000, // Cleanup expired entries every minute

  // Input validation
  MAX_FEN_LENGTH: 100,
  MAX_AN_LENGTH: 2000,

  // Stockfish engine
  STOCKFISH_TIMEOUT_MS: 5000,
  STOCKFISH_DEPTH: 15,

  // OpenAI configuration
  OPENAI_MODEL: "gpt-4o",
  OPENAI_TEMPERATURE: 1,
  OPENAI_MAX_TOKENS: 4,
  OPENAI_NUM_COMPLETIONS: 5,
  OPENAI_RETRY_DELAY_MS: 2500,
  MAX_OPENAI_RETRIES: 3,

  // Game configuration
  EVOLUTION_MOVE_THRESHOLD: 6, // Moves before switching to Stockfish
  // Server-owned leaderboard sessions. These caps are enforced in PostgreSQL
  // so they apply consistently across workers and restarts.
  GAME_SESSION_TTL_MS: 24 * 60 * 60 * 1000,
  GAME_SESSION_MAX_STARTS: 30,
  GAME_SESSION_START_WINDOW_MS: 60 * 60 * 1000,
  GAME_SESSION_MAX_SCORES: 30,
  GAME_SESSION_SCORE_WINDOW_MS: 60 * 60 * 1000,
  GAME_SESSION_CLEANUP_BATCH: 200,
  MAX_TRACKED_GAME_MOVES: 512,

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || "info",

  // Process management
  WEB_CONCURRENCY: parseInt(process.env.WEB_CONCURRENCY || "1", 10) || 1,
  MEMORY_LIMIT_MB: 460,
  GC_INTERVAL_MINUTES: 100,
  MAX_RESTART_COUNT: 10,
  RESTART_WINDOW_MS: 60000,
};

export default config;
