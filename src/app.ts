/**
 * Express Application Setup
 * Clean, modular Express configuration
 */

import "dotenv/config";
import "express-async-errors";

import * as Sentry from "@sentry/node";
import { randomUUID } from "crypto";
import express, { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import config from "./config";
import logger from "./config/logger";
import {
  getRandomMove,
  findLegalWhiteMove,
  getLeaderboardResult,
  replayHistory,
} from "./utils/chess-helpers";
import { getStockfishMove } from "./services/stockfish-service";
import * as leaderboard from "./services/leaderboard-service";
import type {
  RateLimitRecord,
  RateLimitIncrementResult,
  BotType,
  GameResult,
  Chess,
  ChessConstructor,
  TrackedGame,
} from "./types";

// Dynamic import for chess.js (ES module)
const chessImport = import("chess.js");

const app = express();

// Trust the first proxy (Render's reverse proxy) so express-rate-limit
// correctly identifies clients via X-Forwarded-For
app.set("trust proxy", 1);

// Basic middleware
app.use(express.json());
const immutableMediaPath =
  /\/(?:battle-intro|metal-music)\.[a-f0-9]{12}\.m4a$/;
app.use(
  "/media",
  express.static("public/media", {
    setHeaders: (res, filePath) => {
      if (immutableMediaPath.test(filePath)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  })
);
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

async function generateAiMove(
  fen: string,
  bot: BotType,
  chess: Chess,
  ChessConstructor: ChessConstructor
): Promise<string> {
  let aiMove = "";
  if (bot === "chessgpt") {
    // Keep the existing deliberate feel for the random ChessGPT bot.
    const thinkingDelay = 500 + Math.random() * 1000;
    await new Promise((resolve) => setTimeout(resolve, thinkingDelay));
    aiMove = getRandomMove(chess.moves()) || "";
  } else if (bot === "stockfish") {
    const start = Date.now();
    aiMove = await getStockfishMove(fen, ChessConstructor);
    const minThinkMs = 1000 + Math.random() * 1000;
    const elapsed = Date.now() - start;
    if (elapsed < minThinkMs) {
      await new Promise((resolve) => setTimeout(resolve, minThinkMs - elapsed));
    }
  } else {
    aiMove = getRandomMove(chess.moves()) || "";
  }

  return aiMove || getRandomMove(chess.moves()) || "";
}

function gameResultMessage(result: GameResult): string {
  if (result === "win") return "Checkmate — White wins";
  if (result === "loss") return "Checkmate — Black wins";
  return "Game over — draw";
}

function storeFailureStatus(reason: leaderboard.GameStoreFailure): number {
  switch (reason) {
    case "invalid":
      return 400;
    case "not_found":
      return 404;
    case "expired":
      return 410;
    case "rate_limited":
      return 429;
    case "conflict":
    case "already_submitted":
    case "not_finished":
      return 409;
    case "unavailable":
    case "error":
    default:
      return 503;
  }
}

function storeFailureMessage(reason: leaderboard.GameStoreFailure): string {
  switch (reason) {
    case "invalid":
      return "Invalid game request";
    case "not_found":
      return "Game not found";
    case "expired":
      return "Game expired";
    case "rate_limited":
      return "Too many games or scores from this client, please try again later";
    case "conflict":
      return "Game changed; retry the same move";
    case "already_submitted":
      return "Game score already submitted";
    case "not_finished":
      return "Game is not finished";
    case "unavailable":
      return "Leaderboard unavailable";
    case "error":
    default:
      return "Leaderboard unavailable";
  }
}

function sendStoreFailure(
  res: Response,
  reason: leaderboard.GameStoreFailure
): Response {
  return res.status(storeFailureStatus(reason)).json({
    error: storeFailureMessage(reason),
    code: reason,
  });
}

function isSavedAiResponse(game: TrackedGame, fen: string): boolean {
  return (
    game.lastRequestFen === fen &&
    game.lastResponseFen === game.stateFen &&
    (game.lastResponseMove !== null ||
      (game.status === "finished" && game.result !== null))
  );
}

// Main AI move endpoint. The FEN is always the position immediately after the
// player's legal white move. Black's move and the score token are server-owned.
app.get("/ai-move", aiRateLimiter, async (req: Request, res: Response) => {
  const { Chess } = await chessImport;
  const fen = typeof req.query.fen === "string" ? req.query.fen : undefined;
  const gameId = typeof req.query.gameId === "string" ? req.query.gameId : undefined;

  if (!fen) return res.status(400).json({ error: "FEN is required" });
  if (fen.length > config.MAX_FEN_LENGTH) {
    return res.status(400).json({ error: "FEN too long" });
  }

  let requestedChess: Chess;
  try {
    requestedChess = new Chess(fen);
  } catch (err) {
    logger.warn("Invalid FEN provided", { error: (err as Error).message });
    return res.status(400).json({ error: "Invalid FEN string" });
  }

  const requestedBot = typeof req.query.bot === "string" ? req.query.bot : "stockfish";
  const bot: BotType =
    requestedBot === "chessgpt" || requestedBot === "stockfish" || requestedBot === "random"
      ? requestedBot
      : "random";

  // Without PostgreSQL, keep ordinary play available but make it explicitly
  // unranked. No token is created and no arbitrary result can be submitted.
  if (!leaderboard.isConfigured()) {
    if (requestedChess.turn() !== "b") {
      return res.status(400).json({ error: "Not black's turn" });
    }
    if (requestedChess.isGameOver()) {
      const result = getLeaderboardResult(requestedChess);
      return res.json({ move: null, gameId: null, msg: result ? gameResultMessage(result) : "Game over" });
    }
    const aiMove = await generateAiMove(fen, bot, requestedChess, Chess);
    const move = requestedChess.move(aiMove);
    if (!move) return res.status(500).json({ error: "Invalid move generated" });
    return res.json({ move: move.san, gameId: null });
  }

  const startTrackedGame = async (gameIdForSession: string): Promise<Response> => {
    // A new ranked session may only begin from one legal white move from the
    // standard starting position.
    const initial = new Chess();
    const whiteMove = findLegalWhiteMove(initial.fen(), fen, Chess);
    if (!whiteMove) {
      return res.status(400).json({
        error: "First move must be a legal white move from the starting position",
      });
    }

    const chess = new Chess(fen);
    const aiMove = await generateAiMove(fen, bot, chess, Chess);
    const move = chess.move(aiMove);
    if (!move) return res.status(500).json({ error: "Invalid move generated" });

    const result = getLeaderboardResult(chess);
    const created = await leaderboard.createTrackedGame({
      gameId: gameIdForSession,
      clientKey: req.ip || "unknown",
      stateFen: chess.fen(),
      moves: [whiteMove.san, move.san],
      lastRequestFen: fen,
      lastResponseMove: move.san,
      lastResponseFen: chess.fen(),
      result,
      status: result ? "finished" : "active",
    });
    if (!created.ok) return sendStoreFailure(res, created.reason);

    logger.info("AI move successful", { bot, move: move.san });
    return res.json({ move: move.san, gameId: gameIdForSession });
  };

  if (!gameId) {
    return startTrackedGame(randomUUID());
  }

  const loaded = await leaderboard.getTrackedGame(gameId);
  if (!loaded.ok) {
    // The browser may generate its UUID before the first move. An unknown
    // token can be claimed only by a legal opening move, under the same DB
    // start cap as a server-generated token.
    if (loaded.reason === "not_found") return startTrackedGame(gameId);
    return sendStoreFailure(res, loaded.reason);
  }
  const game = loaded.value;

  // A lost response can be retried with the same token and white FEN. Return
  // the saved black move without appending a second move to the game.
  if (isSavedAiResponse(game, fen)) {
    return res.json({
      move: game.lastResponseMove,
      gameId: game.gameId,
      ...(game.result ? { msg: gameResultMessage(game.result) } : {}),
    });
  }
  if (game.status !== "active") {
    return res.status(409).json({ error: "Game is already finished", code: "conflict" });
  }

  const chess = replayHistory(game.moves, Chess);
  if (!chess || chess.fen() !== game.stateFen || chess.turn() !== "w") {
    logger.error("Tracked game state failed validation");
    return res.status(500).json({ error: "Tracked game state is invalid" });
  }

  const whiteMove = findLegalWhiteMove(game.stateFen, fen, Chess);
  if (!whiteMove) {
    return res.status(400).json({
      error: "FEN must be the position after one legal white move",
      code: "invalid_move",
    });
  }
  const appliedWhite = chess.move(whiteMove.san);
  if (!appliedWhite || chess.fen() !== fen) {
    return res.status(400).json({ error: "Invalid white move", code: "invalid_move" });
  }

  const result = getLeaderboardResult(chess);
  if (result) {
    const finished = await leaderboard.advanceTrackedGame({
      gameId: game.gameId,
      version: game.version,
      expectedStateFen: game.stateFen,
      stateFen: chess.fen(),
      moves: [...game.moves, whiteMove.san],
      requestFen: fen,
      responseMove: null,
      responseFen: chess.fen(),
      result,
      status: "finished",
    });
    if (!finished.ok) return sendStoreFailure(res, finished.reason);
    return res.json({
      move: null,
      gameId: game.gameId,
      msg: gameResultMessage(result),
    });
  }
  if (game.moves.length + 1 >= config.MAX_TRACKED_GAME_MOVES) {
    return res.status(409).json({
      error: "Game is too long to continue",
      code: "game_limit",
    });
  }

  const aiMove = await generateAiMove(fen, bot, chess, Chess);
  const blackMove = chess.move(aiMove);
  if (!blackMove) return res.status(500).json({ error: "Invalid move generated" });
  const finalResult = getLeaderboardResult(chess);

  const advanced = await leaderboard.advanceTrackedGame({
    gameId: game.gameId,
    version: game.version,
    expectedStateFen: game.stateFen,
    stateFen: chess.fen(),
    moves: [...game.moves, whiteMove.san, blackMove.san],
    requestFen: fen,
    responseMove: blackMove.san,
    responseFen: chess.fen(),
    result: finalResult,
    status: finalResult ? "finished" : "active",
  });
  if (!advanced.ok) return sendStoreFailure(res, advanced.reason);

  logger.info("AI move successful", { bot, move: blackMove.san });
  return res.json({
    move: blackMove.san,
    gameId: game.gameId,
    ...(finalResult ? { msg: gameResultMessage(finalResult) } : {}),
  });
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
  const periodParam = (req.query.period as string) ?? "all";
  const period =
    periodParam === "week" || periodParam === "month" ? periodParam : "all";
  const data = await leaderboard.getLeaderboard(period, limit);
  res.json(data);
});

// Submit game result - rate limited
app.post(
  "/api/leaderboard",
  leaderboardRateLimiter,
  async (req: Request, res: Response) => {
    const body = req.body as {
      nickname?: unknown;
      gameId?: unknown;
      resigned?: unknown;
      result?: unknown;
    } | null;
    const nickname = body?.nickname;
    const gameId = body?.gameId;
    const resigned = body?.resigned;

    // Validate nickname
    if (!nickname || typeof nickname !== "string") {
      return res.status(400).json({ error: "Nickname is required" });
    }

    const cleanNickname = nickname.trim();
    if (cleanNickname.length === 0 || cleanNickname.length > 20) {
      return res.status(400).json({ error: "Nickname must be 1-20 characters" });
    }

    if (typeof gameId !== "string" || gameId.length === 0) {
      return res.status(400).json({ error: "gameId is required" });
    }
    if (body && Object.prototype.hasOwnProperty.call(body, "result")) {
      return res.status(400).json({
        error: "Result is server-derived; submit gameId instead",
        code: "client_result_rejected",
      });
    }
    if (resigned !== undefined && typeof resigned !== "boolean") {
      return res.status(400).json({ error: "resigned must be a boolean" });
    }

    const submitted = await leaderboard.submitResult(
      cleanNickname,
      gameId,
      resigned === true,
      req.ip
    );
    if (!submitted.ok) return sendStoreFailure(res, submitted.reason);
    res.json({ success: true });
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
