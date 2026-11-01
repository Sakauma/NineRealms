/* Offline seeded clue carving. Difficulty here is clue density, not a human rating. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./engine.js"));
  else root.NineRealmsGenerator = factory(root.SudokuEngine);
})(typeof globalThis !== "undefined" ? globalThis : this, function createGenerator(Engine) {
  "use strict";
  var VERSION = 1;
  function hashWords(text) {
    // Four independently updated words; this is a non-cryptographic content key, not a security hash.
    var a = 1779033703, b = 3144134277, c = 1013904242, d = 2773480762;
    for (var i = 0; i < text.length; i++) {
      var n = text.charCodeAt(i);
      a = b ^ Math.imul(a ^ n, 597399067); b = c ^ Math.imul(b ^ n, 2869860233);
      c = d ^ Math.imul(c ^ n, 951274213); d = a ^ Math.imul(d ^ n, 2716044179);
    }
    a = Math.imul(c ^ a >>> 18, 597399067); b = Math.imul(d ^ b >>> 22, 2869860233);
    c = Math.imul(a ^ c >>> 17, 951274213); d = Math.imul(b ^ d >>> 19, 2716044179);
    var words = [(a ^ b ^ c ^ d) >>> 0, (b ^ a) >>> 0, (c ^ a) >>> 0, (d ^ a) >>> 0], index = 0;
    return function () { return words[index++ % 4]; };
  }
  function rng(seed) {
    var hash = hashWords(String(seed)), a = hash(), b = hash(), c = hash(), d = hash();
    return function () { a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0; var t = (a + b | 0) + d | 0; d = d + 1 | 0; a = b ^ b >>> 9; b = c + (c << 3) | 0; c = (c << 21 | c >>> 11) + t | 0; return (t >>> 0) / 4294967296; };
  }
  function fingerprint(puzzle) {
    var h = hashWords(puzzle.mode + "|" + puzzle.givens.join("") + "|" + JSON.stringify(puzzle.clues));
    return [h(), h(), h(), h()].map(function (n) { return n.toString(16).padStart(8, "0"); }).join("");
  }
  function seed() {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      return Array.from(crypto.getRandomValues(new Uint32Array(4))).map(function (n) { return n.toString(16).padStart(8, "0"); }).join("");
    }
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2) + "-" + Math.random().toString(36).slice(2);
  }
  function fail(code) { var error = new Error(code); error.code = code; throw error; }
  function generate(request) {
    request = request || {};
    var mode = request.mode || "classic", difficulty = request.difficulty || "easy";
    if (["easy", "medium", "hard"].indexOf(difficulty) < 0) fail("CURATED_DIFFICULTY");
    if (typeof request.seed !== "string" || !request.seed.length || request.seed.length > 256) fail("INVALID_SEED");
    var random = rng("carve-v" + VERSION + ":" + request.seed);
    var source = Engine.getPuzzle(difficulty, request.seed, mode, request.sourceId ? { sourceId: request.sourceId } : {});
    var context = { mode: mode, clues: source.clues };
    if (!Engine.validateComplete(source.solution, context)) fail("INVALID_TEMPLATE");
    var board = source.solution.slice(), order = board.map(function (_, i) { return i; });
    for (var i = order.length - 1; i > 0; i--) { var j = Math.floor(random() * (i + 1)), old = order[i]; order[i] = order[j]; order[j] = old; }
    var base = { easy: 44, medium: 36, hard: 28 }[difficulty];
    var target = Math.round(board.length * (base + Math.floor(random() * 5) - 2) / 81);
    var givenCount = board.length, checks = 0, nodes = 0, rejectedByBudget = 0;
    // Node budgets, unlike wall-clock cutoffs, keep successful seed output reproducible.
    var maxNodes = 12000;
    for (var n = 0; n < order.length && givenCount > target; n++) {
      var cell = order[n], value = board[cell]; board[cell] = 0;
      var result = Engine.analyzeSolutions(board, context, { limit: 2, maxNodes: maxNodes });
      checks++; nodes += result.nodes;
      if (result.count === 1 && !result.exhausted) givenCount--;
      else { board[cell] = value; if (result.exhausted) rejectedByBudget++; }
    }
    if (givenCount > target) fail("DENSITY_NOT_REACHED");
    if (board.every(function (v, k) { return Boolean(v) === Boolean(source.givens[k]); })) fail("UNCHANGED_MASK");
    var puzzle = { id: "G1-" + mode + "-" + request.seed, sourceId: source.sourceId, mode: mode, difficulty: difficulty,
      givens: board, solution: source.solution.slice(), clues: source.clues, rating: "generated-density-" + difficulty };
    var key = fingerprint(puzzle);
    if (Array.isArray(request.avoidFingerprints) && request.avoidFingerprints.indexOf(key) >= 0) fail("RECENT_DUPLICATE");
    puzzle.generation = { version: VERSION, seed: request.seed, kind: "carved", difficultyBasis: "clue-density", givenCount: givenCount,
      target: target, fingerprint: key, unique: true, checks: checks, nodes: nodes, rejectedByBudget: rejectedByBudget };
    return puzzle;
  }
  function createClient() {
    var active = null;
    function cancel() { if (active) active.cancel(); }
    function run(request) {
      cancel();
      return new Promise(function (resolve, reject) {
        if (typeof Worker === "undefined" || typeof Blob === "undefined" || !Engine.workerSource) { reject(new Error("WORKER_UNAVAILABLE")); return; }
        var worker, url, timer, settled = false;
        function finish(error, result) {
          if (settled) return; settled = true;
          clearTimeout(timer); if (worker) worker.terminate(); if (url) URL.revokeObjectURL(url);
          active = null; if (error) reject(error); else resolve(result);
        }
        active = { cancel: function () { var e = new Error("GENERATION_CANCELLED"); e.name = "AbortError"; finish(e); } };
        try {
          var source = Engine.workerSource() + "var generator=(" + createGenerator.toString() + ")(SudokuEngine);\n" +
            "self.onmessage=function(event){try{self.postMessage({puzzle:generator.generate(event.data)});}catch(error){self.postMessage({error:error.code||error.message});}};";
          url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
          worker = new Worker(url);
          worker.onmessage = function (event) { if (event.data.error) finish(new Error(event.data.error)); else finish(null, event.data.puzzle); };
          worker.onerror = function () { finish(new Error("WORKER_FAILED")); };
          // Watchdog never returns a half-checked puzzle; caller may retain/fall back to a library puzzle.
          timer = setTimeout(function () { finish(new Error("GENERATION_TIMEOUT")); }, 8000);
          worker.postMessage(request);
        } catch (error) { finish(error); }
      });
    }
    return { run: run, cancel: cancel };
  }
  return { generate: generate, createClient: createClient, fingerprint: fingerprint, seed: seed, version: VERSION };
});
