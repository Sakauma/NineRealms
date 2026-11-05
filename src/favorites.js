/* Nine Realms — exact frozen puzzles, independent of seeds and play sessions. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./engine.js"));
  else root.NineRealmsFavorites = factory(root.SudokuEngine);
})(typeof globalThis !== "undefined" ? globalThis : this, function (Engine) {
  "use strict";
  var KEY = "nine-realms.favorites.v1", VERSION = 1;
  var LIMITS = { records: 200, bytes: 1024 * 1024, sessions: 64 };
  function fail(code) { var error = new Error(code); error.code = code; throw error; }
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function object(value) { return value && typeof value === "object" && !Array.isArray(value); }
  function keys(value, allowed) {
    if (!object(value) || Object.keys(value).some(function (key) { return allowed.indexOf(key) < 0; })) fail("INVALID_FAVORITES_FIELDS");
  }
  function timestamp(value) { return Number.isSafeInteger(value) && value > 0 && value < 1e15; }
  function sessionId(value) { return typeof value === "string" && /^[a-zA-Z0-9_-]{1,96}$/.test(value); }
  function stable(value) {
    if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
    if (object(value)) return "{" + Object.keys(value).sort().map(function (key) { return JSON.stringify(key) + ":" + stable(value[key]); }).join(",") + "}";
    return JSON.stringify(value);
  }
  function puzzleKey(puzzle) {
    if (!object(puzzle) || !Array.isArray(puzzle.givens)) fail("INVALID_FAVORITE_PUZZLE");
    // Full content is compared, not a hash: collisions cannot merge unrelated puzzles.
    return stable([puzzle.mode, puzzle.givens, Engine.normalizeClues(puzzle.mode, puzzle.clues)]);
  }
  function freezePuzzle(input) {
    if (!object(input) || !Engine.getModes().some(function (mode) { return mode.id === input.mode; }) ||
        !Engine.getDifficulties(input.mode).some(function (difficulty) { return difficulty.id === input.difficulty; })) fail("INVALID_FAVORITE_MODE");
    var clues = Engine.normalizeClues(input.mode, input.clues), context = { mode: input.mode, clues: clues };
    var count = Engine.getLayout(context).cellCount;
    function board(value, min) { return Array.isArray(value) && value.length === count && value.every(function (n) { return Number.isInteger(n) && n >= min && n <= 9; }); }
    if (!board(input.givens, 0) || !board(input.solution, 1) || !Engine.validateComplete(input.solution, context) ||
        !input.givens.every(function (v, i) { return !v || v === input.solution[i]; })) fail("INVALID_FAVORITE_PUZZLE");
    if (input.custom !== undefined && typeof input.custom !== "boolean" || input.custom && (input.mode !== "classic" || Object.keys(clues).some(function(k){return k !== "version" && clues[k].length;}))) fail("INVALID_CUSTOM_RULES");
    var proof = Engine.analyzeSolutions(input.givens, context, { limit: 2, maxNodes: 250000, timeLimitMs: input.custom ? 750 : 200 });
    if (proof.exhausted) fail("FAVORITE_VALIDATION_BUDGET");
    if (proof.count !== 1 || !proof.solution || proof.solution.some(function (v, i) { return v !== input.solution[i]; })) fail("FAVORITE_NOT_UNIQUE");
    var frozen = { version: VERSION, mode: input.mode, difficulty: input.difficulty, givens: input.givens.slice(), solution: input.solution.slice(), clues: copy(clues) };
    if (input.custom) frozen.custom = true;
    return frozen;
  }
  function validateEnvelope(value) {
    keys(value, ["version", "records"]);
    if (value.version !== VERSION) fail("UNSUPPORTED_FAVORITES_VERSION");
    if (!Array.isArray(value.records) || value.records.length > LIMITS.records) fail("FAVORITES_LIMIT");
    if (JSON.stringify(value).length * 2 > LIMITS.bytes) fail("FAVORITES_SIZE_LIMIT");
    var ids = new Set(), content = new Set(), started = Date.now();
    var records = value.records.map(function (record) {
      if (Date.now() - started > 8000) fail("FAVORITES_VALIDATION_TIMEOUT");
      keys(record, ["id", "puzzle", "createdAt", "updatedAt", "later", "completed", "sessionIds"]);
      if (typeof record.id !== "string" || !/^fav-[a-zA-Z0-9_-]{1,90}$/.test(record.id) || ids.has(record.id) ||
          !timestamp(record.createdAt) || !timestamp(record.updatedAt) || record.updatedAt < record.createdAt ||
          typeof record.later !== "boolean" || typeof record.completed !== "boolean" ||
          !Array.isArray(record.sessionIds) || record.sessionIds.length > LIMITS.sessions ||
          !record.sessionIds.every(sessionId) || new Set(record.sessionIds).size !== record.sessionIds.length) fail("INVALID_FAVORITE_RECORD");
      keys(record.puzzle, ["version", "mode", "difficulty", "givens", "solution", "clues", "custom"]);
      if (record.puzzle.version !== VERSION) fail("UNSUPPORTED_FAVORITE_PUZZLE_VERSION");
      var puzzle = freezePuzzle(record.puzzle);
      if (Date.now() - started > 8000) fail("FAVORITES_VALIDATION_TIMEOUT");
      if (stable(record.puzzle.clues) !== stable(puzzle.clues)) fail("INVALID_FAVORITE_CLUES");
      var key = puzzleKey(puzzle); if (content.has(key)) fail("DUPLICATE_FAVORITE_PUZZLE");
      ids.add(record.id); content.add(key);
      return { id: record.id, puzzle: puzzle, createdAt: record.createdAt, updatedAt: record.updatedAt,
        later: record.later, completed: record.completed, sessionIds: record.sessionIds.slice() };
    });
    return { version: VERSION, records: records };
  }
  async function validateEnvelopeAsync(value) {
    keys(value, ["version", "records"]);
    if (value.version !== VERSION) fail("UNSUPPORTED_FAVORITES_VERSION");
    if (!Array.isArray(value.records) || value.records.length > LIMITS.records) fail("FAVORITES_LIMIT");
    if (JSON.stringify(value).length * 2 > LIMITS.bytes) fail("FAVORITES_SIZE_LIMIT");
    var started = Date.now(), records = [], ids = new Set(), content = new Set();
    for (var i = 0; i < value.records.length; i++) {
      await new Promise(function (resolve) { setTimeout(resolve, 0); });
      if (Date.now() - started > 8000) fail("FAVORITES_VALIDATION_TIMEOUT");
      var record = validateEnvelope({ version: VERSION, records: [value.records[i]] }).records[0];
      if (Date.now() - started > 8000) fail("FAVORITES_VALIDATION_TIMEOUT");
      var key = puzzleKey(record.puzzle);
      if (ids.has(record.id)) fail("INVALID_FAVORITE_RECORD");
      if (content.has(key)) fail("DUPLICATE_FAVORITE_PUZZLE");
      ids.add(record.id); content.add(key); records.push(record);
    }
    return { version: VERSION, records: records };
  }
  function samePuzzle(a, b) {
    try { return puzzleKey(a) === puzzleKey(b); } catch (error) { return false; }
  }
  function createStore(storage, options) {
    options = options || {};
    var now = typeof options.now === "function" ? options.now : Date.now;
    if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") fail("FAVORITES_STORAGE_UNAVAILABLE");
    var records = [], loadedRaw = null, sequence = 0;
    function reload() {
      var raw = storage.getItem(KEY), envelope;
      if (raw !== null && typeof raw !== "string") fail("INVALID_FAVORITES_STORAGE");
      if (raw !== null) {
        if (raw.length * 2 > LIMITS.bytes) fail("FAVORITES_SIZE_LIMIT");
        try { envelope = JSON.parse(raw); } catch (error) { fail("INVALID_FAVORITES_JSON"); }
        envelope = validateEnvelope(envelope);
      } else envelope = { version: VERSION, records: [] };
      records = envelope.records; loadedRaw = raw; return list();
    }
    function commit(next) {
      if (next.length > LIMITS.records) fail("FAVORITES_LIMIT");
      var text = JSON.stringify({ version: VERSION, records: next });
      if (text.length * 2 > LIMITS.bytes) fail("FAVORITES_SIZE_LIMIT");
      if (storage.getItem(KEY) !== loadedRaw) fail("FAVORITES_CHANGED_IN_OTHER_WINDOW");
      // Web Storage setItem is atomic on failure; do not advance memory until it succeeds.
      storage.setItem(KEY, text); records = next; loadedRaw = text;
    }
    function get(id) { var record = records.find(function (r) { return r.id === id; }); return record ? copy(record) : null; }
    function find(puzzle) {
      var key = puzzleKey(puzzle), record = records.find(function (r) { return puzzleKey(r.puzzle) === key; });
      return record ? copy(record) : null;
    }
    function list(filter) {
      filter = filter || {};
      return records.filter(function (r) {
        return (!filter.mode || filter.mode === "all" || r.puzzle.mode === filter.mode) &&
          (!filter.status || filter.status === "all" || filter.status === "later" && r.later ||
          filter.status === "completed" && r.completed || filter.status === "unfinished" && !r.completed);
      }).sort(function (a, b) { return b.updatedAt - a.updatedAt; }).map(copy);
    }
    function time(previous) { var value = Math.floor(now()); if (!timestamp(value)) fail("INVALID_FAVORITE_TIMESTAMP"); return Math.max(value, previous || 1); }
    function attach(record, id) {
      if (id === undefined || id === null) return;
      if (!sessionId(id)) fail("INVALID_FAVORITE_SESSION");
      record.sessionIds = record.sessionIds.filter(function (v) { return v !== id; }).concat(id).slice(-LIMITS.sessions);
    }
    function add(puzzle, flags) {
      flags = flags || {};
      if (flags.later !== undefined && typeof flags.later !== "boolean" || flags.completed !== undefined && typeof flags.completed !== "boolean") fail("INVALID_FAVORITE_FLAGS");
      var frozen = freezePuzzle(puzzle), existing = find(frozen), stamp = time(existing && existing.updatedAt), next = records.map(copy), record;
      if (existing) record = next.find(function (r) { return r.id === existing.id; });
      else {
        var id;
        do { id = "fav-" + stamp.toString(36) + "-" + (++sequence).toString(36) + "-" + Math.random().toString(36).slice(2, 10); } while (next.some(function (r) { return r.id === id; }));
        record = { id: id, puzzle: frozen, createdAt: stamp, updatedAt: stamp, later: false, completed: false, sessionIds: [] }; next.push(record);
      }
      if (flags.later !== undefined) record.later = flags.later;
      if (flags.completed === true) record.completed = true;
      attach(record, flags.sessionId); record.updatedAt = stamp; commit(next); return copy(record);
    }
    function update(id, action) {
      var next = records.map(copy), record = next.find(function (r) { return r.id === id; });
      if (!record) return null;
      action(record); record.updatedAt = time(record.updatedAt); commit(next); return copy(record);
    }
    function remove(id) { if (!get(id)) return false; commit(records.filter(function (r) { return r.id !== id; })); return true; }
    function setLater(id, later) { if (typeof later !== "boolean") fail("INVALID_FAVORITE_FLAGS"); return update(id, function (r) { r.later = later; }); }
    function linkSession(puzzle, id) { var r = find(puzzle); return r ? update(r.id, function (next) { attach(next, id); }) : null; }
    function markCompleted(puzzle, id) { var r = find(puzzle); return r ? update(r.id, function (next) { next.completed = true; attach(next, id); }) : null; }
    reload();
    return { add: add, remove: remove, setLater: setLater, markCompleted: markCompleted, linkSession: linkSession,
      find: find, get: get, list: list, reload: reload, exportData: function () { return { version: VERSION, records: records.map(copy) }; } };
  }
  return { key: KEY, version: VERSION, limits: copy(LIMITS), createStore: createStore,
    freezePuzzle: freezePuzzle, puzzleKey: puzzleKey, samePuzzle: samePuzzle, validateEnvelope: validateEnvelope, validateEnvelopeAsync: validateEnvelopeAsync };
});
