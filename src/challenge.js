/* Nine Realms — portable puzzle-only challenge codes (NR1). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./engine.js"));
  else root.SudokuChallenge = factory(root.SudokuEngine);
})(typeof globalThis !== "undefined" ? globalThis : this, function (Engine) {
  "use strict";
  var MODES = ["classic", "diagonal", "hyper", "knight"];
  var LEVELS = ["easy", "medium", "hard", "master"];
  var ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  var BYTE_LENGTH = 47;
  var BODY_LENGTH = 43;
  var MAX_INPUT_LENGTH = 256;
  var NODE_LIMIT = 100000;
  var TIME_LIMIT_MS = 750;
  var peerCache = Object.create(null);

  function fail(message) { throw new Error(message); }
  function metadata(mode, difficulty) {
    mode = mode === undefined ? "classic" : mode;
    difficulty = difficulty === undefined ? "easy" : difficulty;
    if (difficulty === "expert" && mode === "classic") difficulty = "master";
    if (MODES.indexOf(mode) < 0) fail("挑战码中的玩法暂不支持。");
    if (LEVELS.indexOf(difficulty) < 0 || (mode !== "classic" && difficulty === "master")) {
      fail("挑战码中的难度与玩法不匹配。");
    }
    return { mode: mode, difficulty: difficulty };
  }
  function peersFor(mode) {
    if (!Engine || typeof Engine.getPeers !== "function") fail("游戏规则资源未完整加载，请重新打开游戏。");
    if (!peerCache[mode]) peerCache[mode] = Array.from({ length: 81 }, function (_, i) {
      return Engine.getPeers(i, mode);
    });
    return peerCache[mode];
  }
  function validateGivens(givens, mode) {
    if (!Array.isArray(givens) || givens.length !== 81) fail("挑战题面必须包含 81 个格子。");
    var empty = 0, clues = 0, peers = peersFor(mode);
    for (var i = 0; i < 81; i++) {
      if (!Number.isInteger(givens[i]) || givens[i] < 0 || givens[i] > 9) fail("挑战题面包含无效数字。");
      if (!givens[i]) { empty++; continue; }
      clues++;
      for (var p = 0; p < peers[i].length; p++) {
        var other = peers[i][p];
        if (other < i && givens[other] === givens[i]) fail("挑战题面的已知数字违反当前玩法规则。");
      }
    }
    if (!empty) fail("这张棋盘已全部填满，没有可供挑战的空格。");
    if (!clues) fail("挑战题面没有线索，不能确定唯一答案。");
  }
  function checksum(bytes) {
    var value = 2166136261;
    for (var i = 0; i < BODY_LENGTH; i++) value = Math.imul(value ^ bytes[i], 16777619);
    return value >>> 0;
  }
  function encodeBase64(bytes) {
    var text = "", buffer = 0, bits = 0;
    for (var i = 0; i < bytes.length; i++) {
      buffer = (buffer << 8) | bytes[i]; bits += 8;
      while (bits >= 6) {
        bits -= 6;
        text += ALPHABET[(buffer >>> bits) & 63];
      }
    }
    if (bits) text += ALPHABET[(buffer << (6 - bits)) & 63];
    return text;
  }
  function decodeBase64(text) {
    var result = [], buffer = 0, bits = 0;
    for (var i = 0; i < text.length; i++) {
      var value = ALPHABET.indexOf(text[i]);
      if (value < 0) fail("挑战码含有无法识别的字符，请完整复制。");
      buffer = (buffer << 6) | value; bits += 6;
      if (bits >= 8) { bits -= 8; result.push((buffer >>> bits) & 255); }
    }
    if (result.length !== BYTE_LENGTH || encodeBase64(result) !== text) {
      fail("挑战码格式不完整，请重新复制。");
    }
    return result;
  }
  function createLegacy(puzzle) {
    if (!puzzle || typeof puzzle !== "object") fail("没有可分享的棋局。");
    var meta = metadata(puzzle.mode, puzzle.difficulty);
    validateGivens(puzzle.givens, meta.mode);
    var bytes = new Uint8Array(BYTE_LENGTH);
    bytes[0] = MODES.indexOf(meta.mode);
    bytes[1] = LEVELS.indexOf(meta.difficulty);
    for (var i = 0; i < 81; i++) {
      bytes[2 + (i >>> 1)] |= puzzle.givens[i] << (i % 2 ? 0 : 4);
    }
    var hash = checksum(bytes);
    for (var j = 0; j < 4; j++) bytes[BODY_LENGTH + j] = (hash >>> (24 - j * 8)) & 255;
    return "NR1-" + encodeBase64(bytes);
  }
  function popcount(n) {
    n -= n >>> 1 & 0x55555555;
    n = (n & 0x33333333) + (n >>> 2 & 0x33333333);
    return ((n + (n >>> 4) & 0x0F0F0F0F) * 0x01010101) >>> 24;
  }
  // Search only imported data, with explicit work/time bounds and a two-solution stop.
  function uniqueSolution(givens, mode) {
    var peers = peersFor(mode);
    var board = givens.slice();
    var used = new Uint16Array(81), counts = new Uint8Array(729);
    var found = 0, solution = null, nodes = 0, exhausted = false;
    var deadline = Date.now() + TIME_LIMIT_MS;
    function place(index, digit) {
      var bit = 1 << (digit - 1);
      board[index] = digit;
      for (var p = 0; p < peers[index].length; p++) {
        var other = peers[index][p];
        counts[other * 9 + digit - 1]++;
        used[other] |= bit;
      }
    }
    function remove(index, digit) {
      var bit = 1 << (digit - 1);
      for (var p = 0; p < peers[index].length; p++) {
        var other = peers[index][p];
        if (--counts[other * 9 + digit - 1] === 0) used[other] &= ~bit;
      }
      board[index] = 0;
    }
    for (var i = 0; i < 81; i++) if (givens[i]) place(i, givens[i]);
    function visit() {
      if (found >= 2 || exhausted) return;
      nodes++;
      if (nodes > NODE_LIMIT || ((nodes & 255) === 0 && Date.now() > deadline)) {
        exhausted = true; return;
      }
      var best = -1, mask = 0, size = 10, degree = -1;
      for (var cell = 0; cell < 81; cell++) {
        if (board[cell]) continue;
        var available = 511 & ~used[cell];
        if (!available) return;
        var count = popcount(available);
        if (count < size || (count === size && peers[cell].length > degree)) {
          best = cell; mask = available; size = count; degree = peers[cell].length;
        }
        if (count === 1) break;
      }
      if (best < 0) {
        found++;
        if (!solution) solution = board.slice();
        return;
      }
      while (mask && found < 2 && !exhausted) {
        var bit = mask & -mask, digit = 32 - Math.clz32(bit);
        mask ^= bit;
        place(best, digit); visit(); remove(best, digit);
      }
    }
    visit();
    if (exhausted) fail("这道挑战题验证耗时过长，请换一个挑战码。");
    if (!found) fail("这道挑战题无解，请检查挑战码来源。");
    if (found !== 1) fail("这道挑战题有多个答案，暂不能作为同题挑战。");
    return solution;
  }
  function decodeLegacy(input) {
    if (typeof input !== "string" || input.length > MAX_INPUT_LENGTH) fail("挑战码过长或格式不正确，请只粘贴代码本身。");
    var normalized = input.replace(/\s/g, "");
    if (!/^NR1-/i.test(normalized)) fail("这不是受支持的 NR1 挑战码。");
    if (normalized.length !== 67 || !/^[A-Za-z0-9_-]{63}$/.test(normalized.slice(4))) {
      fail("挑战码长度或字符不正确，请完整复制。");
    }
    var payload = normalized.slice(4), bytes = decodeBase64(payload);
    var actual = checksum(bytes), recorded = 0;
    for (var j = 0; j < 4; j++) recorded = (recorded << 8) | bytes[BODY_LENGTH + j];
    if (actual !== (recorded >>> 0)) fail("挑战码校验失败，可能少了字符或被修改。");
    if (bytes[0] >= MODES.length || bytes[1] >= LEVELS.length || (bytes[42] & 15)) fail("挑战码包含无效题目信息。");
    var meta = metadata(MODES[bytes[0]], LEVELS[bytes[1]]);
    var givens = [];
    for (var i = 0; i < 81; i++) givens.push((bytes[2 + (i >>> 1)] >>> (i % 2 ? 0 : 4)) & 15);
    validateGivens(givens, meta.mode);
    var solution = uniqueSolution(givens, meta.mode);
    return {
      id: "CH-" + actual.toString(16).toUpperCase().padStart(8, "0"),
      mode: meta.mode, difficulty: meta.difficulty,
      givens: givens, solution: solution, challengeCode: "NR1-" + payload
    };
  }
  var MAX_VARIANT_INPUT = 32768;
  var MAX_VARIANT_BYTES = 24000;
  var CLUE_LIMITS = { regions: 81, cages: 81, lines: 162, edges: 324, parity: 81,
    outside: 72, clones: 81, quadruples: 64 };

  function emptyClues(clues) {
    if (clues === undefined || clues === null) return true;
    return clues && typeof clues === "object" && !Array.isArray(clues) &&
      Object.keys(clues).every(function (key) {
        return key === "version" ? clues[key] === 1 :
          Object.prototype.hasOwnProperty.call(CLUE_LIMITS, key) &&
          Array.isArray(clues[key]) && clues[key].length === 0;
      });
  }

  function variantMetadata(puzzle) {
    if (!puzzle || typeof puzzle !== "object" || Array.isArray(puzzle)) fail("挑战题目信息无效。");
    var mode = puzzle.mode;
    if (typeof mode !== "string" || !Engine.getModes().some(function (entry) { return entry.id === mode; })) {
      fail("挑战码中的玩法暂不支持。");
    }
    if (!Engine.getDifficulties(mode).some(function (entry) { return entry.id === puzzle.difficulty; })) {
      fail("挑战码中的难度与玩法不匹配。");
    }
    var clues = puzzle.clues;
    if (clues !== undefined && clues !== null) {
      if (typeof clues !== "object" || Array.isArray(clues)) fail("附加线索格式无效。");
      Object.keys(clues).forEach(function (key) {
        if (key === "version") {
          if (clues[key] !== 1) fail("附加线索版本暂不支持。");
        } else if (!Object.prototype.hasOwnProperty.call(CLUE_LIMITS, key) ||
          !Array.isArray(clues[key]) || clues[key].length > CLUE_LIMITS[key]) {
          fail("附加线索种类或数量无效。");
        }
      });
      if (JSON.stringify(clues).length > MAX_VARIANT_BYTES) fail("附加线索过多。");
    }
    if (typeof Engine.normalizeClues !== "function") fail("变体规则资源未完整加载。");
    try { clues = Engine.normalizeClues(mode, clues); }
    catch (error) { fail("附加线索不完整或不符合当前玩法，请检查挑战码。"); }
    var givens = puzzle.givens;
    var expected = typeof Engine.getLayout === "function" ? Engine.getLayout(mode).cellCount : 81;
    if (!Array.isArray(givens) || givens.length !== expected || !givens.every(function (n) {
      return Number.isInteger(n) && n >= 0 && n <= 9;
    })) fail("当前玩法的挑战题面必须包含 " + expected + " 个有效数字。");
    if (givens.every(Boolean)) fail("这张棋盘已全部填满，没有可供挑战的空格。");
    return { mode: mode, difficulty: puzzle.difficulty, givens: givens.slice(), clues: clues };
  }

  function hashAll(bytes) {
    var value = 2166136261;
    for (var i = 0; i < bytes.length; i++) value = Math.imul(value ^ bytes[i], 16777619);
    return (value >>> 0).toString(16).padStart(8, "0");
  }

  function decodeVariantBytes(text) {
    var bytes = [], buffer = 0, bits = 0;
    for (var i = 0; i < text.length; i++) {
      var value = ALPHABET.indexOf(text[i]);
      if (value < 0) fail("挑战码字符无效。");
      buffer = (buffer << 6) | value; bits += 6;
      if (bits >= 8) { bits -= 8; bytes.push((buffer >>> bits) & 255); }
      if (bytes.length > MAX_VARIANT_BYTES) fail("挑战码内容过大。");
    }
    if (encodeBase64(bytes) !== text) fail("挑战码编码不完整。");
    return new Uint8Array(bytes);
  }

  function proveVariant(puzzle) {
    if (typeof Engine.analyzeSolutions !== "function") fail("变体求解资源未完整加载。");
    var context = { mode: puzzle.mode, clues: puzzle.clues };
    var result = Engine.analyzeSolutions(puzzle.givens, context,
      { limit: 2, maxNodes: 200000, timeLimitMs: 1500 });
    if (!result || result.exhausted) fail("这道挑战题验证耗时过长，请换一个挑战码。");
    if (!result.count) fail("这道挑战题在附加规则下无解。");
    if (result.count !== 1 || !result.solution) fail("这道挑战题有多个答案，暂不能作为同题挑战。");
    if (!Engine.validateComplete(result.solution, context)) fail("挑战题答案未通过完整规则校验。");
    return result.solution.slice();
  }

  function create(puzzle) {
    if (puzzle && MODES.indexOf(puzzle.mode === undefined ? "classic" : puzzle.mode) >= 0 && emptyClues(puzzle.clues)) {
      return createLegacy(puzzle);
    }
    var meta = variantMetadata(puzzle);
    proveVariant(meta);
    var payload = { version: 2, mode: meta.mode, difficulty: meta.difficulty,
      givens: meta.givens, clues: meta.clues };
    var bytes = new TextEncoder().encode(JSON.stringify(payload));
    if (bytes.length > MAX_VARIANT_BYTES) fail("挑战题的线索过多，无法生成挑战码。");
    var code = "NR2-" + encodeBase64(bytes) + "-" + hashAll(bytes);
    if (code.length > MAX_VARIANT_INPUT) fail("挑战码超过长度限制。");
    return code;
  }

  function decode(input) {
    if (typeof input !== "string" || input.length > MAX_VARIANT_INPUT) fail("挑战码过长或格式不正确。");
    var normalized = input.replace(/\s/g, "");
    if (/^NR1-/i.test(normalized)) return decodeLegacy(normalized);
    var match = /^NR2-([A-Za-z0-9_-]+)-([0-9a-fA-F]{8})$/i.exec(normalized);
    if (!match) fail("请粘贴完整的 NR1 或 NR2 挑战码。");
    var bytes = decodeVariantBytes(match[1]);
    if (hashAll(bytes) !== match[2].toLowerCase()) fail("挑战码校验失败，可能少了字符或被修改。");
    var payload;
    try { payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
    catch (error) { fail("挑战码内容无法识别。"); }
    if (!payload || payload.version !== 2 || Object.keys(payload).some(function (key) {
      return ["version", "mode", "difficulty", "givens", "clues"].indexOf(key) < 0;
    })) fail("挑战码题目版本或字段不受支持。");
    var meta = variantMetadata(payload);
    var solution = proveVariant(meta);
    return { id: "CH2-" + hashAll(bytes).toUpperCase(), mode: meta.mode,
      difficulty: meta.difficulty, givens: meta.givens, clues: meta.clues,
      solution: solution, challengeCode: normalized };
  }

  return { create: create, decode: decode, maxInputLength: MAX_VARIANT_INPUT, codeLength: 67 };

});
