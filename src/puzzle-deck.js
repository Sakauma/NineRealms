/* Persisted source-puzzle rotation; selecting never consumes a puzzle until installed. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory;
  else root.NineRealmsPuzzleDeck = factory;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Engine, storage, random) {
  "use strict";
  var KEY = "nine-realms.puzzle-deck.v1", seen = Object.create(null);
  random = random || Math.random;
  var catalog = Engine.getPuzzleCatalog();
  function pool(mode, difficulty) {
    return catalog.filter(function (p) { return p.mode === mode && p.difficulty === difficulty; }).map(function (p) { return p.id; });
  }
  try {
    var saved = JSON.parse(storage.getItem(KEY) || "null");
    if (saved && saved.version === 1 && saved.seen && typeof saved.seen === "object") {
      catalog.forEach(function (p) {
        var key = p.mode + "/" + p.difficulty;
        if (seen[key]) return;
        var valid = pool(p.mode, p.difficulty), values = saved.seen[key];
        seen[key] = Array.isArray(values) ? Array.from(new Set(values.filter(function (id) { return valid.indexOf(id) !== -1; }))) : [];
      });
    }
  } catch (error) { /* A damaged rotation ledger never prevents playing. */ }
  function choose(mode, difficulty, avoidId) {
    var ids = pool(mode, difficulty), key = mode + "/" + difficulty;
    if (!ids.length) throw new Error("No puzzles in this difficulty.");
    var visited = seen[key] || [];
    var remaining = ids.filter(function (id) { return visited.indexOf(id) === -1; });
    if (!remaining.length) remaining = ids.slice();
    var lastId = visited.length === ids.length ? visited[visited.length - 1] : null;
    var different = remaining.filter(function (id) { return id !== avoidId && id !== lastId; });
    if (different.length) remaining = different;
    return remaining[Math.min(remaining.length - 1, Math.floor(Math.max(0, random()) * remaining.length))];
  }
  function remember(mode, difficulty, id, newDraw) {
    var ids = pool(mode, difficulty), key = mode + "/" + difficulty;
    if (ids.indexOf(id) === -1) return false;
    var visited = seen[key] || [];
    if (visited.length >= ids.length) {
      // Reloading or resuming an old game does not begin a new cycle.
      if (!newDraw) return true;
      visited = [];
    }
    if (visited.indexOf(id) === -1) visited = visited.concat(id);
    seen[key] = visited;
    try { storage.setItem(KEY, JSON.stringify({ version: 1, seen: seen })); } catch (error) { /* Keep rotation in memory when storage is unavailable. */ }
    return true;
  }
  return { choose: choose, remember: remember, exportData: function () { return JSON.parse(JSON.stringify({ version: 1, seen: seen })); } };
});
