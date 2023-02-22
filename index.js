import * as dotenv from "dotenv"; // see https://github.com/motdotla/dotenv#how-do-i-use-dotenv-with-import
dotenv.config();

import express from "express";
import { Chess } from "chess.js";
import { Configuration, OpenAIApi } from "openai";
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static("public"));

app.get("/ai-move", async (req, res) => {
  const fen = req.query.fen;
  const an = req.query.an;
  console.log(fen, an);
  const chess = new Chess(fen);

  // Check if the game is over
  if (chess.isGameOver()) {
    res.status(200).json({ msg: "Game over" });
    return;
  }

  // Calculate the AI's move (this is where you would call your AI algorithm)
  // const ascii = chess.ascii();
  const prompt = await getNextMoveConsiderations(chess, an);
  const aiMove = await getNextMove(prompt, fen);

  let move = chess.move(aiMove);
  if (move === null) {
    res.status(500).send("Invalid move");
    return;
  }

  console.log("SAN", move.san);
  res.send(move.san);
});

app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});

// COTA reasoning
async function getNextMoveConsiderations(chess, an) {
  try {
    const prompt = `You are Stockfish-Kasparov, a superintelligent chess computer that is a hybrid of the best chess engine and the best human chess player. You are playing a chess game defined by the FEN and AN below. You are playing as black.
    FEN: ${chess.fen()}
    AN: ${an}.
    Are you (black) currently checked? ${chess.inCheck() ? "Yes" : "No"}
    The chess board represented as ASCII looks like this:
    ${chess.ascii()}
    The following are a list of your available moves: ${chess.moves().join(", ")}
    Let's think about this step by step. Explain the consequences of white's most recent move. What are your considerations for the top 3 optimal moves based on the current game so far?`;
    const response = await openai.createCompletion({
      model: "text-davinci-003",
      prompt,
      temperature: 0.7,
      max_tokens: 400,
      top_p: 1,
      echo: true,
      frequency_penalty: 0,
      presence_penalty: 0,
      n: 1,
    });

    return response.data.choices[0].text;
  } catch (e) {
    console.log(e);
    process.exit(1);
  }
}

async function getNextMove(prompt, fen, i = 0) {
  try {
    prompt = `${prompt}
    Based on the considerations above, what could a next move look like? (Black to move)
    MOVE (AN):`;

    console.log("PROMPT", { prompt });
    const response = await openai.createCompletion({
      model: "text-davinci-003",
      prompt,
      temperature: 1,
      max_tokens: 4,
      top_p: 1,
      stop: [",", "."],
      frequency_penalty: 0,
      presence_penalty: 0,
      n: 20,
    });

    console.log(response.data.choices);

    let possibleMoves = [];
    response.data.choices.forEach((choice) => {
      let possibleMove = choice.text;
      possibleMove = possibleMove.replace(" ", "").trim();
      possibleMove = possibleMove.replace(/(\r\n|\n|\r)/gm, "");
      possibleMoves.push(possibleMove);
    });

    // Remove all single-letter moves
    possibleMoves = possibleMoves.filter((move) => move.length > 1);
    console.log({ possibleMoves });

    // Create a frequency map showing how many times each move appears
    const frequencyMap = {};
    possibleMoves.forEach((move) => {
      if (frequencyMap[move]) {
        frequencyMap[move]++;
      } else {
        frequencyMap[move] = 1;
      }
    });

    // Sort the moves by frequency
    possibleMoves = Object.keys(frequencyMap).sort((a, b) => frequencyMap[b] - frequencyMap[a]);
    console.log({ possibleMoves });

    // Remove duplicates
    possibleMoves = [...new Set(possibleMoves)];
    console.log("FINAL", { possibleMoves });

    // Pick the first valid move; if not, repeat the whole process; if not, pick a random move.
    const chess = new Chess(fen);
    const moves = chess.moves();

    let validMove = null;
    for (let i = 0; i < possibleMoves.length; i++) {
      const possibleMove = possibleMoves[i];
      if (moves.includes(possibleMove)) {
        console.log("Found a valid move", possibleMove);
        validMove = possibleMove;
        return validMove;
      } else {
        console.log("Invalid move", possibleMove);
      }
    }

    // If over 3, return a random move
    if (i > 3) return moves[Math.floor(Math.random() * moves.length)];
    return getNextMove(prompt, fen, i + 1);
  } catch (e) {
    console.log(e);
  }
}
