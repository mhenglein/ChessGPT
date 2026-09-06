# CLAUDE.md

ChessGPT: Play chess against GPT-4o or Stockfish. The AI plays black.

## Commands

```bash
npm install              # Install dependencies
npm start                # Production server (clustered)
npm run dev              # Development mode (tsx, single process)
npm run build            # Compile TypeScript and bundle frontend
npm run typecheck        # Type check without emitting
npm test                 # Run tests
```

## Environment

Copy `.env.example` to `.env`. Required: `OPENAI_API_KEY`

## Architecture

```
cluster.ts               # Production entry - worker process management
index.ts                 # Server bootstrap
instrument.ts            # Sentry instrumentation
src/
  app.ts                 # Express app, routes (/ai-move, /health, /api/leaderboard)
  config/index.ts        # Centralized config constants
  config/logger.ts       # Winston logger
  services/openai-service.ts     # GPT-4o integration
  services/stockfish-service.ts  # Stockfish engine
  services/leaderboard-service.ts # PostgreSQL leaderboard
  utils/chess-helpers.ts # Game state, move helpers
  types/index.ts         # Shared TypeScript types
  types/stockfish.d.ts   # Stockfish module declarations
app/js/scripts.js        # Frontend source (bundled to public/)
public/                  # Static assets served by Express
tests/                   # Jest tests
dist/                    # Compiled JavaScript output (gitignored)
```

## API

`GET /ai-move?fen=<FEN>&bot=<chessgpt|stockfish>&gameId=<id>` - Returns `{ move, gameId }` (AI plays black). Generate a UUID once per game and reuse it for every request and retry. Send every white move, including a terminal one.
`GET /api/leaderboard?limit=10` - Get top players
`POST /api/leaderboard` - Submit `{ nickname, gameId, resigned? }`. The server derives the result from verified moves and saves each game once.

## Tech Notes

- TypeScript codebase, compiles to `dist/` for production
- FEN for board state, SAN for moves
- Rate limit: 30 req/min on `/ai-move`, 10 req/min on leaderboard POST
- Stockfish depth 15, 5s timeout
- Leaderboard requires `DATABASE_URL` env var (PostgreSQL)

## Render

Workspace: `tea-cspvce8gph6c739g0bdg` (Personal)

Build command: `npm ci && npm run build`. The build compiles the server, bundles
the client, and writes `public/index.html` with content-hashed audio URLs.
Audio source files live in `app/assets/`; music loads only when played.
Do not edit generated `public/index.html`, `public/scripts.js`, or `public/media/` by hand.

Deployment initializes an additive game-session table in the existing leaderboard
database. It does not delete historical scores.

Leaderboard integration tests require `TEST_DATABASE_URL` pointing to a disposable
PostgreSQL database. Run `TEST_DATABASE_URL=... npm test -- --runInBand` to include them.
