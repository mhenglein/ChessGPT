import { Chess } from "chess";

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

  function onDrop(source, target) {
    console.log("onDrop called");
    alert("This never shows?");
    // see if the move is legal
    var move = game.move({
      from: source,
      to: target,
      promotion: "q", // NOTE: always promote to a queen for example simplicity
    });

    alert("This never shows?");

    // illegal move
    if (move === null) return "snapback";

    // update the board with the user's move
    board.position(game.fen());

    // make an HTTP request to the server to get the AI's move
    console.log("This never shows?");
    $.get("/ai-move", { fen: game.fen() }, function (data) {
      var move = game.move(data);
      if (move === null) {
        console.error("Received invalid move from server:", data);
        return;
      }

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

    var moveColor = "White";
    if (game.turn() === "b") {
      moveColor = "Black";
    }

    // checkmate?
    if (game.in_checkmate()) {
      status = "Game over, " + moveColor + " is in checkmate.";
    }

    // draw?
    else if (game.in_draw()) {
      status = "Game over, drawn position";
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
