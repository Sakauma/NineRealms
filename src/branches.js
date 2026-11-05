/* Isolated, bounded hypothesis workspaces. No answer or solver is consulted. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./drafts.js"));
  else root.NineRealmsBranches = factory(root.NineRealmsDrafts);
})(typeof globalThis !== "undefined" ? globalThis : this, function (Drafts) {
  "use strict";
  var LIMIT = 8, DEPTH = 4, HISTORY = 80;
  function fail(message) { throw new TypeError(message || "假设分支存档无效。"); }
  function keys(value, allowed) {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(function (k) { return allowed.indexOf(k) < 0; })) fail();
  }
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function frame(value, givens, clues) {
    keys(value, ["board", "notes", "draft", "selected", "noteMode"]);
    var n = givens.length;
    if (value.selected === undefined || value.noteMode === undefined) value = Object.assign({ selected: 0, noteMode: false }, value);
    if (!Array.isArray(value.board) || value.board.length !== n || !value.board.every(function (v, i) { return Number.isInteger(v) && v >= 0 && v <= 9 && (!givens[i] || v === givens[i]); }) ||
        !Array.isArray(value.notes) || value.notes.length !== n || !value.notes.every(function (m, i) { return Number.isInteger(m) && m >= 0 && m <= 511 && (!value.board[i] || !m); }) ||
        !Number.isInteger(value.selected) || value.selected < 0 || value.selected >= n || typeof value.noteMode !== "boolean") fail();
    return { board: value.board.slice(), notes: value.notes.slice(), draft: Drafts.clone(value.draft, n, clues), selected: value.selected, noteMode: value.noteMode };
  }
  function snapshot(value, noteMode) {
    return { board: value.board.slice(), notes: value.notes.slice(), draft: copy(value.draft), selected: value.selected, noteMode: noteMode === undefined ? Boolean(value.noteMode) : noteMode };
  }
  function workspace(value, noteMode) {
    var out = snapshot(value, noteMode);
    out.history = copy(value.history || []); out.redo = copy(value.redo || []); out.mistakes = value.mistakes;
    return out;
  }
  function validateWorkspace(value, givens, clues) {
    var f = { board: value.board, notes: value.notes, draft: value.draft, selected: value.selected, noteMode: value.noteMode };
    var out = frame(f, givens, clues);
    if (!Number.isInteger(value.mistakes) || value.mistakes < 0 || value.mistakes > 1e9) fail();
    out.mistakes = value.mistakes;
    ["history", "redo"].forEach(function (key) {
      var list = value[key] === undefined && key === "redo" ? [] : value[key];
      if (!Array.isArray(list) || list.length > HISTORY) fail();
      out[key] = list.map(function (f) { return frame(f, givens, clues); });
    });
    return out;
  }
  function validate(value, givens, clues) {
    if (value === null || value === undefined) return null;
    var common = ["board", "notes", "draft", "selected", "noteMode", "history", "redo", "mistakes"];
    keys(value, common.concat(["version", "activeId", "nextId", "nodes"]));
    var root = validateWorkspace(value, givens, clues);
    if (value.version === undefined) {
      if (value.nodes !== undefined || value.activeId !== undefined || value.nextId !== undefined) fail();
      return root;
    }
    if (value.version !== 2 || !Number.isInteger(value.nextId) || value.nextId < 2 || value.nextId > 1e9 ||
        !Array.isArray(value.nodes) || !value.nodes.length || value.nodes.length > LIMIT) fail();
    root.version = 2; root.activeId = value.activeId; root.nextId = value.nextId;
    var seen = new Map();
    root.nodes = value.nodes.map(function (node) {
      keys(node, ["id", "parentId", "label", "base", "state"]);
      if (typeof node.id !== "string" || !/^b[1-9][0-9]{0,8}$/.test(node.id) || Number(node.id.slice(1)) >= root.nextId || seen.has(node.id) ||
          node.parentId !== null && !seen.has(node.parentId) || typeof node.label !== "string" || !node.label.length || node.label.length > 32 || /[\u0000-\u001f]/.test(node.label)) fail();
      var depth = node.parentId === null ? 1 : seen.get(node.parentId) + 1;
      if (depth > DEPTH) fail(); seen.set(node.id, depth);
      keys(node.state, common);
      return { id: node.id, parentId: node.parentId, label: node.label, base: frame(node.base, givens, clues), state: validateWorkspace(node.state, givens, clues) };
    });
    if (root.activeId !== null && !seen.has(root.activeId)) fail();
    return root;
  }
  function active(root) { return Boolean(root && (root.version !== 2 || root.activeId !== null)); }
  function nodeById(root, id) { return root.nodes.find(function (node) { return node.id === id; }); }
  function base(game) {
    var root = game.branch;
    return !root ? null : root.version === 2 && root.activeId ? nodeById(root, root.activeId).base : root;
  }
  function same(a, b) { return JSON.stringify(a.board) === JSON.stringify(b.board) && JSON.stringify(a.notes) === JSON.stringify(b.notes) && Drafts.equal(a.draft, b.draft, a.board.length); }
  function matches(root, game) {
    if (!root || root.version !== 2) return true;
    var state = root.activeId === null ? root : nodeById(root, root.activeId).state;
    return same(state, game) && state.mistakes === game.mistakes && JSON.stringify(state.history) === JSON.stringify(game.history || []) && JSON.stringify(state.redo) === JSON.stringify(game.redo || []);
  }
  function ensure(game, noteMode) {
    if (!game.branch) {
      game.branch = workspace(game, noteMode); game.branch.version = 2; game.branch.nodes = []; game.branch.activeId = null; game.branch.nextId = 1;
    } else if (game.branch.version !== 2) {
      var main = validate(game.branch, game.givens, game.clues), state = workspace(game, noteMode);
      game.branch = Object.assign(main, { version: 2, activeId: "b1", nextId: 2,
        nodes: [{ id: "b1", parentId: null, label: "假设 1", base: snapshot(main), state: state }] });
    }
    return game.branch;
  }
  function sync(game, noteMode) {
    if (!game.branch || game.branch.version !== 2) return;
    var root = game.branch, state = workspace(game, noteMode);
    if (root.activeId === null) Object.assign(root, state);
    else nodeById(root, root.activeId).state = state;
  }
  function load(game, root, id) {
    root.activeId = id;
    var state = id === null ? root : nodeById(root, id).state;
    var next = workspace(state);
    ["board", "notes", "draft", "selected", "history", "redo", "mistakes"].forEach(function (key) { game[key] = next[key]; });
    return next.noteMode;
  }
  function depth(root, id) { var n = 0; while (id !== null) { n++; id = nodeById(root, id).parentId; } return n; }
  function begin(game, noteMode) {
    var root = ensure(game, noteMode); sync(game, noteMode);
    if (root.nodes.length >= LIMIT) fail("最多保留 8 个假设，请先丢弃不再需要的分支。");
    if (depth(root, root.activeId) >= DEPTH) fail("最多嵌套 4 层假设，可切换到上层再建立其他分支。");
    var id = "b" + root.nextId++, node = { id: id, parentId: root.activeId, label: "假设 " + id.slice(1), base: snapshot(game, noteMode), state: workspace(game, noteMode) };
    node.state.history = []; node.state.redo = [];
    root.nodes.push(node); return load(game, root, id);
  }
  function switchTo(game, id, noteMode) {
    var root = ensure(game, noteMode);
    if (id !== null && !nodeById(root, id)) fail("这个假设已不在当前棋局中。");
    sync(game, noteMode); return load(game, root, id);
  }
  function descendants(root, id) {
    var ids = new Set([id]); root.nodes.forEach(function (node) { if (ids.has(node.parentId)) ids.add(node.id); }); return ids;
  }
  function remove(game, root, id, parentId) {
    var ids = descendants(root, id); root.nodes = root.nodes.filter(function (node) { return !ids.has(node.id); });
    var noteMode = load(game, root, parentId);
    if (!root.nodes.length) game.branch = null;
    return noteMode;
  }
  function discard(game, noteMode) {
    var root = ensure(game, noteMode); if (root.activeId === null) fail("请先切换到要丢弃的假设。");
    sync(game, noteMode); var node = nodeById(root, root.activeId);
    return remove(game, root, node.id, node.parentId);
  }
  function adopt(game, noteMode) {
    var root = ensure(game, noteMode); if (root.activeId === null) fail("请先切换到要采纳的假设。");
    sync(game, noteMode); var node = nodeById(root, root.activeId), parent = node.parentId === null ? root : nodeById(root, node.parentId).state;
    if (!same(node.base, parent)) fail("上层棋盘已变动，不能覆盖；请切回上层核对，或丢弃这个分支。");
    var previous = snapshot(parent), changed = !same(parent, node.state);
    if (changed) { parent.history.push(previous); parent.history = parent.history.slice(-HISTORY); parent.redo = []; }
    Object.assign(parent, snapshot(node.state));
    return { noteMode: remove(game, root, node.id, node.parentId), main: node.parentId === null, before: previous, changed: changed };
  }
  function choices(game) {
    if (!game.branch) return [];
    var root = game.branch;
    if (root.version !== 2) return [{ id: "b1", label: "假设 1", depth: 1 }];
    return root.nodes.map(function (node) { return { id: node.id, label: node.label, depth: depth(root, node.id), parentId: node.parentId }; });
  }
  return { validate: validate, active: active, base: base, matches: matches, sync: sync, begin: begin, switchTo: switchTo, discard: discard, adopt: adopt, choices: choices,
    limits: { branches: LIMIT, depth: DEPTH, history: HISTORY } };
});
