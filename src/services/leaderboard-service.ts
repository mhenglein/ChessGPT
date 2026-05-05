/**
 * Leaderboard Service
 * PostgreSQL-backed anonymous leaderboard for tracking wins/losses/draws
 */

import { Pool, PoolConfig } from "pg";
import logger from "../config/logger";
import type { LeaderboardEntry, GameResult, LeaderboardPeriod } from "../types";

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

      CREATE TABLE IF NOT EXISTS leaderboard_games (
        id BIGSERIAL PRIMARY KEY,
        nickname VARCHAR(20) NOT NULL,
        result VARCHAR(8) NOT NULL,
        played_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_leaderboard_games_played_at ON leaderboard_games(played_at DESC);
      CREATE INDEX IF NOT EXISTS idx_leaderboard_games_nickname_lower ON leaderboard_games(LOWER(nickname));
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
 * Get top players sorted by wins, optionally restricted to a time window
 *
 * - "all" reads from the rolling aggregate table (cheap, full history).
 * - "week" / "month" aggregate from per-game rows so the ranking reflects only
 *   games played inside the window. These rows are written from rollout onward,
 *   so historical games are not retroactively included.
 */
export async function getLeaderboard(
  period: LeaderboardPeriod = "all",
  limit: number = 10
): Promise<LeaderboardEntry[]> {
  const db = initPool();
  if (!db) return [];

  const safeLimit = Math.min(Math.max(1, parseInt(String(limit), 10) || 10), 50);

  try {
    if (period === "all") {
      const result = await db.query<LeaderboardEntry>(
        `SELECT nickname, wins, losses, draws, (wins + losses + draws) as total_games
         FROM leaderboard
         ORDER BY wins DESC, (wins - losses) DESC, total_games DESC
         LIMIT $1`,
        [safeLimit]
      );
      return result.rows;
    }

    const interval = period === "week" ? "7 days" : "30 days";
    const result = await db.query<LeaderboardEntry>(
      `SELECT
         nickname,
         COUNT(*) FILTER (WHERE result = 'win')::int  AS wins,
         COUNT(*) FILTER (WHERE result = 'loss')::int AS losses,
         COUNT(*) FILTER (WHERE result = 'draw')::int AS draws,
         COUNT(*)::int AS total_games
       FROM leaderboard_games
       WHERE played_at >= NOW() - INTERVAL '${interval}'
       GROUP BY nickname
       ORDER BY wins DESC, (COUNT(*) FILTER (WHERE result = 'win') - COUNT(*) FILTER (WHERE result = 'loss')) DESC, total_games DESC
       LIMIT $1`,
      [safeLimit]
    );
    return result.rows;
  } catch (err) {
    logger.error("Failed to fetch leaderboard", {
      error: (err as Error).message,
      period,
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

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO leaderboard (nickname, ${column})
       VALUES ($1, 1)
       ON CONFLICT (LOWER(nickname))
       DO UPDATE SET ${column} = leaderboard.${column} + 1, last_played = NOW()`,
      [cleanNickname]
    );
    await client.query(
      `INSERT INTO leaderboard_games (nickname, result) VALUES ($1, $2)`,
      [cleanNickname, result]
    );
    await client.query("COMMIT");

    logger.info("Game result submitted", { nickname: cleanNickname, result });
    return true;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    logger.error("Failed to submit game result", {
      error: (err as Error).message,
      nickname: cleanNickname,
    });
    return false;
  } finally {
    client.release();
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
