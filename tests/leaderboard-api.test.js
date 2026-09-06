const http = require("http");
const { randomUUID } = require("crypto");
const { Pool } = require("pg");
const { Chess } = require("chess.js");

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

function requestJSON(server, method, path, body) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const payload = body === undefined ? null : JSON.stringify(body);
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port: address.port,
        method,
        path,
        headers: payload
          ? {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(payload),
            }
          : undefined,
      },
      (response) => {
        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          raw += chunk;
        });
        response.on("end", () => {
          let parsed = null;
          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch {
            parsed = raw;
          }
          resolve({ status: response.statusCode, body: parsed });
        });
      }
    );
    request.on("error", reject);
    if (payload) request.write(payload);
    request.end();
  });
}

const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

describeWithDatabase("leaderboard anti-abuse API", () => {
  let app;
  let server;
  let service;
  let dbPool;
  const gameIds = [];
  const nicknames = [];

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl;
    service = require("../src/services/leaderboard-service");
    await expect(service.initSchema()).resolves.toBe(true);
    dbPool = new Pool({ connectionString: testDatabaseUrl });
    app = require("../src/app").default;
    server = await new Promise((resolve) => {
      const instance = app.listen(0, () => resolve(instance));
    });
  });

  afterAll(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await service.close();

    try {
      if (gameIds.length) {
        await dbPool.query(
          "DELETE FROM leaderboard_games WHERE game_id = ANY($1::uuid[])",
          [gameIds]
        );
        await dbPool.query(
          "DELETE FROM leaderboard_game_sessions WHERE game_id = ANY($1::uuid[])",
          [gameIds]
        );
      }
      if (nicknames.length) {
        await dbPool.query("DELETE FROM leaderboard WHERE nickname = ANY($1::text[])", [
          nicknames,
        ]);
      }
    } finally {
      await dbPool.end();
    }
  });

  it("rejects forged moves and client results, then replays a saved move", async () => {
    const localGame = new Chess();
    localGame.move("e4");
    const openingFen = localGame.fen();
    const gameId = randomUUID();
    gameIds.push(gameId);

    const opening = await requestJSON(
      server,
      "GET",
      `/ai-move?fen=${encodeURIComponent(openingFen)}&bot=random&gameId=${gameId}`
    );
    expect(opening.status).toBe(200);
    expect(opening.body.gameId).toBe(gameId);
    expect(typeof opening.body.move).toBe("string");
    localGame.move(opening.body.move);

    const forged = new Chess();
    forged.move("d4");
    const forgedMove = await requestJSON(
      server,
      "GET",
      `/ai-move?fen=${encodeURIComponent(forged.fen())}&bot=random&gameId=${gameId}`
    );
    expect(forgedMove.status).toBe(400);
    expect(forgedMove.body.code).toBe("invalid_move");

    localGame.move(localGame.moves()[0]);
    const retryableFen = localGame.fen();
    const next = await requestJSON(
      server,
      "GET",
      `/ai-move?fen=${encodeURIComponent(retryableFen)}&bot=random&gameId=${gameId}`
    );
    expect(next.status).toBe(200);
    expect(typeof next.body.move).toBe("string");

    const replay = await requestJSON(
      server,
      "GET",
      `/ai-move?fen=${encodeURIComponent(retryableFen)}&bot=random&gameId=${gameId}`
    );
    expect(replay.status).toBe(200);
    expect(replay.body.move).toBe(next.body.move);

    const stored = await service.getTrackedGame(gameId);
    expect(stored.ok).toBe(true);
    expect(stored.value.moves).toHaveLength(4);

    const nickname = `anti-${randomUUID().slice(0, 12)}`;
    nicknames.push(nickname);
    const unfinished = await requestJSON(server, "POST", "/api/leaderboard", {
      nickname,
      gameId,
    });
    expect(unfinished.status).toBe(409);
    expect(unfinished.body.code).toBe("not_finished");

    const forgedResult = await requestJSON(server, "POST", "/api/leaderboard", {
      nickname,
      gameId,
      result: "win",
    });
    expect(forgedResult.status).toBe(400);
    expect(forgedResult.body.code).toBe("client_result_rejected");
  });

  it("claims a score once when two clients submit the same game concurrently", async () => {
    const gameId = randomUUID();
    gameIds.push(gameId);
    const chess = new Chess();
    chess.move("e4");
    chess.move("e5");
    const created = await service.createTrackedGame({
      gameId,
      clientKey: `claim-${gameId}`,
      stateFen: chess.fen(),
      moves: ["e4", "e5"],
      lastRequestFen: new Chess().fen(),
      lastResponseMove: "e5",
      lastResponseFen: chess.fen(),
      status: "active",
      result: null,
    });
    expect(created.ok).toBe(true);

    const firstNickname = `claim-a-${randomUUID().slice(0, 8)}`;
    const secondNickname = `claim-b-${randomUUID().slice(0, 8)}`;
    nicknames.push(firstNickname, secondNickname);
    const [first, second] = await Promise.all([
      service.submitResult(firstNickname, gameId, true, "different-client"),
      service.submitResult(secondNickname, gameId, true, "different-client"),
    ]);
    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
    const failed = first.ok ? second : first;
    expect(failed).toEqual({ ok: false, reason: "already_submitted" });

    const rows = await service.getLeaderboard("all", 50);
    const claimedRows = rows.filter((row) =>
      [firstNickname, secondNickname].includes(row.nickname)
    );
    expect(claimedRows).toHaveLength(1);
    expect(claimedRows[0].losses).toBe(1);
  });

  it("records a server-derived white checkmate and makes score replay idempotent", async () => {
    const history = ["e4", "a6", "Qh5", "b6", "Bc4", "c6"];
    const beforeCheckmate = new Chess();
    history.forEach((san) => beforeCheckmate.move(san));
    const terminal = new Chess(beforeCheckmate.fen());
    terminal.move("Qxf7#");

    const previous = new Chess();
    history.slice(0, -1).forEach((san) => previous.move(san));
    const gameId = randomUUID();
    gameIds.push(gameId);
    const created = await service.createTrackedGame({
      gameId,
      clientKey: `terminal-${gameId}`,
      stateFen: beforeCheckmate.fen(),
      moves: history,
      lastRequestFen: previous.fen(),
      lastResponseMove: "c6",
      lastResponseFen: beforeCheckmate.fen(),
      status: "active",
      result: null,
    });
    expect(created.ok).toBe(true);

    const response = await requestJSON(
      server,
      "GET",
      `/ai-move?fen=${encodeURIComponent(terminal.fen())}&bot=random&gameId=${gameId}`
    );
    expect(response.status).toBe(200);
    expect(response.body.move).toBeNull();
    expect(response.body.gameId).toBe(gameId);
    expect(response.body.msg).toMatch(/White wins/);

    const stored = await service.getTrackedGame(gameId);
    expect(stored.ok).toBe(true);
    expect(stored.value.status).toBe("finished");
    expect(stored.value.result).toBe("win");
    expect(stored.value.moves).toEqual([...history, "Qxf7#"]);

    const nickname = `winner-${randomUUID().slice(0, 12)}`;
    nicknames.push(nickname);
    const score = await requestJSON(server, "POST", "/api/leaderboard", {
      nickname,
      gameId,
    });
    expect(score.status).toBe(200);

    const beforeReplay = await dbPool.query(
      "SELECT wins, losses, draws FROM leaderboard WHERE nickname = $1",
      [nickname]
    );
    const replay = await requestJSON(server, "POST", "/api/leaderboard", {
      nickname,
      gameId,
    });
    expect(replay.status).toBe(200);
    const afterReplay = await dbPool.query(
      "SELECT wins, losses, draws FROM leaderboard WHERE nickname = $1",
      [nickname]
    );
    expect(afterReplay.rows).toEqual(beforeReplay.rows);

    await expect(service.initSchema()).resolves.toBe(true);
    const afterInit = await dbPool.query(
      "SELECT wins, losses, draws FROM leaderboard WHERE nickname = $1",
      [nickname]
    );
    expect(afterInit.rows).toEqual(beforeReplay.rows);
  });

  it("rejects expired game moves and scores", async () => {
    const gameId = randomUUID();
    gameIds.push(gameId);
    const chess = new Chess();
    chess.move("e4");
    chess.move("e5");
    const created = await service.createTrackedGame({
      gameId,
      clientKey: `expired-${gameId}`,
      stateFen: chess.fen(),
      moves: ["e4", "e5"],
      lastRequestFen: new Chess().fen(),
      lastResponseMove: "e5",
      lastResponseFen: chess.fen(),
      status: "active",
      result: null,
    });
    expect(created.ok).toBe(true);
    await dbPool.query(
      "UPDATE leaderboard_game_sessions SET expires_at = NOW() - INTERVAL '1 minute' WHERE game_id = $1",
      [gameId]
    );

    const move = new Chess(chess.fen());
    move.move(move.moves()[0]);
    const moveResponse = await requestJSON(
      server,
      "GET",
      `/ai-move?fen=${encodeURIComponent(move.fen())}&bot=random&gameId=${gameId}`
    );
    expect(moveResponse.status).toBe(410);
    expect(moveResponse.body.code).toBe("expired");

    const scoreResponse = await requestJSON(server, "POST", "/api/leaderboard", {
      nickname: `expired-${randomUUID().slice(0, 8)}`,
      gameId,
      resigned: true,
    });
    expect(scoreResponse.status).toBe(410);
    expect(scoreResponse.body.code).toBe("expired");
  });
});
