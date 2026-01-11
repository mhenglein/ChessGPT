require("dotenv").config();

const express = require("express");
const chessImport = import("chess.js");
const { Configuration, OpenAIApi } = require("openai");
const { backOff } = require("exponential-backoff");
const stockfish = require("stockfish");
const chalk = require("chalk");
const winston = require("winston");

// Configure winston logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

const app = express();
app.set("host", process.env.OPENSHIFT_NODEJS_IP || "0.0.0.0");
app.set("port", process.env.PORT || process.env.OPENSHIFT_NODEJS_PORT || 3500);

app.use(express.json());
app.use(express.static("public"));

// Domain handler - Restart server on crashes
app.use(function (req, res, next) {
  const domain = require("domain").create(); // Create a domain for this request

  // Handle errors on this domain
  domain.on("error", function (err) {
    console.error("DOMAIN ERROR CAUGHT\n", err.stack);
    // Log error properly
    try {
      // Failsafe shutdown in 5 seconds
      setTimeout(function () {
        console.error("Failsafe shutdown.");
        process.exit(1);
      }, 5000);

      // Disconnect from the cluster
      const worker = require("cluster").worker;
      if (worker) worker.disconnect();

      // Stop taking new requests
      server.close();
      try {
        // attempt to use Express error route
        next(err);
      } catch (err) {
        // if Express error route failed, try plain Node response
        console.error("Express error mechanism failed.\n", err.stack);
        logger.error("Express error mechanism failed", { error: err.stack });
        if (!res.headersSent) {
          res.statusCode = 500;
          res.sendFile("index.html", { root: __dirname + "/public" });
        }
        return;
      }
    } catch (err) {
      console.error("Unable to send 500 response.\n", err.stack);
    }
  });
  // add the request and response objects to the domain
  domain.add(req);
  domain.add(res);

  // execute the rest of the request chain in the domain
  domain.run(next);
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "healthy", 
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get("/ai-move", async (req, res) => {
  const { Chess } = await chessImport;
  const fen = req.query.fen;
  const an = req.query.an || "No AN available";
  
  if (!fen) {
    return res.status(400).json({ error: "FEN is required" });
  }
  
  let chess;
  try {
    chess = new Chess(fen);
  } catch (err) {
    logger.error("Invalid FEN provided", { fen, error: err.message });
    return res.status(400).json({ error: "Invalid FEN string" });
  }
  
  // Validate it's black's turn (AI plays black)
  if (chess.turn() !== 'b') {
    logger.warn("AI move requested but it's not black's turn", { fen, turn: chess.turn() });
    return res.status(400).json({ error: "Not black's turn" });
  }

  // Check if the game is over
  try {
    if (chess.isGameOver()) {
      // Who won?
      if (chess.in_checkmate()) {
        res.status(200).json({ msg: "Checkmate" });
        console.log("Checkmate");
      } else if (chess.in_draw()) {
        res.status(200).json({ msg: "Draw" });
        console.log("Draw");
      } else if (chess.in_stalemate()) {
        res.status(200).json({ msg: "Stalemate" });
        console.log("Stalemate");
      } else if (chess.in_threefold_repetition()) {
        res.status(200).json({ msg: "Threefold repetition" });
        console.log("Threefold repetition");
      } else if (chess.insufficient_material()) {
        res.status(200).json({ msg: "Insufficient material" });
        console.log("Insufficient material");
      } else if (chess.in_fifty_moves()) {
        res.status(200).json({ msg: "Fifty moves" });
        console.log("Fifty moves");
      }

      return;
    }
  } catch (err) {
    console.log(err);
  }

  // Choose bot
  const bot = req.query.bot || "stockfish";

  // Calculate the AI's move (this is where you would call your AI algorithm)
  let aiMove = "";
  if (bot === "chessgpt") {
    aiMove = await getNextMove(fen, an);
  } else if (bot === "stockfish") {
    aiMove = await getStockfishMove(fen);
  } else {
    // Random move
    const moves = chess.moves();
    aiMove = moves[Math.floor(Math.random() * moves.length)];
  }

  if (!aiMove) {
    logger.error("AI failed to generate a move", { bot, fen });
    // Fallback to random move
    const moves = chess.moves();
    aiMove = moves[Math.floor(Math.random() * moves.length)];
  }

  let move = chess.move(aiMove);
  if (move === null) {
    logger.error("Invalid move from AI", { bot, aiMove, fen });
    res.status(500).json({ error: "Invalid move generated" });
    return;
  }

  logger.info("AI move successful", { bot, move: move.san, fen });
  res.send(move.san);
});

// Error Handler: 500
app.use(function (err, req, res, next) {
  logger.error("Unhandled error", { error: err.stack });
  res.statusCode = 500;
  if (!res.headersSent) {
    res.json({ error: "Internal server error" });
  }
});

// Start Express server.
let server = app.listen(app.get("port"), () => {
  console.log("%s App is running at http://localhost:%d in %s mode", chalk.green("✓"), app.get("port"), app.get("env"));
  console.log("Press CTRL-C to stop\n");
});

async function getNextMove(fen, an, i = 0) {
  const { Chess } = await chessImport;

  // Pick the first valid move; if not, repeat the whole process; if not, pick a random move.
  const chess = new Chess(fen);
  const moves = chess.moves();

  try {
    const systemMessage = {
      role: "system",
      content: `You are ChessGPT, a superintelligent chess computer that is a hybrid of the best chess engine and the best human chess player.`,
    };

    // What is your optimal move based on the FEN and AN below?
    const userMessage = {
      role: "user",
      content: `What is the optimal move based on the FEN and AN below? Answer in SAN (e.g. e4, Nf3, etc.). Don't provide any explanation. 
      FEN: ${fen}. 
      AN: ${an}.
      Are you (black) currently checked? ${chess.inCheck() ? "Yes" : "No"}
    The chess board represented as ASCII looks like this:
    ${chess.ascii()}
    
    The following are a list of your available moves: ${chess.moves().join(", ")}`,
    };

    const messages = [userMessage];

    const response = await backOff(() =>
      openai.createChatCompletion({
        model: "gpt-4o",
        messages,
        temperature: 1,
        max_tokens: 4,
        n: 5,
      })
    );

    if (!response.data.choices) {
      console.log("No choices, random move");
      return moves[Math.floor(Math.random() * moves.length)];
    }

    let possibleMoves = [];
    response.data.choices.forEach((choice) => {
      let possibleMove = choice.message.content;
      possibleMove = possibleMove.replace(" ", "").trim();
      possibleMove = possibleMove.replace(/(\r\n|\n|\r)/gm, "");
      possibleMove = possibleMove.replace("...", "");
      possibleMoves.push(possibleMove);
    });

    // Remove duplicates
    possibleMoves = [...new Set(possibleMoves)];

    // Remove all single-letter moves
    possibleMoves = possibleMoves.filter((move) => move.length > 1);

    let validMove = null;
    for (let i = 0; i < possibleMoves.length; i++) {
      const possibleMove = possibleMoves[i];
      if (moves.includes(possibleMove)) {
        validMove = possibleMove;
        return validMove;
      }
    }

    if (i > 3) return moves[Math.floor(Math.random() * moves.length)];
    return getNextMove(fen, an, i + 1);
  } catch (error) {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.log(error.response.data);
      console.log(error.response.status);
      console.log(error.response.headers);
    } else if (error.request) {
      // The request was made but no response was received
      // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
      // http.ClientRequest in node.js
      console.log(error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.log("Error", error.message);
    }
    console.log(error.config);
    // Set a sleep time with promise
    return new Promise((resolve) => setTimeout(resolve, 2500)).then(() => {
      return moves[Math.floor(Math.random() * moves.length)];
    });
  }
}

const fenregex = /^([rnbqkpRNBQKP1-8]+\/){7}([rnbqkpRNBQKP1-8]+)\s[bw]\s(-|K?Q?k?q?)\s(-|[a-h][36])\s(0|[1-9][0-9]*)\s([1-9][0-9]*)/;

// Convert UCI move format (e2e4) to SAN format (e4)
async function convertUCItoSAN(fen, uciMove) {
  if (!uciMove) return null;
  
  const { Chess } = await chessImport;
  const chess = new Chess(fen);
  
  // Parse UCI move (e.g., "e2e4" or "e7e8q" for promotion)
  const from = uciMove.substring(0, 2);
  const to = uciMove.substring(2, 4);
  const promotion = uciMove.substring(4, 5);
  
  try {
    const move = chess.move({
      from,
      to,
      promotion: promotion || undefined
    });
    
    return move ? move.san : null;
  } catch (err) {
    logger.error("Failed to convert UCI to SAN", { fen, uciMove, error: err.message });
    return null;
  }
}

// Create a new Stockfish instance for each request
async function askStockfish(fen, engine) {
  return new Promise((resolve, reject) => {
    if (!fen.match(fenregex)) {
      reject(new Error("Invalid fen string"));
      return;
    }

    let messageBuffer = [];
    let resolved = false;

    const messageHandler = function (msg) {
      if (typeof msg === "string") {
        messageBuffer.push(msg);
        
        if (msg.includes("bestmove")) {
          resolved = true;
          engine.onmessage = null;
          resolve(msg);
        }
      }
    };

    engine.onmessage = messageHandler;

    engine.postMessage("ucinewgame");
    engine.postMessage("position fen " + fen);
    engine.postMessage("go depth 15"); // Reduced depth for faster response
    
    // Timeout fallback
    setTimeout(() => {
      if (!resolved) {
        engine.onmessage = null;
        reject(new Error("Stockfish timeout"));
      }
    }, 5000);
  });
}

function extractBestMove(stockfishOutput) {
  const match = stockfishOutput.match(/bestmove\s(\w{4,5})/);
  return match ? match[1] : null;
}

async function getStockfishMove(fen) {
  const engine = stockfish();
  let timeoutId;
  
  try {
    const result = await Promise.race([
      askStockfish(fen, engine),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Stockfish timeout')), 5000);
      })
    ]);
    
    clearTimeout(timeoutId);
    
    const bestMove = extractBestMove(result);
    if (!bestMove) {
      throw new Error("No best move found in Stockfish output");
    }
    
    // Convert UCI to SAN format
    const sanMove = await convertUCItoSAN(fen, bestMove);
    
    // Clean up engine
    engine.postMessage("quit");
    
    if (!sanMove) {
      throw new Error("Failed to convert UCI move to SAN");
    }
    
    return sanMove;
  } catch (error) {
    logger.error('Stockfish error', { error: error.message, fen });
    
    // Clean up engine
    try {
      engine.postMessage("quit");
    } catch (e) {
      // Ignore cleanup errors
    }
    
    // Return random valid move as fallback
    const { Chess } = await chessImport;
    const chess = new Chess(fen);
    const moves = chess.moves();
    const fallbackMove = moves[Math.floor(Math.random() * moves.length)];
    
    logger.info("Using fallback random move", { move: fallbackMove, fen });
    return fallbackMove;
  }
}
