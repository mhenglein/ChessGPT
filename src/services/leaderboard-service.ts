/**
 * Leaderboard Service
 * PostgreSQL-backed anonymous leaderboard for tracking wins/losses/draws
 */

import { Pool, PoolConfig } from "pg";
import logger from "../config/logger";
import type { LeaderboardEntry, GameResult } from "../types";

let pool: Pool | null = null;

/**
 * Initialize database connection pool
 * Only creates pool if DATABASE_URL is configured
 */
function initPool(): Pool | null {
  if (pool) return pool;

  if (!process.env.DATABASE_URL) {
    logger.warn("DATABASE_URL not configured - leaderboard disabled");
    return null;
  }

  const poolConfig: PoolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false,
    max: 5, // Limit connections for memory efficiency
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };

  pool = new Pool(poolConfig);

  pool.on("error", (err) => {
    logger.error("Unexpected database pool error", { error: err.message });
  });

  return pool;
}

/**
 * Initialize database schema
 * Creates leaderboard table if it doesn't exist
 */
export async function initSchema(): Promise<boolean> {
  const db = initPool();
  if (!db) return false;

  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS leaderboard (
        id SERIAL PRIMARY KEY,
        nickname VARCHAR(20) NOT NULL,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        draws INTEGER DEFAULT 0,
        last_played TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_leaderboard_wins ON leaderboard(wins DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_leaderboard_nickname_lower ON leaderboard(LOWER(nickname));
    `);

    logger.info("Leaderboard schema initialized");
    return true;
  } catch (err) {
    logger.error("Failed to initialize leaderboard schema", {
      error: (err as Error).message,
    });
    return false;
  }
}

/**
 * Get top players sorted by wins
 */
export async function getLeaderboard(
  limit: number = 10
): Promise<LeaderboardEntry[]> {
  const db = initPool();
  if (!db) return [];

  // Clamp limit to reasonable bounds
  const safeLimit = Math.min(Math.max(1, parseInt(String(limit), 10) || 10), 50);

  try {
    const result = await db.query<LeaderboardEntry>(
      `SELECT nickname, wins, losses, draws, (wins + losses + draws) as total_games
       FROM leaderboard
       ORDER BY wins DESC, (wins - losses) DESC, total_games DESC
       LIMIT $1`,
      [safeLimit]
    );

    return result.rows;
  } catch (err) {
    logger.error("Failed to fetch leaderboard", {
      error: (err as Error).message,
    });
    return [];
  }
}

/**
 * Submit a game result
 * Creates new entry or updates existing based on case-insensitive nickname
 */
export async function submitResult(
  nickname: string,
  result: GameResult
): Promise<boolean> {
  const db = initPool();
  if (!db) return false;

  // Validate inputs
  const cleanNickname = (nickname || "").trim().slice(0, 20);
  if (!cleanNickname) {
    logger.warn("Empty nickname submitted");
    return false;
  }

  const validResults: GameResult[] = ["win", "loss", "draw"];
  if (!validResults.includes(result)) {
    logger.warn("Invalid result submitted", { result });
    return false;
  }

  // Map result to column
  const columnMap: Record<GameResult, string> = {
    win: "wins",
    loss: "losses",
    draw: "draws",
  };
  const column = columnMap[result];

  try {
    // Use INSERT ... ON CONFLICT for atomic upsert
    await db.query(
      `INSERT INTO leaderboard (nickname, ${column})
       VALUES ($1, 1)
       ON CONFLICT (LOWER(nickname))
       DO UPDATE SET ${column} = leaderboard.${column} + 1, last_played = NOW()`,
      [cleanNickname]
    );

    logger.info("Game result submitted", { nickname: cleanNickname, result });
    return true;
  } catch (err) {
    logger.error("Failed to submit game result", {
      error: (err as Error).message,
      nickname: cleanNickname,
    });
    return false;
  }
}

/**
 * Check if leaderboard is available (database configured and connected)
 */
export async function isAvailable(): Promise<boolean> {
  const db = initPool();
  if (!db) return false;

  try {
    await db.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

/**
 * Gracefully close database pool
 */
export async function close(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info("Leaderboard database pool closed");
  }
}
