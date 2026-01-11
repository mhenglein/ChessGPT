# CLAUDE.md

ChessGPT: Play chess against GPT-4o or Stockfish. The AI plays black.

## Commands

```bash
npm install              # Install dependencies
npm start                # Production server (clustered)
npm run dev              # Development mode (single process)
npm test                 # Run tests
npm run build            # Bundle frontend for production
```

## Environment

Copy `.env.example` to `.env`. Required: `OPENAI_API_KEY`

## Architecture

```
cluster.js               # Production entry - worker process management
index.js                 # Server bootstrap
src/
  app.js                 # Express app, routes (/ai-move, /health)
  config/index.js        # Centralized config constants
  config/logger.js       # Winston logger
  services/openai-service.js    # GPT-4o integration
  services/stockfish-service.js # Stockfish engine
  utils/chess-helpers.js # Game state, move helpers
app/js/scripts.js        # Frontend source (bundled to public/)
public/                  # Static assets served by Express
tests/                   # Jest tests
```

## API

`GET /ai-move?fen=<FEN>&bot=<chessgpt|stockfish>` - Returns SAN move (AI plays black)

## Tech Notes

- FEN for board state, SAN for moves
- Rate limit: 30 req/min on `/ai-move`
- Stockfish depth 15, 5s timeout

## Render

Workspace: `tea-cspt7nggph6c739ls70g`
