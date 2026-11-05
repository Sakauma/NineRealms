/* Classic puzzle construction and bounded uniqueness checks; sharing is givens-only. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./engine.js"));
  else root.NineRealmsCustom = factory(root.SudokuEngine);
})(typeof globalThis !== "undefined" ? globalThis : this, function createCustom(Engine) {
  "use strict";
  function board(value) {
    if (!Array.isArray(value) || value.length !== 81 || Object.keys(value).length !== 81 || !Array.from(value).every(function (n) { return Number.isInteger(n) && n >= 0 && n <= 9; }))
      throw new TypeError("经典题面须包含 81 个 0～9 数字。");
    return value.slice();
  }
  function parse(text) {
    if (typeof text !== "string" || text.length > 2048 || /[^0-9.\s]/.test(text)) throw new TypeError("请使用 81 位数字，0 或 . 表示空格，可换行或加空格。");
    var compact = text.replace(/\s/g, "");
    if (compact.length !== 81) throw new TypeError("题面须恰好 81 格，当前为 " + compact.length + " 格。");
    return compact.split("").map(function (n) { return n === "." ? 0 : Number(n); });
  }
  function toText(givens) { var text = board(givens).map(function (n) { return n || "."; }).join(""); return text.match(/.{9}/g).join("\n"); }
  function validate(givens, options) {
    givens = board(givens); options = options || {};
    var conflicts = Engine.getConflicts(givens, "classic");
    if (conflicts.length) return { status: "conflict", count: 0, conflicts: conflicts, solution: null, message: "给定数字存在行、列或宫冲突，已标出相关格。" };
    var proof = Engine.analyzeSolutions(givens, "classic", { limit: 2, maxNodes: options.maxNodes === undefined ? 250000 : options.maxNodes, timeLimitMs: options.timeLimitMs === undefined ? 750 : options.timeLimitMs });
    if (proof.exhausted) return { status: "budget", count: proof.count, solution: null, message: "校验达到计算上限，尚不能判断解的数量；请补充线索后重试。" };
    if (!proof.count) return { status: "unsolvable", count: 0, solution: null, message: "题面无解，请检查给定数字。" };
    if (proof.count > 1) return { status: "multiple", count: 2, solution: null, message: "题面有多解，请补充给定数字。" };
    var playable = givens.some(function (n) { return !n; });
    return { status: "unique", count: 1, solution: proof.solution.slice(), playable: playable,
      message: playable ? "唯一解已验证，可以开局、收藏或分享题面。" : "唯一解，题面已填满；请留出空格后开局。" };
  }
  function puzzle(givens, proof) {
    givens = board(givens);
    if (!proof || proof.status !== "unique" || !proof.playable || !givens.some(function(n){return !n;}) || !Array.isArray(proof.solution) || !Engine.validateComplete(proof.solution, "classic") || !givens.every(function (v, i) { return !v || v === proof.solution[i]; }))
      throw new TypeError("请先完成当前题面的唯一解校验。");
    return { id: "CUSTOM-" + givens.join(""), mode: "classic", difficulty: "easy", clues: Engine.normalizeClues("classic"), givens: givens, solution: proof.solution.slice(), custom: true };
  }
  function createClient() {
    var active = null;
    function cancel() { if (active) active(); }
    function run(givens) {
      givens = board(givens); cancel();
      return new Promise(function (resolve, reject) {
        var worker, url, timer, settled = false;
        function finish(error, value) {
          if (settled) return; settled = true; clearTimeout(timer);
          if (worker) worker.terminate(); if (url) URL.revokeObjectURL(url); active = null;
          if (error) reject(error); else resolve(value);
        }
        active = function () { var error = new Error("校验已取消。"); error.name = "AbortError"; finish(error); };
        function fallback() {
          if (settled) return;
          clearTimeout(timer);
          if (worker) { worker.onmessage = worker.onerror = null; worker.terminate(); worker = null; }
          if (url) { URL.revokeObjectURL(url); url = null; }
          timer = setTimeout(function () { try { finish(null, validate(givens, { maxNodes: 20000, timeLimitMs: 40 })); } catch (error) { finish(error); } }, 0);
        }
        if (typeof Worker === "undefined" || !Engine.workerSource || typeof Blob === "undefined") { fallback(); return; }
        try {
          var source = Engine.workerSource() + "var custom=(" + createCustom.toString() + ")(SudokuEngine);self.onmessage=function(e){try{self.postMessage({result:custom.validate(e.data)});}catch(error){self.postMessage({error:error.message});}};";
          url = URL.createObjectURL(new Blob([source], { type: "text/javascript" })); worker = new Worker(url);
          worker.onmessage = function (event) { if (event.data.error) finish(new Error(event.data.error)); else finish(null, event.data.result); };
          worker.onerror = fallback;
          timer = setTimeout(function () { finish(new Error("后台校验超时，尚未判定解的数量；请重试。")); }, 4000);
          worker.postMessage(givens);
        } catch (error) { fallback(); }
      });
    }
    return { run: run, cancel: cancel };
  }
  return { parse: parse, toText: toText, validate: validate, puzzle: puzzle, createClient: createClient };
});
