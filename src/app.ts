/**
 * Express Application Setup
 * Clean, modular Express configuration
 */

import "dotenv/config";
import "express-async-errors";

import * as Sentry from "@sentry/node";
import express, { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import config from "./config";
import logger from "./config/logger";
import {
  getGameState,
  getRandomMove,
  sanitizeAN,
} from "./utils/chess-helpers";
import { getStockfishMove } from "./services/stockfish-service";
import * as leaderboard from "./services/leaderboard-service";
import type { RateLimitRecord, RateLimitIncrementResult, BotType, GameResult } from "./types";

// Dynamic import for chess.js (ES module)
const chessImport = import("chess.js");

const app = express();

// Trust the first proxy (Render's reverse proxy) so express-rate-limit
// correctly identifies clients via X-Forwarded-For
app.set("trust proxy", 1);

// Basic middleware
app.use(express.json());
app.use(express.static("public"));

/**
 * Bounded rate limiter store to prevent memory leaks.
 * Uses FIFO eviction when max keys are reached.
 */
class BoundedStore {
  private windowMs: number;
  private maxKeys: number;
  private hits: Map<string, RateLimitRecord>;
  private keyOrder: string[]; // Track insertion order for FIFO eviction
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor(windowMs: number, maxKeys: number) {
    this.windowMs = windowMs;
    this.maxKeys = maxKeys;
    this.hits = new Map();
    this.keyOrder = [];

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
  private cleanup(): void {
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
  private evictOldest(): void {
    while (this.keyOrder.length >= this.maxKeys) {
      const oldestKey = this.keyOrder.shift();
      if (oldestKey) {
        this.hits.delete(oldestKey);
      }
    }
  }

  // express-rate-limit store interface
  async increment(key: string): Promise<RateLimitIncrementResult> {
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

  async decrement(key: string): Promise<void> {
    const record = this.hits.get(key);
    if (record) {
      record.totalHits = Math.max(0, record.totalHits - 1);
    }
  }

  async resetKey(key: string): Promise<void> {
    this.hits.delete(key);
    const idx = this.keyOrder.indexOf(key);
    if (idx > -1) this.keyOrder.splice(idx, 1);
  }

  async resetAll(): Promise<void> {
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
  store: new BoundedStore(
    config.RATE_LIMIT_WINDOW_MS,
    config.RATE_LIMIT_MAX_KEYS
  ),
});

// Health check endpoint
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "healthy",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Main AI move endpoint
app.get("/ai-move", aiRateLimiter, async (req: Request, res: Response) => {
  const { Chess } = await chessImport;
  const fen = req.query.fen as string | undefined;
  const rawAN = (req.query.an as string) || "";

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
    logger.error("Invalid FEN provided", { fen, error: (err as Error).message });
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
    logger.error("Error checking game state", { error: (err as Error).message });
  }

  // Choose bot
  const bot = (req.query.bot as BotType) || "stockfish";

  // Calculate the AI's move
  let aiMove = "";
  if (bot === "chessgpt") {
    // Add a small delay to simulate "thinking" for random opening moves
    const thinkingDelay = 500 + Math.random() * 1000;
    await new Promise((resolve) => setTimeout(resolve, thinkingDelay));
    aiMove = getRandomMove(chess.moves());
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
  const move = chess.move(aiMove);
  if (move === null) {
    logger.error("Invalid move from AI", { bot, aiMove, fen });
    return res.status(500).json({ error: "Invalid move generated" });
  }

  logger.info("AI move successful", { bot, move: move.san, fen });
  res.send(move.san);
});

// Rate limiter for leaderboard submissions (stricter to prevent spam)
const leaderboardRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 submissions per minute
  message: { error: "Too many submissions, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
  store: new BoundedStore(60 * 1000, 1000),
});

// Get leaderboard - public endpoint
app.get("/api/leaderboard", async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string, 10) || 10, 50);
  const data = await leaderboard.getLeaderboard(limit);
  res.json(data);
});

// Submit game result - rate limited
app.post(
  "/api/leaderboard",
  leaderboardRateLimiter,
  async (req: Request, res: Response) => {
    const { nickname, result } = req.body as {
      nickname?: string;
      result?: string;
    };

    // Validate nickname
    if (!nickname || typeof nickname !== "string") {
      return res.status(400).json({ error: "Nickname is required" });
    }

    const cleanNickname = nickname.trim();
    if (cleanNickname.length === 0 || cleanNickname.length > 20) {
      return res.status(400).json({ error: "Nickname must be 1-20 characters" });
    }

    // Validate result
    const validResults: GameResult[] = ["win", "loss", "draw"];
    if (!validResults.includes(result as GameResult)) {
      return res.status(400).json({ error: "Result must be win, loss, or draw" });
    }

    const success = await leaderboard.submitResult(
      cleanNickname,
      result as GameResult
    );
    if (success) {
      res.json({ success: true });
    } else {
      res.status(500).json({ error: "Failed to submit result" });
    }
  }
);

// Sentry debug route for verification (remove after testing)
app.get("/debug-sentry", function mainHandler(_req: Request, _res: Response) {
  throw new Error("My first Sentry error!");
});

// Sentry error handler (must be before other error handlers)
Sentry.setupExpressErrorHandler(app);

// Error Handler
app.use(function (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  logger.error("Unhandled error", { error: err.stack });
  if (!res.headersSent) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default app;
