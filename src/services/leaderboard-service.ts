/**
 * Leaderboard Service
 * PostgreSQL-backed anonymous leaderboard for tracking wins/losses/draws
 */

import { Pool, PoolConfig } from "pg";
import config from "../config";
import logger from "../config/logger";
import type {
  LeaderboardEntry,
  GameResult,
  LeaderboardPeriod,
  TrackedGame,
  TrackedGameStatus,
} from "../types";

let pool: Pool | null = null;

const GAME_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type GameStoreFailure =
  | "unavailable"
  | "invalid"
  | "rate_limited"
  | "not_found"
  | "expired"
  | "conflict"
  | "already_submitted"
  | "not_finished"
  | "error";

export type GameStoreResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: GameStoreFailure };

export interface CreateTrackedGameInput {
  gameId: string;
  clientKey: string;
  stateFen: string;
  moves: string[];
  lastRequestFen: string;
  lastResponseMove: string;
  lastResponseFen: string;
  result?: GameResult | null;
  status?: TrackedGameStatus;
}

export interface AdvanceTrackedGameInput {
  gameId: string;
  version: number;
  expectedStateFen: string;
  stateFen: string;
  moves: string[];
  requestFen: string;
  responseMove: string | null;
  responseFen: string;
  result: GameResult | null;
  status: TrackedGameStatus;
}

export interface SubmitTrackedGameResult {
  result: GameResult;
}

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

/** Whether a database URL was provided. Gameplay can continue unranked when
 * this is false, while the scoring path fails closed. */
export function isConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function cleanClientKey(clientKey: string | undefined): string {
  const value = typeof clientKey === "string" ? clientKey.trim() : "";
  return (value || "unknown").slice(0, 128);
}

function isValidGameId(gameId: string): boolean {
  return typeof gameId === "string" && GAME_ID_REGEX.test(gameId);
}

function parseMoves(value: unknown): string[] | null {
  let moves = value;
  if (typeof moves === "string") {
    try {
      moves = JSON.parse(moves);
    } catch {
      return null;
    }
  }
  if (
    !Array.isArray(moves) ||
    moves.length > config.MAX_TRACKED_GAME_MOVES ||
    moves.some((move) => typeof move !== "string" || move.length > 20)
  ) {
    return null;
  }
  return moves;
}

function toTrackedGame(row: Record<string, unknown>): TrackedGame | null {
  const moves = parseMoves(row.moves);
  const expiresAt =
    row.expires_at instanceof Date
      ? row.expires_at
      : typeof row.expires_at === "string"
        ? new Date(row.expires_at)
        : null;
  if (
    typeof row.game_id !== "string" ||
    typeof row.state_fen !== "string" ||
    !moves ||
    typeof row.status !== "string" ||
    typeof row.version !== "number" ||
    typeof row.client_key !== "string" ||
    !expiresAt ||
    Number.isNaN(expiresAt.getTime())
  ) {
    return null;
  }

  const status = row.status as TrackedGameStatus;
  if (!["active", "finished", "expired"].includes(status)) return null;

  const result = row.result;
  if (result !== null && result !== undefined && !["win", "loss", "draw"].includes(String(result))) {
    return null;
  }

  return {
    gameId: row.game_id,
    stateFen: row.state_fen,
    moves,
    status,
    result: result == null ? null : (String(result) as GameResult),
    version: row.version,
    clientKey: row.client_key,
    lastRequestFen:
      typeof row.last_request_fen === "string" ? row.last_request_fen : null,
    lastResponseMove:
      typeof row.last_response_move === "string" ? row.last_response_move : null,
    lastResponseFen:
      typeof row.last_response_fen === "string" ? row.last_response_fen : null,
    submittedNickname:
      typeof row.submitted_nickname === "string" ? row.submitted_nickname : null,
    expiresAt,
  };
}

function isExpired(game: TrackedGame): boolean {
  return game.expiresAt.getTime() <= Date.now();
}

async function cleanupTrackedGames(client: { query: (...args: any[]) => Promise<any> }): Promise<void> {
  // Retain only bounded session history. Scores themselves live in
  // leaderboard_games, so old sessions are not needed after this window.
  await client.query(
    `WITH stale AS (
       SELECT game_id
       FROM leaderboard_game_sessions
       WHERE expires_at <= NOW()
          OR updated_at <= NOW() - INTERVAL '30 days'
       ORDER BY updated_at ASC
       LIMIT $1
     )
     DELETE FROM leaderboard_game_sessions sessions
     USING stale
     WHERE sessions.game_id = stale.game_id`,
    [config.GAME_SESSION_CLEANUP_BATCH]
  );
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

      ALTER TABLE leaderboard_games
        ADD COLUMN IF NOT EXISTS game_id UUID;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_leaderboard_games_game_id
        ON leaderboard_games(game_id)
        WHERE game_id IS NOT NULL;

      CREATE TABLE IF NOT EXISTS leaderboard_game_sessions (
        game_id UUID PRIMARY KEY,
        client_key VARCHAR(128) NOT NULL,
        state_fen VARCHAR(100) NOT NULL,
        moves JSONB NOT NULL DEFAULT '[]'::jsonb,
        status VARCHAR(16) NOT NULL DEFAULT 'active',
        result VARCHAR(8),
        version INTEGER NOT NULL DEFAULT 0,
        last_request_fen VARCHAR(100),
        last_response_move VARCHAR(20),
        last_response_fen VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        submitted_at TIMESTAMPTZ,
        submitted_nickname VARCHAR(20),
        CONSTRAINT leaderboard_game_sessions_status_check
          CHECK (status IN ('active', 'finished', 'expired')),
        CONSTRAINT leaderboard_game_sessions_result_check
          CHECK (result IS NULL OR result IN ('win', 'loss', 'draw'))
      );

      CREATE INDEX IF NOT EXISTS idx_leaderboard_game_sessions_client_created
        ON leaderboard_game_sessions(client_key, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_leaderboard_game_sessions_client_submitted
        ON leaderboard_game_sessions(client_key, submitted_at DESC);
      CREATE INDEX IF NOT EXISTS idx_leaderboard_game_sessions_expires
        ON leaderboard_game_sessions(expires_at);

      ALTER TABLE leaderboard_game_sessions
        ADD COLUMN IF NOT EXISTS submitted_nickname VARCHAR(20);
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

function trackedGameSelectSql(includeSubmittedAt = false): string {
  return `SELECT
      game_id,
      client_key,
      state_fen,
      moves,
      status,
      result,
      version,
      last_request_fen,
      last_response_move,
      last_response_fen,
      expires_at,
      submitted_nickname${includeSubmittedAt ? ", submitted_at" : ""}
    FROM leaderboard_game_sessions`;
}

/**
 * Start a server-tracked game after the caller has validated its first white
 * move and generated the first black response.
 */
export async function createTrackedGame(
  input: CreateTrackedGameInput
): Promise<GameStoreResult<TrackedGame>> {
  const db = initPool();
  if (!db) return { ok: false, reason: "unavailable" };
  if (
    !isValidGameId(input.gameId) ||
    !input.stateFen ||
    !input.lastRequestFen ||
    !input.lastResponseFen ||
    !input.lastResponseMove ||
    !Array.isArray(input.moves)
  ) {
    return { ok: false, reason: "invalid" };
  }

  const clientKey = cleanClientKey(input.clientKey);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    // Advisory locks serialize cap checks for one client across all workers.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [clientKey]);
    await cleanupTrackedGames(client);

    const starts = await client.query<{ count: number | string }>(
      `SELECT COUNT(*)::int AS count
       FROM leaderboard_game_sessions
       WHERE client_key = $1
         AND created_at >= NOW() - ($2 * INTERVAL '1 millisecond')`,
      [clientKey, config.GAME_SESSION_START_WINDOW_MS]
    );
    if (Number(starts.rows[0]?.count ?? 0) >= config.GAME_SESSION_MAX_STARTS) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "rate_limited" };
    }

    const expiresAt = new Date(Date.now() + config.GAME_SESSION_TTL_MS);
    const inserted = await client.query<Record<string, unknown>>(
      `INSERT INTO leaderboard_game_sessions
         (game_id, client_key, state_fen, moves, status, result,
          last_request_fen, last_response_move, last_response_fen, expires_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10)
       RETURNING game_id, client_key, state_fen, moves, status, result, version,
                 last_request_fen, last_response_move, last_response_fen,
                 expires_at, submitted_nickname`,
      [
        input.gameId,
        clientKey,
        input.stateFen,
        JSON.stringify(input.moves),
        input.status ?? (input.result ? "finished" : "active"),
        input.result ?? null,
        input.lastRequestFen,
        input.lastResponseMove,
        input.lastResponseFen,
        expiresAt,
      ]
    );
    const game = inserted.rows[0] ? toTrackedGame(inserted.rows[0]) : null;
    if (!game) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "error" };
    }
    await client.query("COMMIT");
    return { ok: true, value: game };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    logger.error("Failed to create tracked game", {
      error: (err as Error).message,
    });
    return { ok: false, reason: "error" };
  } finally {
    client.release();
  }
}

/** Load a tracked game without exposing the database row shape to callers. */
export async function getTrackedGame(
  gameId: string
): Promise<GameStoreResult<TrackedGame>> {
  const db = initPool();
  if (!db) return { ok: false, reason: "unavailable" };
  if (!isValidGameId(gameId)) return { ok: false, reason: "invalid" };

  try {
    const result = await db.query<Record<string, unknown>>(
      `${trackedGameSelectSql()} WHERE game_id = $1`,
      [gameId]
    );
    const game = result.rows[0] ? toTrackedGame(result.rows[0]) : null;
    if (!game) return { ok: false, reason: "not_found" };
    if (isExpired(game)) {
      await db.query(
        `UPDATE leaderboard_game_sessions
         SET status = 'expired', updated_at = NOW()
         WHERE game_id = $1 AND status <> 'expired'`,
        [gameId]
      );
      return { ok: false, reason: "expired" };
    }
    return { ok: true, value: game };
  } catch (err) {
    logger.error("Failed to fetch tracked game", {
      error: (err as Error).message,
    });
    return { ok: false, reason: "error" };
  }
}

/**
 * Advance a game with compare-and-set semantics. The version and previous FEN
 * make concurrent requests across workers mutually exclusive.
 */
export async function advanceTrackedGame(
  input: AdvanceTrackedGameInput
): Promise<GameStoreResult<TrackedGame>> {
  const db = initPool();
  if (!db) return { ok: false, reason: "unavailable" };
  if (
    !isValidGameId(input.gameId) ||
    !Number.isInteger(input.version) ||
    !input.expectedStateFen ||
    !input.stateFen ||
    !input.requestFen ||
    !input.responseFen ||
    !Array.isArray(input.moves) ||
    !["active", "finished"].includes(input.status)
  ) {
    return { ok: false, reason: "invalid" };
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<Record<string, unknown>>(
      `UPDATE leaderboard_game_sessions
       SET state_fen = $2,
           moves = $3::jsonb,
           status = $4,
           result = $5,
           version = version + 1,
           last_request_fen = $6,
           last_response_move = $7,
           last_response_fen = $8,
           updated_at = NOW()
       WHERE game_id = $1
         AND version = $9
         AND state_fen = $10
         AND status = 'active'
         AND expires_at > NOW()
       RETURNING game_id, client_key, state_fen, moves, status, result, version,
                 last_request_fen, last_response_move, last_response_fen,
                 expires_at, submitted_nickname`,
      [
        input.gameId,
        input.stateFen,
        JSON.stringify(input.moves),
        input.status,
        input.result,
        input.requestFen,
        input.responseMove,
        input.responseFen,
        input.version,
        input.expectedStateFen,
      ]
    );
    const game = result.rows[0] ? toTrackedGame(result.rows[0]) : null;
    if (!game) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "conflict" };
    }
    await client.query("COMMIT");
    return { ok: true, value: game };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    logger.error("Failed to advance tracked game", {
      error: (err as Error).message,
    });
    return { ok: false, reason: "error" };
  } finally {
    client.release();
  }
}

/**
 * Submit a server-derived result exactly once. The client can request a loss
 * by resigning, but it cannot choose win/loss/draw directly.
 */
export async function submitResult(
  nickname: string,
  gameId: string,
  resigned: boolean = false,
  clientKey: string = "unknown"
): Promise<GameStoreResult<SubmitTrackedGameResult>> {
  const db = initPool();
  if (!db) return { ok: false, reason: "unavailable" };

  const cleanNickname = (nickname || "").trim().slice(0, 20);
  if (!cleanNickname || !isValidGameId(gameId) || typeof resigned !== "boolean") {
    return { ok: false, reason: "invalid" };
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const found = await client.query<Record<string, unknown>>(
      `${trackedGameSelectSql(true)}
       WHERE game_id = $1
       FOR UPDATE`,
      [gameId]
    );
    const game = found.rows[0] ? toTrackedGame(found.rows[0]) : null;
    if (!game) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "not_found" };
    }
    // Rate-limit against the key that started the game. A caller cannot evade
    // the score cap by changing networks after receiving a UUID.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [game.clientKey]);
    if (isExpired(game)) {
      await client.query(
        `UPDATE leaderboard_game_sessions
         SET status = 'expired', updated_at = NOW()
         WHERE game_id = $1 AND status <> 'expired'`,
        [gameId]
      );
      await client.query("ROLLBACK");
      return { ok: false, reason: "expired" };
    }

    const submittedAt = found.rows[0]?.submitted_at;
    if (submittedAt != null) {
      if (
        game.submittedNickname &&
        game.submittedNickname.toLowerCase() === cleanNickname.toLowerCase() &&
        game.result
      ) {
        await client.query("COMMIT");
        return { ok: true, value: { result: game.result } };
      }
      await client.query("ROLLBACK");
      return { ok: false, reason: "already_submitted" };
    }

    let result: GameResult | null = game.result;
    if (game.status === "active") {
      if (!resigned) {
        await client.query("ROLLBACK");
        return { ok: false, reason: "not_finished" };
      }
      result = "loss";
      await client.query(
        `UPDATE leaderboard_game_sessions
         SET status = 'finished', result = 'loss', version = version + 1,
             updated_at = NOW()
         WHERE game_id = $1 AND status = 'active'`,
        [gameId]
      );
    } else if (game.status !== "finished" || !result) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "not_finished" };
    } else if (resigned) {
      // A finished win/draw cannot be rewritten as a resignation.
      await client.query("ROLLBACK");
      return { ok: false, reason: "invalid" };
    }

    const scores = await client.query<{ count: number | string }>(
      `SELECT COUNT(*)::int AS count
       FROM leaderboard_game_sessions
       WHERE client_key = $1
         AND submitted_at IS NOT NULL
         AND submitted_at >= NOW() - ($2 * INTERVAL '1 millisecond')`,
      [game.clientKey, config.GAME_SESSION_SCORE_WINDOW_MS]
    );
    if (Number(scores.rows[0]?.count ?? 0) >= config.GAME_SESSION_MAX_SCORES) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "rate_limited" };
    }

    const columnMap: Record<GameResult, string> = {
      win: "wins",
      loss: "losses",
      draw: "draws",
    };
    const column = columnMap[result];
    await client.query(
      `INSERT INTO leaderboard (nickname, ${column})
       VALUES ($1, 1)
       ON CONFLICT (LOWER(nickname))
       DO UPDATE SET ${column} = leaderboard.${column} + 1, last_played = NOW()`,
      [cleanNickname]
    );
    await client.query(
      `INSERT INTO leaderboard_games (nickname, result, game_id) VALUES ($1, $2, $3)`,
      [cleanNickname, result, gameId]
    );

    // This claim is part of the same transaction as the aggregate updates.
    // The partial unique index on leaderboard_games.game_id is a second guard.
    const claimed = await client.query(
      `UPDATE leaderboard_game_sessions
       SET submitted_at = NOW(), submitted_nickname = $2, updated_at = NOW()
       WHERE game_id = $1 AND submitted_at IS NULL
       RETURNING game_id`,
      [gameId, cleanNickname]
    );
    if (claimed.rowCount !== 1) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "already_submitted" };
    }

    await client.query("COMMIT");
    logger.info("Game result submitted", { nickname: cleanNickname, result });
    return { ok: true, value: { result } };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    logger.error("Failed to submit game result", {
      error: (err as Error).message,
      nickname: cleanNickname,
    });
    return { ok: false, reason: "error" };
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
