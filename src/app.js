/* Nine Realms — local, dependency-free game controller. */
(function () {
  "use strict";

  var Engine = window.SudokuEngine;
  var Generator = window.NineRealmsGenerator;
  var generatorClient = Generator ? Generator.createClient() : null;
  var generationEpoch = 0, generatingPuzzle = false;
  var RECENT_GENERATED_KEY = "nine-realms.generated-recent.v1", recentGenerated = [];
  try {
    var storedGenerated = JSON.parse(localStorage.getItem(RECENT_GENERATED_KEY) || "[]");
    if (Array.isArray(storedGenerated)) recentGenerated = storedGenerated.filter(function (v) { return typeof v === "string" && /^[a-f0-9]{32}$/.test(v); }).slice(-256);
  } catch (error) { /* Recent-repeat avoidance is optional; validity never depends on storage. */ }

  var STORAGE_KEY = "nine-realms.sudoku.v1";
  var SAVE_VERSION = 8;
  var History = window.NineRealmsHistory;
  var historyOrigin = null;
  var boardLayout = null;
  var boardLayoutKey = '';
  var activeBoardId = 'all';
  var Voyage = window.SudokuVoyage;
  var Atmosphere = window.NineRealmsAtmosphere;
  var VOYAGE_KEY = "nine-realms.voyage.v1";
  var voyageProgress = {};
  var selectedVoyage = "dawn";
  var loadingVoyage = false;
  var pulseTimeout = null;
  var DAILY_KEY = "nine-realms.daily.v1";
  var Daily = window.SudokuDaily;
  var pendingHint = null;
  var dailyRecords = {};
  var dailyToday = Daily ? Daily.dateKey() : "";
  var loadingDaily = false;
  var THEMES = ["nebula", "aurora", "ember", "ivory", "ocean", "sakura", "firefly", "sunset"];
  var THEME_NAMES = { nebula: "星云", aurora: "极光", ember: "熔金", ivory: "月白",
    ocean: "深海", sakura: "樱落", firefly: "萤森", sunset: "流霞" };
  var LIGHT_THEMES = ["ivory", "sakura", "sunset"];
  var MODES = Engine ? Engine.getModes().map(function (entry) { return entry.id; }) : [];
  var PUZZLE_CATALOG = Engine ? Engine.getPuzzleCatalog() : [];
  var Deck = null;
  try { Deck = window.NineRealmsPuzzleDeck(Engine, localStorage); }
  catch (error) { Deck = window.NineRealmsPuzzleDeck(Engine, { getItem: function () { return null; }, setItem: function () {} }); }
  var $ = function (id) { return document.getElementById(id); };
  var boardElement = $("board");
  var numberPad = $("number-pad");

  if (!Engine || !Daily || !Voyage || !Atmosphere || !window.SudokuHints || !boardElement || !numberPad) {
    var failure = $("status-message");
    if (failure) failure.textContent = "游戏资源未完整加载，请重新打开完整的游戏文件。";
    return;
  }

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var preferences = { theme: "nebula", fx: true, errorCheck: true, fog: false, sound: false, focus: false, zen: false, zenMotion: true, intensity: "cinematic" };
  var game = null;
  var currentContext = null;
  var catalogCategory = "全部";
  var cells = [];
  var numberKeys = [];
  var runningSince = null;
  var noteMode = false;
  var hintCell = -1;
  var hintTimeout = null;
  var checkedReveal = false;
  var checkTimeout = null;
  var toastTimeout = null;
  var lastPeriodicSave = 0;
  var pendingConfirm = null;
  var particleFrame = null;
  var storageFailed = false;
  var importingChallenge = false;

  function gameContext() { return currentContext || { mode: "classic", clues: {} }; }

  function modeInfo(mode) {
    return Engine.getModes().find(function (entry) { return entry.id === mode; });
  }

  function generationInfo(value, puzzle) {
    if (!Generator || !value || value.version !== 1 || value.kind !== "carved" ||
        typeof value.seed !== "string" || value.seed.length > 256 ||
        value.fingerprint !== Generator.fingerprint(puzzle)) return null;
    return { version: 1, seed: value.seed, kind: "carved", difficultyBasis: "clue-density",
      fingerprint: value.fingerprint, givenCount: puzzle.givens.filter(Boolean).length };
  }

  function setGenerationBusy(busy) {
    generatingPuzzle = busy;
    ["difficulty", "mode-picker-open"].forEach(function (id) { if ($(id)) $(id).disabled = busy; });
    var button = $("new-game");
    if (button) {
      button.setAttribute("aria-busy", String(busy));
      var label = button.querySelector("span"); if (label) label.textContent = busy ? "取消生成" : "新游戏";
    }
    if (game) render();
  }

  function cancelPuzzleGeneration() {
    generationEpoch++;
    if (generatorClient) generatorClient.cancel();
    setGenerationBusy(false);
  }

  function rememberGenerated(puzzle) {
    if (!Generator || !puzzle.generation) return;
    var key = Generator.fingerprint(puzzle);
    recentGenerated = recentGenerated.filter(function (v) { return v !== key; }).concat(key).slice(-256);
    try { localStorage.setItem(RECENT_GENERATED_KEY, JSON.stringify(recentGenerated)); } catch (error) { /* Keep a bounded in-memory ledger. */ }
  }

  function sourceIdFor(puzzle, mode, difficulty) {
    var candidates = PUZZLE_CATALOG.filter(function (p) { return p.mode === mode && p.difficulty === difficulty; });
    var match = candidates.find(function (p) { return p.id === puzzle.sourceId; });
    if (!match) match = candidates.find(function (p) {
      var id = String(puzzle.puzzleId || puzzle.id || "");
      return id === p.id || id.indexOf(p.id + "-") === 0;
    });
    return match ? match.id : null;
  }

  function difficultyInfo(mode, difficulty) {
    return Engine.getDifficulties(mode).find(function (entry) { return entry.id === difficulty; });
  }

  function isBoard(value, complete, size) {
    return Array.isArray(value) && value.length === (size || 81) &&
      value.every(function (n) {
        return Number.isInteger(n) && n >= (complete ? 1 : 0) && n <= 9;
      });
  }

  function isNotes(value, size) {
    return Array.isArray(value) && value.length === (size || 81) &&
      value.every(function (n) { return Number.isInteger(n) && n >= 0 && n <= 511; });
  }

  function respectsGivens(board, givens) {
    return board.every(function (value, i) { return !givens[i] || value === givens[i]; });
  }

  function validSnapshot(snapshot, givens) {
    return snapshot && isBoard(snapshot.board, false, givens.length) && isNotes(snapshot.notes, givens.length) &&
      respectsGivens(snapshot.board, givens) &&
      snapshot.notes.every(function (mask, i) { return !snapshot.board[i] || mask === 0; });
  }

  function copySnapshot(snapshot) {
    return { board: snapshot.board.slice(), notes: snapshot.notes.slice(),
      selected: Number.isInteger(snapshot.selected) && snapshot.selected >= 0 && snapshot.selected < snapshot.board.length ? snapshot.selected : 0,
      noteMode: Boolean(snapshot.noteMode) };
  }

  function restoreBranch(source, givens) {
    if (!source || !validSnapshot(source, givens) ||
        !Number.isInteger(source.mistakes) || source.mistakes < 0 ||
        !Array.isArray(source.history)) return null;
    var branch = copySnapshot(source);
    branch.mistakes = source.mistakes;
    branch.history = source.history.slice(-80).filter(function (item) {
      return validSnapshot(item, givens);
    }).map(copySnapshot);
    return branch;
  }

  function restore(provided, keepPreferences) {
    try {
      var raw = provided ? null : localStorage.getItem(STORAGE_KEY);
      if (!provided && !raw) return false;
      var saved = provided || JSON.parse(raw);
      if (!saved || [1, 2, 3, 4, 5, 6, 7, SAVE_VERSION].indexOf(saved.version) < 0) return false;
      var prefs = saved.preferences || {};
      var nextPreferences = Object.assign({}, preferences);
      if (!keepPreferences) {
      nextPreferences.theme = THEMES.indexOf(prefs.theme) >= 0 ? prefs.theme : "nebula";
      nextPreferences.fx = typeof prefs.fx === "boolean" ? prefs.fx : true;
      nextPreferences.errorCheck = typeof prefs.errorCheck === "boolean" ? prefs.errorCheck : true;
      nextPreferences.fog = prefs.fog === true;
      nextPreferences.sound = prefs.sound === true;
      nextPreferences.focus = prefs.focus === true;
      nextPreferences.zen = prefs.zen === true;
      nextPreferences.zenMotion = prefs.zenMotion !== false;
      nextPreferences.intensity = ["cinematic", "balanced", "soft"].indexOf(prefs.intensity) >= 0 ? prefs.intensity : "cinematic";
      }
      var source = saved.game;
      if (!source) return false;
      var mode = saved.version === 1 ? "classic" : source.mode;
      var difficulty = source.difficulty === "expert" ? "master" : source.difficulty;
      var clues = Engine.normalizeClues(mode, source.clues);
      var restoredContext = { mode: mode, clues: clues };
      var restoredSize = Engine.getLayout(restoredContext).cellCount;
      if (MODES.indexOf(mode) < 0 || !difficultyInfo(mode, difficulty) ||
          !isBoard(source.givens, false, restoredSize) || !isBoard(source.solution, true, restoredSize) ||
          !Engine.validateComplete(source.solution, restoredContext) ||
          !respectsGivens(source.solution, source.givens) ||
          !validSnapshot(source, source.givens) ||
          !Number.isFinite(source.elapsedMs) || source.elapsedMs < 0 || source.elapsedMs > 1e12 ||
          !Number.isInteger(source.mistakes) || source.mistakes < 0 ||
          !Number.isInteger(source.hints) || source.hints < 0) return false;
      // A saved answer must belong to this puzzle, not just be another complete grid.
      var trustedSolution = Engine.solve(source.givens, restoredContext);
      if (!trustedSolution || !trustedSolution.every(function (v, i) { return v === source.solution[i]; })) return false;
      var branch = restoreBranch(source.branch, source.givens);
      var completed = !branch && source.board.every(function (value, i) { return value === source.solution[i]; });
      // Older saves were always live. Keep their time, but wait for an explicit resume.
      var recordedProgress = source.elapsedMs > 0 || source.hints > 0 || source.mistakes > 0 ||
        source.board.some(function (value, i) { return value !== source.givens[i]; }) ||
        source.notes.some(function (mask) { return mask !== 0; });
      var started = completed || saved.version < 3 || source.started === true || recordedProgress || Boolean(branch);
      cancelPuzzleGeneration();
      game = {
        generation: generationInfo(source.generation, { mode: mode, clues: clues, givens: source.givens }),
        sessionId: validSessionId(source.sessionId) ? source.sessionId : newSessionId(),
        createdAt: Number.isFinite(source.createdAt) && source.createdAt > 0 ? source.createdAt : Date.now(),
        puzzleId: String(source.puzzleId || "saved"),
        sourceId: sourceIdFor(source, mode, difficulty),
        difficulty: difficulty,
        mode: mode,
        clues: clues,
        givens: source.givens.slice(),
        solution: source.solution.slice(),
        board: source.board.slice(),
        notes: source.notes.slice(),
        history: Array.isArray(source.history) ? source.history.filter(function (item) {
          return validSnapshot(item, source.givens);
        }).slice(-80) : [],
        selected: Number.isInteger(source.selected) && source.selected >= 0 && source.selected < restoredSize
          ? source.selected : source.givens.indexOf(0),
        mistakes: source.mistakes,
        hints: source.hints,
        elapsedMs: started ? source.elapsedMs : 0,
        started: started,
        paused: started && !completed,
        completed: completed,
        branch: branch,
        voyageId: Voyage.matchesPuzzle(source.voyageId, source.givens, mode, difficulty, clues) ? source.voyageId : null,
        dailyDate: Daily.matchesPuzzle(source.dailyDate, source.givens, mode, difficulty, clues) ? source.dailyDate : null,
        fog: typeof source.fog === "boolean" ? source.fog : nextPreferences.fog,
        fogSeen: Array.isArray(source.fogSeen) && source.fogSeen.length === restoredSize &&
          source.fogSeen.every(function (value) { return typeof value === "boolean"; }) ? source.fogSeen.slice() : initialFog(restoredContext)
      };
      preferences = nextPreferences;
      currentContext = restoredContext;
      runningSince = null;
      historyOrigin = 'legacy';
      game.energy = restoreEnergy(source.energy);
      revealFog(game.selected);
      noteMode = Boolean(source.noteMode);
      if (game.selected < 0) game.selected = 0;
      return true;
    } catch (error) {
      return false;
    }
  }

  function dialogIsOpen() {
    return Boolean(document.querySelector("dialog[open]"));
  }

  function validSessionId(value) {
    return typeof value === "string" && /^[a-zA-Z0-9_-]{8,100}$/.test(value);
  }

  function newSessionId() {
    return History ? History.createSessionId() : "game-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2,10);
  }

  function currentElapsed() {
    if (!game.started) return 0;
    return game.elapsedMs + (runningSince === null ? 0 : performance.now() - runningSince);
  }

  function suspendClock() {
    if (game && runningSince !== null) {
      game.elapsedMs = currentElapsed();
      runningSince = null;
    }
  }

  function resumeClock() {
    if (game && game.started && runningSince === null && !game.paused && !game.completed &&
        !generatingPuzzle && !dialogIsOpen() && !document.hidden) runningSince = performance.now();
  }

  function save(action) {
    if (!game) return;
    try {
      var snapshot = Object.assign({}, game, { elapsedMs: Math.floor(currentElapsed()), noteMode: noteMode });
      var envelope = { version: SAVE_VERSION, preferences: preferences, game: snapshot };
      if (History) {
        try { History.capture(envelope, { action: typeof action === "string" ? action : undefined, origin: historyOrigin || undefined }); }
        catch (historyError) { /* Current-game saving remains independent of the history archive. */ }
        historyOrigin = null;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    } catch (error) {
      if (!storageFailed) {
        storageFailed = true;
        toast("浏览器未允许本地保存，本局仍可正常游玩。");
      }
    }
  }

  function formatTime(milliseconds) {
    var total = Math.floor(milliseconds / 1000);
    var seconds = String(total % 60).padStart(2, "0");
    var minutes = Math.floor(total / 60);
    if (minutes < 60) return String(minutes).padStart(2, "0") + ":" + seconds;
    return String(Math.floor(minutes / 60)).padStart(2, "0") + ":" +
      String(minutes % 60).padStart(2, "0") + ":" + seconds;
  }

  function toast(message) {
    var element = $("toast");
    if (!element) return;
    clearTimeout(toastTimeout);
    element.textContent = message;
    element.hidden = false;
    element.classList.add("visible");
    toastTimeout = setTimeout(function () {
      element.classList.remove("visible");
      element.hidden = true;
    }, 3200);
  }

  function setStatus(message) {
    var status = $("status-message");
    if (!status) return;
    // Quiet ready-state copy visually; live announcements and actionable feedback remain.
    status.parentElement.classList.toggle("status-quiet", /已准备好|^已准备/.test(message));
    status.textContent = message;
  }

  function sameUnit(a, b) {
    return Engine.arePeers(a, b, gameContext());
  }

  function isKnightMove(a, b) {
    return Math.abs(Math.floor(a / 9) - Math.floor(b / 9)) *
      Math.abs(a % 9 - b % 9) === 2;
  }

  function conflicts() {
    var result = new Set(Engine.getConflicts(game.board, gameContext()));
    if (!game.branch) game.board.forEach(function (value, i) {
      if (value && !game.givens[i] && value !== game.solution[i]) result.add(i);
    });
    return result;
  }

  function cellLocation(index) {
    return Engine.getCellLabel ? Engine.getCellLabel(index, gameContext()) :
      "第 " + (Math.floor(index / 9) + 1) + " 行第 " + (index % 9 + 1) + " 列";
  }

  function isMulti() { return Boolean(game && game.board.length > 81); }

  function buildBoard() {
    boardLayout = Engine.getLayout(gameContext());
    boardLayoutKey = (game ? game.mode : "classic") + ":" + boardLayout.cellCount;
    activeBoardId = boardLayout.cellCount > 81 && window.innerWidth <= 760 ?
      (boardLayout.boards.find(function (b) { return b.id === "center"; }) || boardLayout.boards[0]).id : "all";
    boardElement.replaceChildren();
    cells = [];
    var fragment = document.createDocumentFragment();
    boardLayout.cells.forEach(function (position, i) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "cell";
      button.dataset.index = String(i);
      button.setAttribute("role", "gridcell");
      var value = document.createElement("span");
      value.className = "value";
      var notes = document.createElement("span");
      notes.className = "notes";
      notes.setAttribute("aria-hidden", "true");
      for (var n = 1; n <= 9; n++) notes.appendChild(document.createElement("span"));
      button.append(value, notes);
      button.addEventListener("click", function (event) { selectCell(Number(event.currentTarget.dataset.index), false); });
      fragment.appendChild(button);
      cells.push(button);
    });
    boardElement.appendChild(fragment);
    var view = $("grid-view");
    if (view) {
      view.replaceChildren();
      var overall = document.createElement("option");
      overall.value = "all"; overall.textContent = "总览 · 全部棋盘"; view.appendChild(overall);
      boardLayout.boards.forEach(function (board) {
        var option = document.createElement("option"); option.value = board.id; option.textContent = board.label + " · 放大"; view.appendChild(option);
      });
    }
    applyBoardView();
    if (numberKeys.length) return;
    for (var digit = 1; digit <= 9; digit++) {
      var key = document.createElement("button");
      key.type = "button"; key.className = "number-key"; key.dataset.value = String(digit);
      var label = document.createElement("span"); label.className = "key-value"; label.textContent = String(digit);
      var remaining = document.createElement("span"); remaining.className = "remaining";
      key.append(label, remaining);
      key.addEventListener("click", function (event) { enterNumber(Number(event.currentTarget.dataset.value), false); });
      numberPad.appendChild(key); numberKeys.push(key);
    }
  }

  function applyBoardView() {
    if (!boardLayout) return;
    var multi = boardLayout.cellCount > 81;
    var focused = activeBoardId === "all" ? null : boardLayout.boards.find(function (b) { return b.id === activeBoardId; });
    if (!focused) activeBoardId = "all";
    var dimension = focused ? 9 : boardLayout.columns;
    document.body.dataset.multi = String(multi);
    document.body.dataset.multiView = focused ? "detail" : "overview";
    boardElement.style.setProperty("--board-dimension", dimension);
    boardElement.setAttribute("aria-rowcount", String(dimension));
    boardElement.setAttribute("aria-colcount", String(dimension));
    cells.forEach(function (cell, index) {
      var position = boardLayout.cells[index];
      var local = focused ? position.boards.find(function (b) { return b.id === focused.id; }) : position;
      cell.hidden = !local;
      if (!local) return;
      cell.style.gridRow = String(local.row + 1); cell.style.gridColumn = String(local.col + 1);
      cell.setAttribute("aria-rowindex", String(local.row + 1)); cell.setAttribute("aria-colindex", String(local.col + 1));
      cell.classList.toggle("shared-cell", multi && position.boards.length > 1);
      if (multi) {
        var outerTop = focused ? local.row === 0 : position.boards.some(function (b) { return b.row === 0; });
        var outerLeft = focused ? local.col === 0 : position.boards.some(function (b) { return b.col === 0; });
        cell.style.borderTop = outerTop ? "2px solid var(--grid-strong)" : "0";
        cell.style.borderLeft = outerLeft ? "2px solid var(--grid-strong)" : "0";
        cell.style.borderRight = (local.col % 3 === 2 ? "2px solid var(--grid-strong)" : "1px solid var(--grid-line)");
        cell.style.borderBottom = (local.row % 3 === 2 ? "2px solid var(--grid-strong)" : "1px solid var(--grid-line)");
      }
    });
    if ($("multigrid-tools")) $("multigrid-tools").hidden = !multi;
    if ($("grid-view")) $("grid-view").value = activeBoardId;
    if ($("multi-grid-summary")) $("multi-grid-summary").textContent = boardLayout.boards.length + " 个子盘 · " + boardLayout.cellCount + " 格 · " +
      boardLayout.cells.filter(function (cell) { return cell.boards.length > 1; }).length + " 格共享";
  }

  function moveOnLayout(dx, dy) {
    var position = boardLayout.cells[game.selected];
    var focused = activeBoardId === "all" ? null : boardLayout.boards.find(function (b) { return b.id === activeBoardId; });
    var origin = focused ? position.boards.find(function (b) { return b.id === focused.id; }) : position;
    if (!origin) return;
    var size = focused ? 9 : boardLayout.columns;
    for (var step = 1; step < size; step++) {
      var row = origin.row + dy * step, col = origin.col + dx * step;
      if (row < 0 || col < 0 || row >= size || col >= size) return;
      var target = boardLayout.cells.findIndex(function (cell) {
        var local = focused ? cell.boards.find(function (b) { return b.id === focused.id; }) : cell;
        return local && local.row === row && local.col === col;
      });
      if (target >= 0) { selectCell(target, true); return; }
    }
  }

  function motionEnabled() {
    return (preferences.zen ? preferences.zenMotion : preferences.fx) && !reducedMotion.matches;
  }

  function automaticErrors() {
    return preferences.errorCheck && !preferences.zen;
  }

  function renderPreferences() {
    document.body.dataset.theme = preferences.theme;
    document.body.dataset.intensity = preferences.intensity;
    if ($("scene-intensity")) $("scene-intensity").value = preferences.intensity;
    document.body.dataset.colorScheme = LIGHT_THEMES.indexOf(preferences.theme) >= 0 ? "light" : "dark";
    if ($("theme-current-name")) $("theme-current-name").textContent = THEME_NAMES[preferences.theme];
    document.body.dataset.fx = motionEnabled() ? "on" : "off";
    document.body.dataset.zenMotion = preferences.zenMotion ? "on" : "off";
    document.body.dataset.pageHidden = String(document.hidden);
    document.body.dataset.motion = reducedMotion.matches ? "reduced" : "full";
    document.body.dataset.focus = preferences.focus && !preferences.zen ? "on" : "off";
    document.body.dataset.zen = preferences.zen ? "on" : "off";
    $("zen-toggle").setAttribute("aria-pressed", String(preferences.zen));
    $("zen-toggle").setAttribute("aria-label", preferences.zen ? "退出禅模式" : "进入禅模式");
    $("zen-toggle").querySelector("span").textContent = preferences.zen ? "退出禅模式" : "禅模式";
    $("zen-toggle").title = preferences.zen ? "回到原来的显示与反馈设置" : "收起成绩，进入静庭";
    $("zen-panel").hidden = !preferences.zen;
    var zenMotion = $("zen-motion-toggle");
    zenMotion.disabled = reducedMotion.matches;
    zenMotion.setAttribute("aria-pressed", String(preferences.zenMotion && !reducedMotion.matches));
    zenMotion.querySelector("span").textContent = preferences.zenMotion && !reducedMotion.matches ? "流动" : "静止";
    zenMotion.title = reducedMotion.matches ? "已遵循系统的减少动态设置" :
      preferences.zenMotion ? "让场景与棋盘静止，保留主题背景" : "开启柔和场景动画与棋盘视差";
    zenMotion.setAttribute("aria-label", zenMotion.title);
    $("sound-toggle").setAttribute("aria-pressed", String(preferences.sound));
    $("sound-toggle").setAttribute("aria-label", preferences.sound ? "关闭音效" : "开启音效");
    $("sound-toggle").title = preferences.sound ? "音效已开启" : "音效已关闭";
    $("focus-toggle").setAttribute("aria-pressed", String(preferences.focus));
    $("focus-toggle").setAttribute("aria-label", preferences.focus ? "退出沉浸模式" : "进入沉浸模式");
    var focusLabel = $("focus-toggle").querySelector("span");
    if (focusLabel) focusLabel.textContent = preferences.focus ? "退出沉浸" : "沉浸";
    Atmosphere.configure({ fx: preferences.zen ? preferences.zenMotion : preferences.fx,
      zen: preferences.zen, sound: preferences.sound && !preferences.zen,
      theme: preferences.theme, intensity: preferences.intensity, reducedMotion: reducedMotion.matches });
    var switcher = $("theme-switcher");
    if (switcher) switcher.querySelectorAll("[data-theme]").forEach(function (button) {
      var active = button.dataset.theme === preferences.theme;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    var fxButton = $("fx-toggle");
    if (fxButton) {
      fxButton.disabled = reducedMotion.matches;
      fxButton.setAttribute("aria-pressed", String(preferences.fx && !reducedMotion.matches));
      fxButton.title = reducedMotion.matches ? "已遵循系统的减少动态设置，保留静态背景" :
        preferences.fx ? "关闭动态背景与 3D 视差，保留静态场景" : "开启动画背景与 3D 视差";
      fxButton.setAttribute("aria-label", fxButton.title);
    }
    if ($("error-toggle")) $("error-toggle").setAttribute("aria-pressed", String(preferences.errorCheck));
    if (!motionEnabled()) {
      resetTilt();
      stopCelebration();
      clearPulse();
    }
  }

  function renderModeControls() {
    if (!game) return;
    var info = modeInfo(game.mode);
    var difficulty = difficultyInfo(game.mode, game.difficulty);
    var switcher = $("mode-switcher");
    if (switcher) switcher.querySelectorAll("[data-mode]").forEach(function (button) {
      var active = button.dataset.mode === game.mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    var select = $("difficulty");
    if (select) {
      if (select.dataset.mode !== game.mode) {
        select.replaceChildren();
        Engine.getDifficulties(game.mode).forEach(function (entry) {
          var option = document.createElement("option");
          option.value = entry.id;
          option.textContent = entry.label;
          select.appendChild(option);
        });
        select.dataset.mode = game.mode;
      }
      select.value = game.difficulty;
    }
    if ($("mode-name")) $("mode-name").textContent = info.label;
    if ($("current-mode-label")) $("current-mode-label").textContent = info.label;
    if ($("catalog-count")) $("catalog-count").textContent = MODES.length + " 种玩法";
    if ($("puzzle-bank-status")) {
      var available = PUZZLE_CATALOG.filter(function (p) { return p.mode === game.mode && p.difficulty === game.difficulty; }).length;
      $("puzzle-bank-status").textContent = game.generation ? "离线新题 · " + game.generation.givenCount + " 个给定数 · " + difficulty.label + "密度档" :
        difficulty.label + "原题库 · " + available + " 题" + (game.difficulty === "master" ? "" : " · 新游戏可离线生成");
      $("puzzle-bank-status").title = game.generation ? "基于合法解与本玩法约束重新挖空，逐步验证唯一解；档位按给定数密度，不是人类技巧评级。变体标记结构来自原题；只避开最近256道题面指纹，不保证永不重复。" :
        "原题库轮换保留。普通新游戏可在后台重新挖空生成；极境、每日和旅程保留原题规则。";
    }
    document.body.dataset.outsideClues = String(Boolean(game.clues && game.clues.outside && game.clues.outside.length));
    if (isMulti()) {
      $('variant-overlay').replaceChildren();
      if ($('variant-legend')) $('variant-legend').textContent = '每个子盘分别遵守标准九宫规则。染色的共享宫在相邻子盘中是同一组格子，只填写一次。';
    } else if (window.SudokuVariantView) {
      var legend = window.SudokuVariantView.render($("variant-overlay"), gameContext());
      if ($("variant-legend") && legend) $("variant-legend").textContent =
        typeof legend === "string" ? legend : Array.isArray(legend.legend) ? legend.legend.join(" · ") : legend.legend || "";
    }
    if ($("mode-rule")) $("mode-rule").textContent = info.description;
    $("zen-rule").textContent = info.label + " · " + info.description;
    if ($("board-context")) $("board-context").textContent = info.label + " · " + difficulty.label;
    if ($("difficulty-description")) $("difficulty-description").textContent = difficulty.description;
    if ($("rule-badge")) $("rule-badge").textContent = {
      classic: "基础规则", diagonal: "双对角线", hyper: "四个窗口", knight: "马步约束"
    }[game.mode];
    document.body.dataset.mode = game.mode;
    boardElement.dataset.mode = game.mode;
  }

  function render() {
    if (!game) return;
    if (boardLayoutKey !== game.mode + ':' + game.board.length) buildBoard();
    if (isMulti() && cells[game.selected] && cells[game.selected].hidden) {
      activeBoardId = boardLayout.cells[game.selected].boards[0].id;
      applyBoardView();
    }
    renderModeControls();
    renderEnergy();
    if (pendingHint && pendingHint.signature !== hintSignature()) pendingHint = null;
    var selectedValue = game.board[game.selected];
    var errors = automaticErrors() || checkedReveal ? conflicts() : new Set();
    var waitingToStart = !game.started;
    var blocked = generatingPuzzle || waitingToStart || game.paused || game.completed;
    var filled = 0;
    var editableTotal = 0;
    var solved = 0;
    cells.forEach(function (button, i) {
      var value = game.board[i];
      var fogged = game.fog && !game.fogSeen[i] && !game.completed;
      button.classList.toggle("fogged", fogged);
      if (value) filled++;
      if (!game.givens[i]) {
        editableTotal++;
        if (game.branch ? Boolean(value) : value === game.solution[i]) solved++;
      }
      (button._variantDecorations || []).forEach(function (name) { button.classList.remove(name); });
      var decorations = Engine.getCellDecorations(i, gameContext());
      decorations.forEach(function (name) { button.classList.add(name); });
      button._variantDecorations = decorations;
      var specialPeer = i !== game.selected && (game.mode === "knight" ?
        isKnightMove(i, game.selected) :
        sameUnit(i, game.selected) && (isMulti() ? boardLayout.cells[game.selected].boards.length > 1 : !Engine.arePeers(i, game.selected, "classic")));
      button.classList.toggle("variant-peer", specialPeer);
      button.classList.toggle("knight-target", game.mode === "knight" && specialPeer);
      button.classList.toggle("given", !fogged && Boolean(game.givens[i]));
      button.classList.toggle("filled", !fogged && Boolean(value) && !game.givens[i]);
      button.classList.toggle("selected", i === game.selected);
      button.classList.toggle("related", i !== game.selected && sameUnit(i, game.selected));
      button.classList.toggle("same-value", !fogged && Boolean(selectedValue) && value === selectedValue && i !== game.selected);
      button.classList.toggle("conflict", !fogged && errors.has(i));
      button.classList.toggle("hint-cell", i === hintCell || Boolean(pendingHint && pendingHint.step.index === i));
      button.classList.toggle("hint-focus", Boolean(pendingHint && pendingHint.step.focusCells.indexOf(i) >= 0));
      button.classList.toggle("branch-cell", Boolean(game.branch) &&
        (value !== game.branch.board[i] || game.notes[i] !== game.branch.notes[i]));
      button.setAttribute("aria-selected", String(i === game.selected));
      button.setAttribute("aria-readonly", String(!fogged && Boolean(game.givens[i])));
      button.setAttribute("aria-invalid", String(!fogged && errors.has(i)));
      button.tabIndex = i === game.selected && !blocked ? 0 : -1;
      button.disabled = blocked;
      button.querySelector(".value").textContent = !fogged && value ? String(value) : "";
      var notes = [];
      button.querySelectorAll(".notes span").forEach(function (span, index) {
        var present = !fogged && !value && Boolean(game.notes[i] & (1 << index));
        span.textContent = present ? String(index + 1) : "";
        if (present) notes.push(index + 1);
      });
      button.setAttribute("aria-label", cellLocation(i) + "，" + (value ? "数字 " + value : (notes.length ? "候选 " + notes.join("、") : "空格")) +
        (game.givens[i] ? "，题目给定" : "") + (specialPeer ? "，与选中格共享特殊约束" : "") +
        (errors.has(i) ? (game.branch ? "，规则冲突" : "，数字有误") : ""));
      if (!isMulti() && !fogged && window.SudokuVariantView && window.SudokuVariantView.getCellLabel) {
        var clueLabel = window.SudokuVariantView.getCellLabel(i, gameContext());
        if (clueLabel) button.setAttribute("aria-label", button.getAttribute("aria-label") + "，" + clueLabel);
      }
      if (fogged) button.setAttribute("aria-label", cellLocation(i) + "，迷雾，点击照亮周围九格");
    });
    numberKeys.forEach(function (button, index) {
      var value = index + 1;
      var count = game.board.filter(function (n) { return n === value; }).length;
      var remaining = Math.max(0, game.solution.filter(function (n) { return n === value; }).length - count);
      button.querySelector(".remaining").textContent = remaining ? String(remaining) : "✓";
      button.classList.toggle("exhausted", remaining === 0);
      button.setAttribute("aria-label", "填入 " + value + "，还可填写 " + remaining + " 个");
      button.disabled = blocked;
    });
    if ($("difficulty")) $("difficulty").value = game.difficulty;
    if ($("timer")) $("timer").textContent = formatTime(currentElapsed());
    if ($("mistakes")) $("mistakes").textContent = String(game.mistakes).padStart(2, "0");
    if ($("progress-count")) $("progress-count").textContent = solved + " / " + editableTotal;
    if ($("progress-fill")) $("progress-fill").style.width = (editableTotal ? solved / editableTotal * 100 : 100) + "%";
    if ($("notes-btn")) {
      $("notes-btn").classList.toggle("active", noteMode);
      $("notes-btn").setAttribute("aria-pressed", String(noteMode));
      $("notes-btn").disabled = blocked;
    }
    if ($("notes-state")) $("notes-state").textContent = noteMode ? "笔记模式" : "数字模式";
    if ($("undo-btn")) $("undo-btn").disabled = blocked || game.history.length === 0;
    if ($("erase-btn")) $("erase-btn").disabled = blocked || Boolean(game.givens[game.selected]) ||
      (!game.board[game.selected] && !game.notes[game.selected]);
    if ($("hint-btn")) {
      $("hint-btn").disabled = blocked || Boolean(game.branch);
      $("hint-btn").title = game.branch ? "假设中暂不揭晓答案；采纳或撤回后可使用提示" : "获取当前玩法的解题提示";
    }
    if ($("check-btn")) $("check-btn").disabled = blocked;
    if ($("auto-notes-btn")) $("auto-notes-btn").disabled = blocked;
    if ($("branch-btn")) {
      $("branch-btn").disabled = blocked || Boolean(game.branch);
      $("branch-btn").setAttribute("aria-pressed", String(Boolean(game.branch)));
    }
    if ($("branch-banner")) $("branch-banner").hidden = !game.branch;
    if ($("branch-rollback")) $("branch-rollback").disabled = blocked;
    if ($("branch-commit")) $("branch-commit").disabled = blocked;
    if ($("branch-summary") && game.branch) {
      var changes = game.board.reduce(function (count, value, i) {
        return count + (value !== game.branch.board[i] || game.notes[i] !== game.branch.notes[i] ? 1 : 0);
      }, 0);
      $("branch-summary").textContent = "假设中 · 已改动 " + changes + " 格。仅检查规则冲突，暂不计失误。";
    }
    document.body.dataset.branch = game.branch ? "on" : "off";
    $("fog-toggle").setAttribute("aria-pressed", String(game.fog));
    $("fog-banner").hidden = !game.fog;
    $("fog-clear").disabled = blocked || game.fogSeen.every(Boolean);
    $("fog-progress").textContent = "已点亮 " + (game.completed ? game.board.length : game.fogSeen.filter(Boolean).length) + " / " + game.board.length;
    $("voyage-game-badge").hidden = !game.voyageId;
    $("voyage-game-badge").textContent = game.voyageId ? "远征 · " + chapterInfo(game.voyageId).title : "";
    $("daily-game-badge").hidden = !game.dailyDate;
    $("daily-game-badge").textContent = game.dailyDate ? "每日一境 · " + game.dailyDate.slice(5).replace("-", "/") : "";
    renderHint();
    if ($("pause-btn")) {
      $("pause-btn").disabled = waitingToStart || game.completed;
      var pauseText = waitingToStart ? "尚未开始" : game.paused ? "继续游戏" : "暂停游戏";
      $("pause-btn").setAttribute("aria-label", pauseText);
      $("pause-btn").title = waitingToStart ? "点击棋盘上的开始游戏后计时" : pauseText;
      $("pause-btn").setAttribute("aria-pressed", String(game.paused));
      var pauseLabel = $("pause-btn").querySelector("[data-label]");
      if (pauseLabel) pauseLabel.textContent = pauseText;
      var pauseIcon = $("pause-btn").querySelector("use");
      if (pauseIcon) pauseIcon.setAttribute("href", game.paused || waitingToStart ? "#i-play" : "#i-pause");
    }
    $("zen-pause").disabled = waitingToStart || game.completed;
    $("zen-pause").setAttribute("aria-pressed", String(game.paused));
    $("zen-pause").querySelector("span").textContent = game.completed ? "此境已圆满" :
      waitingToStart ? "等你开始" : game.paused ? "继续静心" : "暂停歇息";
    $("zen-pause").querySelector("use").setAttribute("href", game.paused || waitingToStart ? "#i-play" : "#i-pause");
    if ($("pause-overlay")) $("pause-overlay").hidden = game.completed || (!waitingToStart && !game.paused);
    if ($("start-btn")) $("start-btn").hidden = !waitingToStart || game.completed;
    if ($("resume-btn")) $("resume-btn").hidden = waitingToStart || game.completed;
    if ($("pause-title")) $("pause-title").textContent = waitingToStart ? "准备好，开启这一境。" : "暂停一下，也很好。";
    if ($("pause-description")) $("pause-description").textContent = preferences.zen ?
      (waitingToStart ? "准备好了，就从一个空格开始。不必着急。" : "棋局已为你保留，准备好后再继续。") :
      waitingToStart ? modeInfo(game.mode).label + " · " + difficultyInfo(game.mode, game.difficulty).label +
        "。点击开始后，棋盘与计时一起开启。" : "进度已经保存，点击继续后再恢复计时。";
    document.body.dataset.gameState = game.completed ? "completed" : waitingToStart ? "ready" : game.paused ? "paused" : "playing";
    if ($("multi-selected-label") && isMulti()) $("multi-selected-label").textContent = cellLocation(game.selected);
    boardElement.setAttribute("aria-label", modeInfo(game.mode).label + "棋盘，已填 " + filled + " 格，共 " + game.board.length + " 格");
  }

  function canInteract() {
    return game && game.started && !generatingPuzzle && !game.paused && !game.completed && !dialogIsOpen();
  }

  function selectCell(index, moveFocus) {
    if (!canInteract() || index < 0 || index >= game.board.length) return;
    game.selected = index;
    revealFog(index);
    render();
    if (moveFocus) cells[index].focus({ preventScroll: true });
    save();
  }

  function remember() {
    game.history.push({
      board: game.board.slice(),
      notes: game.notes.slice(),
      selected: game.selected,
      noteMode: noteMode
    });
    if (game.history.length > 80) game.history.shift();
  }

  function flash(index) {
    if (!motionEnabled()) return;
    var element = cells[index];
    element.classList.remove("just-filled");
    requestAnimationFrame(function () {
      if (!motionEnabled()) return;
      element.classList.add("just-filled");
      setTimeout(function () { element.classList.remove("just-filled"); }, 360);
    });
  }

  function clearPeerNotes(index, value) {
    for (var i = 0; i < game.board.length; i++) {
      if (!game.board[i] && sameUnit(i, index)) game.notes[i] &= ~(1 << (value - 1));
    }
  }

  function enterNumber(value, fromHint) {
    if (!canInteract() || !Number.isInteger(value) || value < 1 || value > 9) return;
    var index = game.selected;
    if (game.givens[index]) {
      toast("这是题目给定的数字，请选择一个空格。");
      return;
    }
    if (noteMode && !fromHint) {
      if (game.board[index]) {
        toast("先擦除当前数字，再添加候选笔记。");
        return;
      }
      remember();
      game.notes[index] ^= 1 << (value - 1);
      setStatus("笔记模式 · 再点一次相同数字即可取消标记。");
    } else {
      if (game.board[index] === value) return;
      remember();
      game.board[index] = value;
      game.notes[index] = 0;
      clearPeerNotes(index, value);
      if (!game.branch && value !== game.solution[index] && !fromHint) {
        game.mistakes++;
        setStatus(automaticErrors() ? "这个数字与答案不符，可以撤销后再想一想。" : "已填入数字。");
      } else if (!fromHint) {
        setStatus(game.branch ? "已记录假设。这次试填仅检查规则冲突，可继续推理或撤回。" : preferences.zen ? "已填入数字。" : "保持节奏，答案就在这些细节里。");
      }
      recordEnergy(index, value, fromHint);
      flash(index);
    }
    render();
    checkCompletion();
    save(fromHint ? "提示填入" : noteMode ? "笔记" : "填数");
  }

  function erase() {
    if (!canInteract()) return;
    var index = game.selected;
    if (game.givens[index] || (!game.board[index] && !game.notes[index])) return;
    remember();
    game.board[index] = 0;
    game.notes[index] = 0;
    if (!game.branch) game.energy.combo = 0;
    setStatus("已擦除当前格。");
    render();
    save("擦除");
  }

  function undo() {
    if (!canInteract() || !game.history.length) return;
    if (!game.branch) game.energy.combo = 0;
    var previous = game.history.pop();
    game.board = previous.board.slice();
    game.notes = previous.notes.slice();
    if (Number.isInteger(previous.selected) && previous.selected >= 0 && previous.selected < game.board.length) {
      game.selected = previous.selected;
    }
    if (typeof previous.noteMode === "boolean") noteMode = previous.noteMode;
    clearTransientMarks();
    setStatus(game.branch ? "已撤销一次试填，检查点仍然保留。" : preferences.zen ? "已撤销上一步，慢慢推敲就好。" : "已撤销上一步，累计失误数保持不变。");
    render();
    save("撤销");
  }

  function clearTransientMarks() {
    pendingHint = null;
    clearPulse();
    clearTimeout(hintTimeout);
    clearTimeout(checkTimeout);
    hintCell = -1;
    checkedReveal = false;
  }

  function beginBranch() {
    if (!canInteract() || game.branch) return;
    game.energy.combo = 0;
    game.branch = {
      board: game.board.slice(), notes: game.notes.slice(), selected: game.selected,
      noteMode: noteMode, history: game.history.map(copySnapshot), mistakes: game.mistakes
    };
    game.history = [];
    clearTransientMarks();
    setStatus("已建立检查点。试填会用异色标记，仅检查规则冲突；随时可以撤回。");
    render();
    save("建立假设");
  }

  function rollbackBranch() {
    if (!canInteract() || !game.branch) return;
    var checkpoint = game.branch;
    game.board = checkpoint.board.slice();
    game.notes = checkpoint.notes.slice();
    game.selected = checkpoint.selected;
    game.history = checkpoint.history.map(copySnapshot);
    game.mistakes = checkpoint.mistakes;
    noteMode = checkpoint.noteMode;
    game.branch = null;
    clearTransientMarks();
    setStatus(preferences.zen ? "已回到检查点，试填数字和笔记均已恢复。" : "已回到检查点，试填数字和笔记均已恢复；累计用时保留。");
    render();
    save("回退假设");
  }

  function commitBranch() {
    if (!canInteract() || !game.branch) return;
    var checkpoint = game.branch;
    var changed = game.board.some(function (value, i) {
      return value !== checkpoint.board[i] || game.notes[i] !== checkpoint.notes[i];
    });
    var newErrors = game.board.reduce(function (count, value, i) {
      return count + (!game.givens[i] && value && value !== checkpoint.board[i] && value !== game.solution[i] ? 1 : 0);
    }, 0);
    game.history = checkpoint.history.map(copySnapshot);
    if (changed) game.history.push(copySnapshot(checkpoint));
    game.history = game.history.slice(-80);
    game.mistakes = checkpoint.mistakes + newErrors;
    game.branch = null;
    game.board.forEach(function (value, i) { if (value) game.energy.claimed[i] = true; });
    game.energy.combo = 0;
    settleUnits(false);
    clearTransientMarks();
    setStatus(newErrors && !preferences.zen ? "已采纳这组试填，其中 " + newErrors + " 个新增数字与答案不符；可整组撤销。" :
      "已采纳这组试填，恢复正式填写；撤销一次即可回到检查点。");
    render();
    checkCompletion();
    save("采纳假设");
  }

  function toggleNotes() {
    if (!canInteract()) return;
    noteMode = !noteMode;
    setStatus(noteMode ? "笔记模式已开启 · 记录可能的数字，按 N 可随时切换。" : "笔记模式已关闭 · 现在会填入正式数字。");
    render();
    save();
  }

  function autoNotes() {
    if (!canInteract()) return;
    if (game.branch ? conflicts().size > 0 : game.board.some(function (value, index) { return value && value !== game.solution[index]; })) {
      setStatus(game.branch ? "先解决当前规则冲突，再生成候选笔记；可点击检查定位。" : "先修正已有的错误数字，再生成候选笔记；可用「检查」或「灵感提示」定位。");
      toast(game.branch ? "当前存在规则冲突，请先检查。" : "当前有错误数字，请先检查。");
      return;
    }
    var next = game.board.map(function (value, index) {
      if (value) return 0;
      return Engine.candidates(game.board, index, gameContext()).reduce(function (mask, digit) {
        return mask | (1 << (digit - 1));
      }, 0);
    });
    var changed = next.some(function (mask, index) { return mask !== game.notes[index]; });
    if (changed) {
      remember();
      game.notes = next;
    }
    noteMode = true;
    setStatus("已按" + modeInfo(game.mode).label + "规则整理候选，可撤销。候选仍需结合其他格子推理。");
    render();
    save("候选速记");
  }


  function completedUnitIndices() {
    return Engine.getUnits(gameContext()).reduce(function (result, unit, index) {
      if (unit.cells.every(function (cell) { return game.board[cell] === game.solution[cell]; })) result.push(index);
      return result;
    }, []);
  }

  function restoreEnergy(source) {
    var count = Engine.getUnits(gameContext()).length;
    var valid = source && Array.isArray(source.claimed) && source.claimed.length === game.board.length &&
      source.claimed.every(function (v) { return typeof v === "boolean"; });
    function integer(value, max) { return Number.isInteger(value) && value >= 0 && value <= max ? value : 0; }
    var combo = valid ? integer(source.combo, game.board.length) : 0;
    return {
      points: valid ? integer(source.points, 50000) : 0,
      combo: game.branch ? 0 : combo,
      best: valid ? Math.max(combo, integer(source.best, game.board.length)) : 0,
      claimed: valid ? source.claimed.map(function (v, i) { return v || Boolean(game.givens[i]); }) :
        game.board.map(function (value) { return Boolean(value); }),
      units: valid && Array.isArray(source.units) ?
        Array.from(new Set(source.units.filter(function (u) { return Number.isInteger(u) && u >= 0 && u < count; }))) :
        completedUnitIndices()
    };
  }

  function renderEnergy() {
    var muted = preferences.zen || Boolean(game.branch) || !preferences.errorCheck;
    $("energy-hud").dataset.muted = String(muted);
    $("energy-points").textContent = muted ? "—" : String(game.energy.points);
    $("energy-combo").textContent = muted ? "—" : String(game.energy.combo);
    $("energy-best").textContent = muted ? "—" : String(game.energy.best);
    $("energy-message").textContent = game.branch ? "假设中暂停奖励，安心试填" :
      !preferences.errorCheck ? "开启纠错后可获得星能反馈" :
      game.energy.combo >= 5 ? "星能共振 · 每格首次落子才奖励" :
      "首次正确落子积攒星能 · 撤销不重复奖励";
    $("board-card").classList.toggle("combo-charge", !muted && game.energy.combo >= 5 &&
      game.started && !game.paused && !game.completed);
  }

  function clearPulse() {
    clearTimeout(pulseTimeout);
    if ($("pulse-banner")) $("pulse-banner").hidden = true;
    cells.forEach(function (cell) {
      cell.classList.remove("unit-pulse", "combo-pulse");
      cell.style.removeProperty("--pulse-delay");
    });
  }

  function settleUnits(reward) {
    var units = Engine.getUnits(gameContext());
    var newlyCompleted = completedUnitIndices().filter(function (index) { return game.energy.units.indexOf(index) < 0; });
    newlyCompleted.forEach(function (index) { game.energy.units.push(index); });
    if (!reward || !newlyCompleted.length) return;
    game.energy.points += newlyCompleted.length * 25;
    if (preferences.zen) return;
    clearPulse();
    var highlights = Array.from(new Set(newlyCompleted.reduce(function (all, index) {
      return all.concat(units[index].cells);
    }, [])));
    if (motionEnabled()) highlights.forEach(function (index, n) {
      cells[index].style.setProperty("--pulse-delay", (n % 9 * 35) + "ms");
      cells[index].classList.add("unit-pulse");
    });
    $("pulse-banner").textContent = "区域共鸣 · " + newlyCompleted.map(function (index) {
      return units[index].label;
    }).join(" / ") + " · +" + newlyCompleted.length * 25 + " 星能";
    $("pulse-banner").hidden = false;
    Atmosphere.play("unit", newlyCompleted.length);
    pulseTimeout = setTimeout(clearPulse, 2200);
  }

  function recordEnergy(index, value, fromHint) {
    // Never compare trial entries to the solution: the checkpoint is a safe workspace.
    if (game.branch) return;
    var energy = game.energy;
    if (fromHint || !preferences.errorCheck) {
      energy.combo = 0;
      energy.claimed[index] = true;
      settleUnits(false);
      return;
    }
    if (value !== game.solution[index]) {
      energy.combo = 0;
      Atmosphere.play("mistake");
      return;
    }
    var fresh = !energy.claimed[index];
    if (fresh) {
      energy.claimed[index] = true;
      energy.combo++;
      energy.best = Math.max(energy.best, energy.combo);
      energy.points += 10 + Math.min(energy.combo, 5) * 2;
      if (!preferences.zen && motionEnabled()) {
        cells[index].classList.remove("combo-pulse");
        void cells[index].offsetWidth;
        cells[index].classList.add("combo-pulse");
      }
      Atmosphere.play("place", energy.combo);
    } else {
      energy.combo = 0;
    }
    settleUnits(fresh);
  }


  function chapterInfo(id) {
    return Voyage.chapters().find(function (chapter) { return chapter.id === id; });
  }

  function readVoyage() {
    try { voyageProgress = Voyage.normalizeProgress(JSON.parse(localStorage.getItem(VOYAGE_KEY) || "{}")); }
    catch (error) { voyageProgress = {}; }
  }

  function saveVoyage() {
    try { localStorage.setItem(VOYAGE_KEY, JSON.stringify(voyageProgress)); }
    catch (error) { toast("星图成绩暂时无法保存到本机，本局仍可继续游玩。"); }
  }

  function renderVoyage() {
    var status = Voyage.getStatus(voyageProgress);
    var chapters = Voyage.chapters();
    var next = chapterInfo(status.nextId) || chapters[8];
    $("voyage-card-title").textContent = status.completed === 9 ? "九星已点亮 · 重访远征" : "下一站 · " + next.title;
    $("voyage-card-progress").textContent = status.completed + " / 9 关 · " + status.stars + " / 27 星";
    $("voyage-total-stars").textContent = String(status.stars);
    var selected = chapterInfo(selectedVoyage);
    if (!selected || selected.index >= status.unlocked) {
      selectedVoyage = next.id;
      selected = next;
    }
    var map = $("voyage-map");
    map.replaceChildren();
    chapters.forEach(function (chapter) {
      var record = voyageProgress[chapter.id];
      var locked = chapter.index >= status.unlocked;
      var button = document.createElement("button");
      button.type = "button";
      button.className = "voyage-node" + (locked ? " locked" : "") +
        (record ? " completed" : "") + (chapter.id === selectedVoyage ? " current" : "");
      button.dataset.voyage = chapter.id;
      button.disabled = locked;
      button.setAttribute("aria-pressed", String(chapter.id === selectedVoyage));
      button.setAttribute("aria-label", "第 " + (chapter.index + 1) + " 关，" + chapter.title +
        (locked ? "，完成前一关后解锁" : record ? "，已获得 " + record.stars + " 星，可重玩" : "，可挑战"));
      var number = document.createElement("span");
      number.className = "node-number";
      number.textContent = String(chapter.index + 1).padStart(2, "0");
      var title = document.createElement("strong");
      title.textContent = chapter.title;
      var stars = document.createElement("small");
      stars.textContent = locked ? "待解锁" : "★".repeat(record ? record.stars : 0) + "☆".repeat(3 - (record ? record.stars : 0));
      button.append(number, title, stars);
      map.appendChild(button);
    });
    $("voyage-selected-title").textContent = String(selected.index + 1).padStart(2, "0") + " · " + selected.title;
    $("voyage-selected-rule").textContent = modeInfo(selected.mode).label + " · " +
      difficultyInfo(selected.mode, selected.difficulty).label + "。 " + selected.subtitle;
    $("voyage-description").textContent = "通关即得 1 星并解锁下一关；不用提示、零失误各加 1 星。没有倒计时，重玩保留最佳星级。";
    var current = game && game.voyageId === selected.id && !game.completed;
    $("voyage-start").textContent = current ? "返回这一关" : voyageProgress[selected.id] ? "重访这一星" : "准备出发";
    $("voyage-start").disabled = loadingVoyage;
  }

  function openVoyage() {
    if (dialogIsOpen()) return;
    var status = Voyage.getStatus(voyageProgress);
    selectedVoyage = game && game.voyageId && !game.completed ? game.voyageId : status.nextId || "home";
    renderVoyage();
    showDialog($("voyage-dialog"));
    save();
  }

  async function startVoyage() {
    if (loadingVoyage || !$("voyage-dialog").open) return;
    var chapter = chapterInfo(selectedVoyage);
    if (!chapter || chapter.index >= Voyage.getStatus(voyageProgress).unlocked) return;
    loadingVoyage = true;
    $("voyage-start").disabled = true;
    try {
      closeDialog($("voyage-dialog"));
      if (game && game.voyageId === chapter.id && !game.completed) {
        setStatus(!game.started ? "这一关已准备好，点击开始游戏后计时。" :
          game.paused ? "已返回这一关，点击继续后再恢复计时。" : "继续点亮这一星。");
        return;
      }
      if (game && hasProgress()) {
        var accepted = await confirmNewGame(chapter.difficulty, chapter.mode, false);
        if (!accepted) { setStatus("已保留当前棋局，星图随时等你出发。"); return; }
      }
      installPuzzle(Voyage.getPuzzle(chapter.id), chapter.difficulty, chapter.mode);
      setStatus("星图远征 · " + chapter.title + "已准备好。点击开始游戏，点亮第一颗星。");
      save();
    } catch (error) {
      toast("暂时无法载入这一关，当前棋局已保留。");
      resumeClock();
    } finally {
      loadingVoyage = false;
      renderVoyage();
    }
  }

  function finishVoyage() {
    $("completion-voyage").hidden = !game.voyageId;
    $("play-again").textContent = game.voyageId ? "返回星图 · 探索下一站" : "探索下一境";
    if (!game.voyageId) return;
    var earned = 1 + (game.hints === 0 ? 1 : 0) + (game.mistakes === 0 ? 1 : 0);
    voyageProgress = Voyage.award(voyageProgress, game.voyageId, {
      elapsedMs: Math.floor(game.elapsedMs), mistakes: game.mistakes, hints: game.hints
    });
    saveVoyage();
    renderVoyage();
    $("completion-voyage").textContent = "★".repeat(earned) + "☆".repeat(3 - earned) +
      " · " + chapterInfo(game.voyageId).title + "已点亮！最佳星级 " +
      (voyageProgress[game.voyageId] ? voyageProgress[game.voyageId].stars : earned) + " 星";
  }

  function readDaily() {
    try {
      dailyRecords = Daily.normalizeRecords(JSON.parse(localStorage.getItem(DAILY_KEY) || "{}"));
    } catch (error) { dailyRecords = {}; }
  }

  function saveDaily() {
    try { localStorage.setItem(DAILY_KEY, JSON.stringify(dailyRecords)); }
    catch (error) { toast("每日记录暂时无法保存到本机，本次仍可继续游玩。"); }
  }

  function renderDaily() {
    dailyToday = Daily.dateKey();
    var puzzle = Daily.getPuzzle(dailyToday);
    var stats = Daily.getStats(dailyRecords, dailyToday);
    var currentDaily = game && game.dailyDate === dailyToday && !game.completed;
    var label = modeInfo(puzzle.mode).label + " · " + difficultyInfo(puzzle.mode, puzzle.difficulty).label;
    $("daily-card-date").textContent = dailyToday.slice(5).replace("-", " / ") + " · " + label;
    $("daily-card-status").textContent = stats.todayCompleted ? "今日已点亮" : currentDaily ? "今日进行中" : "今日待探索";
    $("daily-date").textContent = dailyToday.replace(/-/g, " / ");
    $("daily-description").textContent = label + "。每天一道题，把专注留给此刻。";
    $("daily-total").textContent = String(stats.total);
    $("daily-streak").textContent = String(stats.streak);
    $("daily-start").textContent = currentDaily ? "返回今日棋局" : stats.todayCompleted ? "重玩今日一境" : "准备今日一境";
    $("daily-start").disabled = loadingDaily;
    var calendar = $("daily-calendar");
    calendar.replaceChildren();
    Daily.recentDates(dailyToday, 7).forEach(function (key) {
      var day = document.createElement("span");
      var complete = Boolean(dailyRecords[key]);
      day.className = "daily-day" + (complete ? " completed" : "") + (key === dailyToday ? " today" : "");
      day.setAttribute("role", "listitem");
      day.setAttribute("aria-label", key + (complete ? "，已完成" : "，未完成"));
      if (key === dailyToday) day.setAttribute("aria-current", "date");
      var weekday = document.createElement("small");
      weekday.textContent = ["日", "一", "二", "三", "四", "五", "六"][new Date(key + "T00:00:00Z").getUTCDay()];
      var number = document.createElement("strong");
      number.textContent = String(Number(key.slice(-2)));
      var mark = document.createElement("i");
      mark.textContent = complete ? "✓" : "·";
      day.append(weekday, number, mark);
      calendar.appendChild(day);
    });
  }

  function openDaily() {
    if (dialogIsOpen()) return;
    renderDaily();
    showDialog($("daily-dialog"));
    save();
  }

  async function startDaily() {
    if (loadingDaily || !$("daily-dialog").open) return;
    if (dailyToday !== Daily.dateKey()) {
      renderDaily();
      toast("北京时间已进入新的一天，今日题目已更新。");
      return;
    }
    var date = dailyToday;
    loadingDaily = true;
    $("daily-start").disabled = true;
    try {
      if (game.dailyDate === date && !game.completed) {
        closeDialog($("daily-dialog"));
        setStatus(game.paused ? "已返回今日棋局，点击继续后再恢复计时。" :
          game.started ? "继续探索今日一境。" : "每日一境已准备好，点击开始游戏后计时。");
        $("board-stage").scrollIntoView({ block: "nearest", behavior: "instant" });
        return;
      }
      var puzzle = Daily.getPuzzle(date);
      closeDialog($("daily-dialog"));
      if (hasProgress()) {
        var accepted = await confirmNewGame(puzzle.difficulty, puzzle.mode, false);
        if (!accepted) {
          setStatus("已保留当前棋局，随时可以再来挑战每日一境。");
          return;
        }
      }
      installPuzzle(puzzle, puzzle.difficulty, puzzle.mode);
      setStatus(date + " 每日一境已准备好。点击开始后计时，完成即可点亮今日。");
      save();
    } catch (error) {
      toast("每日题暂时无法载入，当前棋局已保留。");
      resumeClock();
    } finally {
      loadingDaily = false;
      renderDaily();
    }
  }

  function hintSignature() {
    return game.puzzleId + ":" + game.board.join("") + ":" + game.mode + ":" + JSON.stringify(game.clues);
  }

  function renderHint() {
    var panel = $("hint-panel");
    panel.hidden = !pendingHint || !game.started || game.paused || game.completed || Boolean(game.branch);
    if (panel.hidden) return;
    var hint = pendingHint.step;
    var stage = pendingHint.stage;
    $("hint-stage").textContent = ["01 / 03 · 观察", "02 / 03 · 推理", "03 / 03 · 答案"][stage];
    $("hint-title").textContent = hint.title;
    $("hint-text").textContent = [hint.observe, hint.explanation, hint.answer][stage];
    $("hint-next").hidden = stage === 2;
    $("hint-next").textContent = stage === 0 ? "看看推理" : "查看答案";
    $("hint-apply").hidden = stage !== 2;
  }

  function requestHint() {
    if (!canInteract() || game.branch) return;
    if (!pendingHint || pendingHint.signature !== hintSignature()) {
      var hint = window.SudokuHints.getStep(game.board.slice(), game.givens.slice(), game.solution.slice(), gameContext());
      if (!hint || !Number.isInteger(hint.index) || hint.index < 0 || hint.index >= game.board.length ||
          game.givens[hint.index] || hint.value !== game.solution[hint.index]) {
        toast("当前没有可用提示。");
        return;
      }
      pendingHint = { step: hint, stage: 0, signature: hintSignature() };
      game.hints++;
      game.energy.combo = 0;
      game.selected = hint.index;
      hint.focusCells.forEach(function (index) { game.fogSeen[index] = true; });
      revealFog(hint.index);
    }
    setStatus("先观察高亮区域。提示不会自动落子，随时可以收起后自己推理。");
    render();
    save("查看提示");
    $("hint-panel").scrollIntoView({ block: "nearest", behavior: "instant" });
  }

  function advanceHint() {
    if (!canInteract() || game.branch || !pendingHint || pendingHint.signature !== hintSignature()) return;
    pendingHint.stage = Math.min(2, pendingHint.stage + 1);
    renderHint();
  }

  function applyHint() {
    if (!canInteract() || game.branch || !pendingHint || pendingHint.stage !== 2 ||
        pendingHint.signature !== hintSignature()) return;
    var hint = pendingHint.step;
    pendingHint = null;
    game.selected = hint.index;
    enterNumber(hint.value, true);
    hintCell = hint.index;
    clearTimeout(hintTimeout);
    hintTimeout = setTimeout(function () { hintCell = -1; render(); }, 3500);
    if (!game.completed) setStatus(hint.answer);
    render();
    save();
  }

  function initialFog(context) {
    return Engine.getLayout(context || gameContext()).cells.map(function (cell) {
      return cell.boards.some(function (board) { return board.row >= 3 && board.row <= 5 && board.col >= 3 && board.col <= 5; });
    });
  }

  function revealFog(index) {
    if (!game || !Number.isInteger(index) || index < 0 || index >= game.board.length) return;
    var layout = Engine.getLayout(gameContext()), source = layout.cells[index];
    layout.cells.forEach(function (cell, i) {
      if (Math.abs(cell.row - source.row) <= 1 && Math.abs(cell.col - source.col) <= 1) game.fogSeen[i] = true;
    });
  }

  function toggleFog() {
    if (!game || dialogIsOpen()) return;
    game.fog = !game.fog;
    preferences.fog = game.fog;
    revealFog(game.selected);
    setStatus(game.fog ? "迷雾探索已开启：点击任意雾格，就能照亮周围九格，不限制探索次数。" :
      "迷雾已收起，继续按原规则解题；已探索的区域会保留。");
    render();
    save();
  }

  function clearFog() {
    if (!canInteract() || !game.fog) return;
    game.fogSeen.fill(true);
    render();
    save();
    setStatus("迷雾已全部散去，按自己的节奏完成这一境。");
  }

  function checkBoard() {
    if (!canInteract()) return;
    if (game.branch) {
      var ruleErrors = conflicts();
      var stuck = [];
      for (var i = 0; i < game.board.length; i++) {
        if (!game.board[i] && Engine.candidates(game.board, i, gameContext()).length === 0) stuck.push(i);
      }
      checkedReveal = true;
      clearTimeout(checkTimeout);
      checkTimeout = setTimeout(function () { checkedReveal = false; render(); }, 6000);
      setStatus(ruleErrors.size || stuck.length ?
        "假设检查：" + ruleErrors.size + " 格存在规则冲突，" + stuck.length + " 个空格已无候选。可撤回检查点重新推理。" :
        "当前未发现重复或无候选格。这不代表假设已证实，可以继续推理。");
      render();
      return;
    }

    var wrong = game.board.reduce(function (count, value, index) {
      return count + (value && value !== game.solution[index] ? 1 : 0);
    }, 0);
    checkedReveal = true;
    clearTimeout(checkTimeout);
    checkTimeout = setTimeout(function () { checkedReveal = false; render(); }, 6000);
    if (wrong) {
      setStatus("有 " + wrong + " 个数字与唯一答案不符，已标出需要检查的位置。");
      toast("发现 " + wrong + " 个需要调整的数字。");
    } else {
      var remaining = game.board.filter(function (value) { return !value; }).length;
      setStatus("目前填写的数字都正确，还有 " + remaining + " 格等待完成。");
      toast("目前填写正确，继续保持。");
    }
    render();
  }

  function startGame() {
    if (!game || generatingPuzzle || game.started || game.completed || dialogIsOpen() || document.hidden) return;
    Atmosphere.unlock();
    game.started = true;
    game.paused = false;
    render();
    resumeClock();
    setStatus(preferences.zen ? "从一个空格开始，按自己的节奏慢慢来。" : "计时已开始，选一个空格，按自己的节奏探索。");
    save();
    cells[game.selected].focus({ preventScroll: true });
    if (window.matchMedia("(max-width: 800px)").matches) {
      $("board-stage").scrollIntoView({ block: "start", behavior: "instant" });
    }
  }

  function setPaused(paused) {
    if (!game || generatingPuzzle || !game.started || game.completed || dialogIsOpen()) return;
    suspendClock();
    game.paused = paused;
    clearPulse();
    if (!paused) Atmosphere.unlock();
    resetTilt();
    render();
    if (!paused) resumeClock();
    setStatus(paused ? "已暂停 · 你的进度已保存在这台设备。" : "欢迎回来，继续这一局。");
    save();
  }

  function showDialog(element) {
    if (generatingPuzzle) {
      cancelPuzzleGeneration(); renderModeControls();
      setStatus("已取消后台生成，原有棋局和进度已保留。");
    }
    suspendClock();
    resetTilt();
    if (!element) return;
    if (typeof element.showModal === "function") element.showModal();
    else element.setAttribute("open", "");
  }

  function closeDialog(element) {
    if (!element) return;
    if (typeof element.close === "function") element.close();
    else element.removeAttribute("open");
  }

  function confirmAction(title, description, acceptLabel) {
    var dialog = $("confirm-dialog");
    if (!dialog) return Promise.resolve(window.confirm(description));
    if (pendingConfirm) return Promise.resolve(false);
    if ($("confirm-title")) $("confirm-title").textContent = title;
    if ($("confirm-description")) $("confirm-description").textContent = description;
    if ($("confirm-accept")) $("confirm-accept").textContent = acceptLabel;
    showDialog(dialog);
    return new Promise(function (resolve) { pendingConfirm = resolve; });
  }

  function confirmNewGame(difficulty, mode, downgraded) {
    var title = modeInfo(mode).label + " · " + difficultyInfo(mode, difficulty).label;
    var description = "将准备「" + title + "」，当前棋局会留在历史中；点击开始后，新棋局才计时。";
    if (downgraded) description += "极境仅用于经典玩法，新玩法将使用进阶难度。";
    return confirmAction("开启新的挑战？", description, "准备新局");
  }

  async function openHistorical(snapshot, restart) {
    if (!snapshot || !snapshot.game || pendingConfirm) return false;
    if (!restart && snapshot.game.sessionId === game.sessionId) {
      if (History) History.close();
      setStatus("这就是当前棋局，继续你刚才的进度。");
      return true;
    }
    if (History) History.close();
    if (hasProgress()) {
      var accepted = await confirmAction(restart ? "重新挑战这道题？" : "继续这段历史？",
        "当前棋局会保存在历史中。" + (restart ? "将从原题开始一局新的挑战。" : "将恢复所选棋局，点击继续后才恢复计时。"),
        restart ? "重新挑战" : "恢复棋局");
      if (!accepted) return false;
    }
    suspendClock();
    save();
    try {
      var source = snapshot.game;
      if (!modeInfo(source.mode) || !difficultyInfo(source.mode, source.difficulty)) throw new Error("Unavailable historical mode");
      if (restart) {
        installPuzzle({ id: source.puzzleId, givens: source.givens, solution: source.solution, clues: source.clues,
          dailyDate: source.dailyDate, voyageId: source.voyageId, sourceId: source.sourceId, generation: source.generation }, source.difficulty, source.mode);
      } else {
        if (!restore(snapshot, true)) throw new Error("Invalid historical game");
        clearTransientMarks();
        stopCelebration();
        renderPreferences();
        render();
        renderDaily();
        renderVoyage();
      }
      setStatus(restart ? "原题已准备好，这是一次新的挑战；点击开始后计时。" :
        game.completed ? "这局已经完成。可以查看历史回放，或重新挑战原题。" :
        game.started ? "历史棋局已恢复。点击继续，接着上次的位置。" : "历史棋局已恢复，等你点击开始。");
      save();
      if (History) History.flush();
      return true;
    } catch (error) {
      toast("这份历史记录暂时无法恢复，当前棋局已保留。");
      resumeClock();
      return false;
    }
  }

  function resolveConfirm(accepted) {
    var resolve = pendingConfirm;
    pendingConfirm = null;
    closeDialog($("confirm-dialog"));
    resumeClock();
    if (resolve) resolve(accepted);
  }

  function hasProgress() {
    return !game.completed && (game.started || Boolean(game.branch) || game.board.some(function (n, i) { return n !== game.givens[i]; }) ||
      game.notes.some(function (mask) { return mask !== 0; }));
  }

  function installPuzzle(puzzle, difficulty, mode) {
    var clues = Engine.normalizeClues(mode, puzzle && puzzle.clues);
    var nextContext = { mode: mode, clues: clues };
    if (!puzzle || !isBoard(puzzle.givens, false, Engine.getLayout(nextContext).cellCount) || !isBoard(puzzle.solution, true, Engine.getLayout(nextContext).cellCount) ||
        !Engine.validateComplete(puzzle.solution, nextContext) || !respectsGivens(puzzle.solution, puzzle.givens)) {
      throw new Error("Invalid puzzle");
    }
    cancelPuzzleGeneration();
    suspendClock();
    if (game) save();
    historyOrigin = 'new';
    game = {
      generation: generationInfo(puzzle.generation, { mode: mode, clues: clues, givens: puzzle.givens }),
      sessionId: newSessionId(),
      createdAt: Date.now(),
      puzzleId: String(puzzle.id || Date.now()),
      sourceId: sourceIdFor(puzzle, mode, difficulty),
      difficulty: difficulty,
      mode: mode,
      clues: clues,
      givens: puzzle.givens.slice(),
      solution: puzzle.solution.slice(),
      board: puzzle.givens.slice(),
      notes: Array(puzzle.givens.length).fill(0),
      history: [],
      selected: Math.max(0, puzzle.givens.indexOf(0)),
      mistakes: 0,
      hints: 0,
      elapsedMs: 0,
      started: false,
      paused: false,
      completed: false,
      branch: null,
      voyageId: puzzle.voyageId || null,
      dailyDate: puzzle.dailyDate || null,
      fog: preferences.fog,
      fogSeen: initialFog(nextContext)
    };
    currentContext = nextContext;
    game.energy = restoreEnergy(null);
    clearPulse();
    revealFog(game.selected);
    pendingHint = null;
    noteMode = false;
    hintCell = -1;
    checkedReveal = false;
    clearTimeout(hintTimeout);
    clearTimeout(checkTimeout);
    render();
    renderDaily();
    renderVoyage();
  }

  async function newGame(difficulty, initial, requestedMode) {
    if (generatingPuzzle) {
      cancelPuzzleGeneration(); renderModeControls(); resumeClock();
      setStatus("已取消生成，原有棋局和进度已保留。"); return;
    }
    var mode = requestedMode || (game ? game.mode : "classic");
    if (MODES.indexOf(mode) < 0) mode = "classic";
    if (difficulty === "expert") difficulty = "master";
    var downgraded = difficulty === "master" && mode !== "classic";
    if (downgraded) difficulty = "hard";
    if (!difficultyInfo(mode, difficulty)) difficulty = "easy";
    if (!initial && (pendingConfirm || dialogIsOpen())) {
      renderModeControls();
      return;
    }
    if (!initial && game && hasProgress()) {
      var accepted = await confirmNewGame(difficulty, mode, downgraded);
      if (!accepted) {
        renderModeControls();
        return;
      }
    }
    try {
      var sourceId = Deck.choose(mode, difficulty, game && game.sourceId);
      var puzzle, fallback = false;
      if (!initial && difficulty !== "master" && generatorClient) {
        var epoch = ++generationEpoch;
        suspendClock(); save(); setGenerationBusy(true);
        setStatus("正在离线生成并验证新题，可点击“取消生成”保留原局……");
        try {
          puzzle = await generatorClient.run({ mode: mode, difficulty: difficulty, sourceId: sourceId,
            seed: Generator.seed(), avoidFingerprints: recentGenerated.slice() });
        } catch (error) {
          if (epoch !== generationEpoch || error.name === "AbortError") return;
          fallback = true;
        }
        if (epoch !== generationEpoch) return;
        setGenerationBusy(false);
      }
      if (!puzzle) puzzle = Engine.getPuzzle(difficulty, undefined, mode, { sourceId: sourceId });
      installPuzzle(puzzle, difficulty, mode);
      Deck.remember(mode, difficulty, puzzle.sourceId, true);
      rememberGenerated(puzzle);
      setStatus(puzzle.generation ? modeInfo(mode).label + "新题已准备好 · " + difficultyInfo(mode, difficulty).label + "密度档（非技巧评级），点击开始后计时。" :
        fallback ? "本次生成未在预算内完成，已切换为原题库题目；点击开始后计时。" :
        preferences.zen ? modeInfo(mode).label + "已准备好，等你开始。" : downgraded ? "已准备" + modeInfo(mode).label + " · 进阶。极境仅用于经典玩法，点击开始后计时。" :
        modeInfo(mode).label + " · " + difficultyInfo(mode, difficulty).label + "已准备好，点击开始游戏后计时。");
      save();
    } catch (error) {
      cancelPuzzleGeneration();
      renderModeControls();
      setStatus("棋盘暂时未能生成，请重新打开游戏后再试。");
      toast("未能生成新棋盘，原有进度已保留。");
      resumeClock();
    }
  }

  function challengeError(message) {
    if ($("challenge-error")) $("challenge-error").textContent = message || "";
  }

  function openChallenge(kind) {
    if (!game || dialogIsOpen()) return;
    if (!window.SudokuChallenge) {
      toast("挑战码资源未完整加载，请重新打开完整游戏文件。");
      return;
    }
    var sharing = kind === "share";
    challengeError("");
    if ($("challenge-export-panel")) $("challenge-export-panel").hidden = !sharing;
    if ($("challenge-import-panel")) $("challenge-import-panel").hidden = sharing;
    if ($("challenge-title")) $("challenge-title").textContent = sharing ? "分享同一境" : "接收同题挑战";
    if ($("challenge-description")) $("challenge-description").textContent = sharing ?
      "这段代码只包含原始题目、规则线索、玩法与难度，不包含答案、进度或用时。朋友输入即可打开同一盘。" :
      "粘贴朋友的挑战码。验证通过后再确认是否替换当前棋局，新局仍等待点击开始。";
    if (sharing) {
      try {
        if ($("challenge-output")) $("challenge-output").value = window.SudokuChallenge.create({
          givens: game.givens.slice(), mode: game.mode, difficulty: game.difficulty, clues: game.clues
        });
      } catch (error) {
        toast(error.message || "这道题暂时无法生成挑战码。");
        return;
      }
    } else if ($("challenge-input")) {
      $("challenge-input").value = "";
    }
    showDialog($("challenge-dialog"));
    save();
    var focus = sharing ? $("challenge-output") : $("challenge-input");
    if (focus) focus.focus();
  }

  async function copyChallenge() {
    var output = $("challenge-output");
    if (!output || !output.value) return;
    var code = output.value;
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(code);
      challengeError("");
      toast("挑战码已复制，可以发送给朋友。");
    } catch (error) {
      if ($("challenge-dialog") && $("challenge-dialog").open) {
        output.focus();
        output.select();
        output.setSelectionRange(0, output.value.length);
        challengeError("已选中挑战码，请按 Ctrl+C 复制；手机可长按复制。");
      }
    }
  }

  async function importChallenge() {
    if (importingChallenge || !window.SudokuChallenge) return;
    importingChallenge = true;
    if ($("challenge-import")) $("challenge-import").disabled = true;
    challengeError("");
    var puzzle;
    try {
      puzzle = window.SudokuChallenge.decode($("challenge-input") ? $("challenge-input").value : "");
    } catch (error) {
      challengeError(error.message || "挑战码无效，请检查后重试。");
      importingChallenge = false;
      if ($("challenge-import")) $("challenge-import").disabled = false;
      return;
    }
    try {
      closeDialog($("challenge-dialog"));
      if (game && hasProgress()) {
        var accepted = await confirmNewGame(puzzle.difficulty, puzzle.mode, false);
        if (!accepted) {
          renderModeControls();
          setStatus("已取消导入，原棋局和假设检查点均已保留。");
          return;
        }
      }
      installPuzzle(puzzle, puzzle.difficulty, puzzle.mode);
      setStatus("同题挑战已准备好：" + modeInfo(puzzle.mode).label + " · " +
        difficultyInfo(puzzle.mode, puzzle.difficulty).label + "。点击开始后计时。");
      save();
    } catch (error) {
      toast(error.message || "未能导入挑战，原棋局已保留。");
      resumeClock();
    } finally {
      importingChallenge = false;
      if ($("challenge-import")) $("challenge-import").disabled = false;
    }
  }

  function checkCompletion() {
    if (game.branch || game.completed || !game.board.every(function (value, index) { return value === game.solution[index]; }) ||
        !Engine.validateComplete(game.board, gameContext())) return;
    suspendClock();
    game.completed = true;
    game.paused = false;
    if (game.dailyDate) {
      dailyRecords = Daily.recordCompletion(dailyRecords, game.dailyDate, {
        elapsedMs: Math.floor(game.elapsedMs), mistakes: game.mistakes, hints: game.hints
      });
      saveDaily();
      renderDaily();
    }
    finishVoyage();
    Atmosphere.play("win");
    $("completion-daily").hidden = !game.dailyDate;
    $("completion-daily").textContent = game.dailyDate ? game.dailyDate + " · 每日一境已点亮，重玩保留首次成绩。" : "";
    render();
    setStatus(game.board.length + " 格，恰到好处。恭喜完成" + modeInfo(game.mode).label + "！");
    var summary = $("completion-dialog") && $("completion-dialog").querySelector("p");
    if (summary) summary.textContent = modeInfo(game.mode).label + " · " +
      difficultyInfo(game.mode, game.difficulty).label + "，每一个数字都找到了自己的位置。";
    if ($("completion-time")) $("completion-time").textContent = formatTime(game.elapsedMs);
    if ($("completion-mistakes")) $("completion-mistakes").textContent = String(game.mistakes);
    showDialog($("completion-dialog"));
    celebrate();
    save("完成");
  }

  function resetTilt() {
    var stage = $("board-stage");
    if (!stage) return;
    stage.style.setProperty("--tilt-x", "0deg");
    stage.style.setProperty("--tilt-y", "0deg");
    stage.style.setProperty("--light-x", "50%");
    stage.style.setProperty("--light-y", "35%");
  }

  function stopCelebration() {
    if (particleFrame) cancelAnimationFrame(particleFrame);
    particleFrame = null;
    var canvas = $("fx-canvas");
    var context = canvas && canvas.getContext && canvas.getContext("2d");
    if (context) context.clearRect(0, 0, canvas.width, canvas.height);
  }

  function celebrate() {
    if (preferences.zen || !motionEnabled()) return;
    var canvas = $("fx-canvas");
    if (!canvas || !canvas.getContext) return;
    var context = canvas.getContext("2d");
    if (!context) return;
    if (particleFrame) cancelAnimationFrame(particleFrame);
    var width = window.innerWidth;
    var height = window.innerHeight;
    var ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    var palettes = {
      nebula: ["#a78bfa", "#67e8f9", "#e879f9", "#edf1ff"],
      aurora: ["#74f3d2", "#d0fff4", "#5bbdff", "#e9f5ff"],
      ember: ["#ffad70", "#ffe4c7", "#f56e72", "#fff6e8"],
      ivory: ["#178b77", "#dab263", "#5ea6a0", "#b89155"],
      ocean: ["#71e0f2", "#7aa8ff", "#c2fbff", "#4f83ca"],
      sakura: ["#c45d86", "#e692af", "#7c589e", "#f6c6d8"],
      firefly: ["#d1eaa0", "#65b895", "#f3df7d", "#87d8c4"],
      sunset: ["#ba644d", "#df9368", "#9e76b6", "#f3c796"]
    };
    var colors = palettes[preferences.theme] || palettes.nebula;
    var particles = Array.from({ length: 110 }, function () {
      return {
        x: width * 0.5, y: height * 0.43,
        vx: (Math.random() - 0.5) * 12,
        vy: -3 - Math.random() * 10,
        size: 2 + Math.random() * 5,
        spin: Math.random() * Math.PI,
        color: colors[Math.floor(Math.random() * colors.length)]
      };
    });
    var started = performance.now();
    var previous = started;
    function frame(now) {
      var age = now - started;
      var step = Math.min(2, (now - previous) / 16.67);
      previous = now;
      context.clearRect(0, 0, width, height);
      if (age > 2600 || !motionEnabled()) {
        particleFrame = null;
        return;
      }
      context.globalAlpha = Math.min(1, (2600 - age) / 650);
      particles.forEach(function (particle) {
        particle.x += particle.vx * step;
        particle.y += particle.vy * step;
        particle.vy += 0.13 * step;
        particle.spin += 0.06 * step;
        context.save();
        context.translate(particle.x, particle.y);
        context.rotate(particle.spin);
        context.fillStyle = particle.color;
        context.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size * 0.6);
        context.restore();
      });
      particleFrame = requestAnimationFrame(frame);
    }
    particleFrame = requestAnimationFrame(frame);
  }

  function renderCatalog() {
    var all = Engine.getModes();
    if ($("library-summary")) $("library-summary").textContent = PUZZLE_CATALOG.length.toLocaleString("zh-CN") + " 道原题 · " + MODES.length + " 种玩法 · 新局优先轮换不同题目";
    var query = ($("mode-search").value || "").trim().toLowerCase();
    var shown = 0;
    $("mode-switcher").querySelectorAll("[data-mode]").forEach(function (card) {
      var info = all.find(function (entry) { return entry.id === card.dataset.mode; });
      var text = (info.label + " " + info.id + " " + info.description).toLowerCase();
      card.hidden = (catalogCategory !== "全部" && card.dataset.category !== catalogCategory) || (query && text.indexOf(query) < 0);
      if (!card.hidden) shown++;
    });
    $("mode-results").textContent = shown ? shown + " 种玩法" : "没有匹配的玩法，试试其他关键词。";
    $("mode-categories").querySelectorAll("[data-category]").forEach(function (button) {
      button.setAttribute("aria-pressed", String(button.dataset.category === catalogCategory));
    });
  }

  function buildCatalog() {
    var modes = Engine.getModes(), categories = ["全部"];
    var symbols = { classic: "▦", diagonal: "╳", hyper: "▣", knight: "♞", king: "♚",
      killer: "Σ", thermo: "♨", arrow: "↗", kropki: "●", xv: "XV", greater: "≷",
      renban: "∿", whispers: "≈", palindrome: "↔", between: "○—○", lockout: "◇—◇",
      entropic: "123", modular: "369", "region-sum": "＝", sandwich: "1·9", skyscraper: "▥",
      xsum: "XΣ", littlekiller: "↘Σ", clone: "▱▱", quadruple: "⁘", jigsaw: "▧",
      disjoint: "⋮", "odd-even": "○□", nonconsecutive: "≠1", miracle: "✧" };
    modes.forEach(function (info) {
      var category = info.category || "基础与区域";
      if (categories.indexOf(category) < 0) categories.push(category);
      var card = document.createElement("button");
      card.type = "button"; card.className = "mode-card"; card.dataset.mode = info.id; card.dataset.category = category;
      card.setAttribute("aria-pressed", String(game && game.mode === info.id));
      var mark = document.createElement("span"); mark.className = "mode-card-symbol"; mark.setAttribute("aria-hidden", "true");
      mark.textContent = symbols[info.id] || "▦";
      var title = document.createElement("strong"); title.textContent = info.label;
      var subtitle = document.createElement("small"); subtitle.textContent = info.description;
      var family = document.createElement("span"); family.className = "mode-card-family";
      var count = PUZZLE_CATALOG.filter(function (p) { return p.mode === info.id; }).length;
      family.textContent = category + " · " + count + " 题";
      family.dataset.puzzleCount = String(count);
      card.append(mark, title, subtitle, family); $("mode-switcher").appendChild(card);
    });
    categories.forEach(function (category) {
      var button = document.createElement("button"); button.type = "button"; button.dataset.category = category;
      button.textContent = category; button.setAttribute("aria-pressed", String(category === catalogCategory));
      $("mode-categories").appendChild(button);
    });
    renderCatalog();
  }

  function bind(id, event, listener) {
    var element = $(id);
    if (element) element.addEventListener(event, listener);
  }

  bind("voyage-btn", "click", openVoyage);
  bind("voyage-start", "click", startVoyage);
  bind("voyage-close", "click", function () { closeDialog($("voyage-dialog")); });
  bind("voyage-dialog", "close", function () { resumeClock(); save(); });
  bind("voyage-map", "click", function (event) {
    var button = event.target.closest("[data-voyage]");
    if (!button || button.disabled) return;
    selectedVoyage = button.dataset.voyage;
    renderVoyage();
  });
  bind("zen-toggle", "click", function () {
    preferences.zen = !preferences.zen;
    // Only display/feedback changes. Never replace the puzzle or reset its clock.
    clearPulse();
    clearTimeout(checkTimeout);
    checkedReveal = false;
    clearTimeout(toastTimeout);
    $("toast").hidden = true;
    stopCelebration();
    resetTilt();
    renderPreferences();
    render();
    if (!preferences.zen) Atmosphere.unlock();
    setStatus(preferences.zen ? "禅模式已开启。慢慢来，需要时可使用检查与灵感提示。" :
      "已回到普通模式，棋局进度与原来的显示设置都已保留。");
    save();
  });
  bind("zen-pause", "click", function () { setPaused(!game.paused); });
  bind("zen-motion-toggle", "click", function () {
    if (reducedMotion.matches) return;
    preferences.zenMotion = !preferences.zenMotion;
    resetTilt();
    renderPreferences();
    save();
  });
  bind("focus-toggle", "click", function () {
    preferences.focus = !preferences.focus;
    resetTilt();
    renderPreferences();
    save();
  });
  bind("sound-toggle", "click", function () {
    preferences.sound = !preferences.sound;
    renderPreferences();
    if (preferences.sound) { Atmosphere.unlock(); Atmosphere.play("place", 1); }
    save();
  });
  bind("fog-toggle", "click", toggleFog);
  bind("fog-clear", "click", clearFog);
  bind("hint-next", "click", advanceHint);
  bind("hint-apply", "click", applyHint);
  bind("hint-close", "click", function () { pendingHint = null; render(); });
  bind("daily-btn", "click", openDaily);
  bind("daily-start", "click", startDaily);
  bind("daily-close", "click", function () { closeDialog($("daily-dialog")); });
  bind("daily-dialog", "close", function () { resumeClock(); save(); });
  bind("branch-btn", "click", beginBranch);
  bind("branch-rollback", "click", rollbackBranch);
  bind("branch-commit", "click", commitBranch);
  bind("share-btn", "click", function () { openChallenge("share"); });
  bind("import-btn", "click", function () { openChallenge("import"); });
  bind("challenge-close", "click", function () { closeDialog($("challenge-dialog")); });
  bind("challenge-dialog", "close", function () { resumeClock(); save(); });
  bind("challenge-copy", "click", copyChallenge);
  bind("challenge-import", "click", importChallenge);
  bind("challenge-input", "input", function () { challengeError(""); });
  bind("new-game", "click", function () { newGame(game.difficulty, false); });
  bind("difficulty", "change", function (event) { newGame(event.target.value, false); });
  bind("mode-picker-open", "click", function () {
    if (!game || dialogIsOpen()) return;
    renderCatalog(); showDialog($("mode-dialog"));
    $("mode-search").focus(); save();
  });
  bind("mode-close", "click", function () { closeDialog($("mode-dialog")); });
  bind("mode-dialog", "close", function () { resumeClock(); save(); });
  bind("mode-search", "input", renderCatalog);
  bind("mode-categories", "click", function (event) {
    var button = event.target.closest("[data-category]");
    if (!button) return;
    catalogCategory = button.dataset.category; renderCatalog();
  });
  bind("mode-switcher", "click", function (event) {
    var button = event.target.closest("[data-mode]");
    if (!button || !game || MODES.indexOf(button.dataset.mode) < 0) return;
    closeDialog($("mode-dialog"));
    if (button.dataset.mode !== game.mode) newGame(game.difficulty, false, button.dataset.mode);
  });
  bind("rules-open", "click", function () {
    if (!game || dialogIsOpen()) return;
    $("rules-title").textContent = modeInfo(game.mode).label;
    $("rules-description").textContent = modeInfo(game.mode).description;
    showDialog($("rules-dialog")); save();
  });
  bind("rules-close", "click", function () { closeDialog($("rules-dialog")); });
  bind("rules-dialog", "close", function () { resumeClock(); save(); });
  bind("scene-intensity", "change", function (event) {
    preferences.intensity = event.target.value;
    resetTilt(); renderPreferences(); save();
  });
  bind("start-btn", "click", startGame);
  bind("pause-btn", "click", function () { setPaused(!game.paused); });
  bind("resume-btn", "click", function () { setPaused(false); });
  bind("notes-btn", "click", toggleNotes);
  bind("auto-notes-btn", "click", autoNotes);
  bind("erase-btn", "click", erase);
  bind("undo-btn", "click", undo);
  bind("hint-btn", "click", requestHint);
  bind("check-btn", "click", checkBoard);
  bind("confirm-accept", "click", function () { resolveConfirm(true); });
  bind("confirm-cancel", "click", function () { resolveConfirm(false); });
  bind("confirm-dialog", "cancel", function (event) { event.preventDefault(); resolveConfirm(false); });
  bind("confirm-dialog", "close", function () {
    if (pendingConfirm) {
      var resolve = pendingConfirm;
      pendingConfirm = null;
      resolve(false);
    }
    resumeClock();
  });
  bind("close-completion", "click", function () { closeDialog($("completion-dialog")); });
  bind("completion-dialog", "close", resumeClock);
  bind("play-again", "click", function () {
    closeDialog($("completion-dialog"));
    if (game.voyageId) openVoyage();
    else newGame(game.difficulty, false);
  });
  bind("theme-switcher", "click", function (event) {
    var button = event.target.closest("[data-theme]");
    if (!button || THEMES.indexOf(button.dataset.theme) < 0) return;
    preferences.theme = button.dataset.theme;
    renderPreferences();
    save();
  });
  bind("fx-toggle", "click", function () {
    preferences.fx = !preferences.fx;
    renderPreferences();
    save();
  });
  bind("error-toggle", "click", function () {
    preferences.errorCheck = !preferences.errorCheck;
    game.energy.combo = 0;
    clearPulse();
    renderPreferences();
    render();
    toast(preferences.errorCheck ? "即时错误提示已开启。" : "即时错误提示已关闭，可随时点击检查。");
    save();
  });
  bind("board-stage", "pointermove", function (event) {
    if (!motionEnabled() || !canInteract() || event.pointerType === "touch") return;
    var stage = $("board-stage");
    var rect = stage.getBoundingClientRect();
    var dx = Math.max(-0.5, Math.min(0.5, (event.clientX - rect.left) / rect.width - 0.5));
    var dy = Math.max(-0.5, Math.min(0.5, (event.clientY - rect.top) / rect.height - 0.5));
    var depth = preferences.zen ? 2.8 : preferences.intensity === "cinematic" ? 16 : preferences.intensity === "soft" ? 6 : 10;
    stage.style.setProperty("--tilt-x", (-dy * depth).toFixed(2) + "deg");
    stage.style.setProperty("--tilt-y", (dx * depth).toFixed(2) + "deg");
    stage.style.setProperty("--light-x", ((dx + 0.5) * 100).toFixed(1) + "%");
    stage.style.setProperty("--light-y", ((dy + 0.5) * 100).toFixed(1) + "%");
  });
  bind("board-stage", "pointerleave", resetTilt);

  // Appearance controls are secondary; dismiss their popover without touching the game.
  document.addEventListener("pointerdown", function (event) {
    var appearance = $("appearance-settings");
    if (appearance && appearance.open && !appearance.contains(event.target)) appearance.open = false;
  });

  document.addEventListener("keydown", function (event) {
    var appearance = $("appearance-settings");
    if (event.key === "Escape" && appearance && appearance.open) {
      event.preventDefault();
      appearance.open = false;
      appearance.querySelector("summary").focus();
      return;
    }
    var target = event.target;
    if (!canInteract() || (target && (target.isContentEditable ||
        /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)))) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undo();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (/^[1-9]$/.test(event.key)) {
      event.preventDefault();
      enterNumber(Number(event.key), false);
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace" || event.key === "0") {
      event.preventDefault();
      erase();
      return;
    }
    if (event.key.toLowerCase() === "n") {
      event.preventDefault();
      toggleNotes();
      return;
    }
    var direction = { ArrowUp: [0,-1], ArrowDown: [0,1], ArrowLeft: [-1,0], ArrowRight: [1,0] }[event.key];
    if (!direction) return;
    event.preventDefault();
    moveOnLayout(direction[0], direction[1]);
  });

  document.addEventListener("visibilitychange", function () {
    document.body.dataset.pageHidden = String(document.hidden);
    if (document.hidden) {
      stopCelebration();
      suspendClock();
      if (game && game.started && !game.completed) {
        game.paused = true;
        clearPulse();
        resetTilt();
        render();
        save();
      }
    } else {
      render();
      resumeClock();
    }
  });
  window.addEventListener("pagehide", function () {
    suspendClock();
    if (game && game.started && !game.completed) game.paused = true;
    save();
    if (History) History.flush();
  });
  window.addEventListener("beforeunload", function () { save(); if (History) History.flush(); });
  if (reducedMotion.addEventListener) reducedMotion.addEventListener("change", renderPreferences);
  else if (reducedMotion.addListener) reducedMotion.addListener(renderPreferences);

  bind("grid-view", "change", function () {
    activeBoardId = $("grid-view").value;
    applyBoardView();
    if (cells[game.selected].hidden) {
      var first = cells.findIndex(function (cell, i) { return !cell.hidden && !game.givens[i]; });
      if (first < 0) first = cells.findIndex(function (cell) { return !cell.hidden; });
      if (first >= 0) game.selected = first;
    }
    clearTransientMarks(); render(); save();
  });

  if (History) History.init({
    Engine: Engine,
    VariantView: window.SudokuVariantView,
    openDialog: function (element) { showDialog(element); save(); },
    afterClose: function () { render(); resumeClock(); save(); },
    onResume: function (snapshot) { return openHistorical(snapshot, false); },
    onReplayNew: function (snapshot) { return openHistorical(snapshot, true); },
    toast: toast
  });

  buildCatalog();
  buildBoard();
  var restored = restore();
  readDaily();
  readVoyage();
  renderDaily();
  renderVoyage();
  renderPreferences();
  if (restored) {
    render();
    setStatus(preferences.zen ? (game.completed ? "这一境已圆满，随时可以再开一局。" :
      game.started ? "棋局已为你保留，点击继续，慢慢来。" : "棋局已准备好，等你开始。") :
      game.completed ? "上一局已完成，随时可以开启新的挑战。" :
      !game.started ? "已恢复准备中的棋局，点击开始游戏后计时。" :
      "已恢复" + modeInfo(game.mode).label + (game.branch ? "的假设分支，检查点仍然保留；点击继续后计时。" : "进度，点击继续后再恢复计时。"));
    save();
  } else {
    newGame("easy", true);
  }
  if (window.NineRealmsEasterEggs) window.NineRealmsEasterEggs.init({
    openDialog: function (element) { showDialog(element); save(); },
    afterClose: function () { resumeClock(); save(); },
    toast: toast
  });
  setInterval(function () {
    if (!game) return;
    if ($("timer")) $("timer").textContent = formatTime(currentElapsed());
    if (performance.now() - lastPeriodicSave > 5000) {
      save();
      if (dailyToday !== Daily.dateKey()) renderDaily();
      lastPeriodicSave = performance.now();
    }
  }, 250);
})();

