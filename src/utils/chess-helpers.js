/**
 * Chess utility functions
 * Shared helpers for chess game logic
 */

/**
 * Get the game result/state from a chess instance
 * @param {Chess} chess - chess.js instance
 * @returns {object|null} - { isOver: boolean, result: string } or null if game continues
 */
function getGameState(chess) {
  if (!chess.isGameOver()) {
    return null;
  }

  if (chess.isCheckmate()) {
    return { isOver: true, result: "Checkmate" };
  }
  if (chess.isStalemate()) {
    return { isOver: true, result: "Stalemate" };
  }
  if (chess.isDraw()) {
    return { isOver: true, result: "Draw" };
  }
  if (chess.isThreefoldRepetition()) {
    return { isOver: true, result: "Threefold repetition" };
  }
  if (chess.isInsufficientMaterial()) {
    return { isOver: true, result: "Insufficient material" };
  }

  return { isOver: true, result: "Game over" };
}

/**
 * Get a random move from available moves
 * @param {string[]} moves - Array of legal moves in SAN notation
 * @returns {string} - Random move from the array
 */
function getRandomMove(moves) {
  return moves[Math.floor(Math.random() * moves.length)];
}

/**
 * Sanitize algebraic notation to prevent prompt injection
 * @param {string} an - Algebraic notation string
 * @param {number} maxLength - Maximum allowed length
 * @returns {string} - Sanitized string
 */
function sanitizeAN(an, maxLength = 2000) {
  if (!an || typeof an !== "string") return "";
  // Allow only safe chess notation characters: letters, numbers, spaces, common notation symbols
  return an.replace(/[^\w\s,.\-+#=()x]/gi, "").substring(0, maxLength);
}

module.exports = {
  getGameState,
  getRandomMove,
  sanitizeAN,
};
