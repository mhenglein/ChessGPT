import { Chess } from "chess";

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

const blockSize = window.innerWidth < 700 ? 20 : 55;
const animationSpeed = 1;
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

  const totalAnimationDuration = 1500; // 10 times * 150ms

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
    }, 800);
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

    if (movesMade === 7) {
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
