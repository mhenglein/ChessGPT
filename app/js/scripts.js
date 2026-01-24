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

// Play sound effect with volume handling
function playGameSound(type) {
  try {
    const audio = type === "victory" ? audioVictory : audioDefeat;
    if (audio) {
      audio.volume = 0.5;
      audio.currentTime = 0;
      audio.play().catch((e) => console.warn("Audio play failed:", e));
    }
  } catch (e) {
    console.warn("Sound playback error:", e);
  }
}

// Show game over modal with animations
function showGameOverModal(result, status) {
  const board = document.getElementById("myBoard");

  // Reset modal state
  leaderboardSubmit.classList.remove("d-none");
  leaderboardDisplay.classList.add("d-none");
  nicknameInput.value = safeGetItem("lastNickname", "");

  // Store result for leaderboard submission
  currentGameResult = result;

  if (result === "ai") {
    // AI wins (player loses)
    gameOverTitle.textContent = "DEFEATED!";
    gameOverTitle.className = "game-over-title defeat";
    gameOverLogo.src = bot === "stockfish" ? "/stockfish.png" : "/chatgpt.png";
    gameOverLogo.className = "game-over-logo defeat";
    board.classList.add("shake");
    playGameSound("defeat");

    // Remove shake class after animation
    setTimeout(() => board.classList.remove("shake"), 500);
  } else if (result === "player") {
    // Player wins
    gameOverTitle.textContent = "VICTORY!";
    gameOverTitle.className = "game-over-title victory";
    gameOverLogo.src = "/red.png";
    gameOverLogo.className = "game-over-logo victory";
    playGameSound("victory");

    // Trigger confetti
    if (typeof confetti === "function") {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
      // Second burst
      setTimeout(() => {
        confetti({
          particleCount: 50,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
        });
        confetti({
          particleCount: 50,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
        });
      }, 250);
    }
  } else {
    // Draw
    gameOverTitle.textContent = "DRAW";
    gameOverTitle.className = "game-over-title draw";
    gameOverLogo.src = "/chatgpt.png";
    gameOverLogo.className = "game-over-logo";
  }

  gameOverStatus.textContent = status;

  // Update resign button to restart button
  if (resignRestartBtn) {
    resignRestartBtn.textContent = "Restart";
    resignRestartBtn.classList.remove("btn-outline-danger");
    resignRestartBtn.classList.add("btn-outline-warning");
  }

  // Show the modal
  const modal = new bootstrap.Modal(gameOverModal);
  modal.show();
}

// Fetch and display leaderboard
async function fetchLeaderboard(targetBody, limit = 10) {
  try {
    const response = await fetch(`/api/leaderboard?limit=${limit}`);
    if (!response.ok) throw new Error("Failed to fetch leaderboard");

    const data = await response.json();
    targetBody.innerHTML = "";

    if (data.length === 0) {
      targetBody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No entries yet</td></tr>';
      return;
    }

    data.forEach((player, index) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${index + 1}</td>
        <td>${escapeHtml(player.nickname)}</td>
        <td>${player.wins}</td>
        <td>${player.losses}</td>
        <td>${player.draws}</td>
      `;
      targetBody.appendChild(row);
    });
  } catch (e) {
    console.warn("Leaderboard fetch error:", e);
    targetBody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Could not load leaderboard</td></tr>';
  }
}

// Submit score to leaderboard
async function submitScore(nickname, result) {
  try {
    const response = await fetch("/api/leaderboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname, result }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || "Submission failed");
    }

    return true;
  } catch (e) {
    console.error("Score submission error:", e);
    return false;
  }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

const container = document.getElementById("container");
const startAnimation = document.getElementById("startAnimation");
const startContainer = document.getElementById("startContainer");
const chessBoard = document.getElementById("chessBoard");
const myBoard = document.getElementById("myBoard");
const chatGptLogo = document.getElementById("chatGptLogo");
const redLogo = document.getElementById("redLogo");

// Game over modal elements
const gameOverModal = document.getElementById("gameOverModal");
const gameOverTitle = document.getElementById("gameOverTitle");
const gameOverStatus = document.getElementById("gameOverStatus");
const gameOverLogo = document.getElementById("gameOverLogo");
const nicknameInput = document.getElementById("nicknameInput");
const submitScoreBtn = document.getElementById("submitScoreBtn");
const leaderboardSubmit = document.getElementById("leaderboardSubmit");
const leaderboardDisplay = document.getElementById("leaderboardDisplay");
const leaderboardBody = document.getElementById("leaderboardBody");
const playAgainBtn = document.getElementById("playAgainBtn");
const viewLeaderboardBtn = document.getElementById("viewLeaderboardBtn");
const standaloneLeaderboardBody = document.getElementById("standaloneLeaderboardBody");
const resignRestartBtn = document.getElementById("resignRestartBtn");

// Audio elements
const audioVictory = document.getElementById("audio-victory");
const audioDefeat = document.getElementById("audio-defeat");

// Track current game result for leaderboard submission
let currentGameResult = null;

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
      // Determine result type for modal
      let resultType = "draw";
      if (whoWon === "w") resultType = "player";
      else if (whoWon === "b") resultType = "ai";

      // Show game over modal with animations
      showGameOverModal(resultType, status);

      // Update local high score
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
  // Get the chatGptScore from LocalStorage (parse as int to avoid type coercion bugs)
  let chessGptScoreValue = parseInt(safeGetItem("chessGptScoreValue", "0"), 10) || 0;
  let yourScoreValue = parseInt(safeGetItem("yourScore", "0"), 10) || 0;

  if (whoWhon === "b") chessGptScoreValue++;
  if (whoWhon === "w") yourScoreValue++;
  const chessGptScore = document.getElementById("chessGptScore");
  const yourScore = document.getElementById("yourScore");
  if (chessGptScore) chessGptScore.innerText = chessGptScoreValue;
  if (yourScore) yourScore.innerText = yourScoreValue;

  // Set the chatGptScore in LocalStorage
  safeSetItem("chessGptScoreValue", chessGptScoreValue.toString());
  safeSetItem("yourScore", yourScoreValue.toString());
}

const resetBtn = document.getElementById("resetBtn");
resetBtn.addEventListener("click", () => {
  // Reload page
  window.location.reload();
});

// Play Again button in game over modal
if (playAgainBtn) {
  playAgainBtn.addEventListener("click", () => {
    window.location.reload();
  });
}

// Submit score to leaderboard
if (submitScoreBtn) {
  submitScoreBtn.addEventListener("click", async () => {
    const nickname = nicknameInput.value.trim();
    if (!nickname) {
      nicknameInput.classList.add("border-danger");
      nicknameInput.focus();
      return;
    }

    nicknameInput.classList.remove("border-danger");

    // Determine result for API
    let apiResult;
    if (currentGameResult === "player") apiResult = "win";
    else if (currentGameResult === "ai") apiResult = "loss";
    else apiResult = "draw";

    // Disable button during submission
    submitScoreBtn.disabled = true;
    submitScoreBtn.textContent = "Submitting...";

    // Save nickname for next time
    safeSetItem("lastNickname", nickname);

    const success = await submitScore(nickname, apiResult);

    if (success) {
      // Hide submission form, show leaderboard
      leaderboardSubmit.classList.add("d-none");
      leaderboardDisplay.classList.remove("d-none");

      // Fetch and display leaderboard
      await fetchLeaderboard(leaderboardBody);
    } else {
      submitScoreBtn.disabled = false;
      submitScoreBtn.textContent = "Try Again";
    }
  });
}

// Enter key submits score
if (nicknameInput) {
  nicknameInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      submitScoreBtn.click();
    }
  });
}

// View Leaderboard button
if (viewLeaderboardBtn) {
  viewLeaderboardBtn.addEventListener("click", async () => {
    const leaderboardModal = document.getElementById("leaderboardModal");
    const modal = new bootstrap.Modal(leaderboardModal);
    modal.show();
    await fetchLeaderboard(standaloneLeaderboardBody);
  });
}

// Resign/Restart button handler
if (resignRestartBtn) {
  resignRestartBtn.addEventListener("click", function () {
    if (game.isGameOver()) {
      // Game already over - restart
      window.location.reload();
    } else {
      // Active game - resign (player loses)
      showGameOverModal("ai", "You resigned!");
    }
  });
}

// Show leaderboard and resign buttons when chess board is visible
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.target.classList.contains("visible") && !mutation.target.classList.contains("hidden")) {
      if (viewLeaderboardBtn) {
        viewLeaderboardBtn.classList.remove("d-none");
      }
      if (resignRestartBtn) {
        resignRestartBtn.classList.remove("d-none");
      }
    }
  });
});

if (myBoard) {
  observer.observe(myBoard, { attributes: true, attributeFilter: ["class"] });
}
