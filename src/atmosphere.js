/* Nine Realms - layered local atmosphere and quiet opt-in feedback. */
(function (root) {
  "use strict";
  var settings = { fx: false, sound: false, theme: "nebula", reducedMotion: false, zen: false, intensity: "cinematic" };
  var palette = {
    nebula: { stars: ["#bba5ff", "#63e5ff", "#f2eaff"], clouds: ["#8265df", "#478bab"],
      moon: "#e3ddf9", mountain: "#777caa", water: "#a8b4d7" },
    aurora: { stars: ["#93e6c1", "#6ccde4", "#d4fff1"], clouds: ["#35896e", "#4a8ca9"],
      moon: "#d8eee1", mountain: "#558e7c", water: "#a0d0ba" },
    ember: { stars: ["#f3ba77", "#ed8978", "#ffe6bd"], clouds: ["#b16e46", "#934f71"],
      moon: "#f3dfc3", mountain: "#a37b70", water: "#d4ad85" },
    ivory: { stars: ["#346b54", "#8a9f72", "#ac9568"], clouds: ["#8aa48c", "#c1ad83"],
      moon: "#fffbeb", mountain: "#708a79", water: "#7d9687" },
    ocean: { stars: ["#75cddf", "#91dbe5", "#b6f0ef"], clouds: ["#287991", "#174761"],
      moon: "#d3f2ef", mountain: "#174551", water: "#79c8d7" },
    sakura: { stars: ["#d98aa7", "#e3a3b7", "#d99dad"], clouds: ["#e7b0c0", "#e7c1ce"],
      moon: "#fff1e8", mountain: "#bb9eac", water: "#c5a4b1" },
    firefly: { stars: ["#d4ed8f", "#8de8b1", "#c1dc88"], clouds: ["#356b4d", "#225a51"],
      moon: "#dce8b2", mountain: "#123f35", water: "#8dbba5" },
    sunset: { stars: ["#f5be83", "#df9da4", "#ffdda8"], clouds: ["#e9b39d", "#df9da4"],
      moon: "#ffdda8", mountain: "#b89aab", water: "#e8bf91" }
  };
  var canvas = null, context = null, gpu = null, gpuFailed = false;
  var boardRect = { x: 0, y: 0, width: 0, height: 0 }, cloudTextures = {}, auroraTextures = {};
  var width = 0, height = 0, ratio = 1, stars = [], connections = [];
  var scenery = { trees: [] };
  var frameId = 0, lastPaint = 0, skyTime = 0;
  var pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
  var audioContext = null, masterGain = null;
  var voices = new Set(), lastSoundAt = -1000;
  var document = root.document, TAU = Math.PI * 2;

  function hidden() { return !document || document.hidden; }
  function mobile() { return width <= 600; }
  function wrap(value, span) { return ((value % span) + span) % span; }

  function stopSky() {
    if (frameId && root.cancelAnimationFrame) root.cancelAnimationFrame(frameId);
    frameId = 0;
    lastPaint = 0;
  }

  function markRenderer(kind) {
    if (document && document.body) document.body.dataset.renderer = kind;
  }

  function fallbackCanvas() {
    gpuFailed = true;
    if (gpu) { gpu.dispose(); gpu = null; }
    // A canvas cannot change context type. Keep its public ID and accessibility.
    if (canvas && canvas.parentNode) {
      var replacement = canvas.cloneNode(false);
      canvas.parentNode.replaceChild(replacement, canvas);
      canvas = replacement;
    }
    // Keep recovery independent of the failed GPU raster device. Chromium's
    // read-friendly surface hint also selects software-backed Canvas drawing.
    context = canvas && canvas.getContext ?
      canvas.getContext("2d", { alpha: true, willReadFrequently: true }) : null;
    width = height = 0;
    markRenderer("canvas2d");
  }

  function gpuFailure() {
    stopSky();
    fallbackCanvas();
    syncSky();
  }

  function findCanvas() {
    if (!document) return false;
    var found = document.getElementById("sky-canvas");
    if (!found) return false;
    if (canvas !== found) {
      if (gpu) gpu.dispose();
      canvas = found; context = null; gpu = null;
      width = height = 0;
      if (!gpuFailed && root.NineRealmsWebGL) gpu = root.NineRealmsWebGL.create(canvas, gpuFailure);
      if (gpu) markRenderer("webgl2");
      else fallbackCanvas();
    }
    return Boolean(gpu || context);
  }

  function cacheBoard() {
    var board = document && document.querySelector(".board-card");
    if (!board || !width || !height) { boardRect.width = 0; return; }
    var bounds = board.getBoundingClientRect();
    boardRect.x = bounds.left / width; boardRect.y = bounds.top / height;
    boardRect.width = bounds.width / width; boardRect.height = bounds.height / height;
  }

  function strength() {
    return settings.zen ? 0.62 : settings.intensity === "soft" ? 0.70 :
      settings.intensity === "balanced" ? 1 : 1.65;
  }

  function project(star, time, motion) {
    var z = star.z, x = star.x / width * 2 - 1, y = star.y / height * 2 - 1;
    if (motion === "star") z = 0.85 + wrap(z - 0.85 - time * 0.018, 4.5);
    else if (motion === "up") y = wrap(y + 1 - time * (0.035 + star.depth * 0.025) / z, 2) - 1;
    else if (motion === "down") {
      y = wrap(y + 1 + time * (0.025 + star.depth * 0.028) / z, 2) - 1;
      x = wrap(x + 1 + time * 0.009 / z, 2) - 1;
    }
    if (motion !== "star") {
      x += Math.sin(time * 0.24 + star.phase) * 0.035;
      y += Math.cos(time * 0.19 + star.phase) * 0.012;
    }
    var scale = star.z / z, parallax = (settings.zen ? 0 : 18 + strength() * 16) / z;
    return { x: width * (0.5 + x * scale * 0.5) - pointer.x * parallax,
      y: height * (0.5 + y * scale * 0.5) - pointer.y * parallax,
      size: Math.min(2.8, 2.7 / z), fade: Math.max(0.35, 1.1 - z * 0.1) };
  }

  function cloudTexture(color) {
    if (cloudTextures[color]) return cloudTextures[color];
    var tile = document.createElement("canvas"); tile.width = tile.height = 160;
    var brush = tile.getContext("2d");
    if (!brush) return null;
    var pixels = brush.createImageData(160,160), data = pixels.data;
    var rgb = [parseInt(color.slice(1,3),16),parseInt(color.slice(3,5),16),parseInt(color.slice(5,7),16)];
    function hash(x,y) {
      var n = (Math.imul(x,374761393) + Math.imul(y,668265263)) | 0;
      n = Math.imul(n ^ (n >>> 13),1274126177);
      return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
    }
    function noise(x,y) {
      var ix = Math.floor(x), iy = Math.floor(y), fx = x-ix, fy = y-iy;
      fx = fx*fx*(3-2*fx); fy = fy*fy*(3-2*fy);
      var a = hash(ix,iy)*(1-fx)+hash(ix+1,iy)*fx;
      var b = hash(ix,iy+1)*(1-fx)+hash(ix+1,iy+1)*fx;
      return a*(1-fy)+b*fy;
    }
    for (var y=0;y<160;y++) for (var x=0;x<160;x++) {
      var px=x/160,py=y/160;
      var n=noise(px*5,py*5)*0.58+noise(px*11+9,py*11)*0.28+noise(px*23,py*23+5)*0.14;
      var edge=Math.max(0,1-Math.pow(Math.hypot((px-.5)*2,(py-.5)*2),1.4));
      var density=Math.max(0,(n-.27)*2)*edge;
      var index=(y*160+x)*4, light=.58+n*.7;
      data[index]=Math.min(255,rgb[0]*light); data[index+1]=Math.min(255,rgb[1]*light);
      data[index+2]=Math.min(255,rgb[2]*light); data[index+3]=Math.min(255,density*255);
    }
    brush.putImageData(pixels,0,0); cloudTextures[color]=tile; return tile;
  }

  function resizeSky() {
    var nextWidth = Math.max(1, root.innerWidth || 1);
    var nextHeight = Math.max(1, root.innerHeight || 1);
    // The decorative fallback stays below 960x720 internal pixels; the DOM
    // board and its digits keep their normal device-pixel resolution.
    var nextRatio = gpu ? Math.min(1.5, Math.max(1, root.devicePixelRatio || 1)) :
      Math.min(1, 960 / nextWidth, 720 / nextHeight);
    if (nextWidth === width && nextHeight === height && nextRatio === ratio) return;
    width = nextWidth; height = nextHeight; ratio = nextRatio;
    if (gpu) { gpu.resize(width, height, ratio); return; }
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    var count = mobile() ? Math.min(28, Math.max(16, Math.round(width * height / 17000))) :
      Math.min(72, Math.max(32, Math.round(width * height / 20000)));
    // Re-seed layers and nearby links only when viewport dimensions change.
    var seed = (width * 73856093 ^ height * 19349663) >>> 0;
    function random() {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    }
    stars = Array.from({ length: count }, function (_, index) {
      var layer = index % 3;
      return { x: random() * width, y: random() * height, layer: layer,
        depth: 0.2 + layer * 0.32, radius: 0.4 + layer * 0.3 + random() * 0.45,
        phase: random() * TAU, z: 0.85 + random() * 4.5, color: index % 3 };
    });
    // Forest silhouettes are deterministic and computed only after a resize.
    scenery.trees = Array.from({ length: mobile() ? 8 : 14 }, function (_, index) {
      var edge = index % 2, distance = random() * 0.15;
      return { x: edge ? 1 - distance : distance, height: 0.44 + random() * 0.49,
        width: 0.022 + random() * 0.028, layer: index % 3 ? 0 : 1 };
    });
    connections = [];
    for (var i = 0; i < stars.length && connections.length < (mobile() ? 4 : 10); i++) {
      for (var j = i + 1; j < stars.length; j++) {
        var dx = stars[i].x - stars[j].x, dy = stars[i].y - stars[j].y;
        var distance = Math.sqrt(dx * dx + dy * dy);
        if (stars[i].layer !== stars[j].layer || distance < 32 || distance > 126) continue;
        connections.push([i, j]);
        break;
      }
    }
  }

  function glow(x, y, radius, color, opacity) {
    var gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, color);
    // Keep the hue at zero alpha: fading toward transparent black can muddy light scenes.
    gradient.addColorStop(1, color + "00");
    context.globalAlpha = Math.min(0.96, opacity * strength());
    context.fillStyle = gradient;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  function dot(x, y, radius, color, opacity) {
    context.globalAlpha = Math.min(0.96, opacity * strength());
    context.fillStyle = color;
    context.beginPath();
    context.arc(x, y, radius, 0, TAU);
    context.fill();
  }

  function brush(color, opacity, lineWidth) {
    context.globalAlpha = Math.min(0.96, opacity * strength());
    context.fillStyle = context.strokeStyle = color;
    context.lineWidth = lineWidth || 1;
  }

  function ribbon(points, color, opacity, thickness) {
    brush(color, opacity, thickness);
    context.beginPath();
    context.moveTo(points[0], points[1]);
    context.bezierCurveTo(points[2], points[3], points[4], points[5], points[6], points[7]);
    context.stroke();
  }

  function drawStars(time, colors, zen) {
    stars.forEach(function (star, index) {
      if (zen && index % 2) return;
      var point = project(star,time,"star"), x = point.x, y = point.y;
      var alpha = (0.4 + Math.sin(time * 0.4 + star.phase) * 0.13) * point.fade;
      dot(x, y, star.radius * point.size, colors.stars[star.color], alpha);
      if (!zen && index % 17 === 2) {
        glow(x, y, 10, colors.stars[star.color], 0.14);
        brush(colors.stars[star.color], alpha * 0.55, 0.7);
        context.beginPath();
        context.moveTo(x - 4, y); context.lineTo(x + 4, y);
        context.moveTo(x, y - 4); context.lineTo(x, y + 4);
        context.stroke();
      }
    });
  }

  function mountains(colors, opacity, offset) {
    var ridges = [
      [0.76, 0.64, 0.78, 0.67, 0.8, 0.69, 0.74, 0.63, 0.77],
      [0.88, 0.77, 0.84, 0.79, 0.9, 0.81, 0.86, 0.73, 0.85],
      [0.96, 0.88, 0.93, 0.85, 0.98, 0.9, 0.94, 0.85, 0.95]
    ];
    ridges.forEach(function (ridge, layer) {
      var step = width / (ridge.length - 1);
      context.save();
      context.translate(-pointer.x * (layer + 1) * 7 * strength(), -pointer.y * (layer + 1) * 3);
      brush(colors[layer % colors.length], opacity + layer * 0.025);
      context.beginPath();
      context.moveTo(-20, height + 20);
      context.lineTo(0, (ridge[0] + offset) * height);
      for (var i = 0; i < ridge.length - 1; i++) {
        var y1 = (ridge[i] + offset) * height, y2 = (ridge[i + 1] + offset) * height;
        context.bezierCurveTo(i * step + step * 0.38, y1,
          (i + 1) * step - step * 0.27, y2, (i + 1) * step, y2);
      }
      context.lineTo(width + 20, height + 20);
      context.closePath();
      context.fill();
      context.restore();
    });
  }

  function drawNebula(time, colors) {
    var span = Math.min(width, height);
    // Cached fractal gas planes have different depths, rotation, and parallax.
    for (var i = 0; i < 7; i++) {
      var side = i % 2, depth = 1.1 + i * 0.36, tile = cloudTexture(colors.clouds[side]);
      if (!tile) continue;
      var x = width * (side ? .92 : .08) - pointer.x * 34 / depth;
      var y = height * (.11 + i * .14) + Math.sin(time * .06 + i) * 12 - pointer.y * 20 / depth;
      var size = span * (.65 + i * .035);
      context.save(); context.translate(x,y); context.rotate((side ? -.5 : .42) + Math.sin(time * .025 + i) * .04);
      context.globalAlpha = Math.min(.8,.43 * strength());
      context.drawImage(tile,-size*.65,-size*.45,size*1.3,size*.9);
      context.restore();
    }
    drawStars(time, colors, settings.zen);
    context.save();
    context.translate(width * 0.88 + pointer.x * 8, height * 0.2);
    context.rotate(-0.5);
    var radius = span * 0.17;
    brush(colors.stars[1], 0.11, 0.7);
    context.beginPath(); context.ellipse(0, 0, radius, radius * 0.34, 0, 0, TAU); context.stroke();
    var a = time * 0.035 + 0.8;
    glow(Math.cos(a) * radius, Math.sin(a) * radius * 0.34, 12, colors.stars[1], 0.22);
    dot(Math.cos(a) * radius, Math.sin(a) * radius * 0.34, 1.7, colors.stars[2], 0.58);
    context.restore();
  }

  function auroraSheet(layer, colors) {
    var key = layer + ":" + Math.round(strength() * 100) + ":" + (mobile() ? "small" : "large");
    if (auroraTextures[key]) return auroraTextures[key];
    var sheet = document.createElement("canvas");
    sheet.width = mobile() ? 480 : 960; sheet.height = 320;
    var ctx = sheet.getContext("2d", { alpha: true });
    if (!ctx) return null;
    var gradient = ctx.createLinearGradient(0, 24, 0, 310);
    gradient.addColorStop(0, colors.stars[layer % 2]);
    gradient.addColorStop(.35, colors.clouds[layer % 2]);
    gradient.addColorStop(1, colors.clouds[layer % 2] + "00");
    ctx.strokeStyle = gradient;
    var steps = mobile() ? 72 : 144, spacing = sheet.width / steps;
    for (var i = 0; i < steps; i++) {
      var x = i * spacing;
      var fold = Math.sin(i / steps * 6 + layer) * 22 + Math.sin(i / steps * 16 + layer) * 7;
      var y = 42 + fold, length = 230 - layer * 17;
      var light = .3 + .7 * Math.pow(.5 + .5 * Math.sin(i * 1.9 + Math.sin(i * .22) * 3), 2);
      ctx.globalAlpha = Math.min(.9, (.095 + light * .18) / (1 + layer * .18) * strength());
      ctx.lineWidth = spacing * .85;
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + 8, y + length * .25, x - 4, y + length * .65, x + 3, y + length);
      ctx.stroke();
    }
    auroraTextures[key] = sheet;
    return sheet;
  }

  function drawAurora(time, colors) {
    glow(width * .15, height * .07, Math.min(width, height) * .6, colors.clouds[0], .16);
    // Rasterize fine light filaments once. Recovery must not enqueue hundreds
    // of gradient paths every frame on a device whose GPU has already failed.
    for (var layer = 0; layer < 3; layer++) {
      var sheet = auroraSheet(layer, colors);
      if (!sheet) continue;
      var x = -55 - pointer.x * (layer + 1) * 7 + Math.sin(time * .10 + layer) * 12;
      var y = height * (.015 + layer * .045) - pointer.y * layer * 3 + Math.sin(time * .13 + layer) * 5;
      context.globalAlpha = .9 + Math.sin(time * .17 + layer) * .08;
      context.drawImage(sheet, x, y, width + 110, height * (.39 - layer * .02));
    }
    mountains(["#477d78", "#315c68", "#203f4c"], .13, .07);
    drawStars(time, colors, settings.zen);
  }

  function drawEmber(time, colors) {
    var span = Math.min(width, height);
    glow(width * 0.05, height * 0.95, span * 0.6, "#f49a46", 0.2);
    glow(width * 0.97, height * 0.74, span * 0.54, "#d95e52", 0.19);
    for (var side = 0; side < 2; side++) {
      for (var j = 0; j < 3; j++) {
        var x = width * (side ? 0.94 : 0.04), sway = Math.sin(time * 0.12 + j) * 24;
        var gradient = context.createLinearGradient(0, height, 0, height * 0.1);
        gradient.addColorStop(0, j % 2 ? "#f0aa5b" : "#dc6c51");
        gradient.addColorStop(1, "transparent");
        ribbon([x + j * 14, height + 50, x - 95 + sway, height * 0.67,
          x + 110 - sway, height * 0.42, x + sway, height * 0.12], gradient, 0.11, 18 + j * 12);
      }
    }
    stars.forEach(function (star, index) {
      if (index >= (settings.zen ? 20 : 48)) return;
      var point = project(star,time,"up"), x = point.x, y = point.y;
      var alpha = 0.16 + (Math.sin(time * 0.65 + star.phase) + 1) * 0.11;
      glow(x, y, star.radius * 6 * point.size, colors.stars[index % 3], alpha * 0.35);
      brush(colors.stars[index % 3], alpha, 1.2);
      context.beginPath(); context.moveTo(x, y + star.radius * 2.4); context.lineTo(x + 0.7, y); context.stroke();
    });
  }

  function branch(x, y, scale, color, blossoms) {
    context.save(); context.translate(x, y); context.scale(scale, scale);
    context.lineCap = "round";
    ribbon([0, 0, 55, 42, 123, 23, 195, 84], color, 0.2, 5);
    ribbon([53, 30, 72, 9, 106, -2, 129, -20], color, 0.18, 2.4);
    ribbon([107, 39, 115, 70, 150, 75, 168, 107], color, 0.16, 2.1);
    ribbon([147, 55, 178, 32, 207, 44, 231, 34], color, 0.16, 1.8);
    if (blossoms) {
      var blooms = [[72, 14], [108, -7], [127, -19], [150, 78], [168, 105], [190, 81], [210, 39], [231, 34], [126, 43]];
      blooms.forEach(function (point, i) {
        for (var p = 0; p < 5; p++) {
          var a = p * TAU / 5;
          dot(point[0] + Math.cos(a) * 3.3, point[1] + Math.sin(a) * 3.3,
            3.3, i % 2 ? "#d891a6" : "#edb4c3", 0.38);
        }
        dot(point[0], point[1], 1.3, "#fff3d3", 0.65);
      });
    }
    context.restore();
  }

  function driftingPetals(time, colors, leaf) {
    var limit = settings.zen ? (leaf ? 9 : 14) : (leaf ? 17 : 29);
    stars.forEach(function (star, index) {
      if (index >= limit) return;
      var point = project(star,time,"down"), x = point.x, y = point.y;
      var size = ((leaf ? 3.6 : 3.2) + star.depth * 2.1) * point.size;
      context.save(); context.translate(x, y); context.rotate(star.phase + Math.sin(time * 0.35 + index) * 0.7);
      context.scale(0.58 + Math.abs(Math.cos(time * 0.22 + star.phase)) * 0.42, 1);
      brush(colors[index % colors.length], leaf ? 0.22 : 0.4);
      context.beginPath(); context.moveTo(-size, 0);
      context.bezierCurveTo(-size * 0.3, -size * 0.8, size * 0.7, -size * 0.8, size, 0);
      context.bezierCurveTo(size * 0.1, size * (leaf ? 0.4 : 1.1), -size * 0.7, size * 0.65, -size, 0);
      context.fill();
      if (leaf) {
        brush("#6f8c76", 0.2, 0.5);
        context.beginPath(); context.moveTo(-size, 0); context.lineTo(size * 0.75, 0); context.stroke();
      }
      context.restore();
    });
  }

  function drawIvory(time, colors) {
    glow(width * 0.12, height * 0.2, Math.min(width, height) * 0.5, "#b9c7b2", 0.16);
    glow(width * 0.86, height * 0.22, 105, "#fffdf1", 0.65);
    dot(width * 0.86, height * 0.22, Math.min(width, height) * 0.047, "#fffcef", 0.62);
    mountains(["#899e8b", "#758f80", "#617c70"], 0.10, 0.02);
    branch(-5, height * 0.18, Math.min(1.35, width / 850), "#657f6d", false);
    // Sparse reeds provide an ink-brush foreground along the lower corners.
    for (var i = 0; i < 7; i++) {
      var x = 12 + i * 12, sway = Math.sin(time * 0.17 + i * 0.4) * 3;
      ribbon([x, height, x - 6, height - 50, x + 4 + sway, height - 110,
        x + 15 + sway, height - 145 + i * 10], "#6e8a73", 0.14, i % 2 ? 1 : 1.8);
    }
    driftingPetals(time, ["#6e947a", "#9aa776", "#bdab76"], true);
  }

  function drawOcean(time, colors) {
    var span = Math.min(width, height);
    glow(width * 0.2, -height * 0.05, span * 0.78, "#51bfce", 0.17);
    for (var i = 0; i < 5; i++) {
      var x = width * (0.03 + i * 0.22), sway = Math.sin(time * 0.08 + i) * 15;
      var gradient = context.createLinearGradient(0, 0, 0, height * 0.92);
      gradient.addColorStop(0, "#7ce4e9"); gradient.addColorStop(1, "transparent");
      brush(gradient, 0.035 + i % 2 * 0.02);
      context.beginPath(); context.moveTo(x + sway, -10); context.lineTo(x + 25 + sway, -10);
      context.lineTo(x + width * 0.22, height * 0.95); context.lineTo(x - width * 0.02, height * 0.95);
      context.closePath(); context.fill();
    }
    for (var row = 0; row < 6; row++) {
      var y = height * (row < 3 ? 0.04 + row * 0.022 : 0.85 + (row - 3) * 0.035);
      brush(colors.water, row < 3 ? 0.08 : 0.05, 0.9);
      context.beginPath();
      for (var col = 0; col <= 20; col++) {
        var px = col * width / 20;
        var py = y + Math.sin(col * 0.65 + time * 0.3 + row) * (4 + row);
        if (!col) context.moveTo(px, py); else context.lineTo(px, py);
      }
      context.stroke();
    }
    stars.forEach(function (star, index) {
      if (index >= (settings.zen ? 11 : 24)) return;
      var point = project(star,time,"up"), x = point.x, y = point.y;
      var radius = (1.7 + star.depth * 4) * point.size;
      brush(colors.stars[index % 3], 0.16, 0.7);
      context.beginPath(); context.arc(x, y, radius, 0, TAU); context.stroke();
      dot(x - radius * 0.3, y - radius * 0.35, 0.8, "#d8ffff", 0.24);
    });
    mountains(["#154951", "#123e4c"], 0.14, 0.18);
  }

  function drawSakura(time, colors) {
    var span = Math.min(width, height);
    glow(width * 0.95, height * 0.06, span * 0.6, "#e7b0c0", 0.2);
    glow(width * 0.14, height * 0.82, span * 0.48, "#e7c1ce", 0.18);
    mountains(["#b8a1ae", "#bb9eac", "#c5a4b1"], 0.07, 0.09);
    branch(width + 5, height * 0.19, -Math.min(1.6, width / 700), "#9f7c90", true);
    branch(-6, height * 0.06, Math.min(1.1, width / 700), "#a48794", true);
    driftingPetals(time, ["#d98aa7", "#e3a3b7", "#d99dad"], false);
  }

  function drawFirefly(time, colors) {
    var span = Math.min(width, height);
    glow(width * 0.86, height * 0.19, span * 0.34, "#9ecca5", 0.065);
    dot(width * 0.86, height * 0.19, span * 0.035, "#dce8b2", 0.14);
    scenery.trees.forEach(function (tree) {
      var x = tree.x * width, bottom = height * 1.05, tall = tree.height * height, breadth = tree.width * width;
      brush(tree.layer ? "#123f35" : "#092f2c", tree.layer ? 0.30 : 0.22);
      context.fillRect(x - breadth * 0.025, bottom - tall, Math.max(1, breadth * 0.05), tall);
      for (var level = 0; level < 5; level++) {
        var y = bottom - tall + level * tall * 0.14;
        var spread = breadth * (0.25 + level * 0.16);
        context.beginPath(); context.moveTo(x, y);
        context.lineTo(x + spread, y + tall * 0.36);
        context.quadraticCurveTo(x, y + tall * 0.30, x - spread, y + tall * 0.36);
        context.closePath(); context.fill();
      }
    });
    for (var band = 0; band < 3; band++) {
      var y = height * (0.69 + band * 0.09), shift = Math.sin(time * 0.08 + band) * width * 0.02;
      var mist = context.createLinearGradient(0, y - 30, 0, y + 70);
      mist.addColorStop(0, "transparent"); mist.addColorStop(0.45, "#b5d6bd"); mist.addColorStop(1, "transparent");
      brush(mist, 0.035);
      context.beginPath(); context.moveTo(-20, y + 15);
      context.bezierCurveTo(width * 0.3 + shift, y - 40, width * 0.65 - shift, y + 50, width + 20, y - 5);
      context.lineTo(width + 20, y + 80); context.lineTo(-20, y + 80); context.closePath(); context.fill();
    }
    stars.forEach(function (star, index) {
      if (index >= (settings.zen ? 16 : 35)) return;
      var point = project(star,time,"float"), x = point.x, y = point.y;
      var pulse = 0.22 + (1 + Math.sin(time * 0.8 + star.phase)) * 0.18;
      glow(x, y, (9 + star.depth * 6) * point.size, "#bddd70", pulse * 0.31);
      dot(x, y, 0.7 + star.depth * 0.6, index % 3 ? "#d4ed8f" : "#8de8b1", pulse);
    });
  }

  function drawSunset(time, colors) {
    var span = Math.min(width, height), sx = width * 0.85, sy = height * 0.26, radius = span * 0.075;
    glow(sx, sy, radius * 5, "#efb77b", 0.22);
    dot(sx, sy, radius, "#f5be83", 0.4);
    dot(sx, sy, radius * 0.86, "#ffdda8", 0.23);
    for (var i = 0; i < 6; i++) {
      var x = width * (i % 2 ? 0.75 : 0.06) + Math.sin(time * 0.06 + i) * 28;
      var y = height * (0.1 + i * 0.115), breadth = width * (0.23 + i % 3 * 0.035);
      var cloud = context.createLinearGradient(0, y - 15, 0, y + 35);
      cloud.addColorStop(0, i % 2 ? "#df9da4" : "#e9b39d");
      cloud.addColorStop(1, "transparent");
      brush(cloud, 0.16);
      context.beginPath(); context.moveTo(x - breadth, y + 12);
      context.bezierCurveTo(x - breadth * 0.5, y - 10, x - breadth * 0.32, y - 20, x, y - 8);
      context.bezierCurveTo(x + breadth * 0.35, y - 25, x + breadth * 0.45, y + 8, x + breadth, y + 12);
      context.bezierCurveTo(x + breadth * 0.2, y + 37, x - breadth * 0.6, y + 32, x - breadth, y + 12);
      context.closePath(); context.fill();
    }
    mountains(["#b89aab", "#b08f9e", "#a28392"], 0.13, 0.035);
    for (var line = 0; line < 5; line++) {
      var y2 = height * (0.87 + line * 0.022), reach = radius * (0.7 + line * 0.28);
      ribbon([sx - reach, y2, sx - reach * 0.3, y2 + Math.sin(time * 0.15 + line) * 2,
        sx + reach * 0.3, y2 - 2, sx + reach, y2], "#e8bf91", 0.13, 1.1);
    }
  }

  var scenes = { nebula: drawNebula, aurora: drawAurora, ember: drawEmber, ivory: drawIvory,
    ocean: drawOcean, sakura: drawSakura, firefly: drawFirefly, sunset: drawSunset };

  function drawSky(time) {
    var sceneTime = time * (settings.zen ? .32 : settings.intensity === "soft" ? .65 : 1);
    if (gpu) {
      try {
        if (!gpu.draw(sceneTime,settings,pointer,boardRect)) gpuFailure();
      } catch (_) { gpuFailure(); }
      return;
    }
    context.clearRect(0,0,width,height);
    var colors = palette[settings.theme] || palette.nebula;
    context.save();
    context.translate(-pointer.x * 5 * strength(), -pointer.y * 3 * strength());
    scenes[settings.theme](sceneTime,colors);
    context.restore();
    context.globalAlpha = 1;
  }

  function animates() {
    return settings.fx && !settings.reducedMotion && !hidden() && Boolean(root.requestAnimationFrame);
  }

  function frame(now) {
    frameId = 0;
    if (!animates()) return;
    try {
      if (!lastPaint || now - lastPaint >= 1000 / (gpu ? 30 : 20)) {
        var delta = lastPaint ? Math.min(80, now - lastPaint) / 1000 : 0;
        skyTime += delta;
        lastPaint = now;
        var easing = Math.min(1, delta * 2.7);
        pointer.x += (pointer.targetX - pointer.x) * easing;
        pointer.y += (pointer.targetY - pointer.y) * easing;
        drawSky(skyTime);
      }
      if (!frameId && animates()) frameId = root.requestAnimationFrame(frame);
    } catch (_) { stopSky(); }
  }

  function syncSky() {
    stopSky();
    try {
      if (!findCanvas()) return;
      resizeSky();
      cacheBoard();
      if (context) context.clearRect(0,0,width,height);
      if (hidden()) return;
      if (settings.reducedMotion) pointer.x = pointer.y = pointer.targetX = pointer.targetY = 0;
      // Turning motion off freezes a full landscape, rather than clearing it.
      drawSky(settings.reducedMotion ? 0 : skyTime);
      if (animates() && !frameId) frameId = root.requestAnimationFrame(frame);
    } catch (_) {
      // GPU failures permanently choose the local 2D renderer for this page.
      if (gpu) { gpuFailure(); return; }
      stopSky();
    }
  }

  function releaseVoice(voice) {
    voices.delete(voice);
    try { voice.oscillator.disconnect(); } catch (_) {}
    try { voice.gain.disconnect(); } catch (_) {}
  }

  function stopSound() {
    if (audioContext && masterGain) {
      try {
        masterGain.gain.cancelScheduledValues(audioContext.currentTime);
        masterGain.gain.setValueAtTime(0, audioContext.currentTime);
      } catch (_) {}
    }
    voices.forEach(function (voice) {
      try { voice.oscillator.stop(); } catch (_) {}
      releaseVoice(voice);
    });
    voices.clear();
  }

  function unlock() {
    // This is the only path that may create/resume AudioContext; call on a gesture.
    if (settings.zen || !settings.sound || hidden()) return;
    try {
      if (!audioContext || audioContext.state === "closed") {
        var Audio = root.AudioContext || root.webkitAudioContext;
        if (!Audio) return;
        audioContext = new Audio();
        masterGain = audioContext.createGain();
        masterGain.gain.value = 0.28;
        masterGain.connect(audioContext.destination);
      }
      if (audioContext.state === "suspended") {
        var result = audioContext.resume();
        if (result && typeof result.catch === "function") result.catch(function () {});
      }
    } catch (_) {
      audioContext = null;
      masterGain = null;
    }
  }

  function tone(frequency, offset, duration, type, peak, endFrequency) {
    if (!audioContext || !masterGain || voices.size >= 12) return;
    var voice = null;
    try {
      var oscillator = audioContext.createOscillator();
      var gain = audioContext.createGain();
      var start = audioContext.currentTime + offset;
      oscillator.type = type || "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration * 0.8);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak || 0.055, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(masterGain);
      voice = { oscillator: oscillator, gain: gain };
      voices.add(voice);
      oscillator.onended = function () { releaseVoice(voice); };
      oscillator.start(start);
      oscillator.stop(start + duration + 0.025);
    } catch (_) {
      if (voice) releaseVoice(voice);
    }
  }

  function play(kind, level) {
    if (settings.zen || !settings.sound || hidden() || !audioContext || audioContext.state !== "running" || !masterGain) return;
    try {
      var now = audioContext.currentTime;
      if (kind === "place" && now - lastSoundAt < 0.055) return;
      lastSoundAt = now;
      masterGain.gain.setValueAtTime(0.28, now);
      if (kind === "place") {
        var scale = [392, 440, 523.25, 587.33, 659.25, 783.99];
        var step = Math.max(0, Math.min(5, Math.floor((Number(level) || 1) / 2)));
        tone(scale[step], 0, 0.17, "sine", 0.055);
      } else if (kind === "mistake") {
        tone(196, 0, 0.19, "sine", 0.04, 146.83);
      } else if (kind === "unit") {
        [523.25, 659.25, 783.99].forEach(function (frequency, index) {
          tone(frequency, index * 0.055, 0.23, "sine", 0.04);
        });
      } else if (kind === "win") {
        stopSound();
        masterGain.gain.setValueAtTime(0.28, now);
        [392, 523.25, 659.25, 783.99, 1046.5].forEach(function (frequency, index) {
          tone(frequency, index * 0.095, 0.36, "sine", 0.045);
        });
      }
    } catch (_) {}
  }

  function configure(options) {
    options = options || {};
    if (typeof options.fx === "boolean") settings.fx = options.fx;
    if (["cinematic","balanced","soft"].indexOf(options.intensity) !== -1) settings.intensity = options.intensity;
    if (typeof options.zen === "boolean") settings.zen = options.zen;
    if (typeof options.sound === "boolean") settings.sound = options.sound;
    if (typeof options.reducedMotion === "boolean") settings.reducedMotion = options.reducedMotion;
    if (Object.prototype.hasOwnProperty.call(palette, options.theme)) settings.theme = options.theme;
    if (settings.zen || !settings.sound || hidden()) stopSound();
    if (settings.zen || !settings.fx || settings.reducedMotion) {
      pointer.x = pointer.y = pointer.targetX = pointer.targetY = 0;
    }
    syncSky();
  }

  root.NineRealmsAtmosphere = { configure: configure, unlock: unlock, play: play };
  if (document && root.addEventListener) {
    // Read-only pointer input; touch scrolling never changes the backdrop.
    root.addEventListener("pointermove", function (event) {
      if (!settings.fx || settings.zen || settings.reducedMotion || hidden() ||
          mobile() || event.pointerType === "touch") return;
      pointer.targetX = Math.max(-1, Math.min(1, event.clientX / Math.max(1, width) * 2 - 1));
      pointer.targetY = Math.max(-1, Math.min(1, event.clientY / Math.max(1, height) * 2 - 1));
    }, { passive: true });
    document.addEventListener("pointerleave", function () {
      pointer.targetX = pointer.targetY = 0;
    }, { passive: true });
    root.addEventListener("resize", syncSky, { passive: true });
    root.addEventListener("scroll", function () {
      if (!canvas || hidden()) return;
      cacheBoard();
      if (!animates()) drawSky(settings.reducedMotion ? 0 : skyTime);
    }, { passive: true });
    root.addEventListener("pagehide", function () { stopSky(); stopSound(); });
    root.addEventListener("pageshow", syncSky);
    document.addEventListener("visibilitychange", function () {
      if (hidden()) stopSound();
      syncSky();
    });
  }
})(window);
