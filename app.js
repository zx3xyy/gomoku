/* Gomoku (Five in a Row) — vs AI or 2 players. No dependencies. */
(function () {
  "use strict";

  var N = 15;
  var EMPTY = 0, BLACK = 1, WHITE = 2;
  var DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
  var STATS_KEY = "gomoku.stats.v1";
  var GAME_KEY = "gomoku.game.v1";
  var THEME_KEY = "gomoku.theme.v1";
  var SOUND_KEY = "gomoku.sound.v1";
  var SETTINGS_KEY = "gomoku.settings.v1";

  // ---------- pure rules logic ----------
  function rowOf(i) { return (i / N) | 0; }
  function colOf(i) { return i % N; }
  function inBoard(r, c) { return r >= 0 && r < N && c >= 0 && c < N; }

  // Contiguous run through (r,c) along one direction, inclusive.
  function runThrough(board, r, c, dr, dc, color) {
    var count = 1, open = 0;
    var rr = r + dr, cc = c + dc;
    while (inBoard(rr, cc) && board[rr * N + cc] === color) {
      count++;
      rr += dr;
      cc += dc;
    }
    if (inBoard(rr, cc) && board[rr * N + cc] === EMPTY) open++;
    rr = r - dr;
    cc = c - dc;
    while (inBoard(rr, cc) && board[rr * N + cc] === color) {
      count++;
      rr -= dr;
      cc -= dc;
    }
    if (inBoard(rr, cc) && board[rr * N + cc] === EMPTY) open++;
    return { count: count, open: open };
  }

  // Returns the winning cells if idx completes 5+, else null.
  function findWin(board, idx) {
    var color = board[idx];
    if (color === EMPTY) return null;
    var r = rowOf(idx), c = colOf(idx);
    for (var d = 0; d < DIRS.length; d++) {
      var dr = DIRS[d][0], dc = DIRS[d][1];
      var cells = [idx];
      var rr = r + dr, cc = c + dc;
      while (inBoard(rr, cc) && board[rr * N + cc] === color) {
        cells.push(rr * N + cc);
        rr += dr;
        cc += dc;
      }
      rr = r - dr;
      cc = c - dc;
      while (inBoard(rr, cc) && board[rr * N + cc] === color) {
        cells.push(rr * N + cc);
        rr -= dr;
        cc -= dc;
      }
      if (cells.length >= 5) return cells;
    }
    return null;
  }

  function completesFive(board, idx, color) {
    board[idx] = color;
    var r = rowOf(idx), c = colOf(idx);
    var wins = false;
    for (var d = 0; d < DIRS.length; d++) {
      if (runThrough(board, r, c, DIRS[d][0], DIRS[d][1], color).count >= 5) {
        wins = true;
        break;
      }
    }
    board[idx] = EMPTY;
    return wins;
  }

  // ---------- AI (pure) ----------
  function candidates(board) {
    var near = [];
    var seen = new Array(N * N);
    var hasStone = false;
    for (var i = 0; i < N * N; i++) {
      if (board[i] !== EMPTY) {
        hasStone = true;
        var r = rowOf(i), c = colOf(i);
        for (var dr = -2; dr <= 2; dr++) {
          for (var dc = -2; dc <= 2; dc++) {
            var rr = r + dr, cc = c + dc;
            if (inBoard(rr, cc)) {
              var j = rr * N + cc;
              if (board[j] === EMPTY && !seen[j]) {
                seen[j] = true;
                near.push(j);
              }
            }
          }
        }
      }
    }
    if (!hasStone) return [((N / 2) | 0) * N + ((N / 2) | 0)];
    return near;
  }

  function lineScore(run, open) {
    if (run >= 5) return 10000000;
    if (run === 4) return open === 2 ? 500000 : (open === 1 ? 60000 : 0);
    if (run === 3) return open === 2 ? 25000 : (open === 1 ? 3000 : 0);
    if (run === 2) return open === 2 ? 800 : (open === 1 ? 150 : 0);
    return open === 2 ? 40 : (open === 1 ? 8 : 0);
  }

  function cellScore(board, idx, color) {
    board[idx] = color;
    var r = rowOf(idx), c = colOf(idx);
    var total = 0;
    for (var d = 0; d < DIRS.length; d++) {
      var t = runThrough(board, r, c, DIRS[d][0], DIRS[d][1], color);
      total += lineScore(t.count, t.open);
    }
    board[idx] = EMPTY;
    return total;
  }

  function aiChoose(board, aiColor, level) {
    var cands = candidates(board);
    if (cands.length === 1) return cands[0];
    var opp = 3 - aiColor;
    var i;
    // 1. Take an immediate win.
    for (i = 0; i < cands.length; i++) {
      if (completesFive(board, cands[i], aiColor)) return cands[i];
    }
    // 2. Block the opponent's immediate win (Easy sometimes misses).
    if (level !== "easy" || Math.random() >= 0.2) {
      var bestBlock = -1, bestBlockScore = -1;
      for (i = 0; i < cands.length; i++) {
        if (completesFive(board, cands[i], opp)) {
          var s = cellScore(board, cands[i], aiColor);
          if (s > bestBlockScore) {
            bestBlockScore = s;
            bestBlock = cands[i];
          }
        }
      }
      if (bestBlock >= 0) return bestBlock;
    }
    // 3. Heuristic: attack plus slightly discounted defense.
    if (level === "easy" && Math.random() < 0.3) {
      return cands[Math.floor(Math.random() * cands.length)];
    }
    var best = cands[0], bestScore = -1;
    for (i = 0; i < cands.length; i++) {
      var score = cellScore(board, cands[i], aiColor) +
        0.92 * cellScore(board, cands[i], opp) +
        Math.random() * 2;
      if (score > bestScore) {
        bestScore = score;
        best = cands[i];
      }
    }
    return best;
  }

  // ---------- state ----------
  var mode = "ai"; // "ai" | "pvp"
  var difficulty = "normal"; // "easy" | "normal"
  var playerColor = BLACK;
  var board = [];
  var history = []; // [{idx, color}]
  var status = "playing"; // "playing" | "over"
  var result = null; // {winner: 0|1|2, line: [...], resigned: bool}
  var aiThinking = false;
  var gameSeq = 0;

  function aiColor() { return 3 - playerColor; }
  function nextColor() { return history.length % 2 === 0 ? BLACK : WHITE; }

  var canvas = document.getElementById("board");
  var wrapEl = document.getElementById("board-wrap");
  var toastContainer = document.getElementById("toast-container");
  var modeLabel = document.getElementById("mode-label");
  var turnDot = document.getElementById("turn-dot");
  var turnText = document.getElementById("turn-text");
  var moveCountEl = document.getElementById("move-count");
  var switchBtn = document.getElementById("btn-switch");
  var overlay = document.getElementById("modal-overlay");
  var modalContent = document.getElementById("modal-content");

  // ---------- storage ----------
  function loadJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* private mode: play without saving */ }
  }
  function removeKey(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  }

  function defaultStats() {
    return { ai: { games: 0, player: 0, ai: 0, draws: 0 }, pvp: { games: 0, black: 0, white: 0, draws: 0 } };
  }
  function getStats() {
    var s = loadJSON(STATS_KEY, null);
    if (!s || !s.ai || !s.pvp) return defaultStats();
    return s;
  }
  function saveStats(s) { saveJSON(STATS_KEY, s); }

  function saveGame() {
    if (status !== "playing") {
      removeKey(GAME_KEY);
      return;
    }
    saveJSON(GAME_KEY, {
      mode: mode,
      difficulty: difficulty,
      playerColor: playerColor,
      history: history
    });
  }

  function loadGame() {
    var g = loadJSON(GAME_KEY, null);
    if (!g) return false;
    if (g.mode !== "ai" && g.mode !== "pvp") return false;
    if (g.difficulty !== "easy" && g.difficulty !== "normal") return false;
    if (g.playerColor !== BLACK && g.playerColor !== WHITE) return false;
    if (!Array.isArray(g.history) || g.history.length > N * N) return false;
    var b = new Array(N * N);
    for (var i = 0; i < N * N; i++) b[i] = EMPTY;
    for (i = 0; i < g.history.length; i++) {
      var m = g.history[i];
      if (!m || typeof m.idx !== "number" || m.idx < 0 || m.idx >= N * N) return false;
      var expect = i % 2 === 0 ? BLACK : WHITE;
      if (m.color !== expect || b[m.idx] !== EMPTY) return false;
      b[m.idx] = m.color;
    }
    mode = g.mode;
    difficulty = g.difficulty;
    playerColor = g.playerColor;
    board = b;
    history = g.history;
    status = "playing";
    result = null;
    return true;
  }

  // ---------- sound ----------
  var audioCtx = null;
  var soundOn = loadJSON(SOUND_KEY, true);

  function ensureAudio() {
    if (!soundOn || audioCtx) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    } catch (e) {
      audioCtx = null;
    }
  }

  function tone(freq, dur, delay, vol) {
    if (!soundOn) return;
    ensureAudio();
    if (!audioCtx) return;
    try {
      var t0 = audioCtx.currentTime + (delay || 0);
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(vol || 0.15, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch (e) { /* silent */ }
  }

  function playClick() { tone(320, 0.07, 0, 0.12); }
  function playWin() {
    tone(523, 0.12, 0, 0.15);
    tone(659, 0.12, 0.12, 0.15);
    tone(784, 0.2, 0.24, 0.15);
  }
  function playLose() {
    tone(392, 0.14, 0, 0.12);
    tone(311, 0.14, 0.14, 0.12);
    tone(262, 0.22, 0.28, 0.12);
  }

  // ---------- toast ----------
  function toast(msg, duration) {
    var el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    toastContainer.appendChild(el);
    setTimeout(function () {
      el.classList.add("fade");
      setTimeout(function () { el.remove(); }, 350);
    }, duration || 1400);
  }

  // ---------- canvas board ----------
  var geom = { size: 300, cell: 18, o: 18, dpr: 1 };

  function resize() {
    var w = wrapEl.clientWidth || 300;
    var size = Math.min(w, 460);
    var dpr = (typeof window.devicePixelRatio === "number" && window.devicePixelRatio > 0)
      ? window.devicePixelRatio : 1;
    geom = { size: size, cell: size / (N + 1), o: size / (N + 1), dpr: dpr };
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    render();
  }

  function xy(idx) {
    return { x: geom.o + colOf(idx) * geom.cell, y: geom.o + rowOf(idx) * geom.cell };
  }

  function drawStone(ctx, x, y, r, color) {
    var grad = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    if (color === BLACK) {
      grad.addColorStop(0, "#5a5a5a");
      grad.addColorStop(0.5, "#2a2a2a");
      grad.addColorStop(1, "#0a0a0a");
    } else {
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.7, "#f0ede4");
      grad.addColorStop(1, "#c9c4b4");
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    if (color === WHITE) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#8f8a7c";
      ctx.stroke();
    }
  }

  function render() {
    var ctx = canvas.getContext("2d");
    if (!ctx) return;
    var s = geom.size, cell = geom.cell, o = geom.o;
    ctx.save();
    ctx.scale(geom.dpr, geom.dpr);
    ctx.clearRect(0, 0, s, s);
    // Wood background.
    ctx.fillStyle = "#dcb35c";
    ctx.fillRect(0, 0, s, s);
    // Outer border.
    ctx.lineWidth = Math.max(2, cell * 0.08);
    ctx.strokeStyle = "#5b4a2f";
    var m = o * 0.42;
    ctx.strokeRect(m, m, s - 2 * m, s - 2 * m);
    // Grid lines.
    ctx.lineWidth = Math.max(1, cell * 0.035);
    ctx.strokeStyle = "#5b4a2f";
    ctx.beginPath();
    for (var i = 0; i < N; i++) {
      var p = o + i * cell;
      ctx.moveTo(o, p);
      ctx.lineTo(o + (N - 1) * cell, p);
      ctx.moveTo(p, o);
      ctx.lineTo(p, o + (N - 1) * cell);
    }
    ctx.stroke();
    // Star points.
    var stars = [[3, 3], [3, 11], [11, 3], [11, 11], [7, 7]];
    ctx.fillStyle = "#5b4a2f";
    for (var t = 0; t < stars.length; t++) {
      ctx.beginPath();
      ctx.arc(o + stars[t][1] * cell, o + stars[t][0] * cell, cell * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }
    // Stones.
    var r = cell * 0.46;
    for (var k = 0; k < history.length; k++) {
      var p2 = xy(history[k].idx);
      drawStone(ctx, p2.x, p2.y, r, history[k].color);
    }
    // Last-move marker.
    if (history.length > 0) {
      var last = xy(history[history.length - 1].idx);
      ctx.beginPath();
      ctx.arc(last.x, last.y, cell * 0.13, 0, Math.PI * 2);
      ctx.fillStyle = "#d33";
      ctx.fill();
    }
    // Winning line highlight.
    if (result && result.line) {
      ctx.lineWidth = Math.max(2, cell * 0.09);
      ctx.strokeStyle = "#d33";
      for (var w = 0; w < result.line.length; w++) {
        var pw = xy(result.line[w]);
        ctx.beginPath();
        ctx.arc(pw.x, pw.y, r * 1.12, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
    renderStatus();
  }

  function renderStatus() {
    modeLabel.textContent = mode === "ai"
      ? "vs AI · " + (difficulty === "easy" ? "Easy" : "Normal")
      : "2 Players";
    moveCountEl.textContent = "Move " + history.length;
    if (status !== "playing") {
      turnText.textContent = "Game over";
      turnDot.style.display = "none";
    } else {
      turnDot.style.display = "";
      var nc = nextColor();
      turnDot.className = nc === BLACK ? "black" : "white";
      if (mode === "ai") {
        turnText.textContent = aiThinking ? "AI is thinking…" : (nc === playerColor ? "Your turn" : "AI is thinking…");
      } else {
        turnText.textContent = nc === BLACK ? "Black to move" : "White to move";
      }
    }
    switchBtn.style.display = mode === "ai" ? "" : "none";
  }

  function eventToCell(e) {
    var rect = canvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;
    var c = Math.round((x - geom.o) / geom.cell);
    var r = Math.round((y - geom.o) / geom.cell);
    if (r < 0 || r >= N || c < 0 || c >= N) return -1;
    var dx = x - (geom.o + c * geom.cell);
    var dy = y - (geom.o + r * geom.cell);
    if (dx * dx + dy * dy > geom.cell * geom.cell * 0.2) return -1;
    return r * N + c;
  }

  function onBoardInput(e) {
    if (e.preventDefault) e.preventDefault();
    ensureAudio();
    if (status !== "playing" || aiThinking) return;
    var idx = eventToCell(e);
    if (idx < 0 || board[idx] !== EMPTY) return;
    if (mode === "ai" && nextColor() !== playerColor) return;
    placeStone(idx, nextColor());
  }

  // ---------- game flow ----------
  function placeStone(idx, color) {
    board[idx] = color;
    history.push({ idx: idx, color: color });
    playClick();
    var line = findWin(board, idx);
    if (line) {
      endGame(color, line, false);
      return;
    }
    if (history.length >= N * N) {
      endGame(0, null, false);
      return;
    }
    render();
    saveGame();
    maybeTriggerAI();
  }

  function maybeTriggerAI() {
    if (status !== "playing") return;
    if (mode !== "ai" || nextColor() !== aiColor()) return;
    aiThinking = true;
    renderStatus();
    var seq = gameSeq;
    setTimeout(function () {
      if (seq !== gameSeq || status !== "playing") return;
      aiThinking = false;
      placeStone(aiChoose(board, aiColor(), difficulty), aiColor());
    }, 350);
  }

  function endGame(winner, line, resigned) {
    status = "over";
    aiThinking = false;
    result = { winner: winner, line: line, resigned: resigned };
    var s = getStats();
    if (mode === "ai") {
      if (winner === 0) s.ai.draws++;
      else if (winner === playerColor) s.ai.player++;
      else s.ai.ai++;
    } else {
      if (winner === 0) s.pvp.draws++;
      else if (winner === BLACK) s.pvp.black++;
      else s.pvp.white++;
    }
    saveStats(s);
    saveGame();
    render();
    if (mode === "ai") {
      if (winner === playerColor) playWin();
      else if (winner === 0) playClick();
      else playLose();
    } else if (winner !== 0) {
      playWin();
    }
    setTimeout(function () { showGameOver(); }, 500);
  }

  function undo() {
    ensureAudio();
    if (status !== "playing") {
      toast("Game is over — start a new one");
      return;
    }
    if (aiThinking || history.length === 0) return;
    var m = history.pop();
    board[m.idx] = EMPTY;
    // In AI games also take back the AI's reply so it's your move again.
    while (mode === "ai" && history.length > 0 && nextColor() === aiColor()) {
      m = history.pop();
      board[m.idx] = EMPTY;
    }
    result = null;
    render();
    saveGame();
    maybeTriggerAI();
  }

  function resign() {
    ensureAudio();
    if (status !== "playing") return;
    gameSeq++; // cancel any pending AI move
    aiThinking = false;
    var winner = mode === "ai" ? aiColor() : 3 - nextColor();
    endGame(winner, null, true);
  }

  function switchSides() {
    ensureAudio();
    if (mode !== "ai" || status !== "playing") return;
    if (aiThinking) {
      toast("Wait for the AI to move");
      return;
    }
    playerColor = 3 - playerColor;
    saveGame();
    renderStatus();
    toast(playerColor === BLACK ? "You are now Black" : "You are now White");
    maybeTriggerAI();
  }

  function newGame(opts) {
    gameSeq++;
    aiThinking = false;
    if (status === "playing" && history.length > 0) {
      if (!window.confirm("Start a new game? Your current progress will be lost.")) {
        return;
      }
    }
    mode = opts.mode;
    difficulty = opts.difficulty;
    playerColor = opts.playerColor;
    board = new Array(N * N);
    for (var i = 0; i < N * N; i++) board[i] = EMPTY;
    history = [];
    status = "playing";
    result = null;
    saveJSON(SETTINGS_KEY, { mode: mode, difficulty: difficulty, playerColor: playerColor });
    var s = getStats();
    if (mode === "ai") s.ai.games++;
    else s.pvp.games++;
    saveStats(s);
    render();
    saveGame();
    closeModal();
    maybeTriggerAI();
  }

  // ---------- modal ----------
  function openModal(html) {
    modalContent.innerHTML = html;
    overlay.classList.remove("hidden");
  }
  function closeModal() {
    overlay.classList.add("hidden");
  }
  document.getElementById("modal-close").addEventListener("click", closeModal);
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) closeModal();
  });

  function showNewGame() {
    var sel = { mode: mode, difficulty: difficulty, playerColor: playerColor };
    openModal(
      "<h2>New Game</h2>" +
      "<h3>Mode</h3>" +
      '<div class="opt-row" id="opt-mode">' +
      '<button class="opt" data-value="ai">🤖 vs AI<small>Practice solo</small></button>' +
      '<button class="opt" data-value="pvp">👥 2 Players<small>Pass and play</small></button>' +
      "</div>" +
      '<div id="ai-sections">' +
      "<h3>AI Level</h3>" +
      '<div class="opt-row" id="opt-difficulty">' +
      '<button class="opt" data-value="easy">Easy<small>Relaxed</small></button>' +
      '<button class="opt" data-value="normal">Normal<small>A real opponent</small></button>' +
      "</div>" +
      "<h3>You Play</h3>" +
      '<div class="opt-row" id="opt-side">' +
      '<button class="opt" data-value="1">⚫ Black<small>Moves first</small></button>' +
      '<button class="opt" data-value="2">⚪ White<small>Moves second</small></button>' +
      "</div>" +
      "</div>" +
      '<div class="modal-buttons">' +
      '<button class="btn btn-primary" id="start-game">Start</button>' +
      "</div>"
    );
    function paint(group, key) {
      var btns = modalContent.querySelector("#opt-" + group).querySelectorAll(".opt");
      for (var i = 0; i < btns.length; i++) {
        var v = btns[i].dataset.value;
        if (key === "playerColor") v = parseInt(v, 10);
        if (v === sel[key]) btns[i].classList.add("selected");
        else btns[i].classList.remove("selected");
      }
    }
    function paintAll() {
      paint("mode", "mode");
      paint("difficulty", "difficulty");
      paint("side", "playerColor");
      modalContent.querySelector("#ai-sections").style.display = sel.mode === "ai" ? "" : "none";
    }
    function wire(group, key, parse) {
      var btns = modalContent.querySelector("#opt-" + group).querySelectorAll(".opt");
      for (var i = 0; i < btns.length; i++) {
        (function (btn) {
          btn.addEventListener("click", function () {
            var v = btn.dataset.value;
            sel[key] = parse ? parse(v) : v;
            paintAll();
          });
        })(btns[i]);
      }
    }
    wire("mode", "mode");
    wire("difficulty", "difficulty");
    wire("side", "playerColor", function (v) { return parseInt(v, 10); });
    paintAll();
    document.getElementById("start-game").addEventListener("click", function () {
      newGame({ mode: sel.mode, difficulty: sel.difficulty, playerColor: sel.playerColor });
    });
  }

  function statBlock(num, label) {
    return '<div class="stat"><div class="num">' + num + '</div><div class="label">' + label + "</div></div>";
  }

  function statsHTML() {
    var s = getStats();
    return "<h2>vs AI</h2>" +
      '<div class="stat-row">' +
      statBlock(s.ai.player, "You") +
      statBlock(s.ai.ai, "AI") +
      statBlock(s.ai.draws, "Draws") +
      "</div><h2>2 Players</h2>" +
      '<div class="stat-row">' +
      statBlock(s.pvp.black, "Black") +
      statBlock(s.pvp.white, "White") +
      statBlock(s.pvp.draws, "Draws") +
      "</div>";
  }

  var HELP_HTML = "<h2>How To Play</h2>" +
    "<p>Get <strong>5 stones in a row</strong> — across, down, or diagonally. Black moves first.</p>" +
    '<ul class="help-list">' +
    "<li>Tap any intersection to place a stone.</li>" +
    "<li><strong>Undo</strong> takes back moves; <strong>Resign</strong> ends the game.</li>" +
    "<li>Against the AI you can <strong>switch sides</strong> mid-game.</li>" +
    "</ul>";

  function showStats() {
    openModal("<h2>Statistics</h2>" + statsHTML() + HELP_HTML);
  }

  function showGameOver() {
    var title, sub;
    var moves = history.length;
    if (result.winner === 0) {
      title = "It's a draw";
    } else if (mode === "ai") {
      title = result.winner === playerColor ? "You win! 🎉" : "AI wins";
    } else {
      title = result.winner === BLACK ? "Black wins! 🎉" : "White wins! 🎉";
    }
    sub = moves + (moves === 1 ? " move" : " moves") + " · " +
      (mode === "ai" ? "vs AI " + (difficulty === "easy" ? "Easy" : "Normal") : "2 Players") +
      (result.resigned ? " · resigned" : "");
    openModal(
      '<p class="result-title">' + title + "</p>" +
      '<p class="result-sub">' + sub + "</p>" +
      statsHTML() +
      '<div class="modal-buttons">' +
      '<button class="btn btn-primary" id="btn-rematch">Rematch</button>' +
      '<button class="btn btn-secondary" id="btn-settings">Settings</button>' +
      "</div>"
    );
    document.getElementById("btn-rematch").addEventListener("click", function () {
      newGame({ mode: mode, difficulty: difficulty, playerColor: playerColor });
    });
    document.getElementById("btn-settings").addEventListener("click", showNewGame);
  }

  // ---------- theme ----------
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    var dark = theme === "dark";
    document.getElementById("icon-moon").style.display = dark ? "" : "none";
    document.getElementById("icon-sun").style.display = dark ? "none" : "";
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#121213" : "#ffffff");
    saveJSON(THEME_KEY, theme);
  }
  function toggleTheme() {
    var current = document.documentElement.getAttribute("data-theme") || "dark";
    applyTheme(current === "dark" ? "light" : "dark");
  }

  // ---------- sound toggle ----------
  function paintSound() {
    document.getElementById("icon-sound-on").style.display = soundOn ? "" : "none";
    document.getElementById("icon-sound-off").style.display = soundOn ? "none" : "";
    document.getElementById("btn-sound").setAttribute("aria-pressed", soundOn ? "true" : "false");
  }
  function toggleSound() {
    soundOn = !soundOn;
    saveJSON(SOUND_KEY, soundOn);
    paintSound();
    if (soundOn) playClick();
  }

  // ---------- wiring ----------
  document.getElementById("btn-new").addEventListener("click", showNewGame);
  document.getElementById("btn-stats").addEventListener("click", showStats);
  document.getElementById("btn-theme").addEventListener("click", toggleTheme);
  document.getElementById("btn-sound").addEventListener("click", toggleSound);
  document.getElementById("btn-undo").addEventListener("click", undo);
  document.getElementById("btn-giveup").addEventListener("click", resign);
  switchBtn.addEventListener("click", switchSides);
  canvas.addEventListener("pointerdown", onBoardInput);
  if (typeof window.addEventListener === "function") {
    window.addEventListener("resize", resize);
  }

  document.addEventListener("keydown", function (e) {
    if (!overlay.classList.contains("hidden")) {
      if (e.key === "Escape") closeModal();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var k = e.key;
    if (k === "u" || k === "U") {
      undo();
    } else if (k === "n" || k === "N") {
      showNewGame();
    }
  });

  // ---------- init ----------
  applyTheme(loadJSON(THEME_KEY, "dark"));
  paintSound();
  resize();
  if (loadGame()) {
    render();
    maybeTriggerAI();
  } else {
    var def = loadJSON(SETTINGS_KEY, null);
    var startOpts = def && (def.mode === "ai" || def.mode === "pvp")
      ? { mode: def.mode, difficulty: def.difficulty === "easy" ? "easy" : "normal", playerColor: def.playerColor === WHITE ? WHITE : BLACK }
      : { mode: "ai", difficulty: "normal", playerColor: BLACK };
    // Fresh start: skip the dirty check by marking no game in progress.
    status = "over";
    newGame(startOpts);
  }
})();
