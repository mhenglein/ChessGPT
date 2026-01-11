# CLAUDE.md

ChessGPT: Play chess against ChatGPT, which "evolves" to Stockfish after repeated invalid moves.

## Quick Start

```bash
npm install              # Install dependencies
npm start                # Start server (port 3500)
npm run dev              # Development mode (single process)
./start-pm2.sh           # Production with PM2
curl localhost:3500/health  # Health check
```

## Environment Setup

Copy `.env.example` to `.env`:
```
OPENAI_API_KEY=your_key  # Required
PORT=3500                # Optional
LOG_LEVEL=info           # error|warn|info|debug
```

## Architecture

```
cluster.js          # Production entry point - worker process management
index.js            # Server bootstrap, imports src/app.js
src/
  app.js            # Express app, routes, middleware
  config/           # Centralized config and logger
  services/         # OpenAI and Stockfish integrations
  utils/            # Chess helper functions
app/                # Frontend source (dev)
public/             # Static files (production)
```

**Key Flow**: Client sends FEN position to `/ai-move` -> Server validates turn (black) -> ChatGPT or Stockfish generates move -> Returns SAN move

**Bot Selection**: `?bot=chessgpt` (default) or `?bot=stockfish`

## Technical Notes

- Uses FEN for board state, SAN for moves
- OpenAI v4 SDK with exponential backoff
- Stockfish instances created per-request with cleanup
- Rate limiting: 30 requests/minute on `/ai-move`
- No automated tests exist

## Render MCP

Workspace: **Marcus Henglein's Workspace** (`tea-cspt7nggph6c739ls70g`)
