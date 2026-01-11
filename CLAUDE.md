# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. It's a fun game that starts out as playing chess against OpenAI, then it switches to the Stockfish engine halfway through.

## Commands

### Development
```bash
# Install dependencies
npm install

# Start development server (with clustering and memory optimization)
npm start

# Start with PM2 for production (recommended)
./start-pm2.sh

# Package as binary executable
npm run package

# Health check endpoint
curl http://localhost:3500/health
```

### Environment Setup
Create a `.env` file with:
```
OPENAI_API_KEY=your_api_key_here
PORT=3500  # Optional, defaults to 3500
WEB_CONCURRENCY=1  # Optional, number of worker processes
LOG_LEVEL=info  # Optional, logging level (error, warn, info, debug)
```

### Production Management
```bash
# Start with PM2 (production recommended)
./start-pm2.sh

# PM2 management commands
pm2 logs        # View logs
pm2 monit       # Real-time monitoring
pm2 restart chessgpt  # Restart app
pm2 stop chessgpt     # Stop app
pm2 status      # Check status
```

## Architecture Overview

ChessGPT is a web application that allows users to play chess against ChatGPT (with Stockfish as a fallback). The architecture consists of:

### Backend Architecture
- **Clustering**: Production-ready Node.js clustering via `cluster.js` for scalability
- **Main Server**: Express.js server in `index.js` serving static files and providing the `/ai-move` API endpoint
- **AI Integration**: 
  - Primary: OpenAI ChatGPT API with creative prompt engineering to make it play chess
  - Fallback: Stockfish chess engine (triggered as "evolution" after multiple ChatGPT failures)
- **Error Handling**: Domain-based error handling with automatic worker restart on crashes
- **Memory Management**: Manual garbage collection scheduling for Heroku deployment

### Frontend Architecture
- **Static Files**: Development files in `/app/`, production-ready files in `/public/`
- **Chess UI**: Uses chessboard.js for board visualization with Wikipedia-style piece images
- **Game Logic**: chess.js library handles move validation on both client and server
- **Styling**: Bootstrap 5 with custom brutalist CSS design and Emulogic font
- **Audio**: Pokemon-inspired battle intro music and sound effects

### Key Technical Details
- **Move Format**: Uses FEN (Forsyth-Edwards Notation) for board state and SAN (Standard Algebraic Notation) for moves
- **API Resilience**: Exponential backoff for OpenAI API calls
- **State Management**: Board state passed between client and server on each move
- **PWA Support**: Includes manifest and icons for Progressive Web App capabilities

### File Structure
- `/app/`: Development frontend source files
- `/public/`: Production static files (includes minified CSS)
- `cluster.js`: Entry point with worker process management
- `index.js`: Express server with API endpoints
- `config.codekit3`: Indicates CodeKit is used for asset compilation

### Reliability Improvements (Latest)
- **Stockfish Integration**: Fixed race conditions by creating new engine instances per request with proper cleanup
- **Error Handling**: Added winston logging and proper error recovery mechanisms
- **Turn Validation**: Added server-side validation to prevent color-switching bugs
- **Health Monitoring**: Added `/health` endpoint for monitoring application status
- **Process Management**: PM2 configuration with graceful shutdowns and restart limits
- **UCI to SAN Conversion**: Proper move format conversion from Stockfish to chess.js

### Important Notes
- No automated tests or linting configuration exists
- Frontend uses vanilla JavaScript with jQuery (no modern framework)
- Google AdSense integration is present in the frontend
- The "evolution" feature transitions from ChatGPT to Stockfish after repeated invalid moves
- Logs are stored in `logs/` directory (gitignored)