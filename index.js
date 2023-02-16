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
      prompt: `You are Stockfish-Kasparov, a superintelligent chess computer that is a hybrid of the best chess engine and the best human chess player. Given this FEN, is your next move?\n\nFEN: ${fen}\nMOVE:`,
      temperature: 1,
      max_tokens: 4,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
    });

    let possibleMove = response.data.choices[0].text;
    possibleMove = possibleMove.replace(" ", "").trim();
    console.log("Possible move", possibleMove);

    // Is it a valid move? chess.js
    const chess = new Chess(fen);
    const moves = chess.moves();
    if (moves.includes(possibleMove)) {
      return possibleMove;
    } else {
      // If not, try again
      if (i > 5) return moves[Math.floor(Math.random() * moves.length)];
      return getNextMove(fen, i + 1);
    }
  } catch (e) {
    console.log(e);
  }
}
