const { Chess } = require("chess.js");
const {
  findLegalWhiteMove,
  getLeaderboardResult,
  replayHistory,
} = require("../src/utils/chess-helpers");

describe("server tracked chess state", () => {
  it("accepts exactly one legal white move from the server position", () => {
    const initial = new Chess();
    initial.move("e4");

    const valid = findLegalWhiteMove(
      new Chess().fen(),
      initial.fen(),
      Chess
    );
    expect(valid).toEqual({ san: "e4", fen: initial.fen() });

    const blackPosition = new Chess();
    blackPosition.move("e4");
    blackPosition.move("e5");
    expect(
      findLegalWhiteMove(initial.fen(), blackPosition.fen(), Chess)
    ).toBeNull();

    // A position that is legal from the starting board is still invalid when
    // it skips the server's current black move.
    const skipped = new Chess();
    skipped.move("d4");
    expect(findLegalWhiteMove(blackPosition.fen(), skipped.fen(), Chess)).toBeNull();
  });

  it("replays full SAN history and derives a terminal result for White", () => {
    const history = ["f3", "e5", "g4", "Qh4#"];
    const chess = replayHistory(history, Chess);

    expect(chess).not.toBeNull();
    const expected = new Chess();
    history.forEach((san) => expected.move(san));
    expect(chess.fen()).toBe(expected.fen());
    expect(getLeaderboardResult(chess)).toBe("loss");
    expect(replayHistory([...history, "e3"], Chess)).toBeNull();
  });

  it("derives a White win when the white move checkmates Black", () => {
    const chess = replayHistory(
      ["e4", "a6", "Qh5", "b6", "Bc4", "c6", "Qxf7#"],
      Chess
    );
    expect(getLeaderboardResult(chess)).toBe("win");
  });
});
