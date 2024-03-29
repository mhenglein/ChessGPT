(function () {
  'use strict';

  const SYMBOLS = "pnbrqkPNBRQK",
    DEFAULT_POSITION = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    TERMINATION_MARKERS = ["1-0", "0-1", "1/2-1/2", "*"],
    PAWN_OFFSETS = { b: [16, 32, 17, 15], w: [-16, -32, -17, -15] },
    PIECE_OFFSETS = {
      n: [-18, -33, -31, -14, 18, 33, 31, 14],
      b: [-17, -15, 17, 15],
      r: [-16, 1, 16, -1],
      q: [-17, -16, -15, 1, 17, 16, 15, -1],
      k: [-17, -16, -15, 1, 17, 16, 15, -1],
    },
    ATTACKS = [
      20, 0, 0, 0, 0, 0, 0, 24, 0, 0, 0, 0, 0, 0, 20, 0, 0, 20, 0, 0, 0, 0, 0, 24, 0, 0, 0, 0, 0, 20, 0, 0, 0, 0, 20, 0, 0, 0, 0, 24, 0, 0, 0, 0, 20, 0, 0, 0, 0,
      0, 0, 20, 0, 0, 0, 24, 0, 0, 0, 20, 0, 0, 0, 0, 0, 0, 0, 0, 20, 0, 0, 24, 0, 0, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 20, 2, 24, 2, 20, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 2, 53, 56, 53, 2, 0, 0, 0, 0, 0, 0, 24, 24, 24, 24, 24, 24, 56, 0, 56, 24, 24, 24, 24, 24, 24, 0, 0, 0, 0, 0, 0, 2, 53, 56, 53, 2, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 20, 2, 24, 2, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 20, 0, 0, 24, 0, 0, 20, 0, 0, 0, 0, 0, 0, 0, 0, 20, 0, 0, 0, 24, 0, 0, 0, 20, 0, 0, 0, 0,
      0, 0, 20, 0, 0, 0, 0, 24, 0, 0, 0, 0, 20, 0, 0, 0, 0, 20, 0, 0, 0, 0, 0, 24, 0, 0, 0, 0, 0, 20, 0, 0, 20, 0, 0, 0, 0, 0, 0, 24, 0, 0, 0, 0, 0, 0, 20,
    ],
    RAYS = [
      17, 0, 0, 0, 0, 0, 0, 16, 0, 0, 0, 0, 0, 0, 15, 0, 0, 17, 0, 0, 0, 0, 0, 16, 0, 0, 0, 0, 0, 15, 0, 0, 0, 0, 17, 0, 0, 0, 0, 16, 0, 0, 0, 0, 15, 0, 0, 0, 0,
      0, 0, 17, 0, 0, 0, 16, 0, 0, 0, 15, 0, 0, 0, 0, 0, 0, 0, 0, 17, 0, 0, 16, 0, 0, 15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 17, 0, 16, 0, 15, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 17, 16, 15, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, -1, -1, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, -15, -16, -17, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, -15, 0, -16, 0, -17, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -15, 0, 0, -16, 0, 0, -17, 0, 0, 0, 0, 0, 0, 0, 0, -15, 0, 0, 0, -16, 0, 0, 0, -17, 0, 0, 0,
      0, 0, 0, -15, 0, 0, 0, 0, -16, 0, 0, 0, 0, -17, 0, 0, 0, 0, -15, 0, 0, 0, 0, 0, -16, 0, 0, 0, 0, 0, -17, 0, 0, -15, 0, 0, 0, 0, 0, 0, -16, 0, 0, 0, 0, 0, 0,
      -17,
    ],
    SHIFTS = { p: 0, n: 1, b: 2, r: 3, q: 4, k: 5 },
    BITS = { NORMAL: 1, CAPTURE: 2, BIG_PAWN: 4, EP_CAPTURE: 8, PROMOTION: 16, KSIDE_CASTLE: 32, QSIDE_CASTLE: 64 },
    RANK_1 = 7,
    RANK_2 = 6,
    RANK_7 = 1,
    RANK_8 = 0,
    SQUARE_MAP = {
      a8: 0,
      b8: 1,
      c8: 2,
      d8: 3,
      e8: 4,
      f8: 5,
      g8: 6,
      h8: 7,
      a7: 16,
      b7: 17,
      c7: 18,
      d7: 19,
      e7: 20,
      f7: 21,
      g7: 22,
      h7: 23,
      a6: 32,
      b6: 33,
      c6: 34,
      d6: 35,
      e6: 36,
      f6: 37,
      g6: 38,
      h6: 39,
      a5: 48,
      b5: 49,
      c5: 50,
      d5: 51,
      e5: 52,
      f5: 53,
      g5: 54,
      h5: 55,
      a4: 64,
      b4: 65,
      c4: 66,
      d4: 67,
      e4: 68,
      f4: 69,
      g4: 70,
      h4: 71,
      a3: 80,
      b3: 81,
      c3: 82,
      d3: 83,
      e3: 84,
      f3: 85,
      g3: 86,
      h3: 87,
      a2: 96,
      b2: 97,
      c2: 98,
      d2: 99,
      e2: 100,
      f2: 101,
      g2: 102,
      h2: 103,
      a1: 112,
      b1: 113,
      c1: 114,
      d1: 115,
      e1: 116,
      f1: 117,
      g1: 118,
      h1: 119,
    },
    ROOKS = {
      w: [
        { square: SQUARE_MAP.a1, flag: BITS.QSIDE_CASTLE },
        { square: SQUARE_MAP.h1, flag: BITS.KSIDE_CASTLE },
      ],
      b: [
        { square: SQUARE_MAP.a8, flag: BITS.QSIDE_CASTLE },
        { square: SQUARE_MAP.h8, flag: BITS.KSIDE_CASTLE },
      ],
    },
    PARSER_STRICT = 0,
    PARSER_SLOPPY = 1;
  function get_disambiguator(e, r) {
    for (var n = e.from, t = e.to, o = e.piece, i = 0, a = 0, l = 0, f = 0, u = r.length; f < u; f++) {
      var c = r[f].from,
        s = r[f].to;
      o === r[f].piece && n !== c && t === s && (i++, rank(n) === rank(c) && a++, file(n) === file(c) && l++);
    }
    return 0 < i ? (0 < a && 0 < l ? algebraic(n) : 0 < l ? algebraic(n).charAt(1) : algebraic(n).charAt(0)) : "";
  }
  function infer_piece_type(e) {
    var r = e.charAt(0);
    return "a" <= r && r <= "h" ? (e.match(/[a-h]\d.*[a-h]\d/) ? void 0 : PAWN) : "o" === (r = r.toLowerCase()) ? KING : r;
  }
  function stripped_san(e) {
    return e.replace(/=/, "").replace(/[+#]?[?!]*$/, "");
  }
  function rank(e) {
    return e >> 4;
  }
  function file(e) {
    return 15 & e;
  }
  function algebraic(e) {
    var r = file(e),
      e = rank(e);
    return "abcdefgh".substring(r, r + 1) + "87654321".substring(e, e + 1);
  }
  function swap_color(e) {
    return e === WHITE ? BLACK : WHITE;
  }
  function is_digit(e) {
    return -1 !== "0123456789".indexOf(e);
  }
  function clone(e) {
    var r,
      n = e instanceof Array ? [] : {};
    for (r in e) n[r] = "object" == typeof r ? clone(e[r]) : e[r];
    return n;
  }
  function trim(e) {
    return e.replace(/^\s+|\s+$/g, "");
  }
  const BLACK = "b",
    WHITE = "w",
    EMPTY = -1,
    PAWN = "p",
    KNIGHT = "n",
    BISHOP = "b",
    ROOK = "r",
    QUEEN = "q",
    KING = "k";
    ((function () {
      for (var e = [], r = SQUARE_MAP.a8; r <= SQUARE_MAP.h1; r++) 136 & r ? (r += 7) : e.push(algebraic(r));
      return e;
    }))();
    const FLAGS = { NORMAL: "n", CAPTURE: "c", BIG_PAWN: "b", EP_CAPTURE: "e", PROMOTION: "p", KSIDE_CASTLE: "k", QSIDE_CASTLE: "q" },
    Chess = function (e) {
      var I = new Array(128),
        P = { w: EMPTY, b: EMPTY },
        v = WHITE,
        R = { w: 0, b: 0 },
        d = EMPTY,
        f = 0,
        A = 1,
        E = [],
        T = {},
        h = {};
      function u(e) {
        void 0 === e && (e = !1),
          (I = new Array(128)),
          (P = { w: EMPTY, b: EMPTY }),
          (v = WHITE),
          (R = { w: 0, b: 0 }),
          (d = EMPTY),
          (f = 0),
          (A = 1),
          (E = []),
          e || (T = {}),
          (h = {}),
          s(O());
      }
      function r() {
        function e(e) {
          e in h && (n[e] = h[e]);
        }
        for (var r = [], n = {}; 0 < E.length; ) r.push(y());
        for (e(O()); 0 < r.length; ) L(r.pop()), e(O());
        h = n;
      }
      function b() {
        m(DEFAULT_POSITION);
      }
      function m(e, r) {
        void 0 === r && (r = !1);
        var n = e.split(/\s+/),
          t = n[0],
          o = 0;
        if (!c(e).valid) return !1;
        u(r);
        for (var i = 0; i < t.length; i++) {
          var a,
            l = t.charAt(i);
          "/" === l
            ? (o += 8)
            : is_digit(l)
            ? (o += parseInt(l, 10))
            : ((a = l < "a" ? WHITE : BLACK), p({ type: l.toLowerCase(), color: a }, algebraic(o)), o++);
        }
        return (
          (v = n[1]),
          -1 < n[2].indexOf("K") && (R.w |= BITS.KSIDE_CASTLE),
          -1 < n[2].indexOf("Q") && (R.w |= BITS.QSIDE_CASTLE),
          -1 < n[2].indexOf("k") && (R.b |= BITS.KSIDE_CASTLE),
          -1 < n[2].indexOf("q") && (R.b |= BITS.QSIDE_CASTLE),
          (d = "-" === n[3] ? EMPTY : SQUARE_MAP[n[3]]),
          (f = parseInt(n[4], 10)),
          (A = parseInt(n[5], 10)),
          s(O()),
          !0
        );
      }
      function c(e) {
        var r = "No errors.",
          n = "FEN string must contain six space-delimited fields.",
          t = "6th field (move number) must be a positive integer.",
          o = "5th field (half move counter) must be a non-negative integer.",
          i = "4th field (en-passant square) is invalid.",
          a = "3rd field (castling availability) is invalid.",
          l = "2nd field (side to move) is invalid.",
          f = "1st field (piece positions) does not contain 8 '/'-delimited rows.",
          u = "1st field (piece positions) is invalid [consecutive numbers].",
          c = "1st field (piece positions) is invalid [invalid piece].",
          s = "1st field (piece positions) is invalid [row too large].",
          p = "Illegal en-passant square",
          e = e.split(/\s+/);
        if (6 !== e.length) return { valid: !1, error_number: 1, error: n };
        if (isNaN(parseInt(e[5])) || parseInt(e[5], 10) <= 0) return { valid: !1, error_number: 2, error: t };
        if (isNaN(parseInt(e[4])) || parseInt(e[4], 10) < 0) return { valid: !1, error_number: 3, error: o };
        if (!/^(-|[abcdefgh][36])$/.test(e[3])) return { valid: !1, error_number: 4, error: i };
        if (!/^(KQ?k?q?|Qk?q?|kq?|q|-)$/.test(e[2])) return { valid: !1, error_number: 5, error: a };
        if (!/^(w|b)$/.test(e[1])) return { valid: !1, error_number: 6, error: l };
        var S = e[0].split("/");
        if (8 !== S.length) return { valid: !1, error_number: 7, error: f };
        for (var A = 0; A < S.length; A++) {
          for (var E = 0, g = !1, _ = 0; _ < S[A].length; _++)
            if (isNaN(S[A][_])) {
              if (!/^[prnbqkPRNBQK]$/.test(S[A][_])) return { valid: !1, error_number: 9, error: c };
              (E += 1), (g = !1);
            } else {
              if (g) return { valid: !1, error_number: 8, error: u };
              (E += parseInt(S[A][_], 10)), (g = !0);
            }
          if (8 !== E) return { valid: !1, error_number: 10, error: s };
        }
        return ("3" == e[3][1] && "w" == e[1]) || ("6" == e[3][1] && "b" == e[1])
          ? { valid: !1, error_number: 11, error: p }
          : { valid: !0, error_number: 0, error: r };
      }
      function O() {
        for (var e, r, n = 0, t = "", o = SQUARE_MAP.a8; o <= SQUARE_MAP.h1; o++)
          null == I[o] ? n++ : (0 < n && ((t += n), (n = 0)), (e = I[o].color), (r = I[o].type), (t += e === WHITE ? r.toUpperCase() : r.toLowerCase())),
            (o + 1) & 136 && (0 < n && (t += n), o !== SQUARE_MAP.h1 && (t += "/"), (n = 0), (o += 8));
        var i = "",
          a =
            (R[WHITE] & BITS.KSIDE_CASTLE && (i += "K"),
            R[WHITE] & BITS.QSIDE_CASTLE && (i += "Q"),
            R[BLACK] & BITS.KSIDE_CASTLE && (i += "k"),
            R[BLACK] & BITS.QSIDE_CASTLE && (i += "q"),
            (i = i || "-"),
            d === EMPTY ? "-" : algebraic(d));
        return [t, v, i, a, f, A].join(" ");
      }
      function N(e) {
        for (var r = 0; r < e.length; r += 2) "string" == typeof e[r] && "string" == typeof e[r + 1] && (T[e[r]] = e[r + 1]);
        return T;
      }
      function s(e) {
        0 < E.length || (e !== DEFAULT_POSITION ? ((T.SetUp = "1"), (T.FEN = e)) : (delete T.SetUp, delete T.FEN));
      }
      function n(e) {
        e = I[SQUARE_MAP[e]];
        return e ? { type: e.type, color: e.color } : null;
      }
      function p(e, r) {
        if (!("type" in e && "color" in e)) return !1;
        if (-1 === SYMBOLS.indexOf(e.type.toLowerCase())) return !1;
        if (!(r in SQUARE_MAP)) return !1;
        r = SQUARE_MAP[r];
        return (
          (e.type != KING || P[e.color] == EMPTY || P[e.color] == r) &&
          ((I[r] = { type: e.type, color: e.color }), e.type === KING && (P[e.color] = r), s(O()), !0)
        );
      }
      function C(e, r, n, t, o) {
        r = { color: v, from: r, to: n, flags: t, piece: e[r].type };
        return o && ((r.flags |= BITS.PROMOTION), (r.promotion = o)), e[n] ? (r.captured = e[n].type) : t & BITS.EP_CAPTURE && (r.captured = PAWN), r;
      }
      function g(e) {
        function r(e, r, n, t, o) {
          if (e[n].type !== PAWN || (rank(t) !== RANK_8 && rank(t) !== RANK_1)) r.push(C(e, n, t, o));
          else for (var i = [QUEEN, ROOK, BISHOP, KNIGHT], a = 0, l = i.length; a < l; a++) r.push(C(e, n, t, o, i[a]));
        }
        var n = [],
          t = v,
          o = swap_color(t),
          i = { b: RANK_7, w: RANK_2 },
          a = SQUARE_MAP.a8,
          l = SQUARE_MAP.h1,
          f = !1,
          u = !(void 0 !== e && "legal" in e) || e.legal,
          c = !(void 0 !== e && "piece" in e && "string" == typeof e.piece) || e.piece.toLowerCase();
        if (void 0 !== e && "square" in e) {
          if (!(e.square in SQUARE_MAP)) return [];
          (a = l = SQUARE_MAP[e.square]), (f = !0);
        }
        for (var s, p, S = a; S <= l; S++)
          if (136 & S) S += 7;
          else {
            var A = I[S];
            if (null != A && A.color === t)
              if (A.type !== PAWN || (!0 !== c && c !== PAWN)) {
                if (!0 === c || c === A.type)
                  for (var E = 0, g = PIECE_OFFSETS[A.type].length; E < g; E++)
                    for (var _ = PIECE_OFFSETS[A.type][E], T = S; ; ) {
                      if (136 & (T += _)) break;
                      if (null != I[T]) {
                        if (I[T].color === t) break;
                        r(I, n, S, T, BITS.CAPTURE);
                        break;
                      }
                      if ((r(I, n, S, T, BITS.NORMAL), "n" === A.type || "k" === A.type)) break;
                    }
              } else {
                var T = S + PAWN_OFFSETS[t][0];
                for (
                  null == I[T] && (r(I, n, S, T, BITS.NORMAL), (T = S + PAWN_OFFSETS[t][1]), i[t] === rank(S) && null == I[T] && r(I, n, S, T, BITS.BIG_PAWN)),
                    E = 2;
                  E < 4;
                  E++
                )
                  136 & (T = S + PAWN_OFFSETS[t][E]) ||
                    (null != I[T] && I[T].color === o ? r(I, n, S, T, BITS.CAPTURE) : T === d && r(I, n, S, d, BITS.EP_CAPTURE));
              }
          }
        if (
          ((!0 !== c && c !== KING) ||
            (f && l !== P[t]) ||
            (R[t] & BITS.KSIDE_CASTLE &&
              ((p = (s = P[t]) + 2), null != I[s + 1] || null != I[p] || B(o, P[t]) || B(o, s + 1) || B(o, p) || r(I, n, P[t], p, BITS.KSIDE_CASTLE)),
            R[t] & BITS.QSIDE_CASTLE &&
              ((p = (s = P[t]) - 2),
              null != I[s - 1] || null != I[s - 2] || null != I[s - 3] || B(o, P[t]) || B(o, s - 1) || B(o, p) || r(I, n, P[t], p, BITS.QSIDE_CASTLE))),
          !u)
        )
          return n;
        for (var h = [], S = 0, g = n.length; S < g; S++) L(n[S]), K(t) || h.push(n[S]), y();
        return h;
      }
      function _(e, r) {
        var n = "";
        return (
          e.flags & BITS.KSIDE_CASTLE
            ? (n = "O-O")
            : e.flags & BITS.QSIDE_CASTLE
            ? (n = "O-O-O")
            : (e.piece !== PAWN && ((r = get_disambiguator(e, r)), (n += e.piece.toUpperCase() + r)),
              e.flags & (BITS.CAPTURE | BITS.EP_CAPTURE) && (e.piece === PAWN && (n += algebraic(e.from)[0]), (n += "x")),
              (n += algebraic(e.to)),
              e.flags & BITS.PROMOTION && (n += "=" + e.promotion.toUpperCase())),
          L(e),
          t() && (o() ? (n += "#") : (n += "+")),
          y(),
          n
        );
      }
      function B(e, r) {
        for (var n = SQUARE_MAP.a8; n <= SQUARE_MAP.h1; n++)
          if (136 & n) n += 7;
          else if (null != I[n] && I[n].color === e) {
            var t = I[n],
              o = n - r,
              i = 119 + o;
            if (ATTACKS[i] & (1 << SHIFTS[t.type]))
              if (t.type === PAWN) {
                if (0 < o) {
                  if (t.color === WHITE) return !0;
                } else if (t.color === BLACK) return !0;
              } else {
                if ("n" === t.type || "k" === t.type) return !0;
                for (var a = RAYS[i], l = n + a, f = !1; l !== r; ) {
                  if (null != I[l]) {
                    f = !0;
                    break;
                  }
                  l += a;
                }
                if (!f) return !0;
              }
          }
        return !1;
      }
      function K(e) {
        return B(swap_color(e), P[e]);
      }
      function t() {
        return K(v);
      }
      function o() {
        return t() && 0 === g().length;
      }
      function i() {
        return !t() && 0 === g().length;
      }
      function a() {
        for (var e = {}, r = [], n = 0, t = 0, o = SQUARE_MAP.a8; o <= SQUARE_MAP.h1; o++) {
          var i,
            t = (t + 1) % 2;
          136 & o ? (o += 7) : (i = I[o]) && ((e[i.type] = i.type in e ? e[i.type] + 1 : 1), i.type === BISHOP && r.push(t), n++);
        }
        if (2 === n) return !0;
        if (3 === n && (1 === e[BISHOP] || 1 === e[KNIGHT])) return !0;
        if (n === e[BISHOP] + 2) {
          for (var a = 0, l = r.length, o = 0; o < l; o++) a += r[o];
          if (0 === a || a === l) return !0;
        }
        return !1;
      }
      function l() {
        for (var e = [], r = {}, n = !1; ; ) {
          var t = y();
          if (!t) break;
          e.push(t);
        }
        for (;;) {
          var o = O().split(" ").slice(0, 4).join(" ");
          if (((r[o] = o in r ? r[o] + 1 : 1), 3 <= r[o] && (n = !0), !e.length)) break;
          L(e.pop());
        }
        return n;
      }
      function L(e) {
        var r,
          n,
          t = v,
          o = swap_color(t);
        if (
          (E.push({ move: e, kings: { b: P.b, w: P.w }, turn: v, castling: { b: R.b, w: R.w }, ep_square: d, half_moves: f, move_number: A }),
          (I[e.to] = I[e.from]),
          (I[e.from] = null),
          e.flags & BITS.EP_CAPTURE && (v === BLACK ? (I[e.to - 16] = null) : (I[e.to + 16] = null)),
          e.flags & BITS.PROMOTION && (I[e.to] = { type: e.promotion, color: t }),
          I[e.to].type === KING &&
            ((P[I[e.to].color] = e.to),
            e.flags & BITS.KSIDE_CASTLE
              ? ((r = e.to - 1), (n = e.to + 1), (I[r] = I[n]), (I[n] = null))
              : e.flags & BITS.QSIDE_CASTLE && ((r = e.to + 1), (n = e.to - 2), (I[r] = I[n]), (I[n] = null)),
            (R[t] = "")),
          R[t])
        )
          for (var i = 0, a = ROOKS[t].length; i < a; i++)
            if (e.from === ROOKS[t][i].square && R[t] & ROOKS[t][i].flag) {
              R[t] ^= ROOKS[t][i].flag;
              break;
            }
        if (R[o])
          for (i = 0, a = ROOKS[o].length; i < a; i++)
            if (e.to === ROOKS[o][i].square && R[o] & ROOKS[o][i].flag) {
              R[o] ^= ROOKS[o][i].flag;
              break;
            }
        (d = e.flags & BITS.BIG_PAWN ? ("b" === v ? e.to - 16 : e.to + 16) : EMPTY),
          e.piece === PAWN || e.flags & (BITS.CAPTURE | BITS.EP_CAPTURE) ? (f = 0) : f++,
          v === BLACK && A++,
          (v = swap_color(v));
      }
      function y() {
        var e = E.pop();
        if (null == e) return null;
        var r,
          n,
          t = e.move,
          e = ((P = e.kings), (v = e.turn), (R = e.castling), (d = e.ep_square), (f = e.half_moves), (A = e.move_number), v),
          o = swap_color(v);
        return (
          (I[t.from] = I[t.to]),
          (I[t.from].type = t.piece),
          (I[t.to] = null),
          t.flags & BITS.CAPTURE
            ? (I[t.to] = { type: t.captured, color: o })
            : t.flags & BITS.EP_CAPTURE && ((e = e === BLACK ? t.to - 16 : t.to + 16), (I[e] = { type: PAWN, color: o })),
          t.flags & (BITS.KSIDE_CASTLE | BITS.QSIDE_CASTLE) &&
            (t.flags & BITS.KSIDE_CASTLE ? ((r = t.to + 1), (n = t.to - 1)) : t.flags & BITS.QSIDE_CASTLE && ((r = t.to - 2), (n = t.to + 1)),
            (I[r] = I[n]),
            (I[n] = null)),
          t
        );
      }
      function U(e, r) {
        for (var n = stripped_san(e), t = 0; t < 2; t++) {
          if (t == PARSER_SLOPPY) {
            if (!r) return null;
            var o,
              i,
              a,
              l,
              f = !1,
              u = n.match(/([pnbrqkPNBRQK])?([a-h][1-8])x?-?([a-h][1-8])([qrbnQRBN])?/);
            (u = u || n.match(/([pnbrqkPNBRQK])?([a-h]?[1-8]?)x?-?([a-h][1-8])([qrbnQRBN])?/)) &&
              ((o = u[1]), (i = u[2]), (a = u[3]), (l = u[4]), 1 == i.length && (f = !0));
          }
          for (var c = infer_piece_type(n), s = g({ legal: !0, piece: o || c }), p = 0, S = s.length; p < S; p++)
            switch (t) {
              case PARSER_STRICT:
                if (n === stripped_san(_(s[p], s))) return s[p];
                break;
              case PARSER_SLOPPY:
                if (u) {
                  if (
                    !((o && o.toLowerCase() != s[p].piece) || SQUARE_MAP[i] != s[p].from || SQUARE_MAP[a] != s[p].to || (l && l.toLowerCase() != s[p].promotion))
                  )
                    return s[p];
                  if (f) {
                    var A = algebraic(s[p].from);
                    if (
                      !((o && o.toLowerCase() != s[p].piece) || SQUARE_MAP[a] != s[p].to || (i != A[0] && i != A[1]) || (l && l.toLowerCase() != s[p].promotion))
                    )
                      return s[p];
                  }
                }
            }
        }
        return null;
      }
      function S(e) {
        var r,
          n = clone(e),
          t = ((n.san = _(n, g({ legal: !0 }))), (n.to = algebraic(n.to)), (n.from = algebraic(n.from)), "");
        for (r in BITS) BITS[r] & n.flags && (t += FLAGS[r]);
        return (n.flags = t), n;
      }
      return (
        m(void 0 === e ? DEFAULT_POSITION : e),
        {
          load: function (e) {
            return m(e);
          },
          reset: b,
          moves: function (e) {
            for (var r = g(e), n = [], t = 0, o = r.length; t < o; t++)
              void 0 !== e && "verbose" in e && e.verbose ? n.push(S(r[t])) : n.push(_(r[t], g({ legal: !0 })));
            return n;
          },
          in_check: t,
          in_checkmate: o,
          in_stalemate: i,
          in_draw: function () {
            return 100 <= f || i() || a() || l();
          },
          insufficient_material: a,
          in_threefold_repetition: l,
          game_over: function () {
            return 100 <= f || o() || i() || a() || l();
          },
          validate_fen: c,
          fen: O,
          board: function () {
            for (var e = [], r = [], n = SQUARE_MAP.a8; n <= SQUARE_MAP.h1; n++)
              null == I[n] ? r.push(null) : r.push({ square: algebraic(n), type: I[n].type, color: I[n].color }),
                (n + 1) & 136 && (e.push(r), (r = []), (n += 8));
            return e;
          },
          pgn: function (e) {
            var t = "object" == typeof e && "string" == typeof e.newline_char ? e.newline_char : "\n",
              o = "object" == typeof e && "number" == typeof e.max_width ? e.max_width : 0,
              i = [],
              r = !1;
            for (S in T) i.push("[" + S + ' "' + T[S] + '"]' + t), (r = !0);
            r && E.length && i.push(t);
            function n(e) {
              var r = h[O()];
              return (e = void 0 !== r ? e + (0 < e.length ? " " : "") + `{${r}}` : e);
            }
            for (var a = []; 0 < E.length; ) a.push(y());
            var l = [],
              f = "";
            for (0 === a.length && l.push(n("")); 0 < a.length; ) {
              f = n(f);
              var u,
                c = a.pop();
              E.length || "b" !== c.color ? "w" === c.color && (f.length && l.push(f), (f = A + ".")) : ((u = A + ". ..."), (f = f ? f + " " + u : u)),
                (f = f + " " + _(c, g({ legal: !0 }))),
                L(c);
            }
            if ((f.length && l.push(n(f)), void 0 !== T.Result && l.push(T.Result), 0 === o)) return i.join("") + l.join(" ");
            for (
              var s = function () {
                  return 0 < i.length && " " === i[i.length - 1] && (i.pop(), !0);
                },
                p = 0,
                S = 0;
              S < l.length;
              S++
            )
              p + l[S].length > o && l[S].includes("{")
                ? (p = (function (e, r) {
                    for (var n of r.split(" "))
                      if (n) {
                        if (e + n.length > o) {
                          for (; s(); ) e--;
                          i.push(t), (e = 0);
                        }
                        i.push(n), (e += n.length), i.push(" "), e++;
                      }
                    return s() && e--, e;
                  })(p, l[S]))
                : (p + l[S].length > o && 0 !== S ? (" " === i[i.length - 1] && i.pop(), i.push(t), (p = 0)) : 0 !== S && (i.push(" "), p++),
                  i.push(l[S]),
                  (p += l[S].length));
            return i.join("");
          },
          load_pgn: function (e, r) {
            var n = void 0 !== r && "sloppy" in r && r.sloppy;
            function l(e) {
              return e.replace(/\\/g, "\\");
            }
            e = e.trim();
            var t,
              o = "object" == typeof r && "string" == typeof r.newline_char ? r.newline_char : "\r?\n",
              i = new RegExp("^(\\[((?:" + l(o) + ")|.)*\\])(?:\\s*" + l(o) + "){2}"),
              i = i.test(e) ? i.exec(e)[1] : "",
              a =
                (b(),
                (function (e, r) {
                  for (
                    var r = "object" == typeof r && "string" == typeof r.newline_char ? r.newline_char : "\r?\n", n = {}, t = e.split(new RegExp(l(r))), o = 0;
                    o < t.length;
                    o++
                  ) {
                    var i = /^\s*\[([A-Za-z]+)\s*"(.*)"\s*\]\s*$/,
                      a = t[o].replace(i, "$1"),
                      i = t[o].replace(i, "$2");
                    0 < trim(a).length && (n[a] = i);
                  }
                  return n;
                })(i, r)),
              f = "";
            for (t in a) "fen" === t.toLowerCase() && (f = a[t]), N([t, a[t]]);
            if (n) {
              if (f && !m(f, !0)) return !1;
            } else if ("1" === a.SetUp && !("FEN" in a && m(a.FEN, !0))) return !1;
            function u(e) {
              return (e = e.replace(new RegExp(l(o), "g"), " ")), `{${c(e.slice(1, e.length - 1))}}`;
            }
            for (
              var c = function (e) {
                  return Array.from(e)
                    .map(function (e) {
                      return e.charCodeAt(0) < 128 ? e.charCodeAt(0).toString(16) : encodeURIComponent(e).replace(/\%/g, "").toLowerCase();
                    })
                    .join("");
                },
                s = function (e) {
                  return 0 == e.length ? "" : decodeURIComponent("%" + e.match(/.{1,2}/g).join("%"));
                },
                p = e
                  .replace(i, "")
                  .replace(new RegExp(`({[^}]*})+?|;([^${l(o)}]*)`, "g"), function (e, r, n) {
                    return void 0 !== r ? u(r) : " " + u(`{${n.slice(1)}}`);
                  })
                  .replace(new RegExp(l(o), "g"), " "),
                S = /(\([^\(\)]+\))+?/g;
              S.test(p);

            )
              p = p.replace(S, "");
            for (
              var A = (A = trim((p = (p = (p = p.replace(/\d+\.(\.\.)?/g, "")).replace(/\.\.\./g, "")).replace(/\$\d+/g, ""))).split(new RegExp(/\s+/)))
                  .join(",")
                  .replace(/,,+/g, ",")
                  .split(","),
                E = "",
                g = 0;
              g < A.length;
              g++
            ) {
              var _ = (function (e) {
                if (e.startsWith("{") && e.endsWith("}")) return s(e.slice(1, e.length - 1));
              })(A[g]);
              if (void 0 !== _) h[O()] = _;
              else if (null == (_ = U(A[g], n))) {
                if (!(-1 < TERMINATION_MARKERS.indexOf(A[g]))) return !1;
                E = A[g];
              } else (E = ""), L(_);
            }
            return E && Object.keys(T).length && !T.Result && N(["Result", E]), !0;
          },
          header: function () {
            return N(arguments);
          },
          turn: function () {
            return v;
          },
          move: function (e, r) {
            var r = void 0 !== r && "sloppy" in r && r.sloppy,
              n = null;
            if ("string" == typeof e) n = U(e, r);
            else if ("object" == typeof e)
              for (var t = g(), o = 0, i = t.length; o < i; o++)
                if (!(e.from !== algebraic(t[o].from) || e.to !== algebraic(t[o].to) || ("promotion" in t[o] && e.promotion !== t[o].promotion))) {
                  n = t[o];
                  break;
                }
            if (!n) return null;
            r = S(n);
            return L(n), r;
          },
          undo: function () {
            var e = y();
            return e ? S(e) : null;
          },
          clear: function () {
            return u();
          },
          put: p,
          get: n,
          ascii() {
            for (var e, r = "   +------------------------+\n", n = SQUARE_MAP.a8; n <= SQUARE_MAP.h1; n++)
              0 === file(n) && (r += " " + "87654321"[rank(n)] + " |"),
                null == I[n] ? (r += " . ") : ((e = I[n].type), (r += " " + (I[n].color === WHITE ? e.toUpperCase() : e.toLowerCase()) + " ")),
                (n + 1) & 136 && ((r += "|\n"), (n += 8));
            return (r = r + "   +------------------------+\n" + "     a  b  c  d  e  f  g  h");
          },
          remove: function (e) {
            return (r = n((e = e))), (I[SQUARE_MAP[e]] = null), r && r.type === KING && (P[r.color] = EMPTY), s(O()), r;
            var r;
          },
          perft: function e(r) {
            for (var n = g({ legal: !1 }), t = 0, o = v, i = 0, a = n.length; i < a; i++) L(n[i]), K(o) || (0 < r - 1 ? (t += e(r - 1)) : t++), y();
            return t;
          },
          square_color: function (e) {
            return e in SQUARE_MAP ? ((rank((e = SQUARE_MAP[e])) + file(e)) % 2 == 0 ? "light" : "dark") : null;
          },
          history: function (e) {
            for (var r = [], n = [], t = void 0 !== e && ("verbose" in e) && e.verbose; 0 < E.length; ) r.push(y());
            for (; 0 < r.length; ) {
              var o = r.pop();
              t ? n.push(S(o)) : n.push(_(o, g({ legal: !0 }))), L(o);
            }
            return n;
          },
          get_comment: function () {
            return h[O()];
          },
          set_comment: function (e) {
            h[O()] = e.replace("{", "[").replace("}", "]");
          },
          delete_comment: function () {
            var e = h[O()];
            return delete h[O()], e;
          },
          get_comments: function () {
            return (
              r(),
              Object.keys(h).map(function (e) {
                return { fen: e, comment: h[e] };
              })
            );
          },
          delete_comments: function () {
            return (
              r(),
              Object.keys(h).map(function (e) {
                var r = h[e];
                return delete h[e], { fen: e, comment: r };
              })
            );
          },
        }
      );
    };

  let movesMade = 0;
  let bot = "chessgpt";

  const container = document.getElementById("container");
  const startAnimation = document.getElementById("startAnimation");
  const startContainer = document.getElementById("startContainer");
  const chessBoard = document.getElementById("chessBoard");
  const myBoard = document.getElementById("myBoard");
  const chatGptLogo = document.getElementById("chatGptLogo");
  const redLogo = document.getElementById("redLogo");

  // Get the button and audio elements by their IDs
  const audioElement = document.getElementById("audio-element");
  document.getElementById("audio-element-metal");

  const blockSize = window.innerWidth < 700 ? 20 : 55;
  const animationSpeed = 7.5;
  let blocks = [];

  function createBlock(x, y) {
    const block = document.createElement("div");
    block.classList.add("block");
    block.style.left = `${x * blockSize}px`;
    block.style.top = `${y * blockSize}px`;
    container.appendChild(block);
    return block;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function animate() {
    let x = 0;
    let y = 0;
    let dx = 1;
    let dy = 0;

    const screenWidth = Math.ceil(window.innerWidth / blockSize);
    const screenHeight = Math.ceil(window.innerHeight / blockSize);

    for (let i = 0; i < screenWidth * screenHeight; i++) {
      blocks.push(createBlock(x, y));

      if (
        x + dx >= screenWidth ||
        x + dx < 0 ||
        y + dy >= screenHeight ||
        y + dy < 0 ||
        blocks.some((block) => block.style.left === `${(x + dx) * blockSize}px` && block.style.top === `${(y + dy) * blockSize}px`)
      ) {
        const temp = dx;
        dx = -dy;
        dy = temp;
      }

      x += dx;
      y += dy;

      await sleep(animationSpeed);
    }
  }

  startAnimation.addEventListener("click", async () => {
    // Check if volume message has been shown or not
    if (localStorage.getItem("volumeMessageShown") !== "true") {
      // Show the volume message
      const volumeMessage = document.getElementById("volumeMessage");
      const volumeMessageModal = new bootstrap.Modal(volumeMessage);
      volumeMessageModal.show();

      // Set the volume message shown to true
      localStorage.setItem("volumeMessageShown", "true");
      return;
    }

    const totalAnimationDuration = 900; // 10 times * 150ms

    // Hide/Unhide button every 100ms for 10 times
    for (let i = 0; i < 10; i++) {
      setTimeout(() => {
        startAnimation.classList.toggle("d-none");
      }, i * 150);
    }

    // Play the audio when the button is clicked
    audioElement.play();

    // Wrap the rest of the code in a setTimeout with the total animation duration
    setTimeout(async () => {
      startAnimation.classList.add("d-none");
      startContainer.classList.add("d-none");
      container.classList.remove("d-none");

      await animate();

      // Clear the #container element, remove it, show the chess board
      container.innerHTML = "";
      container.classList.add("d-none");
      chessBoard.classList.remove("hidden");
      chessBoard.classList.remove("d-none");
      chessBoard.classList.remove("visible");

      gentlyLowerVolume(audioElement, 1.0, 0.1, 10000);

      // Show the ChatGPT logo
      setTimeout(() => {
        chatGptLogo.classList.remove("d-none");
        redLogo.classList.remove("d-none");

        // Slide the logo from left to right after it's shown
        setTimeout(() => {
          chatGptLogo.style.left = "80%";
          redLogo.style.left = "10%";
        }, 400); // You can adjust this delay according to your needs

        // Slowly reveal the chessboard
        setTimeout(() => {
          myBoard.classList.add("visible");
          myBoard.classList.remove("hidden");
        }, 2200); // You can adjust this delay according to your needs
      }, 50);
    }, totalAnimationDuration);
  });

  function gentlyLowerVolume(audioElement, startVolume, endVolume, duration) {
    const stepTime = 50; // in milliseconds
    const volumeChangePerStep = ((startVolume - endVolume) * stepTime) / duration;

    // Set the initial volume
    audioElement.volume = startVolume;

    // Start gradually lowering the volume
    const intervalId = setInterval(() => {
      // Decrease the volume by volumeChangePerStep
      audioElement.volume -= volumeChangePerStep;

      // Clamp the volume between 0 and 1
      audioElement.volume = Math.max(Math.min(audioElement.volume, 1), 0);

      // Stop lowering the volume when the target volume is reached
      if (audioElement.volume <= endVolume) {
        audioElement.volume = endVolume;
        clearInterval(intervalId);
      }
    }, stepTime);
  }

  function gentlyIncreaseVolume(audioElement, startVolume, endVolume, duration) {
    const stepTime = 50; // in milliseconds
    const volumeChangePerStep = ((endVolume - startVolume) * stepTime) / duration;

    // Set the initial volume
    audioElement.volume = startVolume;

    // Start gradually increasing the volume
    const intervalId = setInterval(() => {
      // Increase the volume by volumeChangePerStep
      audioElement.volume += volumeChangePerStep;

      // Clamp the volume between 0 and 1
      audioElement.volume = Math.max(Math.min(audioElement.volume, 1), 0);

      // Stop increasing the volume when the target volume is reached
      if (audioElement.volume >= endVolume) {
        audioElement.volume = endVolume;
        clearInterval(intervalId);
      }
    }, stepTime);
  }

  function switchToMetalTrack() {
    const audioElementMetal = document.getElementById("audio-element-metal");
    setTimeout(() => {
      gentlyLowerVolume(audioElement, 0.1, 0.0, 5000);
      audioElementMetal.volume = 0.0;
      audioElementMetal.play();
      gentlyIncreaseVolume(audioElementMetal, 0.0, 1.0, 10000);

      setTimeout(() => {
        audioElement.volume = 0.0;
      }, 1000);
    }, 2000);
  }

  try {
    console.log("Chessboard.js version:", Chessboard.version);

    var board = null;
    var game = new Chess();
    var $status = $("#status");
    var $fen = $("#fen");
    var $pgn = $("#pgn");

    function onDragStart(source, piece, position, orientation) {
      console.log("onDragStart called");
      // do not pick up pieces if the game is over
      if (game.game_over()) return false;

      // only pick up pieces for the side to move
      if ((game.turn() === "w" && piece.search(/^b/) !== -1) || (game.turn() === "b" && piece.search(/^w/) !== -1)) {
        return false;
      }
    }

    async function onDrop(source, target) {
      // see if the move is legal
      var move = game.move({
        from: source,
        to: target,
        promotion: "q", // NOTE: always promote to a queen for example simplicity
      });

      // illegal move
      if (move === null) return "snapback";

      // Save move to LocalStorage
      var an = JSON.parse(localStorage.getItem("moves")) || [];
      an.push(move.san);
      localStorage.setItem("moves", JSON.stringify(an));

      // update the board with the user's move
      board.position(game.fen());

      movesMade++;
      console.log("movesMade:", movesMade);

      if (movesMade === 6) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        await startEvolution();
        bot = "stockfish";
      }

      // make an HTTP request to the server to get the AI's move
      $.get("/ai-move", { fen: game.fen(), bot, an }, function (data) {
        var move = game.move(data);
        if (move === null) {
          console.error("Received invalid move from server:", data);
          alert("Something went wrong, but it doesn't count as a win for you, sorry");
          return window.location.reload();
        }

        var an = JSON.parse(localStorage.getItem("moves")) || [];
        an.push(data);
        localStorage.setItem("moves", JSON.stringify(an));

        // update the board with the AI's move
        board.position(game.fen());

        // update the game status
        updateStatus();
      });
    }

    function onSnapEnd() {
      console.log("onSnapEnd called");
      board.position(game.fen());
    }

    function updateStatus() {
      var status = "";
      var stop = false;
      var whoWon = "";

      var moveColor = "White";
      if (game.turn() === "b") {
        moveColor = "Black";
      }

      // checkmate?
      if (game.in_checkmate()) {
        status = "Game over, " + moveColor + " is in checkmate.";
        if (moveColor === "Black") {
          whoWon = "w";
        } else {
          whoWon = "b";
        }
        stop = true;
      }

      // draw?
      else if (game.in_draw()) {
        status = "Game over, drawn position";
        stop = true;
      }

      // game still on
      else {
        status = moveColor + " to move";

        // check?
        if (game.in_check()) {
          status += ", " + moveColor + " is in check";
        }
      }

      $status.html(status);
      $fen.html(game.fen());
      $pgn.html(game.pgn());

      if (stop) {
        alert(status);
        // board.destroy();
        updateHighScore(whoWon);
      }
    }

    var config = {
      draggable: true,
      position: "start",
      onDragStart: onDragStart,
      onDrop: onDrop,
      onSnapEnd: onSnapEnd,
    };

    board = Chessboard("myBoard", config);

    updateStatus();
  } catch (e) {
    console.log(e);
  }

  async function startEvolution() {
    // Get modal
    var modal = document.getElementById("evolutionModal");
    // show modal with bootstrap 5 js
    const myModal = new bootstrap.Modal(modal);
    myModal.show();

    // Get image
    const evolutionImage = document.getElementById("evolutionImage");

    // Back and forth animation
    await new Promise((resolve) => setTimeout(resolve, 2000));
    evolutionImage.src = "/stockfish.png";
    await new Promise((resolve) => setTimeout(resolve, 250));
    evolutionImage.src = "/chatgpt.png";
    await new Promise((resolve) => setTimeout(resolve, 1000));
    evolutionImage.src = "/stockfish.png";
    await new Promise((resolve) => setTimeout(resolve, 250));
    evolutionImage.src = "/chatgpt.png";
    switchToMetalTrack();
    await new Promise((resolve) => setTimeout(resolve, 750));
    evolutionImage.src = "/stockfish.png";
    await new Promise((resolve) => setTimeout(resolve, 500));
    evolutionImage.src = "/chatgpt.png";
    await new Promise((resolve) => setTimeout(resolve, 250));
    evolutionImage.src = "/stockfish.png";

    await new Promise((resolve) => setTimeout(resolve, 500));
    const evolvedStart = document.getElementById("evolvedStart");
    const evolvedFinal = document.getElementById("evolvedFinal");
    evolvedStart.classList.add("d-none");
    evolvedFinal.classList.remove("d-none");

    await new Promise((resolve) => setTimeout(resolve, 500));
    const elo = document.getElementById("elo");
    elo.innerText = "ELO: 3607";
    elo.classList.remove("bg-dark");
    elo.classList.add("bg-danger");
    elo.classList.add("fs-1");
    elo.classList.remove("p-2");
    elo.classList.add("p-3");

    await new Promise((resolve) => setTimeout(resolve, 4000));
    chatGptLogo.src = "/stockfish.png";
    myModal.hide();
  }

  function adjustLogoHeight() {
    if (window.innerWidth <= 767) {
      redLogo.style.top = "90%";
      chatGptLogo.style.top = "2%";
      // redLogo.style.left = "10%";
    } else {
      redLogo.style.top = "75%";
      chatGptLogo.style.top = "5%";
      // redLogo.style.left = "";
    }
  }

  // Call the function on page load and on window resize
  window.addEventListener("load", adjustLogoHeight);
  window.addEventListener("resize", adjustLogoHeight);

  async function updateHighScore(whoWhon = "b") {
    // Wait for a second with a promise resolve
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Get the chatGptScore from LocalStorage
    let chessGptScoreValue = localStorage.getItem("chessGptScoreValue") || 0;
    let yourScoreValue = localStorage.getItem("yourScore") || 0;

    if (whoWhon === "b") chessGptScoreValue++;
    if (whoWhon === "w") yourScoreValue++;
    const chessGptScore = document.getElementById("chessGptScore");
    const yourScore = document.getElementById("yourScore");
    chessGptScore.innerText = chessGptScoreValue;
    yourScore.innerText = yourScoreValue;

    // Set the chatGptScore in LocalStorage
    localStorage.setItem("chessGptScoreValue", chessGptScoreValue);
    localStorage.setItem("yourScore", yourScoreValue);

    // Show scoreboard modal
    const scoreBoard = document.getElementById("scoreBoard");
    const myModal = new bootstrap.Modal(scoreBoard);
    myModal.show();
  }

  const resetBtn = document.getElementById("resetBtn");
  resetBtn.addEventListener("click", () => {
    // Reload page
    window.location.reload();
  });

})();
