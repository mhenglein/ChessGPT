/**
 * Generates public/og-image.png (1200x630) for social previews and Google.
 * Run with: node scripts/generate-og-image.mjs
 */
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(__dirname, "..", "public", "og-image.png");

const W = 1200;
const H = 630;

const LAVENDER = "#e6e6fa";
const DARK = "#0e0a1f";
const ACCENT = "#ffd700";
const RED = "#ff4500";
const BLUE = "#0070ff";

const LIGHT_SQUARE = "#e6e6fa";
const DARK_SQUARE = "#5a4b8c";

// 8x8 chessboard at top-right. Each square 56px, board total 448px.
const SQ = 56;
const BOARD_SIZE = SQ * 8;
const BOARD_X = W - BOARD_SIZE - 60;
const BOARD_Y = (H - BOARD_SIZE) / 2;

let squares = "";
for (let r = 0; r < 8; r++) {
  for (let c = 0; c < 8; c++) {
    const isDark = (r + c) % 2 === 1;
    const fill = isDark ? DARK_SQUARE : LIGHT_SQUARE;
    squares += `<rect x="${BOARD_X + c * SQ}" y="${BOARD_Y + r * SQ}" width="${SQ}" height="${SQ}" fill="${fill}"/>`;
  }
}

// Starting-position chess pieces (Unicode glyphs).
// Black on rows 0-1, White on rows 6-7.
const backRow = ["♜", "♞", "♝", "♛", "♚", "♝", "♞", "♜"]; // ♜♞♝♛♚♝♞♜
const whiteBack = ["♖", "♘", "♗", "♕", "♔", "♗", "♘", "♖"]; // ♖♘♗♕♔♗♘♖
const blackPawn = "♟";
const whitePawn = "♙";

let pieces = "";
const pieceStyle = `font-family="DejaVu Sans, Arial Unicode MS, Apple Color Emoji, sans-serif" font-size="50" text-anchor="middle" dominant-baseline="central"`;
for (let c = 0; c < 8; c++) {
  // black back rank (row 0) — render dark
  pieces += `<text x="${BOARD_X + c * SQ + SQ / 2}" y="${BOARD_Y + 0 * SQ + SQ / 2}" fill="#1a1430" ${pieceStyle}>${backRow[c]}</text>`;
  // black pawns (row 1)
  pieces += `<text x="${BOARD_X + c * SQ + SQ / 2}" y="${BOARD_Y + 1 * SQ + SQ / 2}" fill="#1a1430" ${pieceStyle}>${blackPawn}</text>`;
  // white pawns (row 6)
  pieces += `<text x="${BOARD_X + c * SQ + SQ / 2}" y="${BOARD_Y + 6 * SQ + SQ / 2}" fill="#ffffff" ${pieceStyle}>${whitePawn}</text>`;
  // white back rank (row 7)
  pieces += `<text x="${BOARD_X + c * SQ + SQ / 2}" y="${BOARD_Y + 7 * SQ + SQ / 2}" fill="#ffffff" ${pieceStyle}>${whiteBack[c]}</text>`;
}

// Title block on the left
const TITLE_X = 60;
const TITLE_Y = 240;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0e0a1f"/>
      <stop offset="100%" stop-color="#1f1538"/>
    </linearGradient>
  </defs>

  <!-- background -->
  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <!-- subtle scanline accent -->
  <rect x="0" y="0" width="${W}" height="6" fill="${ACCENT}"/>
  <rect x="0" y="${H - 6}" width="${W}" height="6" fill="${RED}"/>

  <!-- chess board on the right -->
  <rect x="${BOARD_X - 8}" y="${BOARD_Y - 8}" width="${BOARD_SIZE + 16}" height="${BOARD_SIZE + 16}" fill="#000" stroke="${ACCENT}" stroke-width="4"/>
  ${squares}
  ${pieces}

  <!-- text content on the left -->
  <text x="${TITLE_X}" y="${TITLE_Y}"
        font-family="Courier New, Courier, monospace"
        font-size="110" font-weight="900" fill="${LAVENDER}"
        letter-spacing="-2">ChessGPT</text>

  <text x="${TITLE_X}" y="${TITLE_Y + 70}"
        font-family="Courier New, Courier, monospace"
        font-size="32" font-weight="700" fill="${ACCENT}">
    Play chess against ChatGPT.
  </text>

  <text x="${TITLE_X}" y="${TITLE_Y + 115}"
        font-family="Courier New, Courier, monospace"
        font-size="24" font-weight="500" fill="${LAVENDER}" opacity="0.85">
    With creative prompt engineering,
  </text>
  <text x="${TITLE_X}" y="${TITLE_Y + 148}"
        font-family="Courier New, Courier, monospace"
        font-size="24" font-weight="500" fill="${LAVENDER}" opacity="0.85">
    it can beat almost any human.
  </text>
  <text x="${TITLE_X}" y="${TITLE_Y + 181}"
        font-family="Courier New, Courier, monospace"
        font-size="24" font-weight="500" fill="${LAVENDER}" opacity="0.85">
    Including you.
  </text>

  <!-- call-to-action -->
  <rect x="${TITLE_X - 4}" y="${TITLE_Y + 215}" width="380" height="58" fill="${BLUE}"/>
  <text x="${TITLE_X + 186}" y="${TITLE_Y + 254}"
        font-family="Courier New, Courier, monospace"
        font-size="28" font-weight="900" fill="#ffffff" text-anchor="middle">
    Oh yeah? Game on.
  </text>

  <!-- domain mark -->
  <text x="${TITLE_X}" y="${H - 40}"
        font-family="Courier New, Courier, monospace"
        font-size="22" font-weight="700" fill="${LAVENDER}" opacity="0.7">
    chessgpt.ai
  </text>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  background: DARK,
  font: {
    loadSystemFonts: true,
    defaultFontFamily: "Courier New",
  },
});
const png = resvg.render().asPng();
writeFileSync(outPath, png);
console.log(`Wrote ${outPath} (${png.length} bytes, ${W}x${H})`);
