/* One transaction per edit, including candidate batches and complete draft state. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./drafts.js"));
  else root.NineRealmsEdits = factory(root.NineRealmsDrafts);
})(typeof globalThis !== "undefined" ? globalThis : this, function (Drafts) {
  "use strict";
  var LIMIT = 80;
  function snapshot(game, noteMode) {
    return { board: game.board.slice(), notes: game.notes.slice(), draft: Drafts.clone(game.draft, game.board.length, game.clues), selected: game.selected, noteMode: Boolean(noteMode) };
  }
  function push(game, noteMode) {
    game.history.push(snapshot(game, noteMode)); game.history = game.history.slice(-LIMIT); game.redo = [];
  }
  function restore(game, frame) {
    game.board = frame.board.slice(); game.notes = frame.notes.slice(); game.draft = Drafts.clone(frame.draft, game.board.length, game.clues);
    game.selected = frame.selected; return frame.noteMode;
  }
  function undo(game, noteMode) {
    if (!game.history.length) return null;
    game.redo = (game.redo || []).concat([snapshot(game, noteMode)]).slice(-LIMIT);
    return { noteMode: restore(game, game.history.pop()) };
  }
  function redo(game, noteMode) {
    if (!game.redo || !game.redo.length) return null;
    game.history.push(snapshot(game, noteMode)); game.history = game.history.slice(-LIMIT);
    return { noteMode: restore(game, game.redo.pop()) };
  }
  function noteBatch(game, indices, mask, operation, noteMode, ruleMasks) {
    if (!Array.isArray(indices) || indices.length > game.board.length || !Array.from(indices).every(function (i) { return Number.isInteger(i) && i >= 0 && i < game.board.length; }) ||
        !Number.isInteger(mask) || mask < 0 || mask > 511 || ["add", "remove", "toggle", "clear", "rules"].indexOf(operation) < 0 ||
        operation === "rules" && (!Array.isArray(ruleMasks) || ruleMasks.length !== game.board.length || !ruleMasks.every(function (m) { return Number.isInteger(m) && m >= 0 && m <= 511; })))
      throw new TypeError("批量候选操作无效。");
    var next = game.notes.slice(), count = 0;
    Array.from(new Set(indices)).forEach(function (i) {
      if (game.givens[i] || game.board[i]) return;
      var value = operation === "add" ? next[i] | mask : operation === "remove" ? next[i] & ~mask : operation === "toggle" ? next[i] ^ mask : operation === "rules" ? ruleMasks[i] : 0;
      if (value !== next[i]) { next[i] = value; count++; }
    });
    if (count) { push(game, noteMode); game.notes = next; }
    return count;
  }
  return { snapshot: snapshot, push: push, undo: undo, redo: redo, noteBatch: noteBatch, limit: LIMIT };
});
