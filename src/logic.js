/* Rule-only observations. This module deliberately has no solution parameter. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./engine.js"));
  else root.NineRealmsLogic = factory(root.SudokuEngine);
})(typeof globalThis !== "undefined" ? globalThis : this, function (Engine) {
  "use strict";
  // Each entry is backed by local constraints and a full-board rule predicate.
  // Unknown future families still fall back to an explicitly partial check.
  var FIELDS = { jigsaw:["regions"], killer:["cages"], thermo:["lines"], arrow:["lines"], "thermo-killer":["lines","cages"],
    "odd-even":["parity"], kropki:["edges"], xv:["edges"], greater:["edges"],
    renban:["lines"], whispers:["lines"], palindrome:["lines"], between:["lines"], lockout:["lines"], entropic:["lines"], modular:["lines"], "region-sum":["lines"],
    sandwich:["outside"], skyscraper:["outside"], xsum:["outside"], littlekiller:["outside"], clone:["clones"], quadruple:["quadruples"] };
  var SUPPORTED = ["classic", "diagonal", "hyper", "knight", "king", "nonconsecutive", "miracle", "disjoint", "jigsaw", "twin", "samurai", "killer", "thermo", "arrow", "thermo-killer",
    "odd-even","palindrome","greater","kropki","xv","renban","whispers","between","lockout","entropic","modular","region-sum","sandwich","skyscraper","xsum","littlekiller","clone","quadruple"];
  function scope(context) {
    context = typeof context === "string" ? { mode: context } : context || { mode: "classic" };
    var mode = context.mode || "classic", clues = Engine.normalizeClues(mode, context.clues);
    var fields = FIELDS[mode] || [];
    var complete = SUPPORTED.indexOf(mode) >= 0 && Object.keys(clues).every(function (key) {
      return key === "version" || fields.indexOf(key) >= 0 || !clues[key].length;
    });
    var info = Engine.getModes().find(function (m) { return m.id === mode; });
    return {
      complete: complete,
      context: complete ? { mode: mode, clues: clues } : { mode: "classic" },
      message: complete ? "仅按本题规则检查；无冲突不代表已证明正确。" :
        "仅检查行列宫；" + (info ? info.label : mode) + "的附加规则暂未检查，不能据此判定完成。"
    };
  }
  function conflicts(board, context) { return Engine.getConflicts(board, scope(context).context); }
  function masks(board, context) {
    var checked = scope(context).context;
    return board.map(function (value, index) {
      return value ? 0 : Engine.candidates(board, index, checked).reduce(function (mask, digit) { return mask | (1 << (digit - 1)); }, 0);
    });
  }
  function complete(board, context) {
    var checked = scope(context);
    return checked.complete && board.every(Boolean) && Engine.validateComplete(board, checked.context);
  }
  function lens(board, notes, digit, source, context) {
    if (!Number.isInteger(digit) || digit < 1 || digit > 9 || ["notes", "rules"].indexOf(source) < 0)
      throw new TypeError("无效的候选透镜设置。");
    if (!Array.isArray(notes) || notes.length !== board.length || !notes.every(function (m) { return Number.isInteger(m) && m >= 0 && m <= 511; }))
      throw new TypeError("候选笔记格式无效。");
    var values = source === "rules" ? masks(board, context) : notes, bit = 1 << (digit - 1), indices = [];
    board.forEach(function (value, i) { if (!value && (values[i] & bit)) indices.push(i); });
    return { indices: indices, scope: scope(context), source: source };
  }
  return { scope: scope, conflicts: conflicts, masks: masks, lens: lens, complete: complete, supported: SUPPORTED.slice() };
});
