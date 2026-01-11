/**
 * Centralized configuration for ChessGPT
 * All magic numbers and environment-dependent values should be defined here
 */

module.exports = {
  // Server configuration
  PORT: process.env.PORT || process.env.OPENSHIFT_NODEJS_PORT || 3500,
  HOST: process.env.OPENSHIFT_NODEJS_IP || "0.0.0.0",
  NODE_ENV: process.env.NODE_ENV || "development",

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: 60 * 1000, // 1 minute
  RATE_LIMIT_MAX_REQUESTS: 30,

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

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || "info",

  // Process management
  WEB_CONCURRENCY: parseInt(process.env.WEB_CONCURRENCY, 10) || 1,
  MEMORY_LIMIT_MB: 460,
  GC_INTERVAL_MINUTES: 100,
  MAX_RESTART_COUNT: 10,
  RESTART_WINDOW_MS: 60000,
};
