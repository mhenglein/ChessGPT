/**
 * Tests for chess-helpers utility functions
 */

const { getGameState, getRandomMove, sanitizeAN } = require("../src/utils/chess-helpers");

describe("chess-helpers", () => {
  describe("getRandomMove", () => {
    it("should return a move from the provided array", () => {
      const moves = ["e4", "d4", "Nf3", "c4"];
      const result = getRandomMove(moves);
      expect(moves).toContain(result);
    });

    it("should work with single move", () => {
      const moves = ["e4"];
      expect(getRandomMove(moves)).toBe("e4");
    });
  });

  describe("sanitizeAN", () => {
    it("should remove unsafe characters", () => {
      const input = "e4 e5 <script>alert('xss')</script>";
      const result = sanitizeAN(input);
      expect(result).not.toContain("<");
      expect(result).not.toContain(">");
      expect(result).not.toContain("'");
    });

    it("should preserve valid chess notation", () => {
      const input = "e4 e5 Nf3 Nc6 Bb5 a6";
      const result = sanitizeAN(input);
      expect(result).toBe("e4 e5 Nf3 Nc6 Bb5 a6");
    });

    it("should handle promotion notation", () => {
      const input = "e8=Q+";
      const result = sanitizeAN(input);
      expect(result).toBe("e8=Q+");
    });

    it("should handle castling notation", () => {
      const input = "O-O O-O-O";
      // Note: Our regex allows letters, so O is kept
      const result = sanitizeAN(input);
      expect(result).toContain("O");
    });

    it("should truncate long inputs", () => {
      const longInput = "e4 ".repeat(1000);
      const result = sanitizeAN(longInput, 100);
      expect(result.length).toBeLessThanOrEqual(100);
    });

    it("should handle empty/null input", () => {
      expect(sanitizeAN("")).toBe("");
      expect(sanitizeAN(null)).toBe("");
      expect(sanitizeAN(undefined)).toBe("");
    });
  });

  describe("getGameState", () => {
    // Mock chess object for testing
    const createMockChess = (overrides = {}) => ({
      isGameOver: () => false,
      isCheckmate: () => false,
      isStalemate: () => false,
      isDraw: () => false,
      isThreefoldRepetition: () => false,
      isInsufficientMaterial: () => false,
      ...overrides,
    });

    it("should return null when game is not over", () => {
      const chess = createMockChess();
      expect(getGameState(chess)).toBeNull();
    });

    it("should detect checkmate", () => {
      const chess = createMockChess({
        isGameOver: () => true,
        isCheckmate: () => true,
      });
      expect(getGameState(chess)).toEqual({
        isOver: true,
        result: "Checkmate",
      });
    });

    it("should detect stalemate", () => {
      const chess = createMockChess({
        isGameOver: () => true,
        isStalemate: () => true,
      });
      expect(getGameState(chess)).toEqual({
        isOver: true,
        result: "Stalemate",
      });
    });

    it("should detect draw", () => {
      const chess = createMockChess({
        isGameOver: () => true,
        isDraw: () => true,
      });
      expect(getGameState(chess)).toEqual({
        isOver: true,
        result: "Draw",
      });
    });

    it("should detect threefold repetition", () => {
      const chess = createMockChess({
        isGameOver: () => true,
        isThreefoldRepetition: () => true,
      });
      expect(getGameState(chess)).toEqual({
        isOver: true,
        result: "Threefold repetition",
      });
    });

    it("should detect insufficient material", () => {
      const chess = createMockChess({
        isGameOver: () => true,
        isInsufficientMaterial: () => true,
      });
      expect(getGameState(chess)).toEqual({
        isOver: true,
        result: "Insufficient material",
      });
    });
  });
});
