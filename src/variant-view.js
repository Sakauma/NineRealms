/* Nine Realms — immutable puzzle clues rendered above cell backgrounds, below digits. */
(function (root) {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var cache = new WeakMap();
  var materialIds = new WeakMap(), nextMaterialId = 0;
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
  // Definitions belong to this SVG, not the document. A replay and the live board
  // can coexist, and theme changes flow through CSS without rebuilding clue data.
  function materials(svg, clueLines) {
    var prefix = materialIds.get(svg);
    if (!prefix) { prefix = "variant-material-" + (++nextMaterialId); materialIds.set(svg, prefix); }
    var defs = add("defs", { "data-variant-materials": prefix }, svg), paints = {};
    clueLines.forEach(function (line) {
      var type = line.type;
      if (type === "arrow" || !NAMES[type] || paints[type]) return;
      var solid = "var(--clue-" + (type === "thermo" ? "thermo-fill" : type) + ")";
      var id = prefix + "-" + type;
      var gradient = add("linearGradient", { id: id, gradientUnits: "userSpaceOnUse",
        x1: 0, y1: 0, x2: 675, y2: 900 }, defs);
      ["start", "mid", "end"].forEach(function (stop, index) {
        add("stop", { offset: index / 2,
          "stop-color": "var(--clue-" + type + "-glass-" + stop + "," + solid + ")" }, gradient);
      });
      paints[type] = { color: "url(#" + id + ") " + solid, solid: solid };
    });
    var filterId = prefix + "-thermo-frost";
    if (paints.thermo) {
      // One small lighting/grain pass on the combined family silhouette: no bulb
      // seam, per-path edge glints, duplicate translucent pipes or moving texture.
      var filter = add("filter", { id: filterId, x: "-2%", y: "-2%", width: "104%", height: "104%",
        "color-interpolation-filters": "sRGB" }, defs);
      add("feGaussianBlur", { in: "SourceAlpha", stdDeviation: 1.1, result: "bump" }, filter);
      var shine = add("feSpecularLighting", { in: "bump", surfaceScale: 3, specularConstant: .16,
        specularExponent: 18, "lighting-color": "var(--clue-glass-light,#d9eafa)", result: "shine" }, filter);
      add("feDistantLight", { azimuth: 225, elevation: 45 }, shine);
      add("feComposite", { in: "shine", in2: "SourceAlpha", operator: "in", result: "lit" }, filter);
      add("feTurbulence", { type: "fractalNoise", baseFrequency: .65, numOctaves: 2, seed: 17, result: "grain" }, filter);
      add("feColorMatrix", { in: "grain", type: "saturate", values: 0, result: "gray-grain" }, filter);
      var transfer = add("feComponentTransfer", { in: "gray-grain", result: "faint-grain" }, filter);
      add("feFuncA", { type: "linear", slope: .025 }, transfer);
      add("feComposite", { in: "faint-grain", in2: "SourceAlpha", operator: "in", result: "clipped-grain" }, filter);
      add("feBlend", { in: "clipped-grain", in2: "SourceGraphic", mode: "soft-light", result: "body" }, filter);
      add("feComposite", { in: "lit", in2: "body", operator: "arithmetic", k2: 1, k3: 1, result: "frost" }, filter);
      add("feComposite", { in: "frost", in2: "SourceAlpha", operator: "in" }, filter);
    }
    return { paints: paints, filter: "url(#" + filterId + ")", defs: defs, prefix: prefix };
  }
  // A small, cell-local corner cut softens turns without inventing a new route.
  // The quadratic control is the original cell point; first/last points stay exact.
  function pathData(points) {
    function xy(p) { return +p.x.toFixed(3) + " " + +p.y.toFixed(3); }
    if (!points.length) return "";
    var d = ["M" + xy(points[0])];
    for (var i = 1; i < points.length - 1; i++) {
      var before = points[i - 1], p = points[i], after = points[i + 1];
      var ax = p.x - before.x, ay = p.y - before.y, bx = after.x - p.x, by = after.y - p.y;
      var incoming = Math.hypot(ax, ay), outgoing = Math.hypot(bx, by);
      // Collinear points and reversals must keep their original geometry.
      if (!incoming || !outgoing || Math.abs(ax * by - ay * bx) < .001) {
        d.push("L" + xy(p));
        continue;
      }
      var cut = Math.min(14, incoming / 4, outgoing / 4);
      var entry = { x: p.x - ax / incoming * cut, y: p.y - ay / incoming * cut };
      var exit = { x: p.x + bx / outgoing * cut, y: p.y + by / outgoing * cut };
      d.push("L" + xy(entry), "Q" + xy(p) + " " + xy(exit));
    }
    if (points.length > 1) d.push("L" + xy(points[points.length - 1]));
    return d.join(" ");
  }
  function label(parent, x, y, value, attrs) {
    var node = add("text", Object.assign({ x: x, y: y, fill: "var(--clue-label)", "font-family": "Segoe UI, sans-serif",
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
      "stroke-width": 1.3, "vector-effect": "non-scaling-stroke", "stroke-linejoin": "round",
      "stroke-linecap": "round" }, attrs), parent);
  }
  function arrowHead(parent, x, y, dx, dy, color, size, attrs, halfWidth) {
    var length = Math.hypot(dx, dy) || 1, ux = dx / length, uy = dy / length;
    if (halfWidth === undefined) halfWidth = size * .5;
    var backX = x - ux * size, backY = y - uy * size;
    return add("path", Object.assign({ d: "M" + (backX - uy * halfWidth) + " " + (backY + ux * halfWidth) +
      "L" + x + " " + y + "L" + (backX + uy * halfWidth) + " " + (backY - ux * halfWidth),
      fill: "none", stroke: color, "stroke-width": 4, "stroke-linecap": "round", "stroke-linejoin": "round" }, attrs), parent);
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
        " 66% 56%) 35%,var(--clue-arrow-base,var(--text)))";
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
  // Use the same small quadratic corners as pathData when finding crossings.
  // Sampling is only for clearance; the displayed route remains the original path.
  function arrowSamples(points) {
    var samples = [points[0]];
    for (var i = 1; i < points.length - 1; i++) {
      var a = points[i - 1], p = points[i], b = points[i + 1];
      var ax = p.x - a.x, ay = p.y - a.y, bx = b.x - p.x, by = b.y - p.y;
      var incoming = Math.hypot(ax, ay), outgoing = Math.hypot(bx, by);
      if (!incoming || !outgoing || Math.abs(ax * by - ay * bx) < .001) { samples.push(p); continue; }
      var cut = Math.min(14, incoming / 4, outgoing / 4);
      var entry = { x: p.x - ax / incoming * cut, y: p.y - ay / incoming * cut };
      var exit = { x: p.x + bx / outgoing * cut, y: p.y + by / outgoing * cut };
      samples.push(entry);
      for (var step = 1; step <= 12; step++) {
        var t = step / 12, u = 1 - t;
        samples.push({ x: u * u * entry.x + 2 * u * t * p.x + t * t * exit.x,
          y: u * u * entry.y + 2 * u * t * p.y + t * t * exit.y });
      }
    }
    if (points.length > 1) samples.push(points[points.length - 1]);
    return samples;
  }
  function headPoints(tip, ux, uy, size, halfWidth) {
    if (halfWidth === undefined) halfWidth = size * .5;
    return [{ x: tip.x - ux * size - uy * halfWidth, y: tip.y - uy * size + ux * halfWidth }, tip,
      { x: tip.x - ux * size + uy * halfWidth, y: tip.y - uy * size - ux * halfWidth }];
  }
  function clearArrowEnds(info) {
    var arrows = Array.from(info.layouts.values());
    arrows.forEach(function (arrow) {
      var lastIndex = arrow.points.length - 1, tip = arrow.points[lastIndex], previous = arrow.points[lastIndex - 1];
      var length = Math.hypot(tip.x - previous.x, tip.y - previous.y) || 1;
      var ux = (tip.x - previous.x) / length, uy = (tip.y - previous.y) / length;
      var cell = arrow.line.cells[lastIndex], center = point(cell);
      // Keep the direction tip inside the final cell's entry edge, away from
      // central digits and the arrow-only candidate grid. Wings may straddle
      // this boundary; neither the shaft's route nor its direction is changed.
      var edge = Math.min(ux ? (50 + Math.sign(ux) * (tip.x - center.x)) / Math.abs(ux) : Infinity,
        uy ? (50 + Math.sign(uy) * (tip.y - center.y)) / Math.abs(uy) : Infinity);
      var retreat = Math.min(Math.max(0, edge - (ux && uy ? 20 : 8)), Math.max(0, length - 12));
      var end = { x: tip.x - ux * retreat, y: tip.y - uy * retreat };
      arrow.points[lastIndex] = end;
      arrow.retreat = retreat;
      arrow.entry = { x: tip.x - ux * edge, y: tip.y - uy * edge };
      arrow.entryInset = edge - retreat;
      arrow.headSize = ux && uy ? 11 : 15;
      arrow.headHalfWidth = arrow.headSize * .5;
      arrow.head = headPoints(end, ux, uy, arrow.headSize);
      arrow.direction = { x: ux, y: uy };
    });
    // Parallel tracking lanes can be narrower than a full chevron. Slim only
    // those adjacent heads, rather than displacing either route or its endpoint.
    arrows.forEach(function (a, index) {
      arrows.slice(index + 1).forEach(function (b) {
        if (a.line.cells[a.line.cells.length - 1] !== b.line.cells[b.line.cells.length - 1] ||
            a.direction.x * b.direction.x + a.direction.y * b.direction.y < .995) return;
        var dx = b.head[1].x - a.head[1].x, dy = b.head[1].y - a.head[1].y;
        var gap = Math.abs(dx * a.direction.y - dy * a.direction.x);
        if (gap < .1 || gap >= a.headHalfWidth + b.headHalfWidth + 5) return;
        var halfWidth = Math.max(3, (gap - 5) / 2);
        a.headHalfWidth = Math.min(a.headHalfWidth, halfWidth);
        b.headHalfWidth = Math.min(b.headHalfWidth, halfWidth);
      });
    });
    arrows.forEach(function (arrow) {
      arrow.head = headPoints(arrow.head[1], arrow.direction.x, arrow.direction.y, arrow.headSize, arrow.headHalfWidth);
    });
    arrows.forEach(function (arrow) { arrow.samples = arrowSamples(arrow.points); arrow.gaps = []; });
  }
  function arrowCrossings(info, material) {
    var arrows = Array.from(info.layouts.values()), segmentCache = new Map();
    function segments(points) {
      if (segmentCache.has(points)) return segmentCache.get(points);
      var result = [];
      for (var i = 1; i < points.length; i++) {
        var a = points[i - 1], b = points[i], dx = b.x - a.x, dy = b.y - a.y;
        result.push({ a: a, dx: dx, dy: dy, length: Math.hypot(dx, dy),
          left: Math.min(a.x, b.x), right: Math.max(a.x, b.x), top: Math.min(a.y, b.y), bottom: Math.max(a.y, b.y) });
      }
      segmentCache.set(points, result);
      return result;
    }
    function intersection(a, b) {
      var cross = a.dx * b.dy - a.dy * b.dx, lengths = a.length * b.length;
      if (!lengths || Math.abs(cross) / lengths < .12) return null;
      var cx = b.a.x - a.a.x, cy = b.a.y - a.a.y;
      var t = (cx * b.dy - cy * b.dx) / cross, u = (cx * a.dy - cy * a.dx) / cross;
      if (t < -.00001 || t > 1.00001 || u < -.00001 || u > 1.00001) return null;
      return { x: a.a.x + t * a.dx, y: a.a.y + t * a.dy, radius: Math.min(10, 5.5 * lengths / Math.abs(cross)) };
    }
    function gap(arrow, crossing, over) {
      // Bulb interiors are already cleared once, before their rings are drawn.
      var hidden = false;
      info.bulbs.forEach(function (group, cell) {
        var p = point(cell);
        if (Math.hypot(crossing.x - p.x, crossing.y - p.y) <= group[group.length - 1].radius) hidden = true;
      });
      if (hidden) return;
      var existing = arrow.gaps.find(function (p) { return Math.hypot(p.x - crossing.x, p.y - crossing.y) < 5; });
      if (existing) { existing.radius = Math.max(existing.radius, crossing.radius); return; }
      crossing.over = over.index;
      arrow.gaps.push(crossing);
    }
    function crosses(a, b, visit) {
      var first = segments(a), second = segments(b);
      for (var i = 0; i < first.length; i++) for (var j = 0; j < second.length; j++) {
        var one = first[i], two = second[j];
        // Most curve fragments live in different cells. Reject their boxes
        // before any crossing math, including for maximum-size imported clues.
        if (one.right < two.left || two.right < one.left || one.bottom < two.top || two.bottom < one.top) continue;
        var p = intersection(one, two);
        if (p) visit(p);
      }
    }
    arrows.forEach(function (a, index) {
      arrows.slice(index + 1).forEach(function (b) {
        crosses(a.samples, b.samples, function (p) {
          // Never turn a direction marker's short approach into an underpass.
          var tip = a.head[1], protect = Math.hypot(p.x - tip.x, p.y - tip.y) < a.headSize + 4;
          gap(protect ? b : a, p, protect ? a : b);
        });
        crosses(a.samples, b.head, function (p) { gap(a, p, b); });
        crosses(b.samples, a.head, function (p) { gap(b, p, a); });
      });
    });
    arrows.forEach(function (arrow) {
      if (!arrow.gaps.length) return;
      var id = material.prefix + "-arrow-crossings-" + arrow.index;
      var mask = add("mask", { id: id, x: 0, y: 0, width: 900, height: 900, maskUnits: "userSpaceOnUse",
        maskContentUnits: "userSpaceOnUse", "mask-type": "luminance", "data-arrow-crossing-mask": arrow.index }, material.defs);
      add("rect", { x: 0, y: 0, width: 900, height: 900, fill: "white" }, mask);
      arrow.gaps.forEach(function (p) {
        add("circle", { cx: +p.x.toFixed(3), cy: +p.y.toFixed(3), r: +p.radius.toFixed(3), fill: "black",
          "data-arrow-crossing-gap": arrow.index, "data-arrow-crossing-over": p.over }, mask);
      });
      arrow.mask = "url(#" + id + ")";
    });
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
    var material = materials(svg, clues.lines || []), thermoMaterial;
    var under = add("g", { "data-layer": "areas" }, svg);
    var lines = add("g", { "data-layer": "lines" }, svg);
    var endpoints = add("g", { "data-layer": "line-endpoints" }, svg);
    var marks = add("g", { "data-layer": "marks" }, svg);
    if (Array.isArray(clues.regions) && clues.regions.length === 81) {
      for (var region = 0; region < 9; region++) {
        var cells = [];
        clues.regions.forEach(function (value, index) { if (value === region) cells.push(index); });
        outline(under, cells, 0, { stroke: "var(--clue-neutral)", "stroke-width": 2.2 });
        describe(cells, "不规则第 " + (region + 1) + " 宫，数字 1～9 各一次");
      }
      legends.add("粗线围成不规则宫");
    }
    (clues.parity || []).forEach(function (clue) {
      var p = point(clue.cell), even = clue.parity === "even";
      add(even ? "rect" : "circle", even ? { x: p.x - 29, y: p.y - 29, width: 58, height: 58, rx: 4,
        fill: "var(--accent)", "fill-opacity": .15, stroke: "var(--clue-edge)", "stroke-width": 3 } :
        { cx: p.x, cy: p.y, r: 30, fill: "var(--accent)", "fill-opacity": .15,
          stroke: "var(--clue-edge)", "stroke-width": 3 }, under);
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
        outline(under, cells, 6, { stroke: "var(--clue-renban)", "stroke-dasharray": "6 4", "stroke-width": 1.1 });
        var first = Math.min.apply(null, cells), p = point(first);
        label(marks, p.x - 35, p.y - 29, name + (pair ? "′" : ""), { fill: "var(--clue-renban)", "font-size": 23 });
      });
      clone.a.forEach(function (cell, i) {
        describe([cell], "克隆组 " + name + "，与第 " + (Math.floor(clone.b[i] / 9) + 1) + " 行第 " + (clone.b[i] % 9 + 1) + " 列数字相同");
        describe([clone.b[i]], "克隆组 " + name + " 的对应格");
      });
      legends.add("同字母区域对应数字相同");
    });
    (clues.cages || []).forEach(function (cage) {
      outline(marks, cage.cells, 6, { "stroke-dasharray": "5 4", stroke: "var(--clue-cage)", "stroke-width": 1.1 });
      var p = point(Math.min.apply(null, cage.cells));
      label(marks, p.x - 34, p.y - 29, cage.sum, { "font-size": 24 });
      describe(cage.cells, "虚线笼内数字和为 " + cage.sum + (cage.unique ? "，数字不重复" : ""));
      legends.add("笼角数字为笼内总和");
    });
    if (context.mode === "thermo-killer") legends.add("温笼合流：温度计递增与笼内不重复求和同时成立");
    var clueLines = clues.lines || [], arrowInfo = arrowLayouts(clueLines), endpointDraws = [];
    clearArrowEnds(arrowInfo);
    arrowCrossings(arrowInfo, material);
    clueLines.forEach(function (line, lineIndex) {
      var cells = line.cells, type = line.type, first = point(cells[0]), last = point(cells[cells.length - 1]);
      var arrow = arrowInfo.layouts.get(line);
      var color = arrow ? arrow.color : type === "thermo" ? "var(--clue-thermo-fill)" :
        NAMES[type] ? "var(--clue-" + type + ")" : "var(--clue-line)";
      var paint = material.paints[type];
      if (paint) color = paint.color;
      var d = pathData(arrow ? arrow.points : cells.map(point));
      var widths = { thermo: 18, renban: 5.5, whispers: 5, palindrome: 4.5,
        between: 3.5, lockout: 3.5, entropic: 4.5, modular: 4.5, "region-sum": 4.5 };
      var attrs = { d: d, fill: "none", stroke: color,
        "stroke-width": arrow ? 4.5 : widths[type] || 6,
        "stroke-linecap": "round", "stroke-linejoin": "round" };
      var identity = { "class": "variant-line variant-line--" + type + (paint ? " variant-glass-line" : ""),
        "data-line-type": type, "data-line-index": lineIndex, "data-line-cells": cells.join(",") };
      if (paint) identity.style = "--variant-solid-color:" + paint.solid;
      function endpoint(role, cell) {
        return { "class": "variant-endpoint variant-endpoint--" + type +
            (paint ? (type === "thermo" ? " variant-glass-fill" : " variant-glass-line") : ""),
          style: paint ? "--variant-solid-color:" + paint.solid : "",
          "data-line-type": type, "data-line-index": lineIndex,
          "data-endpoint-role": role, "data-endpoint-cell": cell };
      }
      if (type === "entropic") attrs["stroke-dasharray"] = "18 10";
      if (type === "modular") attrs["stroke-dasharray"] = "4 10";
      if (arrow) {
        if (arrow.mask) attrs.mask = arrow.mask;
        identity["data-arrow-lane-x"] = arrow.lane.x;
        identity["data-arrow-lane-y"] = arrow.lane.y;
        identity["data-arrow-end-retreat"] = arrow.retreat;
      }
      if (type === "thermo") {
        if (!thermoMaterial) thermoMaterial = add("g", {
          "class": "variant-thermometer-material", filter: material.filter
        }, lines);
        var thermo = add("g", { "class": "variant-thermometer", "data-thermo-index": lineIndex }, thermoMaterial);
        // Hidden during ordinary glass rendering; high contrast can expose this
        // solid outline while keeping the body Canvas and the digits CanvasText.
        add("path", Object.assign({}, attrs, { "class": "variant-thermo-shell", display: "none",
          stroke: "var(--clue-thermo-ink)", "stroke-width": 22, "data-thermo-shell": lineIndex }), thermo);
        add("circle", { cx: first.x, cy: first.y, r: 31, "class": "variant-thermo-shell", display: "none",
          fill: "var(--clue-thermo-ink)", "data-thermo-bulb-shell": lineIndex }, thermo);
        add("path", Object.assign({}, attrs, identity), thermo);
        add("circle", Object.assign({ cx: first.x, cy: first.y, r: 29, fill: color },
          endpoint("start", cells[0])), thermo);
      } else {
        add("path", Object.assign({}, attrs, identity, arrow ? { "data-arrow-path": arrow.index } : {}), lines);
      }
      if (arrow) {
        arrow.lineIndex = lineIndex;
        endpointDraws.push(function () {
          add("circle", Object.assign({ cx: first.x, cy: first.y, r: arrow.radius, fill: "none", stroke: color,
            "stroke-width": arrow.sharedBulb ? 3.5 : 4.5, "data-arrow-circle": arrow.index },
            endpoint("start", cells[0])), endpoints);
        });
        describe(cells, "第 " + (arrow.index + 1) + " 根箭头：圆圈在第 " +
          (Math.floor(cells[0] / 9) + 1) + " 行第 " + (cells[0] % 9 + 1) +
          " 列；箭杆依次经过 " + cells.slice(1).map(function (cell) {
            return (Math.floor(cell / 9) + 1) + " 行 " + (cell % 9 + 1) + " 列";
          }).join("、") + "；" + LINE_RULES.arrow);
      }
      if (type === "between" || type === "lockout") endpointDraws.push(function () {
        [first, last].forEach(function (p, index) {
          var marker = endpoint(index ? "end" : "start", cells[index ? cells.length - 1 : 0]);
          if (type === "between") add("circle", Object.assign({ cx: p.x, cy: p.y, r: 26,
            fill: "var(--cell-bg)", stroke: color, "stroke-width": 3.5 }, marker), endpoints);
          else add("path", Object.assign({ d: "M" + p.x + " " + (p.y - 28) + "L" + (p.x + 28) + " " + p.y + "L" +
            p.x + " " + (p.y + 28) + "L" + (p.x - 28) + " " + p.y + "Z",
            fill: "var(--cell-bg)", stroke: color, "stroke-width": 3.5, "stroke-linejoin": "round" }, marker), endpoints);
        });
      });
      if (!arrow) describe(cells, (NAMES[type] || type) + "：" + (LINE_RULES[type] || "按本题线索规则"));
      legends.add(NAMES[type] || type);
    });
    // Mask shafts once per bulb, then draw every ring and arrowhead above every shaft.
    arrowInfo.bulbs.forEach(function (group, cell) {
      var p = point(cell), radius = group[group.length - 1].radius;
      add("circle", { cx: p.x, cy: p.y, r: radius, fill: "var(--cell-bg)", "data-arrow-mask-cell": cell }, endpoints);
    });
    endpointDraws.forEach(function (draw) { draw(); });
    arrowInfo.layouts.forEach(function (arrow) {
      var last = arrow.points[arrow.points.length - 1], previous = arrow.points[arrow.points.length - 2];
      arrowHead(endpoints, last.x, last.y, last.x - previous.x, last.y - previous.y, arrow.color, arrow.headSize, {
        "class": "variant-endpoint variant-endpoint--arrow", "data-arrow-head": arrow.index,
        "stroke-width": 3.2, "data-arrow-head-size": arrow.headSize, "data-arrow-end-retreat": arrow.retreat,
        "data-arrow-head-width": +(arrow.headHalfWidth * 2).toFixed(3),
        "data-arrow-head-placement": "cell-entry", "data-arrow-wing-containment": "entry-boundary",
        "data-arrow-entry-inset": +arrow.entryInset.toFixed(3),
        "data-arrow-entry-x": +arrow.entry.x.toFixed(3), "data-arrow-entry-y": +arrow.entry.y.toFixed(3),
        "data-arrow-tip-x": +last.x.toFixed(3), "data-arrow-tip-y": +last.y.toFixed(3),
        "data-line-type": "arrow", "data-line-index": arrow.lineIndex,
        "data-endpoint-role": "end", "data-endpoint-cell": arrow.line.cells[arrow.line.cells.length - 1]
      }, arrow.headHalfWidth);
    });
    if (arrowInfo.layouts.size) {
      legends.add("颜色仅辅助追踪；交叉处不连接；同心圈共用同一数字，各箭杆分别求和");
    }
    (clues.edges || []).forEach(function (edge) {
      var a = point(edge.cells[0]), b = point(edge.cells[1]), x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
      var description;
      if (edge.type === "kropki-white" || edge.type === "kropki-black") {
        var black = edge.type === "kropki-black";
        add("circle", { cx: x, cy: y, r: 15, fill: "var(--cell-bg)", "class": "variant-glyph-backing" }, marks);
        add("circle", { cx: x, cy: y, r: 11, fill: black ? "var(--clue-edge)" : "var(--cell-bg)",
          stroke: "var(--clue-edge)", "stroke-width": 3.5, "data-edge-type": edge.type }, marks);
        description = black ? "黑点两侧数字之比为 2" : "白点两侧数字相差 1";
        legends.add("白点差 1 / 黑点比 2");
      } else if (edge.type === "xv") {
        add("rect", { x: x - 17, y: y - 20, width: 34, height: 40, rx: 7, fill: "var(--cell-bg)",
          "class": "variant-glyph-backing" }, marks);
        label(marks, x, y + 1, edge.value === 10 ? "X" : "V", {
          "text-anchor": "middle", "font-size": 29, "stroke-width": 4, "data-edge-type": edge.type });
        description = "标记两侧数字和为 " + edge.value;
        legends.add("X 和为 10 / V 和为 5");
      } else if (edge.type === "greater") {
        var dx = (b.x - a.x) / 100, dy = (b.y - a.y) / 100;
        add("circle", { cx: x, cy: y, r: 20, fill: "var(--cell-bg)", "class": "variant-glyph-backing" }, marks);
        add("path", { d: "M" + (x - dx * 11 - dy * 13) + " " + (y - dy * 11 + dx * 13) +
          "L" + (x + dx * 11) + " " + (y + dy * 11) +
          "L" + (x - dx * 11 + dy * 13) + " " + (y - dy * 11 - dx * 13),
          fill: "none", stroke: "var(--clue-edge)", "stroke-width": 4, "stroke-linecap": "round",
          "stroke-linejoin": "round", "data-edge-type": edge.type }, marks);
        description = "不等号开口一侧数字较大";
        legends.add("不等号开口朝较大数字");
      }
      if (description) describe(edge.cells, description);
    });
    (clues.quadruples || []).forEach(function (quad) {
      var row = Math.min.apply(null, quad.cells.map(function (cell) { return Math.floor(cell / 9); }));
      var col = Math.min.apply(null, quad.cells.map(function (cell) { return cell % 9; }));
      var x = (col + 1) * 100, y = (row + 1) * 100;
      add("circle", { cx: x, cy: y, r: 29, fill: "var(--cell-bg)", stroke: "var(--clue-edge)",
        "stroke-width": 2.5, "class": "variant-quadruple" }, marks);
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
      label(marks, x, y, clue.value, { "font-size": 29, "text-anchor": "middle", "stroke-width": 5,
        "class": "variant-outside-label", "data-outside-type": clue.type, "data-outside-side": clue.side });
      if (clue.type === "littlekiller" && clue.cells.length > 1) {
        var start = point(clue.cells[0]), next = point(clue.cells[1]);
        var dx = next.x - start.x, dy = next.y - start.y, length = Math.hypot(dx, dy) || 1;
        var ux = dx / length, uy = dy / length;
        var tipX = start.x - ux * 34, tipY = start.y - uy * 34;
        add("path", { d: "M" + (tipX - ux * 22) + " " + (tipY - uy * 22) + "L" + tipX + " " + tipY,
          fill: "none", stroke: "var(--clue-edge)", "stroke-width": 3.5, "stroke-linecap": "round" }, marks);
        arrowHead(marks, tipX, tipY, dx, dy, "var(--clue-edge)", 12);
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
