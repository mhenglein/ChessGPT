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

// Rate limiter for AI endpoint
const aiRateLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_REQUESTS,
  message: { error: "Too many requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
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
