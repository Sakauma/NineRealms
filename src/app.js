/* Nine Realms — local, dependency-free game controller. */
(async function () {
  "use strict";

  var SaveRecovery = window.NineRealmsSaveRecovery, saveRecoveryState = null;
  if (!SaveRecovery || typeof SaveRecovery.createSession !== "function") {
    var missingResource = document.getElementById("status-message");
    if (missingResource) { missingResource.textContent = "游戏资源未完整加载，请重新打开完整的游戏文件。"; missingResource.parentElement.classList.remove("status-quiet"); }
    return;
  }
  var nativeStorage, windowLocks;
  try { nativeStorage = window.localStorage; } catch (error) {}
  try { windowLocks = navigator.locks; } catch (error) {}
  var storageSession = SaveRecovery.createSession({ storage: nativeStorage, locks: windowLocks,
    onConflict: function () { setTimeout(reportStorageConflict, 0); } });
  var writableAtStart = await storageSession.start();
  var playerStorage = storageSession.storage, storageConflict = !writableAtStart;
  var Engine = window.SudokuEngine;
  var Curated = window.NineRealmsCurated, curatedLaunching = false;
  var GridRows = window.NineRealmsGridRows, boardRows = null;
  var Desktop = window.NineRealmsDesktop;
  var Logic = window.NineRealmsLogic;
  var Branches = window.NineRealmsBranches;
  var Edits = window.NineRealmsEdits;
  var TechniqueGuides = window.NineRealmsTechniqueGuides;
  var Custom = window.NineRealmsCustom, customUi = null;
  var customImportClient = Custom ? Custom.createClient() : null, challengeImportEpoch = 0, sharingPlain = false;
  var Backup = window.NineRealmsBackup;
  var Favorites = window.NineRealmsFavorites, favoriteStore = null, personalUi = null;
  var storageTransition = false;
  // Product release numbering is independent of SAVE_VERSION and storage schema keys.
  var APP_VERSION = "1.3.5";
  try { if (Backup && writableAtStart) Backup.recover(playerStorage); }
  catch (recoveryError) {
    if (recoveryError.recoveryRequired) {
      var recoveryDialog = document.getElementById("backup-dialog");
      document.getElementById("backup-status").textContent = recoveryError.message+" 恢复日志不是普通备份，不能在导入入口使用。请保留日志并重新打开游戏重试。";
      ["backup-close", "backup-export", "backup-file", "backup-confirm", "backup-replace"].forEach(function(id){document.getElementById(id).disabled=true;});
      var recoveryButton=document.getElementById("backup-recovery");recoveryButton.hidden=false;
      recoveryButton.onclick=async function(){try{await downloadPlayerFile(recoveryError.previousBackup,"Nine-Realms-recovery-log.json");}catch(error){document.getElementById("backup-status").textContent=error.message||"恢复日志保存未完成。";}};
      recoveryDialog.addEventListener("cancel",function(event){event.preventDefault();});
      if(recoveryDialog.showModal)recoveryDialog.showModal();else recoveryDialog.setAttribute("open","");
      return;
    }
  }
  try { if (Favorites) favoriteStore = Favorites.createStore(playerStorage); } catch (favoriteReadError) { /* Preserve corrupt or inaccessible data until explicit recovery. */ }
  var Generator = window.NineRealmsGenerator;
  var generatorClient = Generator ? Generator.createClient() : null;
  var generationEpoch = 0, generatingPuzzle = false, generationRetry = null;
  var RECENT_GENERATED_KEY = "nine-realms.generated-recent.v1", recentGenerated = [];
  try {
    var storedGenerated = JSON.parse(playerStorage.getItem(RECENT_GENERATED_KEY) || "[]");
    if (Array.isArray(storedGenerated)) recentGenerated = storedGenerated.filter(function (v) { return typeof v === "string" && /^[a-f0-9]{32}$/.test(v); }).slice(-256);
  } catch (error) { /* Recent-repeat avoidance is optional; validity never depends on storage. */ }

  var STORAGE_KEY = "nine-realms.sudoku.v1";
  var SAVE_VERSION = 8;
  var History = window.NineRealmsHistory;
  var Drafts = window.NineRealmsDrafts, draftUi = null, trainingUi = null;
  var historyOrigin = null;
  var boardLayout = null;
  var boardLayoutKey = '';
  var activeBoardId = 'all';
  var Voyage = window.SudokuVoyage;
  var Atmosphere = window.NineRealmsAtmosphere;
  var VOYAGE_KEY = "nine-realms.voyage.v1";
  var voyageProgress = {};
  var voyageStorageBlocked = false;
  var selectedVoyage = "dawn";
  var selectedVoyageTrack = "legacy";
  var ratingCache = new Map();
  var loadingVoyage = false;
  var pulseTimeout = null;
  var DAILY_KEY = "nine-realms.daily.v1";
  var Daily = window.SudokuDaily;
  var pendingHint = null;
  var dailyRecords = {};
  var dailyUnreadable = null;
  var dailyToday = Daily ? Daily.dateKey() : "";
  var loadingDaily = false, dailyEpoch = 0, dailyError = null;
  var dailyClient = Daily && Daily.createClient ? Daily.createClient() : null;
  var THEMES = ["nebula", "aurora", "ember", "ivory", "ocean", "sakura", "firefly", "sunset"];
  var THEME_NAMES = { nebula: "星云", aurora: "极光", ember: "熔金", ivory: "月白",
    ocean: "深海", sakura: "樱落", firefly: "萤森", sunset: "流霞" };
  var LIGHT_THEMES = ["ivory", "sakura", "sunset"];
  var MODES = Engine ? Engine.getModes().map(function (entry) { return entry.id; }) : [];
  var PUZZLE_CATALOG = Engine ? Engine.getPuzzleCatalog() : [];
  var Deck = null;
  try { Deck = window.NineRealmsPuzzleDeck(Engine, playerStorage); }
  catch (error) { Deck = window.NineRealmsPuzzleDeck(Engine, { getItem: function () { return null; }, setItem: function () {} }); }
  var $ = function (id) { return document.getElementById(id); };
  var boardElement = $("board");
  var numberPad = $("number-pad");

  if (!Engine || !GridRows || !Logic || !Branches || !Edits || !Custom || !TechniqueGuides || !Daily || !Voyage || !Atmosphere || !window.SudokuHints || !boardElement || !numberPad) {
    var failure = $("status-message");
    if (failure) failure.textContent = "游戏资源未完整加载，请重新打开完整的游戏文件。";
    return;
  }

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var preferences = { theme: "nebula", fx: true, errorCheck: true, logicMode: false, customDraft: "", fog: false, sound: false, soundVolume: 0.65, effectsEnabled: true, effectsVolume: 1, musicEnabled: false, musicVolume: 0.35, focus: false, zen: false, zenMotion: true, intensity: "cinematic", textSize: "normal", lineContrast: "standard", colorAssist: false, handedness: "right" };
  var game = null;
  var musicAudition = null, settingsMusicAudition = false, editSoundSequence = 0;
  var currentContext = null;
  var catalogCategory = "全部";
  var cells = [];
  var numberKeys = [];
  var numberPresses = new Map();
  var runningSince = null;
  var noteMode = false;
  var checkedReveal = false;
  var checkTimeout = null;
  var toastTimeout = null;
  var lastPeriodicSave = 0;
  var pendingConfirm = null;
  var particleFrame = null;
  var storageFailed = false;
  var importingChallenge = false;
  var batchSelection = new Set(), batchSelecting = false;
  var lensDigit = 0, batchDigit = 1, lensSource = "notes", lensKey = "", lensResult = null;

  function gameContext() { return currentContext || { mode: "classic", clues: {} }; }
  function inBranch() { return Boolean(game && Branches.active(game.branch)); }
  function ruleOnly() { return Boolean(game && (game.logicMode || inBranch())); }
  function checkedContext() { return ruleOnly() ? Logic.scope(gameContext()).context : gameContext(); }

  function modeInfo(mode) {
    return Engine.getModes().find(function (entry) { return entry.id === mode; });
  }

  function generationInfo(value, puzzle, difficulty) {
    if (!Generator || !value || !([1,2].indexOf(value.version)>=0 && value.kind === "carved" || [3,4,5].indexOf(value.version)>=0 && value.kind === "constructed") ||
        typeof value.seed !== "string" || value.seed.length > 256 ||
        value.fingerprint !== Generator.fingerprint(puzzle)) return null;
    var basis = value.difficultyBasis === "supported-logic" &&
      Generator.matchesDifficulty(puzzle.givens, difficulty, {mode:puzzle.mode,clues:puzzle.clues}) ? "supported-logic" : "clue-density";
    var info = { version: value.version, seed: value.seed, kind: value.kind, difficultyBasis: basis,
      fingerprint: value.fingerprint, givenCount: puzzle.givens.filter(Boolean).length };
    if(value.version===3||value.version===4||value.version===5){
      if(!/^[a-f0-9]{32}$/.test(value.baseFingerprint)||value.logicVerified!==true||!Number.isInteger(value.logicRepairs)||value.logicRepairs<0||value.logicRepairs>12||!Number.isInteger(value.ruleReductions)||value.ruleReductions<0||value.ruleReductions>81)return null;
      info.baseFingerprint=value.baseFingerprint;info.logicVerified=true;info.logicRepairs=value.logicRepairs;info.ruleReductions=value.ruleReductions;
      if(value.layoutFingerprint!==undefined){if(!/^[a-f0-9]{32}$/.test(value.layoutFingerprint))return null;info.layoutFingerprint=value.layoutFingerprint;}
    }
    if((value.version===4||value.version===5) && value.difficultyBasis==="rule-depth") {
      var grading=window.NineRealmsRulePathGrading;
      if(!grading||!Number.isInteger(value.logicRounds)||value.logicRounds<1||value.logicGrade!==difficulty)return null;
      var proof=grading.analyze(puzzle.givens,{mode:puzzle.mode,clues:puzzle.clues});
      if(!proof.solved||proof.rounds!==value.logicRounds||grading.tier(proof,puzzle.mode)!==difficulty)return null;
      info.difficultyBasis="rule-depth";info.logicRounds=value.logicRounds;info.logicGrade=value.logicGrade;
    } else if((value.version===4||value.version===5) && value.difficultyBasis!=="supported-logic") return null;
    if(value.version===5){
      var quality=window.NineRealmsRuleQuality;if(!quality)return null;
      if(quality.supported(puzzle.mode)){
        var evidence=quality.analyze(puzzle.givens,{mode:puzzle.mode,clues:puzzle.clues});
        if(!quality.accepts(evidence,difficulty)||!quality.sameSummary(value.ruleQuality,quality.summary(evidence)))return null;
        info.ruleQuality=quality.summary(evidence);
      }else if(value.ruleQuality!==undefined)return null;
    }else if(value.ruleQuality!==undefined)return null;
    return info;
  }

  function generationDifficultyCopy(metadata) {
    if(metadata.difficultyBasis==="supported-logic")return "已验证唯一解与本模式技巧分档。";
    if(metadata.difficultyBasis==="rule-depth")return (metadata.logicGrade!=="easy"&&metadata.ruleQuality&&metadata.ruleQuality.classicSolved===false?"已通过去除特殊规则的对照验证。":"")+"已验证唯一解；规则推演层级 · "+({easy:"入门",medium:"标准",hard:"进阶"}[metadata.logicGrade]||"")+"（"+metadata.logicRounds+" 轮同步推演），不等同完整人类技巧难度。";
    return "已验证唯一解及基础规则推理路径；档位是挖空目标，可能补回给定，不是技巧评级。";
  }

  function clearGenerationRetry() {
    var hadRetry = Boolean(generationRetry);
    generationRetry = null;
    var button = $("new-game"), label = button && button.querySelector("span");
    if (label && !generatingPuzzle) label.textContent = "新游戏";
    if (button) button.removeAttribute("title");
    if (hadRetry) setStatus("原棋局已保留。可重新选择玩法与难度，或点击“新游戏”准备下一题。");
  }

  function setGenerationBusy(busy) {
    generatingPuzzle = busy;
    ["difficulty", "mode-picker-open"].forEach(function (id) { if ($(id)) $(id).disabled = busy; });
    var button = $("new-game");
    if (button) {
      button.setAttribute("aria-busy", String(busy));
      var label = button.querySelector("span"); if (label) label.textContent = busy ? "取消生成" : generationRetry ? "重试生成" : "新游戏";
    }
    if (game) render();
  }

  function cancelPuzzleGeneration() {
    clearGenerationRetry();
    if(loadingDaily)cancelDailyGeneration();
    generationEpoch++;
    if (generatorClient) generatorClient.cancel();
    setGenerationBusy(false);
  }

  function generationAvoid() {
    var keys=recentGenerated.slice();
    if(game && Generator && Generator.recentKeys)keys=keys.concat(Generator.recentKeys(game));
    return Array.from(new Set(keys)).slice(-260);
  }
  function rememberGenerated(puzzle) {
    if (!Generator || !puzzle || (!puzzle.generation&&!puzzle.recovery&&!puzzle.deliveryRecovery)) return;
    var keys=Generator.recentKeys?Generator.recentKeys(puzzle):[Generator.fingerprint(puzzle)];
    keys.forEach(function(key){if(typeof key==="string"&&/^[a-f0-9]{32}$/.test(key))recentGenerated=recentGenerated.filter(function(v){return v!==key;}).concat(key).slice(-256);});
    try { playerStorage.setItem(RECENT_GENERATED_KEY, JSON.stringify(recentGenerated)); } catch (error) { /* Keep a bounded in-memory ledger. */ }
  }
  function recoveryInfo(record,puzzle) {
    if(!record || !Backup || !Backup.recoveryInfo)return null;
    try{return Backup.recoveryInfo(record,puzzle);}catch(error){return null;}
  }
  function generationStage(stage,mode,difficulty,epoch) {
    if(epoch!==generationEpoch || !generatingPuzzle)return;
    var target=modeInfo(mode).label+" · "+difficultyInfo(mode,difficulty).label;
    setStatus(stage.stage==="primary"?"正在构造并验证"+target+"。首轮预算 8 秒，必要时尝试备用方案，合计预算 "+(stage.total===2?"16":"20")+" 秒；可取消。":stage.stage==="fresh-retry"?"首轮未完成，正在尝试备用构造 · "+target+"（本轮预算 8 秒，可取消）。":"新构造未完成，正在检查同玩法同档题库备选 · "+target+"（本轮预算 4 秒，可取消）。");
  }

  function sourceIdFor(puzzle, mode, difficulty) {
    var candidates = PUZZLE_CATALOG.filter(function (p) { return p.mode === mode && p.difficulty === difficulty; });
    var match = candidates.find(function (p) { return p.id === puzzle.sourceId; });
    if (!match) match = candidates.find(function (p) {
      var id = String(puzzle.puzzleId || puzzle.id || "");
      return id === p.id || id.indexOf(p.id + "-") === 0;
    });
    if (match) return match.id;
    var chapter = Voyage.chapters().find(function (entry) {
      return entry.id === puzzle.voyageId || entry.legacySourceId && entry.sourceId === puzzle.sourceId;
    });
    var voyage = chapter && Voyage.puzzleInfo(chapter.id, puzzle.givens, mode, difficulty, puzzle.clues);
    return voyage ? voyage.sourceId : null;
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

  function validSnapshot(snapshot, givens, clues) {
    try { if (snapshot && Drafts) Drafts.validate(snapshot.draft, givens.length, clues); } catch (error) { return false; }
    return snapshot && isBoard(snapshot.board, false, givens.length) && isNotes(snapshot.notes, givens.length) &&
      respectsGivens(snapshot.board, givens) &&
      snapshot.notes.every(function (mask, i) { return !snapshot.board[i] || mask === 0; });
  }

  function copySnapshot(snapshot) {
    return { board: snapshot.board.slice(), notes: snapshot.notes.slice(), draft: Drafts.clone(snapshot.draft, snapshot.board.length),
      selected: Number.isInteger(snapshot.selected) && snapshot.selected >= 0 && snapshot.selected < snapshot.board.length ? snapshot.selected : 0,
      noteMode: Boolean(snapshot.noteMode) };
  }

  function restoreBranch(source, givens, clues) { return Branches.validate(source, givens, clues); }

  function restore(provided, keepPreferences) {
    try {
      var raw = provided ? null : playerStorage.getItem(STORAGE_KEY);
      if (!provided && !raw) return false;
      var saved = provided || JSON.parse(raw);
      if (!saved || [1, 2, 3, 4, 5, 6, 7, SAVE_VERSION].indexOf(saved.version) < 0) return false;
      var prefs = saved.preferences || {};
      var nextPreferences = Object.assign({}, preferences);
      if (!keepPreferences) {
      nextPreferences.theme = THEMES.indexOf(prefs.theme) >= 0 ? prefs.theme : "nebula";
      nextPreferences.fx = typeof prefs.fx === "boolean" ? prefs.fx : true;
      nextPreferences.errorCheck = typeof prefs.errorCheck === "boolean" ? prefs.errorCheck : true;
      nextPreferences.logicMode = prefs.logicMode === true;
      nextPreferences.customDraft = typeof prefs.customDraft === "string" && prefs.customDraft.length <= 2048 ? prefs.customDraft : "";
      nextPreferences.fog = prefs.fog === true;
      nextPreferences.sound = prefs.sound === true;
      nextPreferences.soundVolume = Number.isFinite(prefs.soundVolume) && prefs.soundVolume >= 0 && prefs.soundVolume <= 1 ? prefs.soundVolume : 0.65;
      nextPreferences.effectsEnabled = typeof prefs.effectsEnabled === "boolean" ? prefs.effectsEnabled : true;
      nextPreferences.effectsVolume = Number.isFinite(prefs.effectsVolume) && prefs.effectsVolume >= 0 && prefs.effectsVolume <= 1 ? prefs.effectsVolume : 1;
      nextPreferences.musicEnabled = prefs.musicEnabled === true;
      nextPreferences.musicVolume = Number.isFinite(prefs.musicVolume) && prefs.musicVolume >= 0 && prefs.musicVolume <= 1 ? prefs.musicVolume : 0.35;
      nextPreferences.focus = prefs.focus === true;
      nextPreferences.zen = prefs.zen === true;
      nextPreferences.zenMotion = prefs.zenMotion !== false;
      nextPreferences.intensity = ["cinematic", "balanced", "soft"].indexOf(prefs.intensity) >= 0 ? prefs.intensity : "cinematic";
      nextPreferences.textSize = prefs.textSize === "large" ? "large" : "normal";
      nextPreferences.lineContrast = prefs.lineContrast === "strong" ? "strong" : "standard";
      nextPreferences.colorAssist = prefs.colorAssist === true;
      nextPreferences.handedness = prefs.handedness === "left" ? "left" : "right";
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
          !validSnapshot(source, source.givens, clues) ||
          !Number.isFinite(source.elapsedMs) || source.elapsedMs < 0 || source.elapsedMs > 1e12 ||
          !Number.isInteger(source.mistakes) || source.mistakes < 0 ||
          !Number.isInteger(source.hints) || source.hints < 0) return false;
      // A saved answer must belong to this puzzle, not just be another complete grid.
      if (source.custom !== undefined && typeof source.custom !== "boolean" || source.custom && (mode !== "classic" || !Logic.scope(restoredContext).complete)) return false;
      var fullRuleOnly = source.logicMode === true && Logic.scope(restoredContext).complete;
      var trustedSolution = fullRuleOnly ? source.solution : source.custom ? Engine.analyzeSolutions(source.givens, restoredContext, {limit:1,maxNodes:250000,timeLimitMs:750}).solution : Engine.solve(source.givens, restoredContext);
      if (!trustedSolution || !trustedSolution.every(function (v, i) { return v === source.solution[i]; })) return false;
      if (source.logicMode !== undefined && typeof source.logicMode !== "boolean" || source.errorCheckIncomplete !== undefined && typeof source.errorCheckIncomplete !== "boolean") return false;
      var branch = restoreBranch(source.branch, source.givens, clues);
      if (!Branches.matches(branch, source)) return false;
      var completed = !Branches.active(branch) && !(source.practice && !source.completed) && (source.logicMode ? Logic.complete(source.board, restoredContext) : source.board.every(function (value, i) { return value === source.solution[i]; }));
      // Older saves were always live. Keep their time, but wait for an explicit resume.
      var recordedProgress = source.elapsedMs > 0 || source.hints > 0 || source.mistakes > 0 ||
        source.board.some(function (value, i) { return value !== source.givens[i]; }) ||
        source.notes.some(function (mask) { return mask !== 0; });
      var started = completed || source.started === true || !(source.practice && source.started === false) && (saved.version < 3 || recordedProgress || Boolean(branch));
      cancelPuzzleGeneration();
      game = {
        custom: source.custom === true,
        practice: History ? History.practiceInfo(source.practice) : source.practice || null,
        logicMode: source.logicMode === true,
        generation: generationInfo(source.generation, { mode: mode, clues: clues, givens: source.givens }, difficulty),
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
        draft: Drafts.validate(source.draft, restoredSize, clues),
        history: Array.isArray(source.history) ? source.history.filter(function (item) {
          return validSnapshot(item, source.givens, clues);
        }).slice(-80).map(copySnapshot) : [],
        redo: Array.isArray(source.redo) ? source.redo.filter(function (item) { return validSnapshot(item, source.givens, clues); }).slice(-80).map(copySnapshot) : [],
        selected: Number.isInteger(source.selected) && source.selected >= 0 && source.selected < restoredSize
          ? source.selected : source.givens.indexOf(0),
        mistakes: source.mistakes,
        errorCheckIncomplete: source.errorCheckIncomplete === true || source.errorCheckIncomplete === undefined && !completed && recordedProgress,
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
      game.recovery=recoveryInfo(source.recovery,game);
      rememberGenerated(game);
      batchSelection.clear(); batchSelecting = false;
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
        !generatingPuzzle && !storageTransition && !dialogIsOpen() && !document.hidden) runningSince = performance.now();
  }

  function currentSaveEnvelope() {
    if (!game) throw new Error("当前没有可导出的对局。");
    Branches.sync(game, noteMode);
    return { version: SAVE_VERSION, preferences: preferences,
      game: Object.assign({}, game, { elapsedMs: Math.floor(currentElapsed()), noteMode: noteMode }) };
  }

  function liveSaveExport() { return Boolean(game && (storageSession.isTemporary() || storageFailed || storageConflict)); }

  function save(action) {
    if (!game || storageTransition || saveRecoveryState || storageSession.isTemporary()) return false;
    try {
      storageSession.check();
      var envelope = currentSaveEnvelope();
      if (History) {
        try { History.capture(envelope, { action: typeof action === "string" ? action : undefined, origin: historyOrigin || undefined }); }
        catch (historyError) { /* Current-game saving remains independent of the history archive. */ }
        historyOrigin = null;
      }
      playerStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
      storageFailed = false; refreshSaveStatus();
      return true;
    } catch (error) {
      if (error.code === "SAVE_CONFLICT") { reportStorageConflict(); return false; }
      if (!storageFailed) {
        storageFailed = true;
        toast("进度尚未保存。可继续游玩，请在关闭前从页脚导出当前对局。");
      }
      refreshSaveStatus();
      return false;
    }
  }

  function pauseSaveMessage() {
    if (storageSession.isTemporary()) return "本次进度仅保留在此窗口，关闭前可从页脚“临时对局”导出原文。";
    if (storageConflict) return "此窗口已暂停保存。请先导出本窗口进度，或重新读取本机进度。";
    if (storageFailed) return "进度尚未保存到本机。可继续游玩，关闭前请从页脚导出当前对局。";
    return preferences.zen ? "棋局已为你保留，准备好后再继续。" : "进度已经保存，点击继续后再恢复计时。";
  }

  function refreshSaveStatus() {
    var state = storageSession.isTemporary() ? "temporary" : storageConflict ? "conflict" :
      saveRecoveryState ? "protected" : storageFailed ? "failed" : "saved";
    var messages = { temporary: "本次对局不自动保存", conflict: "此窗口已暂停保存", protected: "自动保存已暂停，原档保持不变",
      failed: "进度尚未保存，关闭前请导出当前对局", saved: "进度自动保存，随时回来继续" };
    var label = $("save-status");
    if (label.textContent !== messages[state]) label.textContent = messages[state];
    if (label.dataset.saveState !== state) { label.dataset.saveState = state; refreshRecoveryLink(); }
    if (game && game.started && game.paused) $("pause-description").textContent = pauseSaveMessage();
    var notice = $("toast");
    if (state === "failed" && preferences.zen) {
      if (notice.dataset.saveWarning !== "true") toast(messages.failed);
    } else if (notice.dataset.saveWarning === "true") {
      clearTimeout(toastTimeout); notice.hidden = true; notice.classList.remove("visible"); delete notice.dataset.saveWarning;
    }
  }

  function suspendOtherPersistence(value) {
    if (History) History.suspendPersistence(value);
    if (window.NineRealmsEasterEggs && window.NineRealmsEasterEggs.suspendPersistence) window.NineRealmsEasterEggs.suspendPersistence(value);
  }

  function reportStorageConflict() {
    if (storageSession.isTemporary()) return;
    storageConflict = true; storageTransition = true;
    suspendClock();
    if (game && game.started && !game.completed) game.paused = true;
    cancelPuzzleGeneration(); suspendOtherPersistence(true);
    var dialog = $("save-conflict-dialog");
    document.querySelectorAll("dialog[open]").forEach(function (open) { if (open !== dialog) closeDialog(open); });
    if (game) render();
    refreshSaveStatus();
    $("save-conflict-export").disabled = !game;
    if (!dialog.open) { if (dialog.showModal) dialog.showModal(); else dialog.setAttribute("open", ""); }
  }

  function enterTemporarySession(freshGame) {
    storageSession.temporary(); storageConflict = false;
    saveRecoveryState = { status: "temporary", sessionOnly: true };
    storageTransition = false; suspendOtherPersistence(true);
    document.querySelectorAll("dialog[open]").forEach(closeDialog);
    if (freshGame || !game) newGame("easy", true); else render();
    refreshSaveStatus();
    setStatus("仅本次游玩，不会覆盖本机存档或其他记录。关闭前可从页脚“临时对局”导出当前对局原文。");
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
    var persistent = storageFailed && preferences.zen && !storageConflict && !storageSession.isTemporary();
    if (persistent) message = "进度尚未保存。请退出禅模式后，从页脚导出未保存对局。";
    if (element.textContent !== message) element.textContent = message;
    element.dataset.saveWarning = String(persistent);
    element.hidden = false;
    element.classList.add("visible");
    if (persistent) return;
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
    var result = new Set(ruleOnly() ? Logic.conflicts(game.board, gameContext()) : Engine.getConflicts(game.board, gameContext()));
    if (!ruleOnly()) game.board.forEach(function (value, i) {
      if (value && !game.givens[i] && value !== game.solution[i]) result.add(i);
    });
    return result;
  }

  function cellLocation(index) {
    return Engine.getCellLabel ? Engine.getCellLabel(index, gameContext()) :
      "第 " + (Math.floor(index / 9) + 1) + " 行第 " + (index % 9 + 1) + " 列";
  }

  function isMulti() { return Boolean(game && game.board.length > 81); }

  // Transient input feedback uses no puzzle state and never inspects correctness.
  function clearNumberPress(button) {
    var pressed = numberPresses.get(button);
    if (pressed) clearTimeout(pressed.timer);
    button.classList.remove("is-pressed"); numberPresses.delete(button);
  }

  function clearNumberPresses() { numberPresses.forEach(function (_, button) { clearNumberPress(button); }); }

  function pressNumberKey(value, source) {
    var button = numberKeys[value - 1];
    if (!button || button.disabled || !canInteract()) return;
    var pressed = numberPresses.get(button);
    if (!pressed) { pressed = { sources: new Set(), started: performance.now(), timer: null }; numberPresses.set(button, pressed); }
    clearTimeout(pressed.timer); pressed.sources.add(source); button.classList.add("is-pressed");
  }

  function releaseNumberKey(source, immediate) {
    numberPresses.forEach(function (pressed, button) {
      if (!pressed.sources.delete(source) || pressed.sources.size) return;
      var remaining = immediate || reducedMotion.matches || !preferences.fx ? 0 : Math.max(0, 90 - (performance.now() - pressed.started));
      if (!remaining) clearNumberPress(button);
      else pressed.timer = setTimeout(function () { if (numberPresses.get(button) === pressed && !pressed.sources.size) clearNumberPress(button); }, remaining);
    });
  }

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
      button.addEventListener("click", function (event) { selectCell(Number(event.currentTarget.dataset.index), false, event.ctrlKey || event.metaKey || batchSelecting); });
      fragment.appendChild(button);
      cells.push(button);
    });
    boardRows = GridRows.wrap(boardElement,cells,boardLayout.cells.map(function(position){return position.row;}));
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
      key.addEventListener("pointerdown", function (event) { if (event.button === 0 && event.isPrimary !== false) pressNumberKey(Number(event.currentTarget.dataset.value), "pointer:" + event.pointerId); });
      key.addEventListener("pointerleave", function (event) { releaseNumberKey("pointer:" + event.pointerId, true); });
      key.addEventListener("click", function (event) { var value = Number(event.currentTarget.dataset.value); if (event.detail === 0) { pressNumberKey(value, "activation"); releaseNumberKey("activation"); } enterNumber(value, false); });
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
        cell.style.borderTop = outerTop ? "var(--reading-strong-width,2px) solid var(--grid-strong)" : "0";
        cell.style.borderLeft = outerLeft ? "var(--reading-strong-width,2px) solid var(--grid-strong)" : "0";
        cell.style.borderRight = (local.col % 3 === 2 ? "var(--reading-strong-width,2px) solid var(--grid-strong)" : "var(--reading-thin-width,1px) solid var(--grid-line)");
        cell.style.borderBottom = (local.row % 3 === 2 ? "var(--reading-strong-width,2px) solid var(--grid-strong)" : "var(--reading-thin-width,1px) solid var(--grid-line)");
      }
    });
    if (boardRows) boardRows.refresh();
    if ($("multigrid-tools")) $("multigrid-tools").hidden = !multi;
    if ($("grid-view")) $("grid-view").value = activeBoardId;
    if (window.NineRealmsSelect) window.NineRealmsSelect.syncAll();
    if ($("multi-grid-summary")) $("multi-grid-summary").textContent = boardLayout.boards.length + " 个子盘 · " + boardLayout.cellCount + " 格 · " +
      boardLayout.cells.filter(function (cell) { return cell.boards.length > 1; }).length + " 格共享";
  }

  function moveOnLayout(dx, dy, extend) {
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
      if (target >= 0) { selectCell(target, true, extend); return; }
    }
  }

  function motionEnabled() {
    return !preferences.zen && preferences.fx && !reducedMotion.matches;
  }

  function automaticErrors() {
    return preferences.errorCheck && !preferences.zen;
  }

  function renderPreferences() {
    document.body.dataset.textSize = preferences.textSize;
    document.body.dataset.lineContrast = preferences.lineContrast;
    document.body.dataset.colorAssist = String(preferences.colorAssist);
    document.body.dataset.handedness = preferences.handedness;
    document.querySelectorAll("[data-reading-pref]").forEach(function(button){
      button.setAttribute("aria-pressed", String(String(preferences[button.dataset.readingPref]) === button.dataset.readingValue));
    });
    document.body.dataset.theme = preferences.theme;
    document.body.dataset.intensity = preferences.intensity;
    if ($("scene-intensity")) $("scene-intensity").value = preferences.intensity;
    if (window.NineRealmsSelect) window.NineRealmsSelect.syncAll();
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
    $("zen-toggle").title = preferences.zen ? "退出禅模式（Esc），保留当前棋局" : "只留下棋盘与基本填数工具";
    $("zen-toggle").setAttribute("aria-keyshortcuts", preferences.zen ? "Escape" : "");
    $("zen-panel").hidden = !preferences.zen;
    if (preferences.zen) prepareZenView();
    renderZenContext();
    var zenMotion = $("zen-motion-toggle");
    zenMotion.disabled = reducedMotion.matches;
    zenMotion.setAttribute("aria-pressed", String(preferences.zenMotion && !reducedMotion.matches));
    zenMotion.querySelector("span").textContent = preferences.zenMotion && !reducedMotion.matches ? "流动" : "静止";
    zenMotion.title = reducedMotion.matches ? "已遵循系统的减少动态设置" :
      preferences.zenMotion ? "让场景与棋盘静止，保留主题背景" : "开启柔和场景动画与棋盘视差";
    zenMotion.setAttribute("aria-label", zenMotion.title);
    $("sound-toggle").setAttribute("aria-pressed", String(preferences.sound));
    if ($("sound-volume")) { $("sound-volume").value = String(Math.round(preferences.soundVolume * 100)); $("sound-volume-value").textContent = Math.round(preferences.soundVolume * 100) + "%"; }
    $("sound-toggle").setAttribute("aria-label", preferences.sound ? "关闭全部声音" : "开启声音总开关");
    $("sound-toggle").title = preferences.sound ? "声音总开关已开启" : "全部声音已静音";
    $("focus-toggle").setAttribute("aria-pressed", String(preferences.focus));
    $("focus-toggle").setAttribute("aria-label", preferences.focus ? "退出沉浸模式" : "进入沉浸模式");
    var focusLabel = $("focus-toggle").querySelector("span");
    if (focusLabel) focusLabel.textContent = preferences.focus ? "退出沉浸" : "沉浸";
    Atmosphere.configure({ fx: !preferences.zen && preferences.fx,
      zen: preferences.zen, sound: preferences.sound && !preferences.zen, soundVolume: preferences.soundVolume, effectsEnabled: preferences.effectsEnabled !== false, effectsVolume: preferences.effectsVolume===undefined?1:preferences.effectsVolume,
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
    if (typeof syncMusic === "function") syncMusic();
    if (typeof renderEffectsStatus === "function") renderEffectsStatus();
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
      if (select.dataset.mode !== game.mode + ":" + Boolean(game.custom)) {
        select.replaceChildren();
        Engine.getDifficulties(game.mode).forEach(function (entry) {
          var option = document.createElement("option");
          option.value = entry.id;
          option.textContent = game.custom && entry.id === game.difficulty ? "自建" : entry.label;
          select.appendChild(option);
        });
        select.dataset.mode = game.mode + ":" + Boolean(game.custom);
      }
      select.value = game.difficulty;
      if (window.NineRealmsSelect) window.NineRealmsSelect.syncAll();
    }
    if ($("mode-name")) $("mode-name").textContent = info.label;
    if ($("current-mode-label")) $("current-mode-label").textContent = info.label;
    if ($("catalog-count")) $("catalog-count").textContent = MODES.length + " 种玩法";
    if ($("puzzle-bank-status")) {
      var available = PUZZLE_CATALOG.filter(function (p) { return p.mode === game.mode && p.difficulty === game.difficulty; }).length;
      var calibrated = game.generation && game.generation.difficultyBasis === "supported-logic";
      $("puzzle-bank-status").textContent = game.custom ? "自建经典题 · " + game.givens.filter(Boolean).length + " 个给定数 · 已验证唯一解" : game.generation ? "离线新题 · " + game.generation.givenCount + " 个给定数 · " + difficulty.label + (calibrated ? " · 技巧校准" : "密度档") :
        difficulty.label + "原题库 · " + available + " 题" + (game.difficulty === "master" ? "" : " · 新游戏可离线生成");
      $("puzzle-bank-status").title = calibrated ? "已验证唯一解，并按本玩法规则完整检查逻辑路径：入门只用单格唯一候选，标准需区域唯一位置，进阶需锁定候选或数对。代表此推理路径，不保证是所有人类解法的最低难度；变体使用其额外区域或相斥格约束。" : game.generation ? "基于合法解与本玩法约束重新挖空，逐步验证唯一解；档位按给定数密度，不是人类技巧评级。变体标记结构来自原题；使用有限近期签名避免重复，不保证永不重复。" :
        "原题库原分档保留，未经本次技巧校准。普通新游戏可在后台重新挖空生成；极境、每日和旅程保留原题规则。";
    }
    if(game.generation&&game.generation.kind==="constructed"){
      $("puzzle-bank-status").textContent="新底盘生成 · "+(game.generation.layoutFingerprint?"新规则布局":"独立约束搜索");
      $("puzzle-bank-status").title="从空盘构造完整解，再验证唯一解；近期按完整经典对称群排除等价底盘。"+generationDifficultyCopy(game.generation);
    }
    if(game.recovery&&$("puzzle-bank-status")){
      $("puzzle-bank-status").textContent=game.recovery.kind==="verified-reserve"?"固定备用题 · "+difficulty.label:game.recovery.kind==="verified-catalog"?"已验证题库备选 · "+difficulty.label:"备用构造 · "+difficulty.label;
      $("puzzle-bank-status").title=game.recovery.kind==="verified-reserve"?"新构造未完成后使用的固定备用题；重新验证同玩法、同档位、唯一解与近期去重，不是本次新构造。":game.recovery.kind==="verified-catalog"?"新构造未完成后选取的题库题；本次验证了同玩法、"+(Generator&&Generator.supportsDifficulty(game.mode)?"同技巧档位":"同规则推演档位")+"、唯一解及近期去重，不是新构造。":"首次构造未完成后的有限备用构造，保持原玩法与难度要求。";
    }
    if (Curated && $("puzzle-bank-status")) {
      var edition = Curated.identify(game);
      if (edition) { $("puzzle-bank-status").textContent = edition.title; $("puzzle-bank-status").title = edition.note; }
      var choices = $("curated-choices");
      if (!choices) { choices = document.createElement("div"); choices.id = "curated-choices"; choices.className = "voyage-training-links"; $("rules-description").after(choices); }
      choices.replaceChildren();
      var rating = $("curated-rating"); if (!rating) { rating = document.createElement("p"); rating.id = "curated-rating"; rating.className = "training-note"; choices.before(rating); }
      var constructed=game.generation&&game.generation.kind==="constructed";
      rating.hidden = !edition && !constructed && !game.recovery;
      rating.textContent = game.recovery ? (game.recovery.kind==="verified-reserve"?"固定备用题，不是本次新构造。":game.recovery.kind==="verified-catalog"?"已验证题库备选，不是本次新构造。":"本局来自首次尝试之后的备用构造。")+"已验证同玩法、同档位与唯一解。" : edition ? edition.title + " · " + edition.note : constructed ? "本局由空盘构造新解"+(game.generation.layoutFingerprint?"，并生成新的规则布局":"")+"。"+generationDifficultyCopy(game.generation) : "";
      choices.hidden = Boolean(preferences.zen);
      ["intro", "standard"].forEach(function (level) {
        var pool = Curated.list({mode: game.mode, level: level}), at = edition ? pool.findIndex(function(p){return p.id === edition.id;}) : -1;
        var entry = pool.length ? pool[(at + 1) % pool.length] : null; if (!entry) return;
        var b = document.createElement("button"); b.type = "button"; b.className = "secondary-btn"; b.textContent = level === "intro" ? "精选 · 入门" : "精选 · 进阶"; b.title = entry.title + " · " + entry.note;
        b.addEventListener("click", function () { launchCurated(entry.id, $("rules-dialog")); }); choices.appendChild(b);
      });
      if (edition && Generator && Generator.supportsFresh(game.mode)) {
        var freshButton=document.createElement("button");freshButton.type="button";freshButton.id="curated-fresh";freshButton.className="secondary-btn";freshButton.textContent="生成同规则新题";
        freshButton.title="独立练习，不替换精选原题，也不改变主线星数。";
        freshButton.addEventListener("click",function(){launchSameRule(game.mode,game.difficulty,$("rules-dialog"));});choices.appendChild(freshButton);
      }
      choices.hidden = Boolean(preferences.zen) || !choices.childElementCount;
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
    if ($("difficulty-description")) $("difficulty-description").textContent = game.mode === "classic" ? difficulty.description :
      "按给定数密度分档，尚未按所选档位校准解题技巧；实际体验会随玩法规则而变化。";
    if ($("rule-badge")) $("rule-badge").textContent = {
      classic: "基础规则", diagonal: "双对角线", hyper: "四个窗口", knight: "马步约束"
    }[game.mode];
    document.body.dataset.mode = game.mode;
    boardElement.dataset.mode = game.mode;
  }

  function render() {
    if (typeof syncMusic === "function") syncMusic();
    if (personalUi) personalUi.refreshCurrent();
    if (!game) return;
    if (boardLayoutKey !== game.mode + ':' + game.board.length) buildBoard();
    if (isMulti() && cells[game.selected] && cells[game.selected].hidden) {
      activeBoardId = boardLayout.cells[game.selected].boards[0].id;
      applyBoardView();
    }
    batchSelection.forEach(function (i) { if (game.board[i] || game.givens[i]) batchSelection.delete(i); });
    renderModeControls();
    renderEnergy();
    if (pendingHint && (document.body.dataset.zen === "on" || !canInteract() || ruleOnly() || pendingHint.signature !== hintSignature())) pendingHint = null;
    var selectedValue = game.board[game.selected];
    var errors = automaticErrors() || checkedReveal ? conflicts() : new Set();
    var waitingToStart = !game.started;
    var blocked = generatingPuzzle || waitingToStart || game.paused || game.completed;
    var filled = 0;
    var editableTotal = 0;
    var solved = 0;
    // Bulb interiors are opaque clue material, independent of selection/draft tint.
    var arrowBulbCells = new Set((game.clues && game.clues.lines || []).filter(function (line) {
      return line.type === "arrow" && Array.isArray(line.cells) && line.cells.length;
    }).map(function (line) { return line.cells[0]; }));
    cells.forEach(function (button, i) {
      var value = game.board[i];
      var fogged = game.fog && !game.fogSeen[i] && !game.completed;
      button.classList.toggle("fogged", fogged);
      if (value) filled++;
      if (!game.givens[i]) {
        editableTotal++;
        if (ruleOnly() || !automaticErrors() ? Boolean(value) : value === game.solution[i]) solved++;
      }
      (button._variantDecorations || []).forEach(function (name) { button.classList.remove(name); });
      var decorations = Engine.getCellDecorations(i, gameContext());
      decorations.forEach(function (name) { button.classList.add(name); });
      button._variantDecorations = decorations;
      var specialPeer = i !== game.selected && (game.mode === "knight" ?
        isKnightMove(i, game.selected) :
        sameUnit(i, game.selected) && (isMulti() ? boardLayout.cells[game.selected].boards.length > 1 : !Engine.arePeers(i, game.selected, "classic")));
      button.classList.toggle("variant-peer", !preferences.zen && specialPeer);
      button.classList.toggle("knight-target", !preferences.zen && game.mode === "knight" && specialPeer);
      button.classList.toggle("given", !fogged && Boolean(game.givens[i]));
      button.classList.toggle("arrow-bulb-cell", !fogged && arrowBulbCells.has(i));
      button.classList.toggle("filled", !fogged && Boolean(value) && !game.givens[i]);
      button.classList.toggle("selected", i === game.selected);
      button.classList.toggle("related", !preferences.zen && i !== game.selected && sameUnit(i, game.selected));
      button.classList.toggle("same-value", !preferences.zen && !fogged && Boolean(selectedValue) && value === selectedValue && i !== game.selected);
      button.classList.toggle("conflict", !fogged && errors.has(i));
      button.classList.toggle("hint-cell", Boolean(pendingHint && pendingHint.index === i));
      button.classList.toggle("branch-cell", inBranch() &&
        (value !== Branches.base(game).board[i] || game.notes[i] !== Branches.base(game).notes[i]));
      button.classList.toggle("batch-selected", batchSelection.has(i));
      button.setAttribute("aria-selected", String(batchSelecting || batchSelection.size ? batchSelection.has(i) : i === game.selected));
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
        (errors.has(i) ? (ruleOnly() ? "，规则冲突" : "，数字有误") : ""));
      if (!isMulti() && !fogged && window.SudokuVariantView && window.SudokuVariantView.getCellLabel) {
        var clueLabel = window.SudokuVariantView.getCellLabel(i, gameContext());
        if (clueLabel) button.setAttribute("aria-label", button.getAttribute("aria-label") + "，" + clueLabel);
      }
      if (fogged) button.setAttribute("aria-label", cellLocation(i) + "，迷雾，点击照亮周围九格");
    });
    numberKeys.forEach(function (button, index) {
      var value = index + 1;
      var count = game.board.filter(function (n) { return n === value; }).length;
      var remaining = Math.max(0, (ruleOnly() ? (isMulti() ? count : 9) : game.solution.filter(function (n) { return n === value; }).length) - count);
      button.querySelector(".remaining").textContent = ruleOnly() && isMulti() ? String(count) : remaining ? String(remaining) : "✓";
      button.classList.toggle("exhausted", !(ruleOnly() && isMulti()) && remaining === 0);
      button.setAttribute("aria-label", noteMode ? "切换候选 " + value : "填入 " + value + (preferences.zen ? "" : ruleOnly() && isMulti() ? "，当前已填 " + count + " 个" : "，还可填写 " + remaining + " 个"));
      button.disabled = blocked;
      if (blocked) clearNumberPress(button);
    });
    if ($("difficulty")) $("difficulty").value = game.difficulty;
    if (window.NineRealmsSelect) window.NineRealmsSelect.syncAll();
    if ($("timer")) $("timer").textContent = formatTime(currentElapsed());
    if ($("mistakes")) $("mistakes").textContent = ruleOnly() || !automaticErrors() ? "—" : String(game.mistakes).padStart(2, "0");
    if ($("progress-count")) {
      $("progress-count").textContent = solved + " / " + editableTotal;
      $("progress-count").setAttribute("aria-label", (ruleOnly() || !automaticErrors() ? "已填 " : "已核对正确 ") + solved + " 格，共 " + editableTotal + " 个待填格");
    }
    if ($("progress-fill")) $("progress-fill").style.width = (editableTotal ? solved / editableTotal * 100 : 100) + "%";
    if ($("notes-btn")) {
      $("notes-btn").classList.toggle("active", noteMode);
      $("notes-btn").setAttribute("aria-pressed", String(noteMode));
      $("notes-btn").disabled = blocked;
    }
    if ($("notes-state")) $("notes-state").textContent = noteMode ? "笔记模式" : "数字模式";
    if ($("undo-btn")) $("undo-btn").disabled = generatingPuzzle || waitingToStart || game.paused || game.history.length === 0;
    if ($("redo-btn")) $("redo-btn").disabled = generatingPuzzle || waitingToStart || game.paused || !game.redo.length;
    if ($("erase-btn")) $("erase-btn").disabled = blocked || Boolean(game.givens[game.selected]) ||
      (!game.board[game.selected] && !game.notes[game.selected]);
    if ($("hint-btn")) {
      $("hint-btn").disabled = blocked || ruleOnly();
      $("hint-btn").title = inBranch() ? "假设中不揭晓答案；返回主盘后可使用提示" :
        game.logicMode ? "纯逻辑模式不揭晓答案；关闭纯逻辑模式后可使用提示" : "显示选中空格的答案，不自动填入";
    }
    if ($("check-btn")) $("check-btn").disabled = blocked;
    if ($("auto-notes-btn")) $("auto-notes-btn").disabled = blocked;
    if ($("branch-btn")) {
      $("branch-btn").disabled = blocked; $("branch-btn").setAttribute("aria-pressed", String(inBranch()));
    }
    if ($("branch-banner")) $("branch-banner").hidden = !game.branch;
    if ($("branch-rollback")) $("branch-rollback").disabled = blocked || !inBranch();
    if ($("branch-commit")) $("branch-commit").disabled = blocked || !inBranch();
    if ($("branch-new")) $("branch-new").disabled = blocked;
    if ($("branch-switch")) {
      var choices = Branches.choices(game), currentBranch = game.branch && game.branch.version === 2 ? game.branch.activeId : inBranch() ? "b1" : null;
      var choiceKey = JSON.stringify(choices);
      if ($("branch-switch").dataset.choices !== choiceKey) {
        $("branch-switch").dataset.choices = choiceKey; $("branch-switch").replaceChildren();
        var mainOption = document.createElement("option"); mainOption.value = ""; mainOption.textContent = "主盘"; $("branch-switch").appendChild(mainOption);
        choices.forEach(function (entry) { var option = document.createElement("option"); option.value = entry.id; option.textContent = entry.label + " · 第 " + entry.depth + " 层"; $("branch-switch").appendChild(option); });
      }
      $("branch-switch").value = currentBranch || ""; $("branch-switch").disabled = blocked;
      if ($("branch-title")) $("branch-title").textContent = inBranch() ? (choices.find(function (entry) { return entry.id === currentBranch; }) || { label: "假设" }).label + " 进行中" : "主盘";
      if ($("branch-summary")) {
        var changes = inBranch() ? game.board.reduce(function (count, value, i) { var base = Branches.base(game); return count + (value !== base.board[i] || game.notes[i] !== base.notes[i] ? 1 : 0); }, 0) : 0;
        $("branch-summary").textContent = inBranch() ? "已改动 " + changes + " 格 · 仅查规则 · 主盘已隔离" : "已保留 " + choices.length + " 个假设，可随时切换";
      }
    }
    document.body.dataset.branch = inBranch() ? "on" : "off";
    renderZenContext();
    $("fog-toggle").setAttribute("aria-pressed", String(game.fog));
    $("fog-banner").hidden = !game.fog;
    $("fog-clear").disabled = blocked || game.fogSeen.every(Boolean);
    $("fog-progress").textContent = "已点亮 " + (game.completed ? game.board.length : game.fogSeen.filter(Boolean).length) + " / " + game.board.length;
    $("voyage-game-badge").hidden = !game.voyageId;
    var voyageChapter = game.voyageId && Voyage.presentation(game.voyageId, game);
    $("voyage-game-badge").textContent = voyageChapter ? "远征 · " + voyageChapter.title + (voyageChapter.legacyEdition ? " · 旧版题面" : "") : "";
    if ($("custom-badge")) $("custom-badge").hidden = !game.custom;
    if ($("practice-badge")) { $("practice-badge").hidden = !game.practice; $("practice-badge").textContent = game.practice ? (game.practice.wasAssumption ? "假设卡点复练" : "独立复练") + " · 原第 " + game.practice.absoluteStep + " 步" : ""; }
    $("daily-game-badge").hidden = !game.dailyDate;
    $("daily-game-badge").textContent = game.dailyDate ? "每日一境 · " + game.dailyDate.slice(5).replace("-", "/") : "";
    if ($("logic-toggle")) { $("logic-toggle").setAttribute("aria-pressed", String(game.logicMode)); $("logic-toggle").disabled = Boolean(game.completed); }
    if ($("logic-badge")) $("logic-badge").hidden = !game.logicMode;
    if ($("logic-scope")) $("logic-scope").textContent = Logic.scope(gameContext()).message;
    document.body.dataset.logic = game.logicMode ? "on" : "off";
    if ($("error-toggle")) $("error-toggle").title = ruleOnly() ? "切换规则冲突即时标记" : "切换错误数字即时标红";
    renderLens();
    renderHint();
    if (draftUi && !preferences.zen) draftUi.render();
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
    if ($("pause-description")) $("pause-description").textContent = !waitingToStart ? pauseSaveMessage() : preferences.zen ?
      "准备好了，就从一个空格开始。不必着急。" : modeInfo(game.mode).label + " · " + (game.custom ? "自建题" : difficultyInfo(game.mode, game.difficulty).label) +
        "。点击开始后，棋盘与计时一起开启。";
    document.body.dataset.gameState = game.completed ? "completed" : waitingToStart ? "ready" : game.paused ? "paused" : "playing";
    if ($("multi-selected-label") && isMulti()) $("multi-selected-label").textContent = cellLocation(game.selected);
    boardElement.setAttribute("aria-multiselectable", String(batchSelecting || batchSelection.size > 0));
    boardElement.setAttribute("aria-label", modeInfo(game.mode).label + (preferences.zen ? "棋盘" : "棋盘，已填 " + filled + " 格，共 " + game.board.length + " 格"));
  }

  function advancedToolsEnabled() { return document.body.dataset.zen !== "on" && document.body.dataset.advancedTools !== "off"; }

  function renderLens() {
    // These are session-only view modes, not saved notes or draft data. Without
    // their controls, they must not invisibly filter cells or intercept digits.
    if (!advancedToolsEnabled()) { lensDigit = 0; batchSelecting = false; batchSelection.clear(); }
    var holder = $("candidate-lens");
    if (!holder) return;
    var active = lensDigit > 0 && game.started && !game.paused && !game.completed, result = null;
    holder.dataset.activeDigit = String(lensDigit);
    if (active) {
      var key = JSON.stringify([game.mode, game.clues, game.board, lensSource, lensDigit, lensSource === "notes" ? game.notes : null]);
      if (key !== lensKey) { lensKey = key; lensResult = Logic.lens(game.board, game.notes, lensDigit, lensSource, gameContext()); }
      result = lensResult;
      $("lens-status").textContent = (lensSource === "notes" ? "玩家笔记（可自行增删）" : "规则推算（局部可能，未证明可解）") + " · " + lensDigit + " · " + result.indices.length + " 格" +
        (lensSource === "rules" && !result.scope.complete ? "。" + result.scope.message : "");
    } else {
      var sourceMessage = lensSource === "notes" ? "玩家笔记（可自行增删）" : "规则推算（局部可能，未证明可解）";
      var scope = lensSource === "rules" ? Logic.scope(gameContext()) : null;
      $("lens-status").textContent = sourceMessage + " · " + (lensDigit ? "开始或继续棋局后查看候选。" : "点击数字筛选，再点一次取消。") +
        (scope && !scope.complete ? " " + scope.message : "");
    }
    var hits = new Set(result ? result.indices : []);
    cells.forEach(function (cell, index) {
      var hit = hits.has(index) && !(game.fog && !game.fogSeen[index]);
      cell.classList.toggle("lens-note", hit && lensSource === "notes");
      cell.classList.toggle("lens-rule", hit && lensSource === "rules");
      cell.querySelectorAll(".notes span").forEach(function (span, n) { span.classList.toggle("lens-digit", hit && lensSource === "notes" && n + 1 === lensDigit); });
      if (hit) cell.setAttribute("aria-label", cell.getAttribute("aria-label") + (lensSource === "notes" ? "；玩家笔记含 " : "；规则推算可含 ") + lensDigit);
    });
    $("lens-notes").setAttribute("aria-pressed", String(lensSource === "notes"));
    $("lens-rules").setAttribute("aria-pressed", String(lensSource === "rules"));
    $("batch-toggle").setAttribute("aria-pressed", String(batchSelecting));
    var batchVisible = batchSelecting || batchSelection.size > 0;
    $("batch-panel").hidden = !batchVisible;
    $("batch-toggle").setAttribute("aria-expanded", String(batchVisible));
    $("batch-digit").value = String(batchDigit);
    $("batch-digit").disabled = !canInteract();
    $("batch-count").textContent = "已选 " + batchSelection.size + " 格";
    $("batch-add").textContent = "加入 " + batchDigit; $("batch-remove").textContent = "移除 " + batchDigit;
    ["batch-toggle", "batch-all", "batch-selection-clear", "batch-add", "batch-remove", "batch-clear", "batch-rules"].forEach(function (id) {
      $(id).disabled = !canInteract() || (["batch-add", "batch-remove", "batch-clear", "batch-rules"].indexOf(id) >= 0 && !batchSelection.size);
    });
    // Cancelling selection is safe even while paused or before any cells are selected.
    $("batch-selection-clear").disabled = !batchVisible;
    $("lens-digits").querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", String(Number(b.dataset.digit) === lensDigit)); });
    if (typeof window !== "undefined" && window.NineRealmsSelect) window.NineRealmsSelect.syncAll();
    if (typeof window !== "undefined" && window.NineRealmsWorkspace) window.NineRealmsWorkspace.refreshTools();
  }

  function canTravelEdit() {
    return game && game.started && !generatingPuzzle && !storageTransition && !game.paused && !dialogIsOpen();
  }
  function canInteract() { return canTravelEdit() && !game.completed; }

  function selectCell(index, moveFocus, extend) {
    if (!canInteract() || index < 0 || index >= game.board.length) return;
    if (extend && advancedToolsEnabled()) {
      if (extend === "extend" && !game.board[game.selected] && !game.givens[game.selected]) batchSelection.add(game.selected);
      if (!game.board[index] && !game.givens[index]) {
        if (extend !== "extend" && batchSelection.has(index)) batchSelection.delete(index); else batchSelection.add(index);
      }
    }
    game.selected = index;
    revealFog(index);
    render();
    if (moveFocus) cells[index].focus({ preventScroll: true });
    save();
  }

  function playEditSound(kind) {
    var sequence=++editSoundSequence,session=game&&game.sessionId,at=performance.now();
    function allowed(){return game&&game.sessionId===session&&canInteract()&&!storageConflict&&preferences.sound&&preferences.effectsEnabled!==false&&preferences.effectsVolume!==0&&preferences.soundVolume>0&&!preferences.zen&&!document.hidden;}
    if(!allowed())return;
    if(Atmosphere.musicStatus&&Atmosphere.musicStatus().audioState==="running"){Atmosphere.play(kind);return;}
    // Resume within the input gesture; never queue stale feedback after a pause or new edit.
    Promise.resolve(Atmosphere.unlock()).then(function(ready){if(ready&&sequence===editSoundSequence&&performance.now()-at<250&&allowed())Atmosphere.play(kind);});
  }

  function remember() { Edits.push(game, noteMode); }

  function batchNotes(operation, mask) {
    if (!canInteract() || !batchSelection.size) return;
    var count = Edits.noteBatch(game, Array.from(batchSelection), mask === undefined ? 1 << (batchDigit - 1) : mask, operation, noteMode,
      operation === "rules" ? Logic.masks(game.board, gameContext()) : undefined);
    if (!count) { toast("所选格的笔记无需改变。"); return; }
    noteMode = true; pendingHint = null;
    setStatus("已批量修改 " + count + " 格候选，一次撤销或重做可恢复整组。");
    render(); save("批量候选 · " + operation);playEditSound("note");
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
    if (!fromHint && batchSelection.size && (noteMode || batchSelecting)) { batchNotes("toggle", 1 << (value - 1)); return; }
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
      if (!inBranch() && (!automaticErrors() || game.logicMode)) game.errorCheckIncomplete = true;
      game.notes[index] = 0;
      clearPeerNotes(index, value);
      if (!ruleOnly() && automaticErrors() && value !== game.solution[index] && !fromHint) {
        game.mistakes++;
        setStatus(automaticErrors() ? "这个数字与答案不符，可以撤销后再想一想。" : "已填入数字。");
      } else if (!fromHint) {
        setStatus(ruleOnly() ? "已填入数字，仅检查规则冲突。" : !automaticErrors() ? "已填入数字。" : "保持节奏，答案就在这些细节里。");
      }
      recordEnergy(index, value, fromHint);
      flash(index);
    }
    render();
    checkCompletion();
    if(!fromHint&&!game.completed)playEditSound(noteMode?"note":"input");
    save(fromHint ? "提示填入" : noteMode ? "笔记" : "填数");
  }

  function erase() {
    if (!canInteract()) return;
    if (batchSelection.size && (noteMode || batchSelecting)) { batchNotes("clear", 0); return; }
    var index = game.selected;
    if (game.givens[index] || (!game.board[index] && !game.notes[index])) return;
    remember();
    game.board[index] = 0;
    game.notes[index] = 0;
    if (!inBranch()) game.energy.combo = 0;
    setStatus("已擦除当前格。");
    render();
    save("擦除");playEditSound("erase");
  }

  function travelEdit(forward) {
    if (!canTravelEdit()) return;
    var wasCompleted = game.completed,oldBoard=game.board,oldNotes=game.notes,oldDraft=game.draft,oldNoteMode=noteMode;
    var result = forward ? Edits.redo(game, noteMode) : Edits.undo(game, noteMode);
    if (!result) return;
    noteMode = result.noteMode;
    game.completed = false;
    if (wasCompleted) { stopCelebration(); resumeClock(); }
    if (!inBranch()) game.energy.combo = 0;
    clearTransientMarks();
    setStatus((forward ? "已重做" : "已撤销") + "上一步，数字、候选与草稿一并恢复。");
    render(); if (forward) checkCompletion(); save(forward ? "重做" : "撤销");
    if(!game.completed&&(oldNoteMode!==noteMode||oldBoard.some(function(v,i){return v!==game.board[i]||oldNotes[i]!==game.notes[i];})||!Drafts.equal(oldDraft,game.draft,game.board.length)))playEditSound(forward?"redo":"undo");
  }
  function undo() { travelEdit(false); }
  function redo() { travelEdit(true); }

  function clearTransientMarks() {
    pendingHint = null;
    batchSelection.clear(); batchSelecting = false;
    clearPulse();
    clearTimeout(checkTimeout);
    checkedReveal = false;
  }

  function branchAction(action, label) {
    if (!canInteract()) return;
    try {
      noteMode = action(); game.energy.combo = 0; clearTransientMarks();
      setStatus(label); render(); save(label);
    } catch (error) { toast(error.message); }
  }

  function beginBranch() {
    branchAction(function () { return Branches.begin(game, noteMode); }, "已建立独立假设，可切换到主盘或其他分支。");
  }

  function rollbackBranch() {
    if (!inBranch()) return;
    branchAction(function () { return Branches.discard(game, noteMode); }, "已丢弃当前假设及其子分支，恢复上层棋盘。");
  }

  function commitBranch() {
    if (!canInteract() || !inBranch()) return;
    try {
      var adopted = Branches.adopt(game, noteMode); noteMode = adopted.noteMode;
      var newErrors = adopted.main && !game.logicMode && automaticErrors() ? game.board.reduce(function (count, value, i) {
        return count + (!game.givens[i] && value && value !== adopted.before.board[i] && value !== game.solution[i] ? 1 : 0);
      }, 0) : 0;
      game.mistakes += newErrors;
      if (adopted.main && (!automaticErrors() || game.logicMode) && game.board.some(function (value, i) { return value && value !== adopted.before.board[i]; })) game.errorCheckIncomplete = true;
      if (adopted.main) {
        game.board.forEach(function (value, i) { if (value) game.energy.claimed[i] = true; });
        if (!game.logicMode && automaticErrors()) settleUnits(false);
      }
      game.energy.combo = 0; clearTransientMarks();
      setStatus(newErrors ? "已采纳到主盘，新增 " + newErrors + " 个答案核对失误；可整组撤销。" : "已采纳到上层，修改可整组撤销。其他分支仍保留。");
      render(); checkCompletion(); save("采纳假设");
    } catch (error) { toast(error.message); }
  }

  function toggleNotes() {
    if (!canInteract()) return;
    noteMode = !noteMode;
    if (!noteMode) { batchSelecting = false; batchSelection.clear(); }
    setStatus(noteMode ? "笔记模式已开启 · 记录可能的数字，按 N 可随时切换。" : "笔记模式已关闭 · 现在会填入正式数字。");
    render();
    save();
  }

  function autoNotes() {
    if (!canInteract()) return;
    if (ruleOnly() ? conflicts().size > 0 : game.board.some(function (value, index) { return value && value !== game.solution[index]; })) {
      setStatus(ruleOnly() ? "先解决当前规则冲突，再生成候选笔记；可点击检查定位。" : "先修正已有的错误数字，再生成候选笔记；可用「检查」或「灵感提示」定位。");
      toast(ruleOnly() ? "当前存在规则冲突，请先检查。" : "当前有错误数字，请先检查。");
      return;
    }
    var next = game.board.map(function (value, index) {
      if (value) return 0;
      return Engine.candidates(game.board, index, checkedContext()).reduce(function (mask, digit) {
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
    save("候选速记");if(changed)playEditSound("note");
  }


  function completedUnitIndices() {
    if (ruleOnly()) return [];
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
      combo: inBranch() ? 0 : combo,
      best: valid ? Math.max(combo, integer(source.best, game.board.length)) : 0,
      claimed: valid ? source.claimed.map(function (v, i) { return v || Boolean(game.givens[i]); }) :
        game.board.map(function (value) { return Boolean(value); }),
      units: valid && Array.isArray(source.units) ?
        Array.from(new Set(source.units.filter(function (u) { return Number.isInteger(u) && u >= 0 && u < count; }))) :
        completedUnitIndices()
    };
  }

  function renderEnergy() {
    var muted = preferences.zen || ruleOnly() || !preferences.errorCheck;
    $("energy-hud").dataset.muted = String(muted);
    $("energy-points").textContent = muted ? "—" : String(game.energy.points);
    $("energy-combo").textContent = muted ? "—" : String(game.energy.combo);
    $("energy-best").textContent = muted ? "—" : String(game.energy.best);
    $("energy-message").textContent = game.logicMode ? "纯逻辑模式暂停答案奖励" : inBranch() ? "假设中暂停奖励，安心试填" :
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
    if (ruleOnly()) return;
    var energy = game.energy;
    if (!automaticErrors()) { energy.combo = 0; energy.claimed[index] = true; return; }
    if (fromHint) {
      energy.combo = 0;
      energy.claimed[index] = true;
      settleUnits(false);
      return;
    }
    if (value !== game.solution[index]) {
      energy.combo = 0;
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
    } else {
      energy.combo = 0;
    }
    settleUnits(fresh);
  }


  function chapterInfo(id) {
    return Voyage.chapters().find(function (chapter) { return chapter.id === id; });
  }

  function readVoyage() {
    try {
      var raw = playerStorage.getItem(VOYAGE_KEY);
      voyageProgress = Voyage.migrateProgress(raw === null ? {} : JSON.parse(raw), game && game.voyageId, { existing: raw !== null || Boolean(game) });
      if (game && !game.completed && game.voyageId && !Voyage.canEnter(voyageProgress, game.voyageId) && Voyage.matchesPuzzle(game.voyageId, game.givens, game.mode, game.difficulty, game.clues)) voyageProgress = Voyage.retainCurrent(voyageProgress, game.voyageId);
      saveVoyage();
    }
    catch (error) { voyageProgress = {}; voyageStorageBlocked = true; }
  }

  function saveVoyage() {
    if (voyageStorageBlocked || storageTransition || saveRecoveryState || storageSession.isTemporary()) return;
    try { playerStorage.setItem(VOYAGE_KEY, JSON.stringify(voyageProgress)); }
    catch (error) { toast("星图成绩暂时无法保存到本机，本局仍可继续游玩。"); }
  }

  function renderVoyageWorld(journey) {
    var world = Voyage.worldState(voyageProgress), nodes = $("voyage-world-nodes");
    var active = document.activeElement, activeId = active && active.dataset.worldId;
    var focusedPhase = active && active.dataset.phaseToggle, oldOpen = {};
    nodes.querySelectorAll('details[data-phase]').forEach(function (item) { oldOpen[item.dataset.phase] = item.open; });
    var groups = [
      { id: "coordinate", title: "定位星", ids: Voyage.chapters("legacy").map(function (c) { return c.id; }), note: "先校准九处坐标，再开启两条航路。" },
      { id: "lines", title: "循线", ids: Voyage.chapters("lines").map(function (c) { return c.id; }), note: "方向 → 对应 → 连续集合" },
      { id: "energy", title: "汇能", ids: Voyage.chapters("sums").slice(0, 2).map(function (c) { return c.id; }), note: "笼的组合 → 箭头拆分" },
      { id: "convergence", title: "群星合奏", ids: ["sums-constellation-v1"], note: "循线三关与汇能两关完成后，在此汇合。" },
      { id: "homecoming", title: "归航核心", ids: ["fusion-homecoming-v1"], note: "点亮前十五处星点，用温度计与杀手笼完成最后校准。" }
    ];
    var branchChoice = ["lines-rise-v1", "sums-sparks-v1"].every(function (id) { return Voyage.canEnter(voyageProgress, id, game && game.voyageId) && !voyageProgress[id]; });
    nodes.replaceChildren();
    groups.forEach(function (group, groupIndex) {
      var section = document.createElement("details"), summary = document.createElement("summary"), beacon = document.createElement("span"), heading = document.createElement("span"), count = document.createElement("span");
      var done = group.ids.filter(function (id) { return Boolean(voyageProgress[id]); }).length;
      section.className = "voyage-phase"; section.dataset.phase = group.id; section.dataset.complete = String(done === group.ids.length);
      section.open = Boolean(oldOpen[group.id] || group.ids.indexOf(selectedVoyage) >= 0 || branchChoice && (group.id === "lines" || group.id === "energy"));
      summary.dataset.phaseToggle = group.id; beacon.className = "phase-beacon"; beacon.setAttribute("aria-hidden", "true"); beacon.textContent = done === group.ids.length ? "✓" : String(groupIndex + 1).padStart(2, "0");
      heading.textContent = group.title; count.className = "phase-count"; count.textContent = voyageStorageBlocked ? "—" : done + " / " + group.ids.length;
      summary.append(beacon, heading, count); section.appendChild(summary);
      var note = document.createElement("p"), stops = document.createElement("div"); note.className = "phase-route-note"; note.textContent = group.note; stops.className = "phase-stops";
      section.append(note, stops);
      group.ids.forEach(function (id) {
        var stage = journey.stages.find(function (item) { return item.id === id; }), record = voyageProgress[id];
        var current = game && !game.completed && game.voyageId === id;
        var state = record ? "completed" : current ? "current" : stage.canEnter ? "open" : "locked";
        var label = record ? "✓ 已修复" : current ? "正在探索" : stage.canEnter ? "可出发" : "未解锁 · 可预览";
        var button = document.createElement("button"), meta = document.createElement("span"), title = document.createElement("span"), status = document.createElement("span");
        button.type = "button"; button.className = "world-node"; button.dataset.worldId = id; button.dataset.state = state; button.dataset.repaired = String(Boolean(record)); button.disabled = voyageStorageBlocked;
        button.setAttribute("aria-pressed", String(id === selectedVoyage));
        if (current || (!game || !game.voyageId || game.completed) && journey.nextId === id) button.setAttribute("aria-current", "step");
        button.setAttribute("aria-label", "第 " + (stage.storyIndex + 1) + " 关，" + stage.title + "，" + label + (record ? "，最佳 " + record.stars + " 星" : ""));
        meta.className = "stop-meta"; meta.textContent = String(stage.storyIndex + 1).padStart(2, "0") + (record ? "  ·  " + "★".repeat(record.stars) : "");
        title.className = "stop-title"; title.textContent = stage.title; status.className = "stop-state"; status.textContent = label;
        button.append(meta, title, status); stops.appendChild(button);
      });
      nodes.appendChild(section);
    });
    var signal = $("voyage-signal"), ns = "http://www.w3.org/2000/svg";
    signal.replaceChildren(); signal.dataset.finished = String(world.finished);
    var points = [{x:34,y:54},{x:130,y:25},{x:130,y:83},{x:226,y:54},{x:300,y:54}];
    var paths = [[0,1],[0,2],[1,3],[2,3],[3,4]];
    paths.forEach(function (pair) {
      var a = points[pair[0]], b = points[pair[1]], dx = b.x-a.x, dy = b.y-a.y, length = Math.hypot(dx,dy), gap = 14;
      var line = document.createElementNS(ns, "line");
      line.setAttribute("x1", a.x+dx/length*gap); line.setAttribute("y1", a.y+dy/length*gap); line.setAttribute("x2", b.x-dx/length*gap); line.setAttribute("y2", b.y-dy/length*gap);
      line.dataset.repaired = String(world.phases[pair[0]].complete && world.phases[pair[1]].complete); signal.appendChild(line);
    });
    world.phases.forEach(function (phase,i) {
      var p = points[i], circle = document.createElementNS(ns,"circle"), selected = groups[i].ids.indexOf(selectedVoyage) >= 0;
      var available = groups[i].ids.some(function (id) { return !voyageProgress[id] && journey.stages.some(function (stage) { return stage.id === id && stage.canEnter; }); });
      circle.setAttribute("cx",p.x);circle.setAttribute("cy",p.y);circle.setAttribute("r",5);
      circle.dataset.state = phase.complete ? "completed" : selected ? "current" : available ? "open" : "locked";signal.appendChild(circle);
      var ring=document.createElementNS(ns,"circle"); ring.setAttribute("cx",p.x);ring.setAttribute("cy",p.y);ring.setAttribute("r",10);ring.setAttribute("class","signal-halo");
      ring.style.opacity = phase.repaired ? "0.8" : "0.2"; ring.setAttribute("stroke-dasharray", (Math.PI*20*phase.repaired/phase.total) + " " + Math.PI*20);ring.setAttribute("transform","rotate(-90 " + p.x + " " + p.y + ")");signal.appendChild(ring);
    });
    $("voyage-world").dataset.finished = String(world.finished);
    $("voyage-world-feedback").textContent = voyageStorageBlocked ? "远征记录暂不可读取，原始记录已保留。" : world.finished ? "十六处星点已归位。沿熟悉的航路，随时重访。" : branchChoice ? "两条航路都已开放。两路都需完成，先走哪一条由你决定。" : journey.inheritedPassage ? "旧版已解锁资格与最佳成绩均已保留。" : "通关即修复星点，无需满星。";
    var links = $("voyage-training-links");
    if (!links.children.length) window.NineRealmsTraining.stations().forEach(function (station) {
      var button = document.createElement("button"); button.type = "button"; button.dataset.station = station.id; links.appendChild(button);
    });
    var practice = Voyage.practiceProgress(voyageProgress);
    links.querySelectorAll("button").forEach(function (button) {
      var station = window.NineRealmsTraining.stations().find(function (item) { return item.id === button.dataset.station; });
      button.textContent = station.title + " · " + station.exerciseIds.filter(function (id) { return practice.completed.indexOf(id) >= 0; }).length + "/" + station.exerciseIds.length; button.disabled = voyageStorageBlocked;
    });
    if ($( "voyage-dialog").open) {
      var focus = activeId ? nodes.querySelector('[data-world-id="' + activeId + '"]') : focusedPhase ? nodes.querySelector('[data-phase-toggle="' + focusedPhase + '"]') : null;
      if (focus && !focus.disabled) focus.focus({ preventScroll: true });
    }
  }

  function renderVoyage() {
    var journey = Voyage.journey(voyageProgress, game && !game.completed && game.voyageId);
    var overall = Voyage.getStatus(voyageProgress, "all");
    var recommended = chapterInfo(journey.nextId), selected = chapterInfo(selectedVoyage);
    if (!selected) { selectedVoyage = journey.nextId || "fusion-homecoming-v1"; selected = chapterInfo(selectedVoyage); }
    selectedVoyageTrack = selected.trackId;
    renderVoyageWorld(journey);
    $("voyage-repaired").textContent = overall.completed + " / " + overall.total;
    $("voyage-total-stars").textContent = String(overall.stars); $("voyage-star-max").textContent = " / " + overall.total * 3 + " 星";
    $("voyage-card-title").textContent = journey.finished ? "归航星图已复原 · 自由回访" : "下一站 · " + (recommended ? recommended.title : selected.title);
    $("voyage-card-progress").textContent = overall.completed + " / " + overall.total + " 关 · " + overall.stars + " / " + overall.total * 3 + " 星";
    var current = game && game.voyageId === selected.id && !game.completed, allowed = Voyage.canEnter(voyageProgress, selected.id, game && game.voyageId);
    selected = Voyage.presentation(selected.id, current ? game : null);
    $("voyage-destination-label").textContent = journey.finished && selected.id === "fusion-homecoming-v1" ? "归航已完成" : current ? "继续这一站" : voyageProgress[selected.id] ? "重访星点" : allowed ? "当前目的地" : "航路预览";
    $("voyage-selected-title").textContent = String(selected.storyIndex + 1).padStart(2, "0") + " · " + selected.title;
    $("voyage-selected-rule").textContent = modeInfo(selected.mode).label + " · " + difficultyInfo(selected.mode, selected.difficulty).label + (selected.editionLabel ? " · " + selected.editionLabel : "");
    $("voyage-connection").textContent = journey.finished && selected.id === "fusion-homecoming-v1" ? "航线在此合拢。你已经找回归途。" : selected.scene || selected.bridge;
    $("voyage-observation").textContent = selected.observation || selected.goal || selected.subtitle;
    $("voyage-lesson").textContent = (selected.lesson || selected.mission) + (selected.ratingNote ? "\n" + selected.ratingNote : "");
    renderVoyageDiscoveries(selected);
    var missing = journey.stages.find(function (stage) { return stage.id === selected.id; }).requires.filter(function (id) { return !voyageProgress[id]; });
    $("voyage-gate").textContent = voyageStorageBlocked ? "远征存档格式较新或不可读取，原数据已保留。请使用对应版本或有效备份恢复。" : allowed ? voyageProgress[selected.id] ? "章节历史最佳 " + voyageProgress[selected.id].stars + " 星" + (selected.legacySourceId ? "（含旧版题面）" : "") + "已保留，重玩不会降低成绩。" : journey.granted.indexOf(selected.id) >= 0 && missing.length ? "旧版通行已保留，仍可继续这一站。" : current ? "保留当前棋局，回到棋盘后由你继续计时。" : "已开放 · 准备后，由你点击开始计时。" : selected.id === "fusion-homecoming-v1" ? "还需修复前十五处星点中的 " + missing.length + " 处，才会开放归航核心。" : selected.id === "sums-constellation-v1" ? "循线三关与汇能两关都完成后汇合，还差 " + missing.length + " 关。" : selected.trackId !== "legacy" && Voyage.getStatus(voyageProgress, "legacy").completed < 9 ? "完成定位星九关后开放；可先预览规则。" : "先完成「" + chapterInfo(missing[missing.length - 1]).title + "」，再继续这一站。";
    $("voyage-start").textContent = current ? "继续 · " + selected.title : voyageProgress[selected.id] ? "重访 · " + selected.title : allowed ? "准备 · " + selected.title : "尚未解锁";
    $("voyage-start").disabled = loadingVoyage || !allowed || voyageStorageBlocked;
    $("voyage-next-stop").hidden = !recommended || recommended.id === selected.id;
    $("voyage-next-stop").textContent = recommended ? "回到当前目的地 · " + recommended.title : "";
    $("voyage-next-stop").disabled = voyageStorageBlocked;
    if (voyageStorageBlocked) {
      $("voyage-repaired").textContent = "—"; $("voyage-total-stars").textContent = "—"; $("voyage-star-max").textContent = "";
      $("voyage-card-title").textContent = "远征记录暂不可读取"; $("voyage-card-progress").textContent = "原始记录已保留，未清空";
    }
  }

  function practiceForMode(mode) { return {thermo:"thermo-bounds",killer:"killer-sum",arrow:"arrow-sum","thermo-killer":"thermo-bounds"}[mode]; }
  function openVoyagePractice(station) {
    if (!trainingUi || storageTransition || voyageStorageBlocked) return;
    voyagePracticeReturn = {id:selectedVoyage,station:station}; closeDialog($("voyage-dialog")); trainingUi.open(station);
  }
  function renderVoyageDiscoveries(selected) {
    var box = $("voyage-discovery");
    if (!box) { box = document.createElement("div"); box.id="voyage-discovery"; box.className="voyage-training-links"; $("voyage-lesson").after(box); }
    box.replaceChildren();
    function add(label, action, note) { var b=document.createElement("button");b.type="button";b.className="secondary-btn";b.textContent=label;b.disabled=voyageStorageBlocked||curatedLaunching;if(note)b.title=note;b.addEventListener("click",action);box.appendChild(b); }
    var station=practiceForMode(selected.mode);
    if(station) add(selected.mode === "thermo-killer" ? "先练温度计规则" : "先练规则 · "+modeInfo(selected.mode).label,function(){openVoyagePractice(station);});
    if(Curated && Voyage.discovery) Voyage.discovery(voyageProgress).forEach(function(item){add(item.title,function(){launchCurated(item.puzzleId,$("voyage-dialog"));},item.subtitle);});
    if(voyageProgress[selected.id] && Generator && Generator.supportsFresh(selected.mode)) {
      add("同规则新题 · 独立练习",function(){launchSameRule(selected.mode,selected.difficulty,$("voyage-dialog"));},"生成新的练习题，不冒充章节原题，不改变这一章的星数。");
      box.lastElementChild.id="voyage-fresh";
    }
    box.hidden=!box.childElementCount;
  }
  async function launchPractice(id) {
    var exercise=window.NineRealmsTraining.exercise(id), entry, puzzle;
    if(exercise.local) { entry=Curated && Curated.list({mode:exercise.mode,level:"intro"})[0]; if(!entry)throw new Error("这项练习的精选题暂不可用。"); puzzle=Curated.getPuzzle(entry.id); }
    else { entry=PUZZLE_CATALOG.find(function(p){return p.id===exercise.sourceId;});if(!entry)throw new Error("练习源题暂不可用。");puzzle=Engine.getPuzzle(entry.difficulty,"practice-followup-"+id,entry.mode,{sourceId:entry.id}); }
    return launchPreparedPuzzle(puzzle,$("training-dialog"),exercise.local ? "同规则精选题" : "同技巧源题");
  }
  function launchCurated(id, origin) { if(!Curated)return; return launchPreparedPuzzle(Curated.getPuzzle(id),origin,"精选题"); }
  function launchSameRule(mode,difficulty,origin) {
    if(!Generator || !Generator.supportsFresh(mode) || !generatorClient)return;
    return launchPreparedPuzzle(function(){return generatorClient.run({mode:mode,difficulty:difficulty,fresh:true,seed:Generator.seed(),avoidFingerprints:generationAvoid()},{recovery:true,allowCatalog:false,onStage:function(stage){generationStage(stage,mode,difficulty,generationEpoch);}});},origin,"同规则新题（独立练习，不计章节星数）");
  }
  async function launchPreparedPuzzle(puzzle, origin, label) {
    if(curatedLaunching||storageTransition||voyageStorageBlocked)return false;
    if(liveSaveExport() || saveRecoveryState) { toast("当前棋局尚未安全保存，请先从页脚导出当前对局并恢复保存后，再进入精选题。"); return false; }
    if(!origin && dialogIsOpen())return false;
    curatedLaunching=true; var epoch=null,back=voyagePracticeReturn;voyagePracticeReturn=null;
    if(origin)closeDialog(origin);
    try {
      if(game && hasProgress() && !await confirmAction("开始"+label+"？","确认后会先检查当前棋局能否保存，再切换题目；主线进度和练习成绩不会改变。","开始精选题")) {
        voyagePracticeReturn=back;if(origin)showDialog(origin);return false;
      }
      if(storageTransition){if(origin)showDialog(origin);return false;}
      if(liveSaveExport() || !save() || !History || !History.flush()) throw new Error("当前棋局或历史暂时无法安全保存，未替换棋盘。请先导出当前对局并检查存储空间。");
      var archived=History.getSnapshot(game.sessionId);
      if(!archived || JSON.stringify(archived.game.board)!==JSON.stringify(game.board) || JSON.stringify(archived.game.notes)!==JSON.stringify(game.notes)) throw new Error("当前棋局尚未完整记入历史，未替换棋盘。请先导出当前对局。");
      if(typeof puzzle === "function") {
        epoch=++generationEpoch;suspendClock();setGenerationBusy(true);setStatus("正在生成同规则新题；可点击“取消生成”保留原局。");
        puzzle=await puzzle();
        if(epoch!==generationEpoch||storageTransition)return false;
        setGenerationBusy(false);
        if(liveSaveExport()||!save()||!History.flush())throw new Error("当前棋局未能安全保存，未替换棋盘。");
        if(!puzzle.generation||puzzle.generation.kind!=="constructed")throw new Error("本次未能完成新题构造，原棋局已保留。");
        puzzle.voyageId=null;puzzle.dailyDate=null;rememberGenerated(puzzle);
      }
      installPuzzle(puzzle,puzzle.difficulty,puzzle.mode);setStatus((puzzle.title||label)+"已准备好，由你开始计时。");save();if(History)History.flush();return true;
    } catch(error) {
      if(epoch!==null&&(epoch!==generationEpoch||error.name==="AbortError"))return false;
      if(epoch!==null)setGenerationBusy(false);
      voyagePracticeReturn=back;if(origin&&!dialogIsOpen())showDialog(origin);
      var message=epoch!==null?"本次新题构造未通过全部检查，原棋局已保留。可稍后重试。":error.message||"精选题暂不可用。";
      setStatus(message);toast(message);return false;
    }
    finally {if(epoch!==null&&epoch===generationEpoch)setGenerationBusy(false);curatedLaunching=false;}
  }

  function renderEffectsStatus(){
    var toggle=$("effects-toggle");if(!toggle)return;
    var enabled=preferences.effectsEnabled!==false,volume=preferences.effectsVolume===undefined?1:preferences.effectsVolume,muted=!preferences.sound||preferences.soundVolume===0||volume===0;
    toggle.setAttribute("aria-pressed",String(enabled));toggle.textContent="音效 · "+(enabled?(muted?"开启（静音）":"开启"):"关闭");
    $("effects-volume").value=String(Math.round(volume*100));$("effects-volume-value").textContent=Math.round(volume*100)+"%";
    var audio=Atmosphere.musicStatus?Atmosphere.musicStatus():{};
    $("effects-status").textContent=!enabled?"音效已关闭。":!preferences.sound?"声音总开关已关闭，音效保持静音。":preferences.zen?"禅模式保持安静，音效设置会保留。":document.hidden?"切到后台，音效已暂停。":muted?"总音量或音效音量为零，音效保持静音。":audio.audioError||audio.audioState==="suspended"||audio.audioState==="interrupted"?"音频尚未就绪，再次操作时会尝试恢复声音。":"填数、候选、擦除与撤销使用不同短音。";
  }

  function musicContext() {
    var mapOpen = Boolean($("voyage-dialog").open), settingsOpen = Boolean($("appearance-settings").open);
    var currentId = game && game.voyageId && !game.completed ? game.voyageId : null;
    var journey = Voyage.journey(voyageProgress, currentId);
    var id = mapOpen ? currentId || journey.nextId || (journey.finished ? "fusion-homecoming-v1" : "dawn") : game && game.voyageId;
    var phase = mapOpen && musicAudition || window.NineRealmsMusic.phaseFor(id);
    var audition = Boolean(mapOpen && musicAudition || settingsOpen && settingsMusicAudition);
    var otherDialog = Array.from(document.querySelectorAll("dialog[open]")).some(function (d) { return d.id !== "voyage-dialog"; });
    var reason = storageTransition || storageConflict ? "storage" : document.hidden ? "hidden" : preferences.zen ? "zen" : generatingPuzzle ? "preparing" : otherDialog ? "dialog" : !audition && game && game.paused ? "paused" : !audition && !mapOpen && !(game && game.started && !game.completed) ? "ready" : null;
    return { active: !reason, phase: phase, audition: audition, reason: reason };
  }

  function renderMusicStatus() {
    if (!window.NineRealmsMusic || !Atmosphere.musicStatus) return;
    var info = musicContext(), state = Atmosphere.musicStatus(), title = window.NineRealmsMusic.tracks().find(function (t) { return t.id === info.phase; }).title;
    var settingsPath = $("voyage-dialog").open ? "关闭星图后，在右上角“外观设置”中" : $("appearance-settings").open ? "在本面板中" : "在右上角“外观设置”中";
    var muted = !preferences.sound || preferences.soundVolume === 0 || preferences.musicVolume === 0;
    var retry = state.state === "error" || state.audioError || state.audioState === "suspended" || state.audioState === "interrupted" || state.audioState === "closed";
    var text = !preferences.musicEnabled ? "背景音乐已关闭。" + settingsPath + "开启背景音乐；它随声音总开关一起静音。" : !preferences.sound ? "声音总开关已关闭，BGM 也处于静音。" + settingsPath + "开启“声音”后可试听。" : preferences.zen ? "禅模式保持安静，音乐开关与音量会保留。" : preferences.soundVolume === 0 || preferences.musicVolume === 0 ? "音量为零，音乐保持静音。" + settingsPath + "调高总音量与 BGM 音量。" : info.reason === "hidden" ? "切到后台，音乐已暂停。" : info.reason === "storage" ? "数据恢复或保存冲突期间，音乐已暂停。" : info.reason === "dialog" ? "查看弹窗时音乐暂停，关闭后恢复。" : info.reason === "paused" ? "棋局已暂停，继续后恢复音乐；也可在外观设置中单独试听，不开始计时。" : info.reason === "preparing" ? "正在准备棋局，音乐暂时暂停。" : !info.active ? "开始棋局后播放背景音乐；也可在本面板试听，不开始计时。" : state.state === "error" ? "BGM 暂时无法合成，可点击试听重试；游戏与音效仍可使用。" : state.audioState === "unavailable" || state.audioError === "initialization" ? "当前环境暂无法启动音频，可点击试听重试。" : retry ? "浏览器尚未允许播放声音，请点击试听或继续游戏重试。" : state.state === "loading" ? "正在准备「" + title + "」……" : state.playing ? (info.audition ? "正在试听 · " : "正在播放 · ") + title : "点击开始或试听，允许浏览器播放声音。";
    ["music-status","voyage-music-status"].forEach(function (id) { var node=$(id); if(node && node.textContent!==text)node.textContent=text; });
    var toggle=$("music-toggle"); if(toggle){toggle.setAttribute("aria-pressed",String(Boolean(preferences.musicEnabled)));toggle.textContent="背景音乐 · "+(preferences.musicEnabled?(muted?"开启（静音）":"开启"):"关闭");}
    if($("music-volume")){var volume=Number.isFinite(preferences.musicVolume)?preferences.musicVolume:0.35;$("music-volume").value=String(Math.round(volume*100));$("music-volume-value").textContent=Math.round(volume*100)+"%";}
    var preview=$("music-preview");if(preview){preview.disabled=!preferences.musicEnabled||muted||preferences.zen||document.hidden||storageTransition||storageConflict;preview.setAttribute("aria-pressed",String(settingsMusicAudition));preview.textContent=settingsMusicAudition?(retry?"重试试听":"停止试听"):"试听背景音乐";}
    document.querySelectorAll("[data-music-preview]").forEach(function(button){button.setAttribute("aria-pressed",String(Boolean(state.playing && info.phase===button.dataset.musicPreview)));});
  }

  function syncMusic() {
    if (!window.NineRealmsMusic || !Atmosphere.setMusic) return;
    if(preferences.zen||document.hidden||storageTransition||storageConflict){settingsMusicAudition=false;musicAudition=null;}
    var context = musicContext();
    Atmosphere.setMusic({ enabled: preferences.musicEnabled === true, volume: Number.isFinite(preferences.musicVolume)?preferences.musicVolume:0.35, phase: context.phase, active: context.active });
    renderMusicStatus();
  }

  function playVoyageSound(kind, requireDialog) {
    if (!preferences.sound || preferences.zen || preferences.soundVolume === 0 || document.hidden) return Promise.resolve(false);
    return Promise.resolve(Atmosphere.unlock()).then(function (ready) {
      if (ready === false || requireDialog && !$("voyage-dialog").open) return false;
      return Atmosphere.play(kind) !== false;
    });
  }

  function openVoyage(targetId) {
    if (dialogIsOpen()) return;
    var journey = Voyage.journey(voyageProgress, game && !game.completed && game.voyageId);
    selectedVoyage = typeof targetId === "string" && chapterInfo(targetId) ? targetId : game && game.voyageId && !game.completed ? game.voyageId : journey.nextId || "fusion-homecoming-v1";
    $("voyage-world-nodes").replaceChildren();
    renderVoyage(); showDialog($("voyage-dialog"));
    $("voyage-dialog").scrollTop = 0; $("voyage-selected-title").focus({ preventScroll: true });
    playVoyageSound("voyage-enter", true); save();
  }

  async function startVoyage(targetId) {
    if (voyageStorageBlocked || storageTransition || loadingVoyage || typeof targetId !== "string" && !$("voyage-dialog").open) return;
    var chapter = chapterInfo(typeof targetId === "string" ? targetId : selectedVoyage);
    if (!chapter || !Voyage.canEnter(voyageProgress, chapter.id, game && game.voyageId)) return;
    loadingVoyage = true; $("voyage-start").disabled = true;
    try {
      closeDialog($("voyage-dialog"));
      if (game && game.voyageId === chapter.id && !game.completed) {
        setStatus(!game.started ? "这一关已准备好，点击开始游戏后计时。" : game.paused ? "已返回这一关，点击继续后再恢复计时。" : "继续点亮这一星。"); return;
      }
      if (game && hasProgress() && !await confirmNewGame(chapter.difficulty, chapter.mode, false)) { setStatus("已保留当前棋局，星图随时等你出发。"); openVoyage(chapter.id); return; }
      if (storageTransition) return;
      installPuzzle(Voyage.getPuzzle(chapter.id), chapter.difficulty, chapter.mode);
      setStatus("星图远征 · " + chapter.title + "已准备好。点击开始游戏，点亮这一处星点。"); save();
    } catch (error) { toast("暂时无法载入这一关，当前棋局已保留。"); resumeClock(); }
    finally { loadingVoyage = false; renderVoyage(); }
  }

  var voyageBranchChoice = false, voyagePracticeReturn = null;
  function finishVoyage() {
    var voyageCompletionSound = null;
    var dialog = $("completion-dialog"); dialog.dataset.voyage = String(Boolean(game.voyageId)); dialog.dataset.homecoming = "false";
    dialog.querySelector(".eyebrow").textContent = game.voyageId ? "THE WAY HOME" : "A PERFECT LITTLE UNIVERSE";
    dialog.querySelector("h2").textContent = "这一境，已圆满。";
    $("completion-voyage").hidden = !game.voyageId; voyageCompletionSound = null; voyageBranchChoice = false;
    $("play-again").textContent = game.voyageId ? "返回星图" : "探索下一境";
    if (!game.voyageId) return;
    if (voyageStorageBlocked) { $("completion-voyage").textContent = "本局已完成；远征存档暂不可写，原始记录未被覆盖。"; return; }
    var prior = Boolean(voyageProgress[game.voyageId]);
    var beforeAccess = Voyage.chapters().filter(function (c) { return Voyage.canEnter(voyageProgress, c.id, game.voyageId); }).map(function (c) { return c.id; });
    var stats = { elapsedMs: Math.floor(game.elapsedMs), mistakes: game.mistakes, hints: game.hints, errorCheckIncomplete: game.errorCheckIncomplete === true };
    var earned = Voyage.starsFor(stats);
    voyageProgress = Voyage.award(voyageProgress, game.voyageId, stats); saveVoyage(); renderVoyage();
    var chapter = chapterInfo(game.voyageId), journey = Voyage.journey(voyageProgress);
    var opened = Voyage.chapters().filter(function (c) { return beforeAccess.indexOf(c.id) < 0 && Voyage.canEnter(voyageProgress, c.id, game.voyageId); });
    voyageBranchChoice = opened.length > 1;
    voyageCompletionSound = !prior && journey.finished ? "voyage-home" : !prior && opened.length ? "voyage-unlock" : "voyage-repair";
    dialog.dataset.homecoming = String(journey.finished);
    dialog.querySelector("h2").textContent = journey.finished ? "归途，已完整。" : voyageBranchChoice ? "两条航路，已接通。" : chapter.title + "，已点亮。";
    var prerequisitesMet = journey.stages.find(function (stage) { return stage.id === chapter.id; }).requires.every(function (id) { return Boolean(voyageProgress[id]); });
    var resolution = prerequisitesMet ? chapter.resolution || chapter.outcome : chapter.title + "已点亮。这一站的成绩已保留，其余星点仍按实际通关修复。";
    $("completion-voyage").textContent = resolution + "\n" + "★".repeat(earned) + "☆".repeat(3 - earned) + " · 本次 " + earned + " 星，最佳 " + (voyageProgress[game.voyageId] ? voyageProgress[game.voyageId].stars : earned) + " 星。" + (game.errorCheckIncomplete ? " 本局未全程统计失误，不授予零失误星。" : "") + (opened.length ? "\n新航路已开放：" + opened.map(function (c) { return c.title; }).join("、") + "。" : "");
    var nextId = Voyage.nextAfter(voyageProgress, game.voyageId);
    $("play-again").textContent = journey.finished ? "归航完成 · 重访星图" : voyageBranchChoice ? "选择下一条航路" : nextId ? "准备下一站 · " + chapterInfo(nextId).title : "返回星图";
    return voyageCompletionSound;
  }


  function readDaily() {
    try {
      var raw = playerStorage.getItem(DAILY_KEY), value = raw === null ? {} : JSON.parse(raw);
      Daily.validateRecords(value); dailyRecords = Daily.normalizeRecords(value); dailyUnreadable = null;
    } catch (error) { dailyRecords = {}; dailyUnreadable = { status: error.code === "DAILY_RECORDS_UNSUPPORTED" ? "unsupported" : "invalid", raw: typeof raw === "string" ? raw : null }; }
  }

  function saveDaily() {
    if (storageTransition || saveRecoveryState || dailyUnreadable || storageSession.isTemporary()) return;
    try { playerStorage.setItem(DAILY_KEY, JSON.stringify(dailyRecords)); }
    catch (error) { toast("每日记录暂时无法保存到本机，本次仍可继续游玩。"); }
  }

  async function warmDailyIdentity(snapshot){
    var source=snapshot&&snapshot.game;
    if(!source||!dailyClient||typeof window.Worker!=="function"||!Daily.needsConstruction(source.dailyDate,source.givens,source.mode,source.difficulty,source.clues))return;
    var inert=document.body.inert;document.body.inert=true;document.body.setAttribute("aria-busy","true");
    try{await dailyClient.run(source.dailyDate);}catch(error){/* Strict synchronous recovery remains available if worker resources fail. */}
    finally{document.body.inert=inert;document.body.removeAttribute("aria-busy");}
  }
  function cancelDailyGeneration(){
    if(!loadingDaily)return;
    dailyEpoch++;loadingDaily=false;if(dailyClient)dailyClient.cancel();
  }
  function renderDaily() {
    var today=Daily.dateKey();if(dailyToday&&dailyToday!==today){cancelDailyGeneration();dailyError=null;}dailyToday=today;
    var currentDaily = game && game.dailyDate === dailyToday && !game.completed;
    var puzzle=null,preview=null,dailyLoadError=dailyError;
    try{puzzle=currentDaily?game:Daily.peekPuzzle(dailyToday);preview=puzzle||Daily.describe(dailyToday);}catch(error){dailyLoadError=error;}
    var stats = Daily.getStats(dailyRecords, dailyToday);
    var label = preview ? modeInfo(preview.mode).label + " · " + difficultyInfo(preview.mode, preview.difficulty).label : "每日新题暂不可用";
    $("daily-card-date").textContent = dailyToday.slice(5).replace("-", " / ") + " · " + label;
    $("daily-card-status").textContent = dailyUnreadable ? "记录待恢复" : stats.todayCompleted ? "今日已点亮" : currentDaily ? "今日进行中" : "今日待探索";
    $("daily-date").textContent = dailyToday.replace(/-/g, " / ");
    $("daily-description").textContent = loadingDaily ? label+"。正在后台准备，可取消；当前棋局不会被提前替换。" : dailyLoadError ? "本次每日题未能准备好，原棋局和成绩已保留。可点击重试；不会自动更换日期题面。" :
      label + (currentDaily ? "。继续已保存的今日棋局，保留原题身份。" : puzzle && puzzle.dailyFallback ? "。本日构造未通过固定检查，使用明确标注的固定后备题，并非新生成题。" : !puzzle || puzzle.dailyEdition === "constructed-v3" ? "。按日期构造新题，每天一题。" : "。每天一道题，把专注留给此刻。");
    $("daily-total").textContent = dailyUnreadable ? "—" : (stats.totalIncomplete ? "≥" : "") + String(stats.total);
    $("daily-streak").textContent = dailyUnreadable ? "—" : (stats.streakIncomplete ? "≥" : "") + String(stats.streak);
    $("daily-export-original").hidden = !dailyUnreadable;
    $("daily-export-original").disabled = !dailyUnreadable || typeof dailyUnreadable.raw!=="string";
    $("daily-stat-note").textContent = dailyUnreadable ? "每日记录暂不可读取，已保留原文并暂停覆盖。可在数据备份中恢复有效备份。" : stats.totalIncomplete ? "旧版仅保留最近400条明细，较早记录可能缺失；≥ 表示目前能确认的下限，不补造历史。" : "累计与连续按已完成日期计算，明细仅保留最近400条。";
    $("daily-start").textContent = loadingDaily ? "取消准备" : currentDaily ? "返回今日棋局" : dailyLoadError ? "重试准备" : stats.todayCompleted ? "重玩今日一境" : "准备今日一境";
    $("daily-start").setAttribute("aria-busy",String(loadingDaily));
    $("daily-start").disabled = Boolean(dailyUnreadable) || !game;
    var calendar = $("daily-calendar");
    calendar.replaceChildren();
    Daily.recentDates(dailyToday, 7).forEach(function (key) {
      var day = document.createElement("span");
      var complete = Daily.hasCompletion(dailyRecords, key);
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

  bind("daily-export-original", "click", async function () {
    try { if (!dailyUnreadable || typeof dailyUnreadable.raw !== "string") throw new Error("每日原文暂不可读取。");
      var saved = await downloadPlayerFile(dailyUnreadable.raw, "Nine-Realms-unreadable-daily.json");
      $("daily-stat-note").textContent = saved ? "已发起导出，请确认文件已保存。原文仍保留，自动覆盖已暂停。" : "已取消导出，原文未改变。";
    } catch (error) { $("daily-stat-note").textContent = error.message; }
  });

  function openDaily() {
    if (!game || dialogIsOpen()) return;
    renderDaily();
    showDialog($("daily-dialog"));
    save();
  }

  async function startDaily() {
    if(loadingDaily){cancelDailyGeneration();dailyError=null;renderDaily();setStatus("已取消每日题准备，原棋局已保留。");return;}
    if(!game||storageTransition||dailyUnreadable||!$("daily-dialog").open)return;
    if(dailyToday!==Daily.dateKey()){renderDaily();toast("北京时间已进入新的一天，今日题目已更新。");return;}
    var date=dailyToday,epoch=null,originalSession=game.sessionId;
    try{
      if(game.dailyDate===date&&!game.completed){closeDialog($("daily-dialog"));setStatus("已返回今日棋局，原题与进度保持不变。");return;}
      var preview=Daily.describe(date);closeDialog($("daily-dialog"));
      if(hasProgress()&&!await confirmNewGame(preview.difficulty,preview.mode,false)){setStatus("已保留当前棋局，随时可以再来挑战每日一境。");return;}
      if(storageTransition||game.sessionId!==originalSession)return;
      if(!archiveBeforeReplacement())throw new Error("DAILY_SAVE_FAILED");
      dailyError=null;showDialog($("daily-dialog"));epoch=++dailyEpoch;loadingDaily=true;renderDaily();
      if(!dailyClient)throw new Error("DAILY_WORKER_UNAVAILABLE");
      var puzzle=await dailyClient.run(date);
      if(epoch!==dailyEpoch||storageTransition||!$("daily-dialog").open||game.sessionId!==originalSession)return;
      if(date!==Daily.dateKey()){cancelDailyGeneration();renderDaily();setStatus("北京时间已进入新的一天，未替换当前棋局。请准备新一天的题目。");return;}
      if(!archiveBeforeReplacement())throw new Error("DAILY_SAVE_FAILED");
      loadingDaily=false;closeDialog($("daily-dialog"));
      installPuzzle(puzzle,puzzle.difficulty,puzzle.mode);
      setStatus(date+(puzzle.dailyFallback?" 每日固定后备题已准备好（本日不是新生成题）。":" 每日一境已准备好。")+"点击开始后计时，完成即可点亮今日。");save();
    }catch(error){
      if(epoch!==null&&epoch!==dailyEpoch||error.name==="AbortError")return;
      dailyError=error;
      var message=error.message==="DAILY_SAVE_FAILED"?"当前棋局或历史未能安全保存，原棋局已保留。请先导出当前对局并检查存储空间。":"每日题暂时无法准备，当前棋局已保留。可稍后重试。";
      setStatus(message);toast(message);resumeClock();
    }finally{if(epoch===null||epoch===dailyEpoch){loadingDaily=false;renderDaily();}}
  }

  function renderTechniqueGuide() {
    var guide = TechniqueGuides.get(game.mode), list = $("technique-guide-tips");
    list.replaceChildren();
    $("technique-guide").hidden = !guide;
    $("technique-guide").open = false;
    if (guide) guide.tips.forEach(function (tip) {
      var item = document.createElement("li"); item.textContent = tip; list.appendChild(item);
    });
  }

  function renderLogicRating() {
    var target = $("logic-rating"), panel = $("logic-rating-panel"), context = gameContext(), givens = game.givens.slice();
    var key = JSON.stringify(["puzzle-logic-v2", context, givens]);
    panel.hidden = true; target.textContent = ""; target.removeAttribute("title");
    setTimeout(function () {
      if (!game || key !== JSON.stringify(["puzzle-logic-v2", gameContext(), game.givens])) return;
      var result = ratingCache.get(key);
      if (!result) {
        try { result = window.SudokuHints.ratePuzzle(givens, context); } catch (error) { return; }
        if (!result || !result.solved || result.status !== "rated") return;
        if (ratingCache.size >= 64) ratingCache.delete(ratingCache.keys().next().value);
        ratingCache.set(key, result);
      }
      var labels = { "naked-single": "唯一候选", "hidden-single": "唯一位置", "locked-candidate": "锁定候选", "naked-pair": "显性数对", "hidden-pair": "隐性数对" };
      var label = result.steps === 0 ? "无需推理" : labels[result.highestTechnique];
      if (!label) return;
      target.textContent = "本题评级 · " + label;
      target.title = result.explanation || "依据原始题面的完整逻辑推演；不代表所选难度档。";
      panel.hidden = false;
    }, 0);
  }

  function hintSignature() {
    // Check the mode before reading any answer data. A revealed answer must not
    // survive a selection, puzzle, solution or gameplay-mode change.
    if (!game || ruleOnly()) return null;
    return JSON.stringify([game.puzzleId, game.selected, game.mode, game.clues,
      game.board, game.givens, game.solution]);
  }

  function selectedHintResult() {
    if (!game || ruleOnly()) return { message: "当前模式不揭晓答案。" };
    var unavailable = { message: "当前题目的答案无法验证，暂不能显示提示。" };
    try {
      var context = gameContext(), size = Engine.getLayout(context).cellCount;
      var index = game.selected;
      if (!Number.isInteger(index) || index < 0 || index >= size) {
        return { message: "请先点选棋盘上的一个空格，再查看提示。" };
      }
      if (!isBoard(game.board, false, size) || !isBoard(game.givens, false, size) ||
          !isBoard(game.solution, true, size)) return unavailable;
      // Read every slot as well as checking shape: sparse or corrupt saved data
      // must never turn an unverified value into an answer.
      for (var i = 0; i < size; i++) {
        if (!Number.isInteger(game.board[i]) || !Number.isInteger(game.givens[i]) ||
            !Number.isInteger(game.solution[i])) return unavailable;
      }
      if (!respectsGivens(game.board, game.givens) ||
          !respectsGivens(game.solution, game.givens) ||
          !Engine.validateComplete(game.solution, context)) return unavailable;
      if (game.givens[index]) return { message: "这一格是题目给定数字，请选择一个空格。" };
      if (game.board[index]) return { message: "这一格已有数字，请选择空格；若要查看这一格，请先清空它。" };
      return { index: index, value: game.solution[index], hasMistakes: game.board.some(function (value, cell) {
        return value && !game.givens[cell] && value !== game.solution[cell];
      }) };
    } catch (error) {
      return unavailable;
    }
  }

  function renderHint() {
    var panel = $("hint-panel");
    if (!panel) return;
    if (pendingHint && (document.body.dataset.zen === "on" || !canInteract() || ruleOnly() || pendingHint.signature !== hintSignature())) pendingHint = null;
    panel.hidden = !pendingHint;
    // Clear the actual text too, so stale answers do not remain in the hidden
    // panel after pausing, switching modes, changing cells or closing it.
    var location = pendingHint ? cellLocation(pendingHint.index) : "";
    // One board coordinate identifies even a shared cell. Keep every membership
    // in the accessible label without turning the bounded result into a paragraph.
    var compact = location.split(" / ")[0].replace(/（重叠格）/g, "");
    compact = /^第/.test(compact) ? compact.replace(/\s+/g, "") :
      compact.replace(/第\s*(\d+)\s*行第\s*(\d+)\s*列/g, "$1行$2列");
    $("hint-title").textContent = location ? "提示 · " + compact : "";
    $("hint-title").title = location;
    $("hint-title").setAttribute("aria-label", location ? "提示，" + location + "的答案" : "提示");
    $("hint-value").textContent = pendingHint ? String(pendingHint.value) : "";
    $("hint-value").setAttribute("aria-label", pendingHint ? "答案 " + pendingHint.value : "答案");
    $("hint-text").textContent = pendingHint && pendingHint.hasMistakes ? "另有已填错误" : "";
  }

  function requestHint() {
    if (document.body.dataset.zen === "on" || !canInteract() || ruleOnly()) {
      pendingHint = null;
      renderHint();
      return;
    }
    var hint = selectedHintResult();
    if (hint.message) {
      pendingHint = null;
      renderHint();
      setStatus(hint.message);
      toast(hint.message);
      return;
    }
    var signature = hintSignature(), fresh = !pendingHint || pendingHint.signature !== signature;
    if (fresh) {
      pendingHint = { index: hint.index, value: hint.value, hasMistakes: hint.hasMistakes, signature: signature };
      game.hints++;
      game.energy.combo = 0;
    }
    render();
    if (fresh) save("查看答案提示");
    if (window.NineRealmsWorkspace) window.NineRealmsWorkspace.revealHint();
    else $("hint-panel").scrollIntoView({ block: "nearest", behavior: "instant" });
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
    if (preferences.zen || !canInteract()) return;
    if (ruleOnly()) {
      var ruleErrors = conflicts();
      var stuck = [];
      for (var i = 0; i < game.board.length; i++) {
        if (!game.board[i] && Engine.candidates(game.board, i, checkedContext()).length === 0) stuck.push(i);
      }
      checkedReveal = true;
      clearTimeout(checkTimeout);
      checkTimeout = setTimeout(function () { checkedReveal = false; render(); }, 6000);
      setStatus(ruleErrors.size || stuck.length ?
        "规则检查：" + ruleErrors.size + " 格存在规则冲突，" + stuck.length + " 个空格已无候选。可撤回检查点重新推理。" :
        "当前未发现重复或无候选格。这不代表已证明正确。" + (game.logicMode ? " " + Logic.scope(gameContext()).message : ""));
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
    if (!game || storageTransition || generatingPuzzle || game.started || game.completed || dialogIsOpen() || document.hidden) return;
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
    if (!game || storageTransition || generatingPuzzle || !game.started || game.completed || dialogIsOpen()) return;
    suspendClock();
    game.paused = paused;
    if (paused) { settingsMusicAudition = false; musicAudition = null; if (Atmosphere.stopSound) Atmosphere.stopSound(); }
    clearPulse();
    if (!paused) Atmosphere.unlock();
    resetTilt();
    render();
    if (!paused) resumeClock();
    setStatus(paused ? "已暂停 · 你的进度已保存在这台设备。" : "欢迎回来，继续这一局。");
    save();
  }

  function showDialog(element) {
    clearGenerationRetry();
    if(loadingDaily&&element&&element.id!=="daily-dialog"){cancelDailyGeneration();renderDaily();}
    clearNumberPresses();
    if (window.NineRealmsFloatingDraft) window.NineRealmsFloatingDraft.close(false);
    if(storageTransition)return;
    if (generatingPuzzle) {
      cancelPuzzleGeneration(); renderModeControls();
      setStatus("已取消后台生成，原有棋局和进度已保留。");
    }
    suspendClock();
    settingsMusicAudition = false;
    resetTilt();
    if (!element) return;
    if (typeof element.showModal === "function") element.showModal();
    else element.setAttribute("open", "");
    if (typeof syncMusic === "function") syncMusic();
  }

  function closeDialog(element) {
    clearGenerationRetry();
    if (!element) return;
    if (typeof element.close === "function") element.close();
    else element.removeAttribute("open");
    if (typeof syncMusic === "function") syncMusic();
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
      var accepted = await confirmAction(snapshot.game.practice ? "开启独立复练？" : restart ? "重新挑战这道题？" : "继续这段历史？",
        "当前棋局会保存在历史中。" + (snapshot.game.practice ? "将载入这份独立复练，原局不会被覆盖。" : restart ? "将从原题开始一局新的挑战。" : "将恢复所选棋局，点击继续后才恢复计时。"),
        snapshot.game.practice ? "准备复练" : restart ? "重新挑战" : "恢复棋局");
      if (!accepted) return false;
    }
    suspendClock();
    save();
    try {
      var source = snapshot.game,previousSession=game.sessionId;
      await warmDailyIdentity(snapshot);
      if(storageTransition||liveSaveExport()||game.sessionId!==previousSession)return false;
      if (!modeInfo(source.mode) || !difficultyInfo(source.mode, source.difficulty)) throw new Error("Unavailable historical mode");
      if (restart) {
        installPuzzle({ id: source.puzzleId, givens: source.givens, solution: source.solution, clues: source.clues,
          dailyDate: source.dailyDate, voyageId: source.voyageId, sourceId: source.sourceId, generation: source.generation, recovery:source.recovery, custom: source.custom }, source.difficulty, source.mode);
      } else {
        if (!restore(snapshot, true)) throw new Error("Invalid historical game");
        if (source.practice) historyOrigin = "new";
        clearTransientMarks();
        stopCelebration();
        renderPreferences();
        render();
        renderDaily();
        renderVoyage();
      }
      if (!voyageStorageBlocked && game.voyageId && Voyage.matchesPuzzle(game.voyageId, game.givens, game.mode, game.difficulty, game.clues)) {
        voyageProgress = Voyage.retainCurrent(voyageProgress, game.voyageId); saveVoyage(); renderVoyage();
      }
      setStatus(source.practice ? (game.started ? "独立复练已恢复，点击继续后计时。" : "独立复练已准备好，保留原卡点数字与候选；点击开始后计时。") : restart ? "原题已准备好，这是一次新的挑战；点击开始后计时。" :
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
    return !game.completed && (game.started || inBranch() || game.board.some(function (n, i) { return n !== game.givens[i]; }) ||
      game.notes.some(function (mask) { return mask !== 0; }));
  }

  function archiveBeforeReplacement() {
    try {
      if(liveSaveExport()||saveRecoveryState||!save()||!History||!History.flush())return false;
      var old=History.getSnapshot(game.sessionId);
      return Boolean(old && old.game.mode===game.mode && ["givens","board","notes","clues","branch","draft"].every(function(key){return JSON.stringify(old.game[key])===JSON.stringify(game[key]);}));
    } catch(error){return false;}
  }

  function installPuzzle(puzzle, difficulty, mode) {
    if(loadingDaily)cancelDailyGeneration();
    var clues = Engine.normalizeClues(mode, puzzle && puzzle.clues);
    var nextContext = { mode: mode, clues: clues };
    if (!puzzle || !isBoard(puzzle.givens, false, Engine.getLayout(nextContext).cellCount) || !isBoard(puzzle.solution, true, Engine.getLayout(nextContext).cellCount) ||
        !Engine.validateComplete(puzzle.solution, nextContext) || !respectsGivens(puzzle.solution, puzzle.givens)) {
      throw new Error("Invalid puzzle");
    }
    var deliveredRecovery=puzzle.deliveryRecovery||puzzle.recovery, verifiedRecovery=recoveryInfo(deliveredRecovery,Object.assign({},puzzle,{mode:mode,difficulty:difficulty}));
    if(deliveredRecovery&&!verifiedRecovery)throw new Error("Invalid recovery proof");
    cancelPuzzleGeneration();
    suspendClock();
    if (game) save();
    historyOrigin = 'new';
    game = {
      custom: puzzle.custom === true,
      logicMode: preferences.logicMode,
      generation: generationInfo(puzzle.generation, { mode: mode, clues: clues, givens: puzzle.givens }, difficulty),
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
      draft: Drafts.empty(puzzle.givens.length),
      history: [],
      redo: [],
      selected: Math.max(0, puzzle.givens.indexOf(0)),
      mistakes: 0,
      errorCheckIncomplete: false,
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
    game.recovery=verifiedRecovery;
    batchSelection.clear(); batchSelecting = false;
    currentContext = nextContext;
    game.energy = restoreEnergy(null);
    clearPulse();
    revealFog(game.selected);
    pendingHint = null;
    noteMode = false;
    checkedReveal = false;
    clearTimeout(checkTimeout);
    render();
    renderDaily();
    renderVoyage();
  }

  async function newGame(difficulty, initial, requestedMode) {
    if(storageTransition)return;
    if (generatingPuzzle) {
      cancelPuzzleGeneration(); renderModeControls(); resumeClock();
      setStatus("已取消生成，原有棋局和进度已保留。"); return;
    }
    clearGenerationRetry();
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
    if(storageTransition)return;
    try {
      if(!initial && game && !archiveBeforeReplacement()) {
        resumeClock();renderModeControls();setStatus("当前棋局或历史尚未安全保存，原棋局已保留。请先导出当前对局并检查存储空间，再开启新游戏。");return;
      }
      var sourceId = Deck.choose(mode, difficulty, game && game.sourceId);
      var puzzle, freshRequested = Boolean(Generator && Generator.supportsFresh(mode));
      if (!initial && difficulty !== "master" && generatorClient) {
        var epoch = ++generationEpoch;
        suspendClock(); save(); setGenerationBusy(true);

        try {
          puzzle = await generatorClient.run({ mode: mode, difficulty: difficulty, sourceId: sourceId,
            seed: Generator.seed(), fresh: freshRequested, avoidFingerprints: generationAvoid() }, {recovery:true,onStage:function(stage){generationStage(stage,mode,difficulty,epoch);}});
        } catch (error) {
          if (epoch !== generationEpoch || error.name === "AbortError") return;
          {
            generationRetry = {mode:mode,difficulty:difficulty};
            setGenerationBusy(false);resumeClock();renderModeControls();
            var retryTarget=modeInfo(mode).label + " · " + difficultyInfo(mode,difficulty).label;
            $("new-game").title="重新生成" + retryTarget;
            setStatus((error.message === "WORKER_UNAVAILABLE" ? "当前环境不支持后台生成" : "本次有限构造与备选验证均未找到合格题目") + "，原棋局已保留，未替换为未经验证的旧题或降低难度。点击“重试生成”再试" + retryTarget + "。");
            return;
          }
        }
        if (epoch !== generationEpoch) return;
        setGenerationBusy(false);
      }
      if (!puzzle) puzzle = Engine.getPuzzle(difficulty, undefined, mode, { sourceId: sourceId });
      if(!initial && game && !archiveBeforeReplacement()) {
        resumeClock();renderModeControls();setStatus("当前棋局或历史未能安全保存，未替换棋盘。请先导出当前对局并检查存储空间。");return;
      }
      installPuzzle(puzzle, difficulty, mode);
      Deck.remember(mode, difficulty, puzzle.sourceId, true);
      rememberGenerated(puzzle);
      setStatus(puzzle.generation && puzzle.generation.kind === "constructed" ? modeInfo(mode).label + "新底盘" + (puzzle.generation.layoutFingerprint ? "与新规则布局" : "") + "已准备好 · " + difficultyInfo(mode,difficulty).label + (puzzle.generation.difficultyBasis === "supported-logic" ? "（已通过技巧校准）" : puzzle.generation.difficultyBasis === "rule-depth" ? "（规则推演层级，不等同人类技巧评级）" : "（给定数分档，已验证基础规则推理可完成）") + "，点击开始后计时。" : puzzle.generation ? modeInfo(mode).label + "题库底盘重挖已准备好 · " + difficultyInfo(mode, difficulty).label +
        (game.generation.difficultyBasis === "supported-logic" ? "（已通过技巧校准）" : "密度档（非技巧评级）") + "，点击开始后计时。" :
        preferences.zen ? modeInfo(mode).label + "已准备好，等你开始。" : downgraded ? "已准备" + modeInfo(mode).label + " · 进阶。极境仅用于经典玩法，点击开始后计时。" :
        modeInfo(mode).label + " · " + difficultyInfo(mode, difficulty).label + "已准备好，点击开始游戏后计时。");
      if(game.recovery)setStatus(game.recovery.kind==="verified-reserve"?"新构造未完成，已准备经过重新验证的固定备用题 · "+modeInfo(mode).label+" · "+difficultyInfo(mode,difficulty).label+"。这不是本次新构造；点击开始后计时。":game.recovery.kind==="verified-catalog"?"新构造未完成，已准备同玩法同档的已验证题库备选 · "+modeInfo(mode).label+" · "+difficultyInfo(mode,difficulty).label+"。这是题库题，不是新构造；点击开始后计时。":"备用构造已通过验证 · "+modeInfo(mode).label+" · "+difficultyInfo(mode,difficulty).label+"，点击开始后计时。");
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
    var sharing = kind === "share"; sharingPlain = false;
    if ($("challenge-plain")) { $("challenge-plain").hidden = game.mode !== "classic"; $("challenge-plain").textContent = "切换 81 格文本"; }
    challengeError("");
    if ($("challenge-export-panel")) $("challenge-export-panel").hidden = !sharing;
    if ($("challenge-import-panel")) $("challenge-import-panel").hidden = sharing;
    if ($("challenge-title")) $("challenge-title").textContent = sharing ? "分享同一境" : "接收同题挑战";
    if ($("challenge-description")) $("challenge-description").textContent = sharing ?
      "这段代码只包含原始题目、规则线索、玩法与难度，不包含答案、进度或用时。朋友输入即可打开同一盘。" :
      "粘贴挑战码或 81 格经典题面（0 或 . 为空格）；只加载已验证唯一解的题目。";
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
      if (Desktop) await Desktop.copyText(code);
      else { if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error("Clipboard unavailable"); await navigator.clipboard.writeText(code); }
      challengeError("");
      toast("分享文本已复制，可以发送给朋友。");
    } catch (error) {
      if ($("challenge-dialog") && $("challenge-dialog").open) {
        output.focus();
        output.select();
        output.setSelectionRange(0, output.value.length);
        challengeError("已选中分享文本，请按 Ctrl/⌘ C 复制；手机可长按复制。");
      }
    }
  }

  async function importChallenge() {
    if (importingChallenge || !window.SudokuChallenge) return;
    importingChallenge = true;
    if ($("challenge-import")) $("challenge-import").disabled = true;
    challengeError("");
    var puzzle, request = ++challengeImportEpoch;
    try {
      var input = $("challenge-input") ? $("challenge-input").value : "";
      if (/^\s*NR[12]-/i.test(input)) puzzle = window.SudokuChallenge.decode(input);
      else {
        var givens = Custom.parse(input); challengeError("正在离线验证经典题面……");
        var proof = await customImportClient.run(givens);
        if (request !== challengeImportEpoch || !$("challenge-dialog").open) return;
        if (proof.status !== "unique" || !proof.playable) throw new Error(proof.message);
        puzzle = Custom.puzzle(givens, proof);
      }
    } catch (error) {
      if (request !== challengeImportEpoch) return;
      challengeError(error.message || "题面文本无效，请检查后重试。");
      importingChallenge = false;
      if ($("challenge-import")) $("challenge-import").disabled = false;
      return;
    }
    try {
      if (request !== challengeImportEpoch || storageTransition) return;
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
      setStatus(puzzle.custom ? "导入的经典题面已验证唯一解，点击开始后计时。" : "同题挑战已准备好：" + modeInfo(puzzle.mode).label + " · " +
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
    if (inBranch() || game.completed || !(game.logicMode ? Logic.complete(game.board, gameContext()) :
        game.board.every(function (value, index) { return value === game.solution[index]; }) && Engine.validateComplete(game.board, gameContext()))) return;
    suspendClock();
    game.completed = true;
    game.paused = false;
    try { if (favoriteStore) favoriteStore.markCompleted(game, game.sessionId); } catch (error) { toast("收藏完成状态暂未保存，当前棋局仍会保存在历史中。"); }
    var dailyUpdated = true;
    if (game.dailyDate) {
      try {
        if (dailyUnreadable) throw new Error("每日原文待恢复");
        dailyRecords = Daily.recordCompletion(dailyRecords, game.dailyDate, {
          elapsedMs: Math.floor(game.elapsedMs), mistakes: game.mistakes, hints: game.hints
        });
        saveDaily();
      } catch (error) { dailyUpdated = false; toast("本局已完成，但每日统计未能更新。原记录已保留，可先导出留存。"); }
      renderDaily();
    }
    var completionSound = finishVoyage();
    Atmosphere.play(completionSound || "win");
    $("completion-daily").hidden = !game.dailyDate;
    $("completion-daily").textContent = game.dailyDate ? game.dailyDate + (dailyUpdated ? " · 每日一境已点亮，重玩保留首次成绩。" : " · 本局已完成，每日统计尚未更新，原记录已保留。") : "";
    render();
    setStatus(game.board.length + " 格，恰到好处。恭喜完成" + modeInfo(game.mode).label + "！");
    var summary = $("completion-dialog") && $("completion-dialog").querySelector("p");
    if (summary) summary.textContent = modeInfo(game.mode).label + " · " +
      (game.custom ? "自建题" : difficultyInfo(game.mode, game.difficulty).label) + "，每一个数字都找到了自己的位置。";
    if ($("completion-time")) $("completion-time").textContent = formatTime(game.elapsedMs);
    if ($("completion-mistakes")) $("completion-mistakes").textContent = game.logicMode || !automaticErrors() || game.voyageId && game.errorCheckIncomplete ? "—" : String(game.mistakes);
    // Zen completion stays on the finished board, without a score dialog.
    if (!preferences.zen) showDialog($("completion-dialog"));
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
  bind("voyage-dialog", "close", function () { if (!this.open) { musicAudition = null; if (Atmosphere.stopSound) Atmosphere.stopSound(); } if (typeof syncMusic === "function") syncMusic(); resumeClock(); save(); });
  bind("voyage-world-nodes", "click", function (event) {
    var button = event.target.closest("[data-world-id]"); if (!button || button.disabled) return;
    selectedVoyage = button.dataset.worldId; selectedVoyageTrack = chapterInfo(selectedVoyage).trackId; renderVoyage(); playVoyageSound("voyage-select", true);
    if (window.matchMedia("(max-width: 760px)").matches) $("voyage-selected-title").scrollIntoView({ block: "start" });
  });
  bind("voyage-training-links", "click", function (event) {
    var button = event.target.closest("[data-station]"); if (!button || button.disabled || !trainingUi) return;
    voyagePracticeReturn = { id: selectedVoyage, station: button.dataset.station };
    closeDialog($("voyage-dialog")); trainingUi.open(button.dataset.station);
  });
  bind("completion-review", "click", function () {
    if (!History || !game) return; var id = game.sessionId; closeDialog($("completion-dialog")); save(); History.flush(); History.open(id); var review = $("history-review"); if (review) review.open = true;
  });
  bind("voyage-next-stop", "click", function () {
    var nextId = Voyage.journey(voyageProgress, game && game.voyageId).nextId;
    if (!nextId) return;
    selectedVoyage = nextId; renderVoyage(); $("voyage-selected-title").focus();
  });
  function renderZenContext() {
    var context = $("zen-context");
    if (!context) return;
    var message = game && game.completed ? "此境已圆满" :
      inBranch() ? "假设中 · 退出后可管理" : "";
    context.hidden = !preferences.zen || !message;
    context.textContent = message;
  }

  function prepareZenView() {
    // View state only: never erase saved notes, drafts, branches, fog or history.
    clearTransientMarks();
    lensDigit = 0; lensResult = null; lensKey = "";
    var appearance = $("appearance-settings");
    if (appearance) appearance.open = false;
    if (window.NineRealmsSelect) window.NineRealmsSelect.close();
    if (window.NineRealmsFloatingDraft) window.NineRealmsFloatingDraft.close(false);
    if ($("more-tools-panel")) $("more-tools-panel").hidden = true;
  }

  function setZen(enabled) {
    enabled = Boolean(enabled);
    if (preferences.zen === enabled) return;
    preferences.zen = enabled;
    // No new puzzle, pause, score reset or settings reset on either transition.
    if (enabled) prepareZenView();
    else clearTransientMarks();
    clearTimeout(toastTimeout);
    $("toast").hidden = true;
    stopCelebration();
    resetTilt();
    renderPreferences();
    render();
    if (window.NineRealmsWorkspace) window.NineRealmsWorkspace.sync();
    if (!preferences.zen) Atmosphere.unlock();
    setStatus(preferences.zen ? "禅模式。只留下棋盘、填数、笔记、擦除与撤销。按 Esc 退出。" :
      "已回到普通模式，棋局进度与原来的显示设置都已保留。");
    save();
    var focus = !enabled ? $("zen-toggle") : !game.started ? $("start-btn") :
      game.paused ? $("resume-btn") : game.completed ? $("zen-toggle") : cells[game.selected];
    if (focus) focus.focus({ preventScroll: true });
  }

  function exitZenOnEscape(event) {
    // Exit is available before input guards, including ready/paused/completed.
    // An open select/dialog consumes its own first Escape before leaving Zen.
    if (event.key !== "Escape" || event.defaultPrevented || !preferences.zen || dialogIsOpen()) return false;
    event.preventDefault();
    setZen(false);
    return true;
  }

  bind("zen-toggle", "click", function () { setZen(!preferences.zen); });
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
  window.addEventListener("nine-realms-music-state", function () { renderMusicStatus();renderEffectsStatus(); });
  bind("effects-toggle", "click", function(){preferences.effectsEnabled=preferences.effectsEnabled===false;editSoundSequence++;renderPreferences();save();});
  bind("effects-volume", "input", function(){preferences.effectsVolume=Number($("effects-volume").value)/100;editSoundSequence++;renderPreferences();save();});
  bind("music-toggle", "click", function () { preferences.musicEnabled = !preferences.musicEnabled; renderPreferences(); if (preferences.musicEnabled && preferences.sound) Atmosphere.unlock(); save(); });
  bind("appearance-settings", "toggle", function () { if(!this.open)settingsMusicAudition=false;syncMusic(); });
  bind("music-preview", "click", function () {
    if(!preferences.musicEnabled||!preferences.sound||preferences.soundVolume===0||preferences.musicVolume===0||preferences.zen||document.hidden||storageTransition||storageConflict)return;
    var state=Atmosphere.musicStatus(),retry=state.state==="error"||state.audioError||state.audioState==="suspended"||state.audioState==="interrupted"||state.audioState==="closed";
    if(settingsMusicAudition&&!retry){settingsMusicAudition=false;syncMusic();return;}
    settingsMusicAudition=true;syncMusic();Atmosphere.unlock({retryMusic:true});
  });
  bind("music-volume", "input", function () { preferences.musicVolume = Number($("music-volume").value) / 100; syncMusic(); if (preferences.sound && preferences.musicEnabled) Atmosphere.unlock(); save(); });
  bind("voyage-dialog", "click", function (event) {
    var button = event.target.closest("[data-music-preview]"); if (!button) return;
    if (!preferences.sound || !preferences.musicEnabled || preferences.soundVolume === 0 || preferences.musicVolume === 0 || preferences.zen) { renderMusicStatus(); return; }
    musicAudition = button.dataset.musicPreview; syncMusic(); Atmosphere.unlock({retryMusic:true});
  });
  bind("sound-volume", "input", function () { preferences.soundVolume = Number($("sound-volume").value) / 100; renderPreferences(); if (preferences.sound) Atmosphere.unlock(); save(); });
  bind("voyage-dialog", "click", function (event) {
    var button = event.target.closest("[data-sound-preview]"); if (!button) return;
    var status = $("voyage-sound-status");
    if (!preferences.sound || preferences.effectsEnabled === false || preferences.effectsVolume === 0 || preferences.zen || preferences.soundVolume === 0) { status.textContent = preferences.zen ? "禅模式保持安静。" : "请在外观设置中开启声音和音效，并调高对应音量。"; return; }
    playVoyageSound(button.dataset.soundPreview, true).then(function (played) { status.textContent = played ? "正在试听 · " + button.textContent : "声音尚未就绪，请再次点击试听。"; });
  });
  bind("sound-toggle", "click", function () {
    preferences.sound = !preferences.sound;
    renderPreferences();
    if (preferences.sound) { Promise.resolve(Atmosphere.unlock()).then(function(ready){if(ready&&preferences.sound&&!preferences.zen&&!document.hidden)Atmosphere.play("input");}); }
    save();
  });
  bind("fog-toggle", "click", toggleFog);
  bind("fog-clear", "click", clearFog);
  bind("hint-close", "click", function () { pendingHint = null; render(); });
  bind("daily-btn", "click", openDaily);
  bind("daily-start", "click", startDaily);
  bind("daily-close", "click", function () { closeDialog($("daily-dialog")); });
  bind("daily-dialog", "close", function () { if(loadingDaily){cancelDailyGeneration();renderDaily();} resumeClock(); save(); });
  function toggleLensDigit(value) {
    if (!Number.isInteger(value) || value < 1 || value > 9) return;
    lensDigit = lensDigit === value ? 0 : value;
    if (lensDigit) batchDigit = lensDigit;
    render();
  }
  for (var lensNumber = 1; lensNumber <= 9; lensNumber++) {
    var lensButton = document.createElement("button"); lensButton.type = "button";
    lensButton.textContent = String(lensNumber); lensButton.dataset.digit = String(lensNumber);
    lensButton.setAttribute("aria-label", "筛选候选 " + lensNumber + "，再次点击取消"); lensButton.setAttribute("aria-pressed", String(lensNumber === lensDigit));
    lensButton.addEventListener("click", function (event) { toggleLensDigit(Number(event.currentTarget.dataset.digit)); });
    $("lens-digits").appendChild(lensButton);
  }
  bind("batch-toggle", "click", function () { if (!canInteract()) return; batchSelecting = !batchSelecting; if (batchSelecting) noteMode = true; render(); });
  bind("batch-all", "click", function () { if (!canInteract()) return; game.board.forEach(function (v, i) { if (!v && !game.givens[i]) batchSelection.add(i); }); render(); });
  bind("batch-selection-clear", "click", function () { batchSelection.clear(); batchSelecting = false; render(); });
  ["add", "remove", "clear", "rules"].forEach(function (operation) { bind("batch-" + operation, "click", function () { batchNotes(operation); }); });
  bind("batch-digit", "change", function () { var value = Number($("batch-digit").value); if (Number.isInteger(value) && value >= 1 && value <= 9) { batchDigit = value; render(); } });
  bind("lens-notes", "click", function () { lensSource = "notes"; render(); });
  bind("lens-rules", "click", function () { lensSource = "rules"; render(); });
  bind("logic-toggle", "click", function () {
    if (!game || game.completed || storageTransition || generatingPuzzle) return;
    game.logicMode = !game.logicMode; preferences.logicMode = game.logicMode;
    game.energy.combo = 0; clearTransientMarks();
    setStatus(game.logicMode ? "纯逻辑模式 · " + Logic.scope(gameContext()).message : "已恢复普通模式，填写与检查会核对本题答案。");
    render(); checkCompletion(); save("切换检查模式");
  });
  bind("branch-new", "click", beginBranch);
  bind("branch-switch", "change", function () { var target = $("branch-switch").value || null; branchAction(function () { return Branches.switchTo(game, target, noteMode); }, target ? "已切换假设，主盘保持独立。" : "已返回主盘，其他假设仍保留。"); });
  bind("branch-btn", "click", beginBranch);
  bind("branch-rollback", "click", rollbackBranch);
  bind("branch-commit", "click", commitBranch);
  bind("share-btn", "click", function () { openChallenge("share"); });
  bind("import-btn", "click", function () { openChallenge("import"); });
  bind("challenge-close", "click", function () { closeDialog($("challenge-dialog")); });
  bind("challenge-dialog", "close", function () { challengeImportEpoch++; customImportClient.cancel(); importingChallenge = false; $("challenge-import").disabled = false; resumeClock(); save(); });
  bind("challenge-copy", "click", copyChallenge);
  bind("challenge-import", "click", importChallenge);
  bind("challenge-input", "input", function () { challengeImportEpoch++; customImportClient.cancel(); importingChallenge = false; $("challenge-import").disabled = false; challengeError(""); });
  bind("challenge-plain", "click", function () { if (game.mode !== "classic") return; sharingPlain = !sharingPlain; $("challenge-output").value = sharingPlain ? Custom.toText(game.givens) : window.SudokuChallenge.create(game); $("challenge-plain").textContent = sharingPlain ? "切换挑战码" : "切换 81 格文本"; });
  bind("custom-open", "click", function () { if (customUi) customUi.open(); });
  bind("custom-personal-open", "click", function () { closeDialog($("personal-dialog")); if (customUi) customUi.open(); });
  bind("new-game", "click", function () { if(game){var retry=generationRetry;newGame(retry?retry.difficulty:game.difficulty, false, retry?retry.mode:undefined);} });
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
    var examples = $("rule-examples");
    examples.open = false;
    examples.hidden = !window.NineRealmsRuleExamples.render($("rule-examples-content"), game.mode);
    renderTechniqueGuide();
    renderLogicRating();
    showDialog($("rules-dialog")); save();
  });
  bind("rules-close", "click", function () { closeDialog($("rules-dialog")); });
  bind("rules-dialog", "close", function () { resumeClock(); save(); });
  bind("reading-settings", "click", function(event){
    var button = event.target.closest("[data-reading-pref]");
    if (!button || storageTransition) return;
    var key = button.dataset.readingPref, value = button.dataset.readingValue;
    preferences[key] = key === "colorAssist" ? value === "true" : value;
    renderPreferences(); save();
  });
  bind("reading-settings", "keydown", function(event){ if(event.key !== "Escape") event.stopPropagation(); });
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
  bind("redo-btn", "click", redo);
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
    if (game.voyageId) {
      var nextId = Voyage.nextAfter(voyageProgress, game.voyageId);
      if (nextId && !voyageBranchChoice && !voyageStorageBlocked) startVoyage(nextId);
      else openVoyage(nextId);
    }
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
    toast(ruleOnly() ? (preferences.errorCheck ? "规则冲突即时标记已开启。" : "规则冲突即时标记已关闭。") : preferences.errorCheck ? "即时错误提示已开启。" : "即时纠错已关闭：失误暂停统计，进度按已填格数显示；仍可主动点击检查。");
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
    if (exitZenOnEscape(event)) return;
    var appearance = $("appearance-settings");
    if (event.key === "Escape" && appearance && appearance.open) {
      event.preventDefault();
      appearance.open = false;
      appearance.querySelector("summary").focus();
      return;
    }
    var target = event.target;
    if (!canTravelEdit() || (target && (target.isContentEditable ||
        /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)))) return;
    if ((event.ctrlKey || event.metaKey) && ["z", "y"].indexOf(event.key.toLowerCase()) >= 0) {
      event.preventDefault();
      if (event.key.toLowerCase() === "y" || event.shiftKey) redo(); else undo();
      return;
    }
    if (!canInteract()) return;
    if (event.key === "Escape" && pendingHint) {
      event.preventDefault();
      pendingHint = null;
      render();
      $("hint-btn").focus({ preventScroll: true });
      return;
    }
    if (event.key === "Escape" && (batchSelection.size || batchSelecting)) { event.preventDefault(); batchSelection.clear(); batchSelecting = false; render(); return; }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (/^[1-9]$/.test(event.key)) {
      event.preventDefault();
      pressNumberKey(Number(event.key), "keyboard:" + (event.code || event.key));
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
    moveOnLayout(direction[0], direction[1], event.shiftKey ? "extend" : false);
  });

  document.addEventListener("keyup", function (event) { releaseNumberKey("keyboard:" + (event.code || event.key)); });
  document.addEventListener("pointerup", function (event) { releaseNumberKey("pointer:" + event.pointerId); }, { passive: true });
  document.addEventListener("pointercancel", function (event) { releaseNumberKey("pointer:" + event.pointerId, true); }, { passive: true });
  window.addEventListener("blur", clearNumberPresses);

  window.addEventListener("storage", function(event) {
    if (storageSession.isTemporary()) return;
    storageSession.changed(event);
    if(!Backup || event.key!==Backup.journalKey)return;
    if(event.newValue!==null){
      cancelPuzzleGeneration();suspendClock();storageTransition=true;clearNumberPresses();if(Atmosphere.stopSound)Atmosphere.stopSound();if(History)History.suspendPersistence(true);
      document.body.inert=true;if(window.NineRealmsEasterEggs&&window.NineRealmsEasterEggs.suspendPersistence)window.NineRealmsEasterEggs.suspendPersistence(true);
      setStatus("另一窗口正在恢复数据，当前窗口已暂停保存。完成后将重新载入。");
    }else if(storageTransition){window.location.reload();}
  });

  document.querySelectorAll("dialog").forEach(function (dialog) { dialog.addEventListener("close", function () { if (typeof syncMusic === "function") syncMusic(); }); });

  document.addEventListener("visibilitychange", function () {
    document.body.dataset.pageHidden = String(document.hidden);
    if (document.hidden) {
      clearNumberPresses();
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
    syncMusic();
  });
  window.addEventListener("pagehide", function (event) {
    clearNumberPresses();
    suspendClock();
    if (game && game.started && !game.completed) game.paused = true;
    save();
    if (History) History.flush();
    if (event.isTrusted) storageSession.release();
  });
  window.addEventListener("pageshow", function (event) { if (event.persisted) window.location.reload(); });
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

  async function downloadPlayerFile(value, filename) {
    var text = typeof value === "string" ? value : JSON.stringify(value);
    if (Desktop && Desktop.isTauri()) return Desktop.saveJSON(text, filename);
    var url = URL.createObjectURL(new Blob([text], { type: "application/json;charset=utf-8" }));
    var link = document.createElement("a"); link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();
    setTimeout(function(){URL.revokeObjectURL(url);},30000);
    return true;
  }

  function refreshRecoveryLink() {
    if (liveSaveExport()) { $("save-recovery-open").hidden = false; $("save-recovery-open").textContent = storageSession.isTemporary() ? "临时对局" : "未保存对局"; return; }
    $("save-recovery-open").textContent = "原档副本";
    try { $("save-recovery-open").hidden = playerStorage.getItem(SaveRecovery.archiveKey) === null; }
    catch (error) { $("save-recovery-open").hidden = true; }
  }

  function showSaveRecovery(state) {
    var pending = Boolean(state), unavailable = state && state.status === "unavailable", live = !pending && liveSaveExport();
    $("save-recovery-title").textContent = live ? "本窗口尚未保存的对局" : pending ? "棋局暂未能恢复" : "保留的原档副本";
    $("save-recovery-description").textContent = live ?
      "可以导出当前对局原文；它不是完整备份，不含其他历史、收藏或成绩。关闭其他九境窗口后，在“数据备份”中选择此文件，经校验和确认后仅恢复这一局。本机原档和副本保持不变。" : !pending ?
      "已保留的原始棋局或记录仍在本机。可以导出留存，交由兼容版本检查；这些副本不是完整备份，不能直接在数据备份中导入。" : unavailable ?
      "浏览器暂不允许读取本机存档。可以重试，或仅本次游玩；仅本次游玩不会自动保存当前对局。" : state.status === "unsupported" ?
      "这份存档来自较新的存档版本（" + state.version + "），当前版本无法读取。原始数据未改变，请优先用对应版本打开，也可以导出留存。" :
      "发现无法读取的棋局数据，原始内容未改变。可导出留存、重新读取，或保留原档副本后开新局；历史、收藏和成绩会保留。";
    var archiveRaw = null;
    try { archiveRaw = playerStorage.getItem(SaveRecovery.archiveKey); } catch (error) {}
    $("save-recovery-export-archive").hidden = !pending && !live || archiveRaw === null;
    $("save-recovery-export").textContent = live ? "导出当前对局原文" : pending ? "导出原档" : "导出已有副本原文";
    $("save-recovery-export").dataset.currentWindow = String(live);
    $("save-recovery-temporary").hidden = !pending || Boolean(unavailable);
    $("save-recovery-export").disabled = Boolean(unavailable);
    $("save-recovery-retry").hidden = !pending;
    $("save-recovery-new").hidden = !pending;
    $("save-recovery-new").textContent = unavailable ? "仅本次游玩" : "保留原档并开新局";
    $("save-recovery-close").hidden = pending;
    $("save-recovery-status").textContent = "";
    var dialog = $("save-recovery-dialog");
    if (!dialog.open) { if (dialog.showModal) dialog.showModal(); else dialog.setAttribute("open", ""); }
  }

  function readCurrentSave() {
    var state;
    try { state = SaveRecovery.inspect(playerStorage, SAVE_VERSION); }
    catch (error) { state = { status: "unavailable", raw: null }; }
    if (state.status === "candidate") {
      if (restore(state.value)) return { status: "restored" };
      state.status = "invalid";
    }
    return state;
  }

  bind("save-recovery-dialog", "cancel", function (event) { if (saveRecoveryState && !saveRecoveryState.sessionOnly) event.preventDefault(); });
  bind("save-recovery-close", "click", function () { closeDialog($("save-recovery-dialog")); resumeClock(); });
  bind("save-recovery-open", "click", function () {
    if (dialogIsOpen() || storageTransition) return;
    suspendClock(); showSaveRecovery(null);
  });
  bind("save-recovery-export", "click", async function () {
    try {
      var pending = saveRecoveryState && !saveRecoveryState.sessionOnly;
      var live = !pending && $("save-recovery-export").dataset.currentWindow === "true";
      var raw = live ? JSON.stringify(currentSaveEnvelope()) : pending ? saveRecoveryState.raw : playerStorage.getItem(SaveRecovery.archiveKey);
      if (typeof raw !== "string") throw new Error("暂时无法读取原档，请重试。");
      var saved = await downloadPlayerFile(raw, live ? "Nine-Realms-window-save.json" : pending ? "Nine-Realms-unreadable-save.json" : "Nine-Realms-original-saves.json");
      $("save-recovery-status").textContent = saved ? "已发起保存，请确认文件已保存到设备。原数据仍保留在本机。" : "已取消保存，原数据仍保留在本机。";
    } catch (error) { $("save-recovery-status").textContent = error.message || "导出未完成，原数据仍保留。"; }
  });
  bind("save-recovery-retry", "click", function () {
    try { storageSession.rebase(); } catch (error) {}
    var state = readCurrentSave();
    if (state.status !== "missing" && state.status !== "restored") {
      saveRecoveryState = state; showSaveRecovery(state); return;
    }
    saveRecoveryState = null; storageTransition = false;
    suspendOtherPersistence(false);
    closeDialog($("save-recovery-dialog")); renderPreferences();
    if (state.status === "restored") { render(); setStatus("棋局已重新读取，点击继续后恢复计时。"); save(); }
    else newGame("easy", true);
    refreshRecoveryLink();
  });
  bind("save-recovery-new", "click", function () {
    if (!saveRecoveryState) return;
    var sessionOnly = saveRecoveryState.status === "unavailable";
    if (sessionOnly) { enterTemporarySession(true); return; }
    try {
      if (!sessionOnly) SaveRecovery.preserve(playerStorage, saveRecoveryState);
      if (!sessionOnly) saveRecoveryState = null;
      storageTransition = false; closeDialog($("save-recovery-dialog"));
      suspendOtherPersistence(false);
      newGame("easy", true); refreshRecoveryLink();
      refreshSaveStatus(); toast("原档副本已保留，可在页脚“原档副本”中导出。");
    } catch (error) {
      $("save-recovery-status").textContent = (error.message || "原档副本保存失败。") + " 当前原档与已有副本均未改变。可分别导出，或选择仅本次游玩。";
    }
  });

  bind("save-recovery-export-archive", "click", async function () {
    try {
      var raw = playerStorage.getItem(SaveRecovery.archiveKey);
      if (typeof raw !== "string") throw new Error("暂时无法读取已有副本，原数据未改变。");
      var saved = await downloadPlayerFile(raw, "Nine-Realms-original-saves.json");
      $("save-recovery-status").textContent = saved ? "已发起保存已有副本的原文，请确认文件已保存。" : "已取消保存，已有副本仍保留。";
    } catch (error) { $("save-recovery-status").textContent = error.message; }
  });
  bind("save-recovery-temporary", "click", function () { enterTemporarySession(true); });
  bind("save-conflict-dialog", "cancel", function (event) { event.preventDefault(); });
  bind("save-conflict-temporary", "click", function () { enterTemporarySession(false); });
  bind("save-conflict-reload", "click", async function () {
    if (await storageSession.start()) window.location.reload();
    else $("save-conflict-status").textContent = "另一窗口仍在保存。请先关闭其他九境窗口，再重新读取；也可选择仅本次游玩。";
  });
  bind("save-conflict-export", "click", async function () {
    var actions = [$("save-conflict-export"), $("save-conflict-reload"), $("save-conflict-temporary")];
    actions.forEach(function (button) { button.disabled = true; });
    $("save-conflict-status").textContent = "正在准备本窗口进度，请等待导出完成或取消后再重新读取。";
    try {
      var value, rawOnly = false;
      try { value = await preparePlayerBackup(); }
      catch (error) { value = currentSaveEnvelope(); rawOnly = true; }
      var saved = await downloadPlayerFile(value, rawOnly ? "Nine-Realms-window-save.json" : "Nine-Realms-window-backup.json");
      $("save-conflict-status").textContent = saved ? "已发起保存本窗口备份，请确认文件已保存。重新读取会放弃本窗口尚未保存的修改。" : "已取消导出，本窗口进度仍保留。";
      if (saved && rawOnly) $("save-conflict-status").textContent = "完整备份暂不可导出，已发起保存本窗口对局。关闭其他窗口后，可在“数据备份”中校验并仅恢复这一局，其他记录保留。请确认文件已保存。";
    } catch (error) { $("save-conflict-status").textContent = error.message || "导出未完成，请保留此窗口。"; }
    finally { actions.forEach(function (button) { button.disabled = false; }); $("save-conflict-export").disabled = !game; }
  });

  function favoriteSession(record, unfinished) {
    if (!History || !Favorites) return null;
    if (game && (!unfinished || !game.completed) && Favorites.samePuzzle(game,record.puzzle)) {
      return {version:SAVE_VERSION,preferences:preferences,game:Object.assign({},game,{elapsedMs:Math.floor(currentElapsed()),noteMode:noteMode})};
    }
    var rows=History.getRecords();
    for(var i=0;i<rows.length;i++){
      if(unfinished&&rows[i].completed)continue;
      var snapshot=History.getSnapshot(rows[i].sessionId);
      if(snapshot&&Favorites.samePuzzle(snapshot.game,record.puzzle))return snapshot;
    }
    return null;
  }

  async function playFavorite(record, restart) {
    if(storageTransition)return;
    closeDialog($("personal-dialog"));
    if(!restart){var snapshot=favoriteSession(record,true);if(!snapshot){toast("该题没有保留的未完成会话，请重新挑战。");return;}await openHistorical(snapshot,false);return;}
    if(hasProgress()&&!await confirmAction("重新挑战收藏题？","当前棋局会保存在历史中。收藏题面保持不变，将开启独立的新会话。","重新挑战"))return;
    if(storageTransition)return;
    suspendClock();save();
    var puzzle=Object.assign({id:record.id},record.puzzle);
    installPuzzle(puzzle,puzzle.difficulty,puzzle.mode);
    try{favoriteStore.linkSession(game,game.sessionId);}catch(e){toast("新局已准备好，但收藏会话关联暂未保存。");}
    save();if(History)History.flush();setStatus("收藏题目已准备好，点击开始后计时。");
  }

  async function preparePlayerBackup() {
    if (dailyUnreadable) throw new Error("每日原文暂不可读取，为避免遗漏，完整备份已暂停；请在每日一境导出原文，或用有效备份恢复。");
    if (voyageStorageBlocked) throw new Error("远征存档格式较新或暂不可读取，为避免导出遗漏，完整备份已暂停；原数据未改变，请使用对应版本导出。");
    suspendClock();
    save();if(History)History.flush();
    // Export the live snapshot even when quota prevents persistence. Never export stale progress.
    var entries={};
    entries[STORAGE_KEY]=currentSaveEnvelope();
    if(History)entries[History.KEY]=History.exportData();
    entries[DAILY_KEY]=dailyRecords;entries[VOYAGE_KEY]=voyageProgress;
    entries[RECENT_GENERATED_KEY]=recentGenerated.slice();
    if(Deck&&Deck.exportData)entries["nine-realms.puzzle-deck.v1"]=Deck.exportData();
    if(favoriteStore)entries[Favorites.key]=favoriteStore.exportData();
    if(window.NineRealmsEasterEggs&&window.NineRealmsEasterEggs.exportData)entries["nine-realms.secrets.v1"]=window.NineRealmsEasterEggs.exportData();
    var liveStorage={getItem:function(key){return Object.prototype.hasOwnProperty.call(entries,key)?JSON.stringify(entries[key]):playerStorage.getItem(key);}};
    return await Backup.createAsync(liveStorage,{appVersion:APP_VERSION});
  }

  function commitPlayerBackup(validated) {
    cancelPuzzleGeneration();suspendClock();
    if(!save())throw new Error("当前进度暂时无法安全保存，已停止替换。请先释放本机存储空间。");
    if(History){var state=History.originalState();if(["invalid","unsupported"].indexOf(state.status)>=0)History.preserveOriginal();else if(!History.flush())throw new Error("历史暂时无法安全保存，已停止替换。");}
    if(dailyUnreadable){if(typeof dailyUnreadable.raw!=="string")throw new Error("暂不可读取每日原文，未替换任何数据。");SaveRecovery.preserve(playerStorage,dailyUnreadable,DAILY_KEY);}
    storageTransition=true;if(History)History.suspendPersistence(true);
    try{
      Backup.replace(playerStorage,validated);
      document.body.dataset.storageTransition="true";
      window.location.reload();
    }catch(error){
      if(!error.recoveryRequired){storageTransition=false;if(History)History.suspendPersistence(false);}
      throw error;
    }
  }

  async function commitWindowGame(validated) {
    if (storageTransition || saveRecoveryState || storageSession.isTemporary()) throw new Error("当前窗口尚未启用安全保存。请关闭其他九境窗口，重新打开游戏后恢复。");
    cancelPuzzleGeneration();suspendClock();
    if (!save()) throw new Error("当前对局暂时无法安全保存，未替换棋盘。请先导出当前对局并检查存储空间。");
    // History may be protected because it is unreadable or newer. Keep those
    // exact bytes; a game-only recovery must not require replacing the history.
    if (History && ["invalid","unsupported","unavailable"].indexOf(History.originalState().status)<0 && !History.flush())
      throw new Error("当前历史暂时无法安全保存，未替换棋盘。请先导出当前对局并检查存储空间。");
    var next=JSON.parse(JSON.stringify(validated));
    next.preferences=JSON.parse(JSON.stringify(preferences));
    next.game.sessionId=newSessionId();
    next=await Backup.validateWindowAsync(next);
    storageSession.check();
    var previous=playerStorage.getItem(STORAGE_KEY);
    try {
      var previousHistory=History?playerStorage.getItem(History.KEY):null;
      SaveRecovery.preserveWindow(playerStorage,previous);
      // A fresh recovery session can reach the ordinary 40-record/byte limit.
      // Retain the entire original history, including any records it may trim.
      if (previousHistory!==null) SaveRecovery.preserveWindow(playerStorage,previousHistory,History.KEY);
    } catch(error) {
      if (error.name!=="QuotaExceededError"&&error.name!=="SecurityError") throw error;
      var copyError=new Error("恢复前的副本未能完整保存，棋盘尚未替换。请检查本机存储空间与权限。");
      copyError.cause=error;throw copyError;
    }
    refreshRecoveryLink();
    storageTransition=true;suspendOtherPersistence(true);
    try {
      Backup.replaceWindow(playerStorage,next,previous);
      document.body.dataset.storageTransition="true";
      window.location.reload();
    } catch(error) {
      if (!error.recoveryRequired) {storageTransition=false;suspendOtherPersistence(false);}
      throw error;
    }
  }

  if (window.NineRealmsCustomUI) customUi = window.NineRealmsCustomUI({
    current: function () { return game; }, blocked: function () { return storageTransition || generatingPuzzle || dialogIsOpen(); },
    readDraft: function () { return preferences.customDraft; }, writeDraft: function (text) { preferences.customDraft = text; save(); },
    open: function (dialog) { showDialog(dialog); save(); }, close: closeDialog, afterClose: function () { resumeClock(); save(); },
    savePuzzle: favoriteStore ? function (puzzle) { favoriteStore.add(puzzle, { later: true }); if (personalUi) personalUi.refreshCurrent(); } : null,
    play: async function (puzzle) {
      closeDialog($("custom-dialog"));
      if (hasProgress() && !await confirmAction("开始这道自建题？", "当前棋局会留在历史中；自建题已通过唯一解校验，点击开始后计时。", "准备自建题")) { showDialog($("custom-dialog")); return false; }
      if (storageTransition) return false;
      installPuzzle(puzzle, puzzle.difficulty, "classic"); setStatus("自建经典题已验证唯一解，点击开始后计时。"); save(); if (History) History.flush(); return true;
    }
  });

  if (window.NineRealmsTrainingUI) trainingUi = window.NineRealmsTrainingUI({
    progress: function () { return Voyage.practiceProgress(voyageProgress); },
    blocked: function () { return storageTransition || voyageStorageBlocked; },
    play: launchPractice,
    open: showDialog, close: closeDialog, afterClose: function () {
      resumeClock(); save();
      if (voyagePracticeReturn && !storageTransition && !curatedLaunching) { var back = voyagePracticeReturn; voyagePracticeReturn = null; openVoyage(back.id); $("voyage-training-links").closest("details").open = true; var button = $("voyage-training-links").querySelector('[data-station="' + back.station + '"]'); if (button) button.focus(); }
    },
    success: function (id, cell, digit) { if (storageTransition || voyageStorageBlocked) throw new Error("练习成绩暂不可保存，原记录未改变。"); voyageProgress = Voyage.recordPractice(voyageProgress, id, cell, digit); saveVoyage(); renderVoyage(); }
  });

  if (window.NineRealmsDraftUI) draftUi = window.NineRealmsDraftUI({
    game: function () { return game; }, layout: function () { return boardLayout; }, view: function () { return activeBoardId; },
    blocked: function () { return !canInteract(); },
    change: function (next, label) { if (!canInteract()) return; if (Drafts.equal(next, game.draft, game.board.length)) return;
      remember(); game.draft = Drafts.validate(next, game.board.length, game.clues); render(); save(label); },
    message: setStatus, undo: undo, redo: redo
  });

  bind("checkpoints-open", "click", function () { if (storageTransition || !History) return; save(); History.flush(); History.openCheckpoints(); });

  if (History) History.init({
    Engine: Engine, storage: playerStorage,
    preserveOriginal: function (state) { SaveRecovery.preserve(playerStorage, state, History.KEY); refreshRecoveryLink(); },
    downloadOriginal: function (raw) { return downloadPlayerFile(raw, "Nine-Realms-unreadable-history.json"); },
    VariantView: window.SudokuVariantView,
    openDialog: function (element) { showDialog(element); save(); },
    afterClose: function () { render(); resumeClock(); save(); },
    onFavorite: function(snapshot){if(!favoriteStore||!snapshot)throw new Error("收藏暂不可用");favoriteStore.add(snapshot.game,{sessionId:snapshot.game.sessionId,completed:snapshot.game.completed});toast("已收藏这道题，打开“我的题目”即可查看。");if(personalUi)personalUi.refreshCurrent();},
    onPractice: function (snapshot) { return openHistorical(snapshot, false); },
    onResume: function (snapshot) { return openHistorical(snapshot, false); },
    onReplayNew: function (snapshot) { return openHistorical(snapshot, true); },
    toast: toast
  });

  if (window.NineRealmsPersonal && Backup && Favorites) personalUi=window.NineRealmsPersonal({
    store:favoriteStore,modes:Engine.getModes(),current:function(){return game;},
    blocked:function(){return storageTransition||dialogIsOpen();},locked:function(){return storageTransition;},
    open:showDialog,close:closeDialog,save:save,afterClose:function(){resumeClock();save();},
    resumeAvailable:function(record){return Boolean(favoriteSession(record,true));},play:playFavorite,
    history:function(record){var snapshot=favoriteSession(record,false);closeDialog($("personal-dialog"));if(History)History.open(snapshot&&snapshot.game.sessionId);},
    maxBackupBytes:Backup.limits.maxBytes,nativeSave:function(){return Boolean(Desktop&&Desktop.isTauri());},
    hasPreviousWindow:function(){try{return SaveRecovery.previousWindow(playerStorage)!==null;}catch(e){return false;}},
    exportPreviousWindow:function(){var raw=SaveRecovery.previousWindow(playerStorage);if(typeof raw!=="string")throw new Error("没有可读取的恢复前原对局；请从页脚导出原档副本留存。");return downloadPlayerFile(raw,"Nine-Realms-before-window-restore.json");},
    exportBackup:async function(){var backup=await preparePlayerBackup();return await downloadPlayerFile(backup,"Nine-Realms-backup-"+new Date().toISOString().slice(0,10)+".json");},
    prepareBackup:async function(text){
      var parsed;try{parsed=JSON.parse(text);}catch(e){}
      if(parsed&&parsed.format===undefined&&Object.prototype.hasOwnProperty.call(parsed,"game")){
        var windowGame=await Backup.validateWindowAsync(text),g=windowGame.game;
        return {validated:windowGame,windowGame:true,summary:"窗口对局 · 仅恢复当前棋盘\n"+modeInfo(windowGame.version===1?"classic":g.mode).label+" · "+g.board.filter(Boolean).length+" / "+g.board.length+" 格 · 用时 "+formatTime(g.elapsedMs)+"\n包含笔记、撤销与分支；历史、收藏、每日与主线成绩、当前设置保留。"};
      }
      var validated=await Backup.validateAsync(text),p=Backup.preview(validated);
      return {validated:validated,summary:"备份时间："+new Date(p.createdAt).toLocaleString()+" · 版本 "+p.appVersion+
        "\n"+(p.currentGame?"当前棋局："+modeInfo(p.currentGame.mode).label+" · "+p.currentGame.filled+" / "+p.currentGame.total+" 格":"没有当前棋局")+
        "\n历史 "+p.historyCount+" 局 / "+p.historySteps+" 步 · 收藏 "+p.favoritesCount+" 题"+
        "\n彩蛋 "+p.secretsCount+" 项 · 每日明细 "+p.dailyCount+" 条 · 旅程 "+p.voyageCount+" 条"};
    },commitBackup:function(value){return Backup.isWindow(value)?commitWindowGame(value):commitPlayerBackup(value);},downloadRecovery:function(value,windowRecovery){return downloadPlayerFile(value,windowRecovery?"Nine-Realms-before-window-restore.json":"Nine-Realms-recovery-log.json");}
  });

  buildCatalog();
  buildBoard();
  try{await warmDailyIdentity(JSON.parse(playerStorage.getItem(STORAGE_KEY)||"null"));}catch(error){}
  var startupSave = readCurrentSave();
  var restored = startupSave.status === "restored";
  if (!restored && startupSave.status !== "missing") { saveRecoveryState = startupSave; storageTransition = true; }
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
      "已恢复" + modeInfo(game.mode).label + (inBranch() ? "的假设分支，检查点仍然保留；点击继续后计时。" : "进度，点击继续后再恢复计时。"));
    save();
  } else if (!saveRecoveryState && !storageConflict) {
    newGame("easy", true);
  }
  refreshRecoveryLink();
  if (storageConflict) reportStorageConflict();
  else if (saveRecoveryState) { suspendOtherPersistence(true); showSaveRecovery(saveRecoveryState); }
  refreshSaveStatus();
  if (window.NineRealmsEasterEggs) window.NineRealmsEasterEggs.init({
    storage: playerStorage,
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

