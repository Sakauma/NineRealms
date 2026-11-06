/* Small rule examples, shown only inside the rules dialog. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.NineRealmsRuleExamples = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  var examples = {
    thermo: { kind: "thermo", title: "从球端开始，严格递增", cells: [0, 1, 2],
      clues: { lines: [{ type: "thermo", cells: [0, 1, 2] }] },
      correct: [2, 4, 7], wrong: [2, 7, 4], good: "2 < 4 < 7，可以跳过数字。", bad: "7 到 4 变小了，不能成立。" },
    arrow: { kind: "arrow", title: "圆圈数字 = 箭身数字之和", cells: [0, 1, 2],
      clues: { lines: [{ type: "arrow", cells: [0, 1, 2] }] },
      correct: [7, 2, 5], wrong: [8, 2, 5], good: "圆圈 7 = 箭身 2 + 5。", bad: "2 + 5 = 7，与圆圈 8 不符。" },
    renban: { kind: "line", title: "数字连续，沿线不必递增", cells: [0, 1, 2],
      clues: { lines: [{ type: "renban", cells: [0, 1, 2] }] },
      correct: [4, 2, 3], wrong: [2, 4, 6], good: "2、3、4 连续，次序可以不同。", bad: "2、4、6 之间有缺数。" },
    whispers: { kind: "line", title: "沿线相邻两数相差至少 5", cells: [0, 1, 2],
      clues: { lines: [{ type: "whispers", cells: [0, 1, 2] }] },
      correct: [1, 7, 2], wrong: [1, 6, 3], good: "相邻差值分别为 6 和 5。", bad: "6 与 3 只相差 3。" }
  };
  function get(mode) {
    var source = examples[mode === "thermo-killer" ? "thermo" : mode];
    if (!source) return null;
    var result = JSON.parse(JSON.stringify(source));
    result.mode = mode;
    result.note = mode === "thermo-killer" ? "这里仅演示温度计；温笼合流还须满足笼内总和与不重复规则。" :
      mode === "arrow" ? "圆圈不计入箭身。箭身不额外要求互不重复，仍须遵守行、列、宫及其他标记。" :
      "这里仅演示线条规则；完整棋盘仍须满足行、列、宫及其他标记。";
    return result;
  }
  function render(target, mode) {
    var example = get(mode), doc = target.ownerDocument;
    target.replaceChildren();
    if (!example) return false;
    var title = doc.createElement("p"); title.className = "rule-example-title"; title.textContent = example.title; target.appendChild(title);
    var pair = doc.createElement("div"); pair.className = "rule-example-pair"; target.appendChild(pair);
    [true, false].forEach(function (correct) {
      var values = correct ? example.correct : example.wrong, figure = doc.createElement("figure");
      function svgNode(tag, attrs) {
        var node = doc.createElementNS("http://www.w3.org/2000/svg", tag);
        Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
        return node;
      }
      var isArrow = example.kind === "arrow", hasOrigin = isArrow || example.kind === "thermo";
      var strokeWidth = isArrow ? 2.5 : 7, originStrokeWidth = isArrow ? 2 : 4, originRadius = 28;
      var digitRadius = 9, clearance = 10, segmentLength = 30;
      var radii = [hasOrigin ? originRadius + originStrokeWidth / 2 : digitRadius, digitRadius, digitRadius];
      // Lay out the shapes from their edges: equal visible line lengths and
      // gaps, with extra room for the circle instead of shortening its line.
      var width = 2 * (radii[0] + radii[1] + radii[2]) + 2 * segmentLength + 4 * clearance;
      if (isArrow) width += clearance + segmentLength;
      var positions = [(248 - width) / 2 + radii[0]];
      for (var i = 1; i < radii.length; i++) positions.push(positions[i - 1] + radii[i - 1] + 2 * clearance + segmentLength + radii[i]);
      var description = hasOrigin ? (isArrow ? "圆圈 " : "球端 ") + values[0] + "，后续依次为 " + values.slice(1).join("、") : "沿线依次为 " + values.join("、");
      var svg = svgNode("svg", { viewBox: "0 0 248 76", role: "img", "aria-label": (correct ? "正确" : "错误") + "示例：" + description });
      var ink = svgNode("g", { "class": "rule-example-ink", fill: "none", stroke: "currentColor", "stroke-linecap": "round", "stroke-linejoin": "round", opacity: ".6" });
      svg.appendChild(ink);
      function segment(left, extraClass) {
        // Round caps contribute to visible length, so inset both path ends.
        ink.appendChild(svgNode("path", {
          "class": "rule-example-stroke rule-example-connector" + (extraClass ? " " + extraClass : ""),
          d: "M " + (left + strokeWidth / 2) + " 38 H " + (left + segmentLength - strokeWidth / 2), "stroke-width": String(strokeWidth)
        }));
      }
      for (var j = 0; j < positions.length - 1; j++) segment(positions[j] + radii[j] + clearance);
      if (isArrow) {
        var tailStart = positions[2] + digitRadius + clearance, tip = tailStart + segmentLength - strokeWidth / 2;
        segment(tailStart, "rule-example-arrow-tail");
        ink.appendChild(svgNode("path", {
          "class": "rule-example-stroke rule-example-arrowhead",
          d: "M " + (tip - 8) + " 31 L " + tip + " 38 L " + (tip - 8) + " 45", "stroke-width": String(strokeWidth)
        }));
      }
      if (hasOrigin) ink.appendChild(svgNode("circle", {
        "class": "rule-example-origin", cx: String(positions[0]), cy: "38", r: String(originRadius), "stroke-width": String(originStrokeWidth)
      }));
      values.forEach(function (value, i) {
        var text = svgNode("text", { "class": "rule-example-digit", x: String(positions[i]), y: "39", "text-anchor": "middle", "dominant-baseline": "middle" });
        text.textContent = String(value); svg.appendChild(text);
      });
      var caption = doc.createElement("figcaption"), label = doc.createElement("strong");
      label.textContent = correct ? "✓ 正确" : "× 错误";
      caption.appendChild(label); figure.appendChild(caption);
      figure.appendChild(svg);
      var explanation = doc.createElement("p"); explanation.className = "rule-example-explanation";
      explanation.textContent = correct ? example.good : example.bad;
      figure.appendChild(explanation); pair.appendChild(figure);
    });
    var note = doc.createElement("p"); note.className = "rule-example-note"; note.textContent = example.note; target.appendChild(note);
    return true;
  }
  return { get: get, render: render };
});
