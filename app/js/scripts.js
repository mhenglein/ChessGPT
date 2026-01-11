// Import Chess from node_modules (bundled by esbuild)
import { Chess } from "chess.js";

let movesMade = 0;
let bot = "chessgpt";
let waitingForAI = false; // Lock to prevent race condition / color-switching bug

// Safe localStorage helpers with error handling
function safeGetItem(key, defaultValue = null) {
  try {
    const item = localStorage.getItem(key);
    return item !== null ? item : defaultValue;
  } catch (e) {
    console.warn("localStorage read error:", e);
    return defaultValue;
  }
}

function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    console.warn("localStorage write error:", e);
    return false;
  }
}

function safeGetJSON(key, defaultValue = []) {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (e) {
    console.warn("localStorage JSON parse error:", e);
    return defaultValue;
  }
}

function safeSetJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn("localStorage JSON write error:", e);
    return false;
  }
}

const container = document.getElementById("container");
const startAnimation = document.getElementById("startAnimation");
const startContainer = document.getElementById("startContainer");
const chessBoard = document.getElementById("chessBoard");
const myBoard = document.getElementById("myBoard");
const chatGptLogo = document.getElementById("chatGptLogo");
const redLogo = document.getElementById("redLogo");

// Get the button and audio elements by their IDs
const audioElement = document.getElementById("audio-element");
const audioElementMetal = document.getElementById("audio-element-metal");

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
  if (safeGetItem("volumeMessageShown") !== "true") {
    // Show the volume message
    const volumeMessage = document.getElementById("volumeMessage");
    const volumeMessageModal = new bootstrap.Modal(volumeMessage);
    volumeMessageModal.show();

    // Set the volume message shown to true
    safeSetItem("volumeMessageShown", "true");
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

// Unified volume fade function (DRY - replaces gentlyLowerVolume & gentlyIncreaseVolume)
function fadeVolume(audioElement, startVolume, endVolume, duration) {
  const stepTime = 50; // in milliseconds
  const totalSteps = duration / stepTime;
  const volumeChangePerStep = (endVolume - startVolume) / totalSteps;
  const isIncreasing = endVolume > startVolume;

  // Set the initial volume
  audioElement.volume = startVolume;

  // Start gradually changing the volume
  const intervalId = setInterval(() => {
    audioElement.volume += volumeChangePerStep;

    // Clamp the volume between 0 and 1
    audioElement.volume = Math.max(0, Math.min(1, audioElement.volume));

    // Stop when target volume is reached
    const reachedTarget = isIncreasing
      ? audioElement.volume >= endVolume
      : audioElement.volume <= endVolume;

    if (reachedTarget) {
      audioElement.volume = endVolume;
      clearInterval(intervalId);
    }
  }, stepTime);
}

// Backwards compatibility aliases
const gentlyLowerVolume = fadeVolume;
const gentlyIncreaseVolume = fadeVolume;

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
    // do not pick up pieces if the game is over
    if (game.isGameOver()) return false;

    // Block if waiting for AI response (prevents race condition)
    if (waitingForAI) return false;

    // only pick up pieces for White (player's side)
    if (piece.search(/^b/) !== -1) {
      return false;
    }

    // only pick up pieces when it's white's turn
    if (game.turn() !== "w") {
      return false;
    }
  }

  async function onDrop(source, target) {
    // Prevent moves while waiting for AI (race condition fix)
    if (waitingForAI) return "snapback";

    // Only allow moves when it's white's turn (color-switching bug fix)
    if (game.turn() !== "w") return "snapback";

    // see if the move is legal
    var move = game.move({
      from: source,
      to: target,
      promotion: "q", // NOTE: always promote to a queen for example simplicity
    });

    // illegal move
    if (move === null) return "snapback";

    // Save move to LocalStorage
    var an = safeGetJSON("moves", []);
    an.push(move.san);
    safeSetJSON("moves", an);

    // update the board with the user's move
    board.position(game.fen());

    movesMade++;

    if (movesMade === 6) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await startEvolution();
      bot = "stockfish";
    }

    // Lock before making AI request
    waitingForAI = true;

    // make an HTTP request to the server to get the AI's move
    $.get("/ai-move", { fen: game.fen(), bot, an: JSON.stringify(an) })
      .done(function (data) {
        // Check if response is a game-over message or error
        if (typeof data === "object") {
          if (data.error) {
            console.error("Server error:", data.error);
            waitingForAI = false;
            return;
          }
          if (data.msg) {
            // Game over message from server
            console.log("Game state:", data.msg);
            updateStatus();
            waitingForAI = false;
            return;
          }
        }

        var move = game.move(data);
        if (move === null) {
          console.error("Received invalid move from server:", data);
          waitingForAI = false;
          // Don't reload - just unlock and let user try again
          return;
        }

        var an = safeGetJSON("moves", []);
        an.push(data);
        safeSetJSON("moves", an);

        // update the board with the AI's move
        board.position(game.fen());

        // update the game status
        updateStatus();

        // Unlock after AI move is complete
        waitingForAI = false;
      })
      .fail(function (jqXHR) {
        console.error("Server request failed:", jqXHR.status, jqXHR.responseJSON);
        waitingForAI = false;
      });
  }

  function onSnapEnd() {
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

    // checkmate? (updated to new chess.js API)
    if (game.isCheckmate()) {
      status = "Game over, " + moveColor + " is in checkmate.";
      if (moveColor === "Black") {
        whoWon = "w";
      } else {
        whoWon = "b";
      }
      stop = true;
    }

    // draw? (updated to new chess.js API)
    else if (game.isDraw()) {
      status = "Game over, drawn position";
      stop = true;
    }

    // game still on
    else {
      status = moveColor + " to move";

      // check? (updated to new chess.js API)
      if (game.isCheck()) {
        status += ", " + moveColor + " is in check";
      }
    }

    $status.html(status);
    $fen.html(game.fen());
    $pgn.html(game.pgn());

    if (stop) {
      alert(status);
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
  console.error("Chess initialization error:", e);
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
  } else {
    redLogo.style.top = "75%";
    chatGptLogo.style.top = "5%";
  }
}

// Call the function on page load and on window resize
window.addEventListener("load", adjustLogoHeight);
window.addEventListener("resize", adjustLogoHeight);

async function updateHighScore(whoWhon = "b") {
  // Wait for a second with a promise resolve
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Get the chatGptScore from LocalStorage (parse as int to avoid type coercion bugs)
  let chessGptScoreValue = parseInt(safeGetItem("chessGptScoreValue", "0"), 10) || 0;
  let yourScoreValue = parseInt(safeGetItem("yourScore", "0"), 10) || 0;

  if (whoWhon === "b") chessGptScoreValue++;
  if (whoWhon === "w") yourScoreValue++;
  const chessGptScore = document.getElementById("chessGptScore");
  const yourScore = document.getElementById("yourScore");
  chessGptScore.innerText = chessGptScoreValue;
  yourScore.innerText = yourScoreValue;

  // Set the chatGptScore in LocalStorage
  safeSetItem("chessGptScoreValue", chessGptScoreValue.toString());
  safeSetItem("yourScore", yourScoreValue.toString());

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
