/* Nine Realms — stable legacy voyage plus independently unlocked themed expeditions. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./engine.js"));
  else root.SudokuVoyage = factory(root.SudokuEngine);
})(typeof globalThis !== "undefined" ? globalThis : this, function (Engine) {
  "use strict";

  var CHAPTERS = [
    { id: "dawn", title: "启明星", subtitle: "从第一束光出发", mode: "classic", difficulty: "easy" },
    { id: "orbit", title: "双轨", subtitle: "沿两条对角线相遇", mode: "diagonal", difficulty: "easy" },
    { id: "window", title: "方窗", subtitle: "点亮四扇隐秘的窗口", mode: "hyper", difficulty: "easy" },
    { id: "pegasus", title: "天马", subtitle: "跟随马步探索星空", mode: "knight", difficulty: "easy" },
    { id: "echo", title: "回声", subtitle: "在九宫之间寻找呼应", mode: "classic", difficulty: "medium" },
    { id: "cross", title: "交汇", subtitle: "让两束星光各归其位", mode: "diagonal", difficulty: "medium" },
    { id: "chamber", title: "光室", subtitle: "解开窗口之间的联系", mode: "hyper", difficulty: "medium" },
    { id: "jump", title: "跃迁", subtitle: "让每一步跳跃都有答案", mode: "knight", difficulty: "medium" },
    { id: "home", title: "归星", subtitle: "用逻辑点亮最后一颗星", mode: "classic", difficulty: "hard" }
  ].map(function (chapter, index) {
    return Object.assign({ index: index, trackId: "legacy" }, chapter);
  });

  var TRACKS = [
    { id: "legacy", title: "九星远征", subtitle: "原来的九站旅程，进度原样保留", description: "从经典规则走向对角线、窗口与马步；重访旧关不丢最佳成绩。" },
    { id: "lines", title: "循线之旅", subtitle: "递增 · 镜像 · 连续", description: "三站认识线条的不同语言：先看方向，再看对称，最后看连续集合。" },
    { id: "sums", title: "星火求和", subtitle: "组合 · 拆分 · 交叉验证", description: "从小笼的总和出发，学习箭头拆分，再把多个笼与行列宫联系起来。" }
  ];
  var THEMED = [
    { id: "lines-rise-v1", trackId: "lines", title: "微光升温", subtitle: "先看方向，再填数字", mode: "thermo", difficulty: "easy", sourceId: "V-thermo-easy-1",
      lesson: "温度计从圆球到尖端严格递增。长度为 n 的线，圆球最多是 10−n；沿线每前进一步，数字至少增大 1。",
      goal: "先找到一条温度计，比较相邻格的上下界，再与行、列和宫的已填数交叉检查。" },
    { id: "lines-mirror-v1", trackId: "lines", title: "星河镜面", subtitle: "读出两端的回应", mode: "palindrome", difficulty: "medium", sourceId: "V-palindrome-medium-1",
      lesson: "回文线两端向内对应的位置必须相等；它不是递增线。先找到已知数字的镜像位置。",
      goal: "沿一条回文线成对检查两端；同值仍要遵守各自行、列和宫的限制。" },
    { id: "lines-spectrum-v1", trackId: "lines", title: "流光成谱", subtitle: "从单格走向数字集合", mode: "renban", difficulty: "hard", sourceId: "V-renban-hard-1",
      lesson: "连续线上的数字互不重复，并组成一段连续整数；排列顺序不限，不要求沿线递增。",
      goal: "根据线长和已知数字缩小整段连续区间，再把候选与行列宫相互核对。" },
    { id: "sums-sparks-v1", trackId: "sums", title: "星火相聚", subtitle: "认识不重复的总和", mode: "killer", difficulty: "easy", sourceId: "V-killer-easy-1",
      lesson: "每个虚线笼的数字不重复，合计等于角标。两格和为 3 只能是 1 与 2；其他组合还要接受行列宫约束。",
      goal: "先找最短的笼，列出不重复的数字组合；已知一格时，用总和减去它。" },
    { id: "sums-arrows-v1", trackId: "sums", title: "光束汇流", subtitle: "拆开圆圈里的数字", mode: "arrow", difficulty: "medium", sourceId: "V-arrow-medium-1",
      lesson: "圆圈中的数字等于箭身各格之和。箭身可否重复由行列宫等规则决定，不能照搬杀手笼的不重复条件。",
      goal: "先从已知圆圈或已知箭身作减法，再检查每种拆分是否符合所在行列宫。" },
    { id: "sums-constellation-v1", trackId: "sums", title: "群星合奏", subtitle: "让总和与九宫相互印证", mode: "killer", difficulty: "hard", sourceId: "V-killer-hard-1",
      lesson: "每行、列、宫的 1–9 总和都是 45。若干完整笼都位于同一行、列或宫内且互不重叠时，可从 45 扣去它们的总和，求出该区域其余格的合计。",
      goal: "结合笼的候选组合与行列宫限制逐步推进；不要把跨区域的完整笼总和直接相减。" }
  ];
  THEMED.forEach(function (chapter) {
    chapter.index = THEMED.filter(function (other) { return other.trackId === chapter.trackId; }).indexOf(chapter);
    chapter.ratingNote = "章节按概念逐步展开；入门／标准／进阶是原题给定密度档，不是人类技巧评级。";
    CHAPTERS.push(chapter);
  });

  // One story, three acts. Metadata never changes a puzzle or saved record.
  var STORY = [
    ["星图失去第一处坐标。", "用行、列、宫找回第一颗定位星。", "沿修复的坐标寻找两条交叉航道。"],
    ["两条航道在远方交叉。", "让两条对角线也各自容纳 1–9。", "交叉点指向四扇被遮住的窗口。"],
    ["窗口里藏着下一段航线。", "同时核对九宫与四个额外窗口。", "穿过窗口，追上跳跃的信标。"],
    ["信标不沿直线移动。", "检查马步相隔格，避免数字相撞。", "把学到的交叉检查带回经典九宫。"],
    ["旧坐标发来新的回声。", "在给定更少的经典盘里连接行列宫。", "回声汇聚到更复杂的双轨交点。"],
    ["双轨间的空白需要彼此印证。", "用对角线与宫的共同约束推进。", "顺着交点打开最后一间光室。"],
    ["光室中的窗口同时亮起。", "把额外窗口的限制传回行列宫。", "借这束光完成最后一次跃迁。"],
    ["返航信标只剩一次跳跃。", "在更稀疏的盘面中保持马步约束。", "回到九宫中心，校准原始星图。"],
    ["九颗定位星终于归位，航线仍然断裂。", "解开经典九宫，完成星图的坐标骨架。", "九星定位完成；可选择循线或求和两路，最终在群星合奏汇合。"],
    ["温度计般的航线从微光中升起。", "沿圆球到尖端的递增关系修复航线。", "方向确定后，寻找两端互相回应的镜面信号。"],
    ["一束信号在航线两端出现。", "用回文线对应位置相等的规则校对信号。", "把单点对应扩大为一整段连续频谱。"],
    ["离散光点需要组成连续的频谱。", "找出连续线上的数字集合，完成航线修复。", "航线已通；完成求和前两站后，一同进入群星合奏。"],
    ["沿途星火被收进标有总量的容器。", "用笼内不重复的数字组合补齐能量。", "沿箭头把分散的能量汇入同一圆圈。"],
    ["能量沿箭身汇向接收圆圈。", "核对圆圈等于箭身之和，不额外假设笼规则。", "求和能量已备齐；循线三站完成后，一同进入群星合奏。"],
    ["坐标、航线与能量在归途汇合。", "用笼总和与行列宫交叉检查，点亮最后的星点。", "所有十五处星点点亮后，返航星图完整修复。" ]
  ];
  var EXAMPLES = [
    "例如一行只缺 7，就用列与宫再核对 7。", "例如主对角线已有 5，其余对角线格不能再放 5。",
    "例如额外窗口已有 3，同一窗口其余格排除 3。", "例如一个格填 4，它的马步相隔格不能填 4。",
    "例如某宫的 2 只剩一处候选，就检查对应行列。", "例如对角线唯一缺数也必须满足所在宫。",
    "例如窗口排除的 6，也会缩小交叉行的候选。", "例如两个候选格与已填 8 呈马步时，都需排除 8。",
    "例如同一行的缺数要分别接受列与宫检验。", "例如三格温度计的圆球最多为 7。",
    "例如五格回文线第一格为 4，则第五格也是 4。", "例如三格连续线可为 4、2、3，顺序不限。",
    "例如两格笼和为 3，只能用 1 与 2。", "例如两格箭身的圆圈为 6、一格已填 2，则另一格为 4。",
    "例如完全位于同一行、互不重叠的若干笼合计为 40，则该行其余格合计为 5。"
  ];
  CHAPTERS.forEach(function (chapter, index) {
    chapter.storyIndex = index;
    chapter.transition = STORY[index][0];
    chapter.mission = STORY[index][1] + EXAMPLES[index];
    chapter.bridge = STORY[index][0];
    chapter.outcome = index < 9 ? "修复第 " + (index + 1) + " 颗定位星，保留这一站的最佳星级。" : index < 12 ? "接通第 " + (index - 8) + " 段航路，让线条规则与星图骨架吻合。" : index < 14 ? "汇聚第 " + (index - 11) + " 束能量，为两路汇合做准备。" : "完成两路的最终校准；十五处星点齐亮时，返航星图修复完成。";
    chapter.nextLink = STORY[index][2];
    chapter.nextStep = STORY[index][2];
  });
  TRACKS[0].description = "第一幕：修复九颗定位星。行列宫是共同骨架，对角线、窗口与马步练习交叉约束；完成后同时开放线条与求和两路。";
  TRACKS[1].description = "第二幕：连接返航航线。在行列宫骨架上加入递增、对应相等与连续集合；完成三站后，与求和前两站共同解锁最终汇合。";
  TRACKS[2].description = "第二幕与终章：汇聚返航能量。把笼与箭头的局部总和同九宫骨架相互核对，前两站汇聚能量；与循线三站共同解锁最终关，修复全部十五处星点。";

  function tracks() { return TRACKS.map(function (track) { return Object.assign({}, track); }); }

  function chapterFor(id) {
    return CHAPTERS.find(function (chapter) { return chapter.id === id; }) || null;
  }

  function chapters(trackId) {
    return CHAPTERS.filter(function (chapter) { return !trackId || chapter.trackId === trackId; }).map(function (chapter) { return Object.assign({}, chapter); });
  }

  function getPuzzle(id) {
    var chapter = chapterFor(id);
    if (!chapter) throw new RangeError("未知的星图关卡。");
    var legacy = chapter.trackId === "legacy";
    return Object.assign({}, Engine.getPuzzle(chapter.difficulty,
      (legacy ? "nine-realms-voyage-v1:" : "nine-realms-themed-voyage-v1:") + id,
      chapter.mode, legacy ? { legacyPool: true } : { sourceId: chapter.sourceId }), { voyageId: id });
  }

  // Legacy schedules contain no per-puzzle clues; extra constraints cannot claim their records.
  function legacyClues(clues) {
    if (clues === undefined || clues === null) return true;
    if (!clues || typeof clues !== "object" || Array.isArray(clues)) return false;
    var lists = ["regions", "cages", "lines", "edges", "parity", "outside", "clones", "quadruples"];
    return Object.keys(clues).every(function (key) {
      return key === "version" ? clues[key] === 1 :
        lists.indexOf(key) >= 0 && Array.isArray(clues[key]) && clues[key].length === 0;
    });
  }

  function matchesPuzzle(id, givens, mode, difficulty, clues) {
    var chapter = chapterFor(id);
    if (!chapter || !Array.isArray(givens) || givens.length !== 81) return false;
    if (chapter.trackId === "legacy" && !legacyClues(clues)) return false;
    var puzzle = getPuzzle(id);
    if (chapter.trackId !== "legacy" && canonical(clues) !== canonical(puzzle.clues)) return false;
    return puzzle.mode === mode && puzzle.difficulty === difficulty &&
      puzzle.givens.every(function (value, index) { return value === givens[index]; });
  }

  function canonical(value) {
    if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
    if (value && typeof value === "object") return "{" + Object.keys(value).sort().map(function (key) {
      return JSON.stringify(key) + ":" + canonical(value[key]);
    }).join(",") + "}";
    return JSON.stringify(value);
  }

  function validStats(stats) {
    return stats && typeof stats === "object" && !Array.isArray(stats) &&
      Number.isFinite(stats.elapsedMs) && stats.elapsedMs >= 0 && stats.elapsedMs <= 1e12 &&
      Number.isInteger(stats.mistakes) && stats.mistakes >= 0 && stats.mistakes <= 1e9 &&
      Number.isInteger(stats.hints) && stats.hints >= 0 && stats.hints <= 1e9;
  }

  function starsFor(stats) {
    return 1 + (stats.hints === 0 ? 1 : 0) + (stats.mistakes === 0 ? 1 : 0);
  }

  function copyRecord(record) {
    return {
      stars: starsFor(record),
      elapsedMs: Math.floor(record.elapsedMs),
      mistakes: record.mistakes,
      hints: record.hints
    };
  }

  function normalizeProgress(raw) {
    var result = {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return result;
    // Each expedition has its own contiguous prefix. A gap in one never erases
    // valid progress in another, and later orphan records never unlock stages.
    TRACKS.forEach(function (track) {
      var route = chapters(track.id);
      for (var index = 0; index < route.length; index++) {
        var id = route[index].id;
        if (!Object.prototype.hasOwnProperty.call(raw, id)) break;
        var record = raw[id];
        if (!validStats(record) || !Number.isInteger(record.stars) ||
            record.stars < 1 || record.stars > 3 || record.stars !== starsFor(record)) break;
        result[id] = copyRecord(record);
      }
    });
    if (raw.__journey && typeof raw.__journey === "object" && !Array.isArray(raw.__journey) &&
        raw.__journey.version === 1 && Array.isArray(raw.__journey.granted)) {
      result.__journey = { version: 1, granted: CHAPTERS.filter(function (chapter) {
        return raw.__journey.granted.indexOf(chapter.id) >= 0;
      }).map(function (chapter) { return chapter.id; }) };
    }
    // A migrated active/previously accessible stage may be ahead of a missing
    // local prefix. Keep only its explicitly granted, independently valid result.
    if (result.__journey) result.__journey.granted.forEach(function (id) {
      var record = raw[id];
      if (Object.prototype.hasOwnProperty.call(raw, id) && validStats(record) &&
          Number.isInteger(record.stars) && record.stars === starsFor(record)) result[id] = copyRecord(record);
    });
    return result;
  }

  function getStatus(progress, trackId) {
    trackId = trackId || "legacy";
    var route = trackId === "all" ? chapters() : chapters(trackId);
    var clean = normalizeProgress(progress);
    var ids = route.filter(function (chapter) { return Boolean(clean[chapter.id]); }).map(function (chapter) { return chapter.id; });
    var completed = ids.length, prefix = 0;
    while (prefix < route.length && clean[route[prefix].id]) prefix++;
    return {
      stars: ids.reduce(function (sum, id) { return sum + clean[id].stars; }, 0),
      total: route.length,
      completed: completed,
      unlocked: trackId === "all" ? TRACKS.reduce(function (sum, track) { return sum + getStatus(clean, track.id).unlocked; }, 0) : Math.min(route.length, prefix + 1),
      nextId: (route.find(function (chapter) { return !clean[chapter.id]; }) || {}).id || null
    };
  }

  // One-time migration records the exact old access rights, not future unlocks.
  // Missing storage is different from an existing empty pre-story progress object.
  function migrateProgress(raw, currentVoyageId, options) {
    if (raw && typeof raw === "object" && Object.prototype.hasOwnProperty.call(raw, "__journey")) {
      var marker = raw.__journey, normalizedMarker = normalizeProgress(raw).__journey;
      if (!marker || typeof marker !== "object" || Array.isArray(marker) || marker.version !== 1 ||
          !normalizedMarker || canonical(marker) !== canonical(normalizedMarker)) {
        var error = new Error("远征进度标记来自不支持的版本或格式已损坏；原数据已保留，请勿覆盖。");
        error.code = "VOYAGE_PROGRESS_UNSUPPORTED";
        throw error;
      }
    }
    var clean = normalizeProgress(raw);
    if (clean.__journey) return clean;
    var granted = [];
    if (options && options.existing) {
      TRACKS.forEach(function (track) {
        var unlocked = getStatus(clean, track.id).unlocked;
        chapters(track.id).forEach(function (chapter) { if (chapter.index < unlocked) granted.push(chapter.id); });
      });
      if (chapterFor(currentVoyageId)) granted.push(currentVoyageId);
    }
    clean.__journey = { version: 1, granted: CHAPTERS.filter(function (chapter) {
      return granted.indexOf(chapter.id) >= 0;
    }).map(function (chapter) { return chapter.id; }) };
    return clean;
  }

  // Caller must first verify the restored actual puzzle with matchesPuzzle.
  function retainCurrent(progress, id) {
    if (!chapterFor(id)) throw new RangeError("未知的星图关卡。");
    var clean = normalizeProgress(progress), grants = clean.__journey ? clean.__journey.granted.slice() : [];
    grants.push(id);
    clean.__journey = { version: 1, granted: CHAPTERS.filter(function (chapter) {
      return grants.indexOf(chapter.id) >= 0;
    }).map(function (chapter) { return chapter.id; }) };
    return clean;
  }

  function dependencies(chapter) {
    if (chapter.id === "sums-constellation-v1") return chapters("lines").concat(chapters("sums").slice(0, 2)).map(function (stage) { return stage.id; });
    if (chapter.index > 0) return chapters(chapter.trackId).slice(0, chapter.index).map(function (stage) { return stage.id; });
    return chapter.trackId === "legacy" ? [] : chapters("legacy").map(function (stage) { return stage.id; });
  }

  function canEnter(progress, id, currentVoyageId) {
    var chapter = chapterFor(id);
    if (!chapter) return false;
    var clean = normalizeProgress(progress), current = chapterFor(currentVoyageId);
    if (clean[id] || current && current.id === id) return true;
    // Exact old rights include an active saved stage even if its earlier records
    // are missing. No ungranted future stages gain permission from a count alone.
    if (clean.__journey && clean.__journey.granted.indexOf(id) >= 0) return true;
    if (!clean.__journey && chapter.index >= getStatus(clean, chapter.trackId).unlocked) return false;
    return dependencies(chapter).every(function (dependency) { return Boolean(clean[dependency]); });
  }

  function journey(progress, currentVoyageId) {
    var clean = normalizeProgress(progress), current = chapterFor(currentVoyageId), overall = getStatus(clean, "all");
    var grants = clean.__journey ? clean.__journey.granted : [];
    var inheritedPassage = grants.some(function (id) {
      var chapter = chapterFor(id); return !dependencies(chapter).every(function (dependency) { return Boolean(clean[dependency]); });
    });
    var stages = CHAPTERS.map(function (chapter) {
      var done = Boolean(clean[chapter.id]), enter = canEnter(clean, chapter.id, currentVoyageId);
      var isCurrent = Boolean(current && current.id === chapter.id && !done), required = dependencies(chapter);
      var inherited = !done && grants.indexOf(chapter.id) >= 0 && !required.every(function (id) { return Boolean(clean[id]); });
      var reason = done ? "已点亮，可随时回访；不会重置最佳成绩。" : isCurrent ? "继续已保存的当前远征棋局。" :
        enter ? inherited ? "沿用旧版已解锁资格，可继续这一关。" : "这一星点已开放，可以继续修复。" :
        chapter.index >= getStatus(clean, chapter.trackId).unlocked ? "先点亮本幕前一处星点。" :
        chapter.id === "sums-constellation-v1" ? "循线三站与求和前两站都完成后，开放最终汇合。" : "完成九星远征后，线条与求和两路同时开放。";
      return Object.assign({}, chapter, { status: done ? "completed" : isCurrent ? "current" : enter ? "open" : "locked",
        canEnter: enter, reason: reason, requires: required, inherited: inherited });
    });
    var next = null;
    if (current && !clean[current.id]) next = stages.find(function (stage) { return stage.id === current.id; });
    // Keep an old player's active later route, but never invent new access grants.
    if (!next && inheritedPassage) {
      for (var t = TRACKS.length - 1; t >= 1 && !next; t--) {
        if (getStatus(clean, TRACKS[t].id).completed > 0)
          next = stages.find(function (stage) { return stage.trackId === TRACKS[t].id && stage.canEnter && !clean[stage.id]; }) || null;
      }
    }
    if (!next) next = stages.find(function (stage) { return stage.canEnter && !clean[stage.id]; }) || null;
    var returning = Boolean(next && next.trackId === "legacy" && TRACKS.slice(1).some(function (track) { return getStatus(clean, track.id).completed > 0; }));
    return { title: "修复返航星图", objective: "先校准九颗定位星，再沿循线与求和两路准备；两路完成后汇合，点亮全部十五处星点。",
      total: overall.total, completed: overall.completed, stars: overall.stars, finished: overall.completed === overall.total,
      nextId: next ? next.id : null, nextTrackId: next ? next.trackId : null, stages: stages,
      inheritedPassage: inheritedPassage, granted: grants.slice(), returning: returning,
      continuityMessage: overall.completed === overall.total ? "十五处星点全部点亮，返航星图已修复。你仍可重访任意关卡。" :
        returning ? "后段成绩全部保留。可回访尚未点亮的早期星点，补全十五处星图；已通关部分无需重玩。" :
        inheritedPassage ? "已保留旧版实际解锁的关卡及当前棋局；不要求重玩已通关部分。后续新解锁仍遵循两路汇合条件。" :
        "完成九星远征后，循线与求和两路同时开放；循线三站和求和前两站完成后汇合。" };
  }

  function nextAfter(progress, id) {
    var state = journey(progress), chapter = chapterFor(id);
    if (state.finished) return null;
    if (!chapter) return state.nextId;
    var next = state.stages.find(function (stage) { return stage.storyIndex > chapter.storyIndex && stage.canEnter && stage.status !== "completed"; });
    return next ? next.id : state.nextId;
  }

  function award(progress, id, stats) {
    var chapter = chapterFor(id);
    if (!chapter) throw new RangeError("未知的星图关卡。");
    if (!validStats(stats)) throw new TypeError("星图通关记录无效。");
    var clean = normalizeProgress(progress);
    if (chapter.index >= getStatus(clean, chapter.trackId).unlocked &&
        !(clean.__journey && clean.__journey.granted.indexOf(id) >= 0)) return clean;
    var next = copyRecord(stats);
    var previous = clean[id];
    if (!previous || next.stars > previous.stars ||
        (next.stars === previous.stars && next.elapsedMs < previous.elapsedMs)) clean[id] = next;
    return clean;
  }

  return { tracks: tracks, chapters: chapters, getPuzzle: getPuzzle, matchesPuzzle: matchesPuzzle,
    normalizeProgress: normalizeProgress, award: award, getStatus: getStatus,
    journey: journey, canEnter: canEnter, nextAfter: nextAfter, migrateProgress: migrateProgress, retainCurrent: retainCurrent };
});
