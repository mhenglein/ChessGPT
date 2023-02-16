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
  console.log(fen);
  const chess = new Chess(fen);

  // Check if the game is over
  if (chess.isGameOver()) {
    res.status(200).json({ msg: "Game over" });
    return;
  }

  // Calculate the AI's move (this is where you would call your AI algorithm)
  const aiMove = await getNextMove(fen);

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

async function getNextMove(fen, i = 0) {
  try {
    const response = await openai.createCompletion({
      model: "text-davinci-003",
      prompt: `You are Stockfish-Kasparov, a superintelligent chess computer that is a hybrid of the best chess engine and the best human chess player. Given this FEN, is your next move?\n\nFEN: ${fen}\nMOVE (SAN):`,
      temperature: 1,
      max_tokens: 5,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
      n: 10,
    });

    console.log(response.data.choices);

    let possibleMoves = [];
    response.data.choices.forEach((choice) => {
      let possibleMove = choice.text;
      possibleMove = possibleMove.replace(" ", "").trim();
      possibleMove = possibleMove.replace(/(\r\n|\n|\r)/gm, "");
      if (possibleMove.includes("-")) {
        possibleMove = possibleMove.split("-")[1];
      }
      possibleMoves.push(possibleMove);
    });

    // Remove duplicates
    possibleMoves = [...new Set(possibleMoves)];
    console.log(possibleMoves);

    // Remove all single-letter moves
    possibleMoves = possibleMoves.filter((move) => move.length > 1);

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
      }
    }

    if (i > 3) return moves[Math.floor(Math.random() * moves.length)];
    return getNextMove(fen, i + 1);
  } catch (e) {
    console.log(e);
  }
}
