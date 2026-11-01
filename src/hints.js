/* Nine Realms — progressive, evidence-based hints. No board mutations. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./engine.js"));
  else root.SudokuHints = factory(root.SudokuEngine);
})(typeof globalThis !== "undefined" ? globalThis : this, function (Engine) {
  "use strict";

  function isBoard(value, complete, length) {
    return Array.isArray(value) && value.length === length && value.every(function (n) {
      return Number.isInteger(n) && n >= (complete ? 1 : 0) && n <= 9;
    });
  }

  function ruleNames(mode) {
    if (mode === "diagonal") return "行、列、宫和所在对角线";
    if (mode === "hyper") return "行、列、宫和所在额外窗口";
    if (mode === "knight") return "行、列、宫及马步相隔格";
    return "行、列和宫";
  }

  function getStep(board, givens, solution, mode) {
    var context = mode || "classic";
    mode = typeof context === "string" ? context : context.mode;
    var count;
    try { count = Engine && Engine.getLayout ? Engine.getLayout(context).cellCount : 81; }
    catch (error) { return null; }
    function coordinate(index) {
      return Engine.getCellLabel ? Engine.getCellLabel(index, context) :
        "第 " + (Math.floor(index / 9) + 1) + " 行第 " + (index % 9 + 1) + " 列";
    }
    function step(kind, index, value, focusCells, title, observe, explanation) {
    return {
      kind: kind, index: index, value: value,
      focusCells: Array.from(new Set(focusCells)),
      title: title, observe: observe, explanation: explanation,
      answer: coordinate(index) + "应填入 " + value + "。点击“填入这一格”后才会修改棋盘。"
    };
  }


    if (!Engine || !Engine.getModes().some(function (item) { return item.id === mode; }) ||
        !isBoard(board, false, count) || !isBoard(givens, false, count) || !isBoard(solution, true, count) ||
        !Engine.validateComplete(solution, context)) return null;
    for (var i = 0; i < count; i++) {
      if (givens[i] && (board[i] !== givens[i] || solution[i] !== givens[i])) return null;
    }

    // Incorrect entries must be handled first: reasoning from a bad premise is misleading.
    for (var wrong = 0; wrong < count; wrong++) {
      if (!givens[wrong] && board[wrong] && board[wrong] !== solution[wrong]) {
        return step("correction", wrong, solution[wrong], [wrong], "核对一处已填数字",
          "先检查高亮格，看看这个已填数字是否需要重新考虑。",
          "系统对照本题唯一解，发现" + coordinate(wrong) + "的已填数字不一致。这是答案核对；你可以先擦除并自行推理，也可以继续查看正确数字。");
      }
    }

    var available = new Array(count), emptyCells = [];
    for (var cell = 0; cell < count; cell++) {
      if (board[cell]) continue;
      available[cell] = Engine.candidates(board, cell, context);
      emptyCells.push(cell);
      if (available[cell].length === 1) {
        var peers = Engine.getPeers(cell, context);
        var filled = peers.filter(function (peer) { return board[peer] !== 0; });
        var excluded = Array.from(new Set(filled.map(function (peer) { return board[peer]; }))).sort();
        if (["classic", "diagonal", "hyper", "knight"].indexOf(mode) < 0) {
          var related = typeof Engine.getRelatedCells === "function" ? Engine.getRelatedCells(cell, context) : peers;
          return step("rule-single", cell, available[cell][0], [cell].concat(related),
            "观察规则候选",
            "观察高亮格及相关线索，结合本题的附加规则筛选可填数字。",
            "按照本题全部规则检查候选后，" + coordinate(cell) + "只剩数字 " + available[cell][0] +
            "。这是规则候选的汇总结果，此提示不逐条展开每项约束的排除过程。");
        }
        return step("naked-single", cell, available[cell][0], [cell].concat(filled),
          "寻找单格唯一候选",
          "观察高亮空格，以及与它互相约束的已填格。逐一排除已出现的数字。",
          coordinate(cell) + "受" + ruleNames(mode) + "约束，排除已出现的 " + excluded.join("、") +
          " 后，候选只剩 " + available[cell][0] + "。");
      }
    }

    // Only real nine-cell units contain each digit once; knight links are peers, not units.
    var units = Engine.getUnits(context);
    for (var u = 0; u < units.length; u++) {
      var unit = units[u];
      if (!unit || !Array.isArray(unit.cells) || unit.cells.length !== 9) continue;
      for (var digit = 1; digit <= 9; digit++) {
        var places = unit.cells.filter(function (index) {
          return available[index] && available[index].indexOf(digit) >= 0;
        });
        if (places.length === 1) {
          return step("hidden-single", places[0], digit, unit.cells, "寻找区域唯一位置",
            "观察高亮区域：其中有一个数字，只能落在一个空格。检查每个空格受到的约束。",
            unit.label + "是一个必须包含数字 1～9 的九格区域。结合本题全部规则检查各空格后，数字 " +
            digit + " 只在" + coordinate(places[0]) + "的候选中出现，因此可以确定这一格。");
        }
      }
    }

    if (!emptyCells.length) return null;
    var best = emptyCells.reduce(function (selected, index) {
      return available[index].length < available[selected].length ? index : selected;
    }, emptyCells[0]);
    return step("solution", best, solution[best], [best], "需要更深入的推理",
      "可以从高亮格的候选关系继续探索；当前没有找到基础逻辑步骤。",
      "当前没有找到单格唯一候选或区域唯一位置。这里可能需要更深入的候选排除或分支推理；下一步会直接展示本题答案，作为求解辅助。");
  }

  return { getStep: getStep };
});
