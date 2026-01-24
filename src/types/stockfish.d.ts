/**
 * Type definitions for stockfish npm package
 * The stockfish package doesn't provide its own types
 */

declare module "stockfish" {
  interface StockfishEngine {
    onmessage: ((message: string) => void) | null;
    postMessage(message: string): void;
  }

  function stockfish(): StockfishEngine;
  export = stockfish;
}
