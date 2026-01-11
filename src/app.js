/**
 * Express Application Setup
 * Clean, modular Express configuration
 */

require("dotenv").config();
require("express-async-errors");

const express = require("express");
const rateLimit = require("express-rate-limit");
const config = require("./config");
const logger = require("./config/logger");
const { getGameState, getRandomMove, sanitizeAN } = require("./utils/chess-helpers");
const { getNextMove } = require("./services/openai-service");
const { getStockfishMove } = require("./services/stockfish-service");

// Dynamic import for chess.js (ES module)
const chessImport = import("chess.js");

const app = express();

// Basic middleware
app.use(express.json());
app.use(express.static("public"));

/**
 * Bounded rate limiter store to prevent memory leaks.
 * Uses FIFO eviction when max keys are reached.
 */
class BoundedStore {
  constructor(windowMs, maxKeys) {
    this.windowMs = windowMs;
    this.maxKeys = maxKeys;
    this.hits = new Map();
    this.keyOrder = []; // Track insertion order for FIFO eviction

    // Periodic cleanup of expired entries
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, config.RATE_LIMIT_CLEANUP_INTERVAL_MS);

    // Allow cleanup interval to be garbage collected on process exit
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  // Remove expired entries
  cleanup() {
    const now = Date.now();
    for (const [key, value] of this.hits) {
      if (now > value.resetTime) {
        this.hits.delete(key);
        const idx = this.keyOrder.indexOf(key);
        if (idx > -1) this.keyOrder.splice(idx, 1);
      }
    }
  }

  // Evict oldest entries when at capacity
  evictOldest() {
    while (this.keyOrder.length >= this.maxKeys) {
      const oldestKey = this.keyOrder.shift();
      if (oldestKey) {
        this.hits.delete(oldestKey);
      }
    }
  }

  // express-rate-limit store interface
  async increment(key) {
    const now = Date.now();
    let record = this.hits.get(key);

    if (!record || now > record.resetTime) {
      // Evict if at capacity and this is a new key
      if (!record && this.keyOrder.length >= this.maxKeys) {
        this.evictOldest();
      }

      record = {
        totalHits: 0,
        resetTime: now + this.windowMs,
      };

      // Track key order for FIFO eviction
      if (!this.hits.has(key)) {
        this.keyOrder.push(key);
      }
    }

    record.totalHits++;
    this.hits.set(key, record);

    return {
      totalHits: record.totalHits,
      resetTime: new Date(record.resetTime),
    };
  }

  async decrement(key) {
    const record = this.hits.get(key);
    if (record) {
      record.totalHits = Math.max(0, record.totalHits - 1);
    }
  }

  async resetKey(key) {
    this.hits.delete(key);
    const idx = this.keyOrder.indexOf(key);
    if (idx > -1) this.keyOrder.splice(idx, 1);
  }

  async resetAll() {
    this.hits.clear();
    this.keyOrder = [];
  }
}

// Rate limiter for AI endpoint with bounded store
const aiRateLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_REQUESTS,
  message: { error: "Too many requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
  store: new BoundedStore(config.RATE_LIMIT_WINDOW_MS, config.RATE_LIMIT_MAX_KEYS),
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Main AI move endpoint
app.get("/ai-move", aiRateLimiter, async (req, res) => {
  const { Chess } = await chessImport;
  const fen = req.query.fen;
  const rawAN = req.query.an || "";

  // Validate FEN is provided
  if (!fen) {
    return res.status(400).json({ error: "FEN is required" });
  }

  // Input validation to prevent DoS
  if (fen.length > config.MAX_FEN_LENGTH) {
    return res.status(400).json({ error: "FEN too long" });
  }

  // Sanitize AN to prevent prompt injection
  const an = rawAN ? sanitizeAN(rawAN, config.MAX_AN_LENGTH) : "No AN available";

  // Create chess instance
  let chess;
  try {
    chess = new Chess(fen);
  } catch (err) {
    logger.error("Invalid FEN provided", { fen, error: err.message });
    return res.status(400).json({ error: "Invalid FEN string" });
  }

  // Validate it's black's turn (AI plays black)
  if (chess.turn() !== "b") {
    logger.warn("AI move requested but it's not black's turn", {
      fen,
      turn: chess.turn(),
    });
    return res.status(400).json({ error: "Not black's turn" });
  }

  // Check if the game is over
  try {
    const gameState = getGameState(chess);
    if (gameState) {
      return res.status(200).json({ msg: gameState.result });
    }
  } catch (err) {
    logger.error("Error checking game state", { error: err.message });
  }

  // Choose bot
  const bot = req.query.bot || "stockfish";

  // Calculate the AI's move
  let aiMove = "";
  if (bot === "chessgpt") {
    aiMove = await getNextMove(fen, an, chess);
  } else if (bot === "stockfish") {
    aiMove = await getStockfishMove(fen, Chess);
  } else {
    // Random move
    aiMove = getRandomMove(chess.moves());
  }

  // Fallback if no move generated
  if (!aiMove) {
    logger.error("AI failed to generate a move", { bot, fen });
    aiMove = getRandomMove(chess.moves());
  }

  // Validate and apply move
  let move = chess.move(aiMove);
  if (move === null) {
    logger.error("Invalid move from AI", { bot, aiMove, fen });
    return res.status(500).json({ error: "Invalid move generated" });
  }

  logger.info("AI move successful", { bot, move: move.san, fen });
  res.send(move.san);
});

// Error Handler
app.use(function (err, req, res, next) {
  logger.error("Unhandled error", { error: err.stack });
  if (!res.headersSent) {
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = app;
