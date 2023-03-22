require("dotenv").config();

const express = require("express");
const chessImport = import("chess.js");
const { Configuration, OpenAIApi } = require("openai");
const { backOff } = require("exponential-backoff");
const stockfish = require("stockfish");

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static("public"));

app.get("/ai-move", async (req, res) => {
  const { Chess } = await chessImport;
  const fen = req.query.fen;
  const an = req.query.an || "No AN available";
  const chess = new Chess(fen);

  // Check if the game is over
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

  // Choose bot
  const bot = req.query.bot || "stockfish";

  // Calculate the AI's move (this is where you would call your AI algorithm)
  let aiMove = "";
  if (bot === "chessgpt") {
    console.log("Getting ChessGPT move");
    aiMove = await getNextMove(fen, an);
  } else if (bot === "stockfish") {
    console.log("Getting Stockfish move");
    aiMove = await getStockfishMove(fen);
  } else {
    // Random move
    const moves = chess.moves();
    aiMove = moves[Math.floor(Math.random() * moves.length)];
  }

  // It is not awaiting the getStockfishMove function, so it is undefined (async issue)
  console.log("AI move:", aiMove); // aiMove is undefined
  let move = chess.move(aiMove);
  if (move === null) {
    res.status(500).send("Invalid move");
    return;
  }

  console.log("SAN", move.san);
  console.log("FEN", chess.fen());
  res.send(move.san);
});

app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
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
    console.log({ messages });

    const response = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages,
      temperature: 1,
      max_tokens: 4,
      n: 5,
    });

    if (!response.data.choices) {
      console.log("No choices");
      return moves[Math.floor(Math.random() * moves.length)];
    }

    console.log(response.data.choices);

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
    console.log(possibleMoves);

    // Remove all single-letter moves
    possibleMoves = possibleMoves.filter((move) => move.length > 1);

    let validMove = null;
    for (let i = 0; i < possibleMoves.length; i++) {
      const possibleMove = possibleMoves[i];
      if (moves.includes(possibleMove)) {
        console.log("Found a valid move", possibleMove);
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

async function askStockfish(fen) {
  const engine = stockfish();
  return new Promise((resolve, reject) => {
    if (!fen.match(fenregex)) {
      reject("Invalid fen string");
      return;
    }

    const messageHandler = function (msg) {
      if (typeof msg == "string" && msg.match("bestmove")) {
        engine.onmessage = null;
        resolve(msg);
      }
    };

    engine.onmessage = messageHandler;

    engine.postMessage("ucinewgame");
    engine.postMessage("position fen " + fen);
    engine.postMessage("go depth 18");
  });
}

function extractBestMove(stockfishOutput) {
  const match = stockfishOutput.match(/bestmove\s(\w{4})/);
  return match ? match[1] : null;
}

async function getStockfishMove(fen) {
  try {
    const output = await askStockfish(fen); // Add the 'await' keyword here
    const bestMove = extractBestMove(output);
    console.log({ bestMove });
    return bestMove;
  } catch (error) {
    console.error(error);
  }
}
