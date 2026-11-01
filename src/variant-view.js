/* Nine Realms — immutable puzzle clues rendered above cell backgrounds, below digits. */
(function (root) {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var cache = new WeakMap();
  var lastResult = null;
  var NAMES = { thermo: "温度计", arrow: "箭头", renban: "连续线", whispers: "低语线",
    palindrome: "回文线", between: "之间线", lockout: "锁定线", entropic: "熵线",
    modular: "模三线", "region-sum": "区域和线" };
  var LINE_RULES = { thermo: "从球端起严格递增", arrow: "圆圈数字等于箭杆数字之和",
    renban: "线上数字组成一组不重复的连续整数", whispers: "相邻数字之差至少为 5",
    palindrome: "沿线两端对应数字相同", between: "中间数字严格处于两端数字之间",
    lockout: "两端相差至少 4，中间数字处于两端范围之外",
    entropic: "每连续三格分别包含低、中、高三组数字", modular: "每连续三格模 3 的余数各不相同",
    "region-sum": "线在每个经过区域内的数字之和相同" };
  function point(cell) { return { x: cell % 9 * 100 + 50, y: Math.floor(cell / 9) * 100 + 50 }; }
  function add(tag, attrs, parent) {
    var node = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, String(attrs[key])); });
    if (parent) parent.appendChild(node);
    return node;
  }
  function pathData(cells) {
    return cells.map(function (cell, i) { var p = point(cell); return (i ? "L" : "M") + p.x + " " + p.y; }).join(" ");
  }
  function label(parent, x, y, value, attrs) {
    var node = add("text", Object.assign({ x: x, y: y, fill: "var(--text)", "font-family": "Segoe UI, sans-serif",
      "font-size": 25, "font-weight": 600, "dominant-baseline": "middle",
      "paint-order": "stroke", stroke: "var(--cell-bg)", "stroke-width": 6, "stroke-linejoin": "round" }, attrs), parent);
    node.textContent = String(value);
    return node;
  }
  function outline(parent, cells, inset, attrs) {
    var set = new Set(cells), d = [];
    cells.forEach(function (cell) {
      var row = Math.floor(cell / 9), col = cell % 9, x = col * 100, y = row * 100;
      var top = row > 0 && set.has(cell - 9), bottom = row < 8 && set.has(cell + 9);
      var left = col > 0 && set.has(cell - 1), right = col < 8 && set.has(cell + 1);
      var x1 = x + (left ? 0 : inset), x2 = x + 100 - (right ? 0 : inset);
      var y1 = y + (top ? 0 : inset), y2 = y + 100 - (bottom ? 0 : inset);
      if (!top) d.push("M" + x1 + " " + (y + inset) + "H" + x2);
      if (!bottom) d.push("M" + x1 + " " + (y + 100 - inset) + "H" + x2);
      if (!left) d.push("M" + (x + inset) + " " + y1 + "V" + y2);
      if (!right) d.push("M" + (x + 100 - inset) + " " + y1 + "V" + y2);
    });
    return add("path", Object.assign({ d: d.join(" "), fill: "none", stroke: "var(--accent)",
      "stroke-width": 1.3, "vector-effect": "non-scaling-stroke", "stroke-linejoin": "round" }, attrs), parent);
  }
  function arrowHead(parent, x, y, dx, dy, color, size) {
    var length = Math.hypot(dx, dy) || 1, ux = dx / length, uy = dy / length;
    var backX = x - ux * size, backY = y - uy * size;
    return add("path", { d: "M" + (backX - uy * size * .5) + " " + (backY + ux * size * .5) +
      "L" + x + " " + y + "L" + (backX + uy * size * .5) + " " + (backY - ux * size * .5),
      fill: "none", stroke: color, "stroke-width": 4, "stroke-linecap": "round", "stroke-linejoin": "round" }, parent);
  }
  // Keep coincident arrow shafts in separate lanes without changing which cells they visit.
  function arrowLayouts(clueLines) {
    var arrows = clueLines.filter(function (line) { return line.type === "arrow"; });
    var layouts = new Map(), bulbs = new Map(), placed = [];
    var lanes = [{ x: 0, y: 0 }];
    [-20, -10, 0, 10, 20].forEach(function (x) {
      [-20, -10, 0, 10, 20].forEach(function (y) {
        if ((x || y) && Math.hypot(x, y) <= 24) lanes.push({ x: x, y: y });
      });
    });
    arrows.forEach(function (line, index) {
      var segments = new Map();
      for (var i = 1; i < line.cells.length; i++) {
        var a = line.cells[i - 1], b = line.cells[i], pa = point(a), pb = point(b);
        var length = Math.hypot(pb.x - pa.x, pb.y - pa.y);
        segments.set(Math.min(a, b) + ":" + Math.max(a, b),
          { x: (pb.x - pa.x) / length, y: (pb.y - pa.y) / length });
      }
      var overlaps = [];
      placed.forEach(function (other) {
        segments.forEach(function (direction, key) {
          if (other.segments.has(key)) overlaps.push({ lane: other.lane, direction: direction });
        });
      });
      var lane = lanes[0], best = -Infinity;
      if (overlaps.length) lanes.forEach(function (candidate) {
        var gap = Math.min.apply(null, overlaps.map(function (overlap) {
          return Math.abs((candidate.x - overlap.lane.x) * overlap.direction.y -
            (candidate.y - overlap.lane.y) * overlap.direction.x);
        }));
        var score = Math.min(14, gap) - Math.hypot(candidate.x, candidate.y) * .025;
        if (score > best) { best = score; lane = candidate; }
      });
      var points = line.cells.map(function (cell, i) {
        var p = point(cell);
        return { x: p.x + (i ? lane.x : 0), y: p.y + (i ? lane.y : 0) };
      });
      // The text-color mix adapts the same deterministic hues to light and dark themes.
      var color = "color-mix(in srgb,hsl(" + ((198 + index * 137.508) % 360).toFixed(2) +
        " 66% 56%) 76%,var(--text))";
      var layout = { line: line, index: index, points: points, color: color, lane: lane, segments: segments };
      layouts.set(line, layout);
      placed.push(layout);
      if (!bulbs.has(line.cells[0])) bulbs.set(line.cells[0], []);
      bulbs.get(line.cells[0]).push(layout);
    });
    bulbs.forEach(function (group) {
      group.forEach(function (layout, index) {
        layout.radius = 29 + (group.length > 1 ? index * Math.min(6, 12 / (group.length - 1)) : 0);
        layout.sharedBulb = group.length > 1;
      });
    });
    return { layouts: layouts, bulbs: bulbs };
  }
  function render(svg, context) {
    if (!svg) return { legend: "", cellDescriptions: Array(81).fill(""), hasOutside: false, replacesBoxes: false };
    context = typeof context === "string" ? { mode: context } : context || { mode: "classic" };
    var engine = root.SudokuEngine;
    var clues = engine && engine.normalizeClues ? engine.normalizeClues(context.mode, context.clues) : context.clues || {};
    var key = context.mode + ":" + JSON.stringify(clues);
    var existing = cache.get(svg);
    if (existing && existing.key === key) { lastResult = existing.result; return existing.result; }
    svg.replaceChildren();
    svg.setAttribute("viewBox", "0 0 900 900");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.style.pointerEvents = "none";
    svg.style.overflow = "visible";
    var descriptions = Array.from({ length: 81 }, function () { return []; });
    var legends = new Set();
    function describe(cells, value) {
      cells.forEach(function (cell) {
        if (descriptions[cell] && descriptions[cell].indexOf(value) < 0) descriptions[cell].push(value);
      });
    }
    var under = add("g", { "data-layer": "areas" }, svg);
    var lines = add("g", { "data-layer": "lines" }, svg);
    var endpoints = add("g", { "data-layer": "line-endpoints" }, svg);
    var marks = add("g", { "data-layer": "marks" }, svg);
    if (Array.isArray(clues.regions) && clues.regions.length === 81) {
      for (var region = 0; region < 9; region++) {
        var cells = [];
        clues.regions.forEach(function (value, index) { if (value === region) cells.push(index); });
        outline(under, cells, 0, { stroke: "var(--grid-strong)", "stroke-width": 2.2 });
        describe(cells, "不规则第 " + (region + 1) + " 宫，数字 1～9 各一次");
      }
      legends.add("粗线围成不规则宫");
    }
    (clues.parity || []).forEach(function (clue) {
      var p = point(clue.cell), even = clue.parity === "even";
      add(even ? "rect" : "circle", even ? { x: p.x - 29, y: p.y - 29, width: 58, height: 58, rx: 4,
        fill: "var(--accent)", opacity: .15 } : { cx: p.x, cy: p.y, r: 30, fill: "var(--accent)", opacity: .15 }, under);
      describe([clue.cell], even ? "方形偶数格，只能填 2、4、6、8" : "圆形奇数格，只能填 1、3、5、7、9");
      legends.add("圆形奇数 / 方形偶数");
    });
    (clues.clones || []).forEach(function (clone, index) {
      var name = String.fromCharCode(65 + index % 26);
      [clone.a, clone.b].forEach(function (cells, pair) {
        cells.forEach(function (cell) {
          var p = point(cell);
          add("rect", { x: p.x - 48, y: p.y - 48, width: 96, height: 96, fill: "var(--branch)", opacity: .08 }, under);
        });
        outline(under, cells, 6, { stroke: "var(--branch)", "stroke-dasharray": "5 3" });
        var first = Math.min.apply(null, cells), p = point(first);
        label(marks, p.x - 35, p.y - 29, name + (pair ? "′" : ""), { fill: "var(--branch)", "font-size": 23 });
      });
      clone.a.forEach(function (cell, i) {
        describe([cell], "克隆组 " + name + "，与第 " + (Math.floor(clone.b[i] / 9) + 1) + " 行第 " + (clone.b[i] % 9 + 1) + " 列数字相同");
        describe([clone.b[i]], "克隆组 " + name + " 的对应格");
      });
      legends.add("同字母区域对应数字相同");
    });
    (clues.cages || []).forEach(function (cage) {
      outline(marks, cage.cells, 6, { "stroke-dasharray": "4 3", stroke: "var(--muted)", "stroke-width": 1.2 });
      var p = point(Math.min.apply(null, cage.cells));
      label(marks, p.x - 34, p.y - 29, cage.sum, { "font-size": 24, fill: "var(--text)" });
      describe(cage.cells, "虚线笼内数字和为 " + cage.sum + (cage.unique ? "，数字不重复" : ""));
      legends.add("笼角数字为笼内总和");
    });
    var clueLines = clues.lines || [], arrowInfo = arrowLayouts(clueLines), endpointDraws = [];
    clueLines.forEach(function (line) {
      var cells = line.cells, type = line.type, first = point(cells[0]), last = point(cells[cells.length - 1]);
      var arrow = arrowInfo.layouts.get(line);
      var color = arrow ? arrow.color : type === "renban" || type === "palindrome" ? "var(--branch)" :
        type === "whispers" ? "var(--accent-strong)" : type === "thermo" ? "var(--muted)" : "var(--accent-two)";
      var d = arrow ? arrow.points.map(function (p, i) { return (i ? "L" : "M") + p.x + " " + p.y; }).join(" ") :
        pathData(cells);
      var attrs = { d: d, fill: "none", stroke: color,
        "stroke-width": type === "thermo" ? 16 : type === "renban" ? 12 : arrow ? 6 : 7,
        opacity: type === "thermo" || type === "renban" ? .42 : arrow ? .95 : .8,
        "stroke-linecap": "round", "stroke-linejoin": "round" };
      if (type === "entropic") attrs["stroke-dasharray"] = "15 8";
      if (type === "modular") attrs["stroke-dasharray"] = "5 8";
      if (arrow) add("path", Object.assign({}, attrs, {
        stroke: "var(--cell-bg)", "stroke-width": 11, opacity: 1, "data-arrow-underlay": arrow.index
      }), lines);
      add("path", Object.assign({}, attrs, arrow ? { "data-arrow-path": arrow.index } : {}), lines);
      if (type === "thermo") endpointDraws.push(function () {
        add("circle", { cx: first.x, cy: first.y, r: 29, fill: color, opacity: .42 }, endpoints);
      });
      if (arrow) {
        endpointDraws.push(function () {
          add("circle", { cx: first.x, cy: first.y, r: arrow.radius, fill: "none", stroke: color,
            "stroke-width": arrow.sharedBulb ? 3.5 : 5, "data-arrow-circle": arrow.index }, endpoints);
        });
        describe(cells, "第 " + (arrow.index + 1) + " 根箭头：圆圈在第 " +
          (Math.floor(cells[0] / 9) + 1) + " 行第 " + (cells[0] % 9 + 1) +
          " 列；箭杆依次经过 " + cells.slice(1).map(function (cell) {
            return (Math.floor(cell / 9) + 1) + " 行 " + (cell % 9 + 1) + " 列";
          }).join("、") + "；" + LINE_RULES.arrow);
      }
      if (type === "between" || type === "lockout") endpointDraws.push(function () {
        [first, last].forEach(function (p) {
          if (type === "between") add("circle", { cx: p.x, cy: p.y, r: 26, fill: "var(--cell-bg)", stroke: color, "stroke-width": 5 }, endpoints);
          else add("path", { d: "M" + p.x + " " + (p.y - 29) + "L" + (p.x + 29) + " " + p.y + "L" +
            p.x + " " + (p.y + 29) + "L" + (p.x - 29) + " " + p.y + "Z",
            fill: "var(--cell-bg)", stroke: color, "stroke-width": 5 }, endpoints);
        });
      });
      if (!arrow) describe(cells, (NAMES[type] || type) + "：" + (LINE_RULES[type] || "按本题线索规则"));
      legends.add(NAMES[type] || type);
    });
    // Mask shafts once per bulb, then draw every ring and arrowhead above every shaft.
    arrowInfo.bulbs.forEach(function (group, cell) {
      var p = point(cell), radius = group[group.length - 1].radius;
      add("circle", { cx: p.x, cy: p.y, r: radius, fill: "var(--cell-bg)" }, endpoints);
    });
    endpointDraws.forEach(function (draw) { draw(); });
    arrowInfo.layouts.forEach(function (arrow) {
      var last = arrow.points[arrow.points.length - 1], previous = arrow.points[arrow.points.length - 2];
      arrowHead(endpoints, last.x, last.y, last.x - previous.x, last.y - previous.y, arrow.color, 19);
    });
    if (arrowInfo.layouts.size) {
      legends.add("颜色仅辅助追踪；交叉处不连接；同心圈共用同一数字，各箭杆分别求和");
    }
    (clues.edges || []).forEach(function (edge) {
      var a = point(edge.cells[0]), b = point(edge.cells[1]), x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
      var description;
      if (edge.type === "kropki-white" || edge.type === "kropki-black") {
        var black = edge.type === "kropki-black";
        add("circle", { cx: x, cy: y, r: 11, fill: black ? "var(--text)" : "var(--cell-bg)",
          stroke: "var(--text)", "stroke-width": 2, "vector-effect": "non-scaling-stroke" }, marks);
        description = black ? "黑点两侧数字之比为 2" : "白点两侧数字相差 1";
        legends.add("白点差 1 / 黑点比 2");
      } else if (edge.type === "xv") {
        add("rect", { x: x - 17, y: y - 20, width: 34, height: 40, rx: 6, fill: "var(--cell-bg)" }, marks);
        label(marks, x, y + 1, edge.value === 10 ? "X" : "V", { "text-anchor": "middle", "font-size": 29 });
        description = "标记两侧数字和为 " + edge.value;
        legends.add("X 和为 10 / V 和为 5");
      } else if (edge.type === "greater") {
        var dx = (b.x - a.x) / 100, dy = (b.y - a.y) / 100;
        add("circle", { cx: x, cy: y, r: 20, fill: "var(--cell-bg)" }, marks);
        add("path", { d: "M" + (x - dx * 11 - dy * 13) + " " + (y - dy * 11 + dx * 13) +
          "L" + (x + dx * 11) + " " + (y + dy * 11) +
          "L" + (x - dx * 11 + dy * 13) + " " + (y - dy * 11 - dx * 13),
          fill: "none", stroke: "var(--text)", "stroke-width": 4, "stroke-linecap": "round", "stroke-linejoin": "round" }, marks);
        description = "不等号开口一侧数字较大";
        legends.add("不等号开口朝较大数字");
      }
      if (description) describe(edge.cells, description);
    });
    (clues.quadruples || []).forEach(function (quad) {
      var row = Math.min.apply(null, quad.cells.map(function (cell) { return Math.floor(cell / 9); }));
      var col = Math.min.apply(null, quad.cells.map(function (cell) { return cell % 9; }));
      var x = (col + 1) * 100, y = (row + 1) * 100;
      add("circle", { cx: x, cy: y, r: 29, fill: "var(--cell-bg)", stroke: "var(--muted)", "stroke-width": 3 }, marks);
      quad.values.forEach(function (value, i) {
        var dx = quad.values.length === 1 ? 0 : (i % 2 ? 11 : -11);
        var dy = quad.values.length <= 2 ? 0 : (i < 2 ? -11 : 11);
        label(marks, x + dx, y + dy, value, { "font-size": 22, "text-anchor": "middle", "stroke-width": 2 });
      });
      describe(quad.cells, "交点四格必须包含 " + quad.values.join("、"));
      legends.add("交点圆内数字必须出现于周围四格");
    });
    (clues.outside || []).forEach(function (clue) {
      var x, y;
      if (clue.side === "top") { x = clue.index * 100 + 50; y = -25; }
      else if (clue.side === "bottom") { x = clue.index * 100 + 50; y = 925; }
      else if (clue.side === "left") { x = -25; y = clue.index * 100 + 50; }
      else { x = 925; y = clue.index * 100 + 50; }
      var desc = clue.type === "sandwich" ? "1 与 9 之间数字之和为 " + clue.value :
        clue.type === "skyscraper" ? "从这一侧看到 " + clue.value + " 栋楼" :
        clue.type === "xsum" ? "首格为 X，前 X 格数字之和为 " + clue.value :
        "箭头指向的斜线数字之和为 " + clue.value;
      label(marks, x, y, clue.value, { "font-size": 29, "text-anchor": "middle", fill: "var(--accent)", "stroke-width": 5 });
      if (clue.type === "littlekiller" && clue.cells.length > 1) {
        var start = point(clue.cells[0]), next = point(clue.cells[1]);
        var dx = next.x - start.x, dy = next.y - start.y, length = Math.hypot(dx, dy) || 1;
        var ux = dx / length, uy = dy / length;
        var tipX = start.x - ux * 34, tipY = start.y - uy * 34;
        add("path", { d: "M" + (tipX - ux * 22) + " " + (tipY - uy * 22) + "L" + tipX + " " + tipY,
          fill: "none", stroke: "var(--accent)", "stroke-width": 3.5 }, marks);
        arrowHead(marks, tipX, tipY, dx, dy, "var(--accent)", 12);
      }
      describe(clue.cells, desc);
      legends.add(clue.type === "sandwich" ? "外围夹心和值" : clue.type === "skyscraper" ? "外围楼高数量" :
        clue.type === "xsum" ? "外围 X 和" : "外围斜线和值");
    });
    var result = { legend: Array.from(legends).join(" · "),
      cellDescriptions: descriptions.map(function (items) { return items.join("；"); }),
      hasOutside: Boolean(clues.outside && clues.outside.length),
      replacesBoxes: context.mode === "jigsaw" };
    svg.dataset.hasOutside = String(result.hasOutside);
    cache.set(svg, { key: key, result: result });
    lastResult = result;
    return result;
  }
  function getCellLabel(index) {
    return lastResult && lastResult.cellDescriptions[index] || "";
  }
  root.SudokuVariantView = { render: render, getCellLabel: getCellLabel };
})(typeof globalThis !== "undefined" ? globalThis : this);
