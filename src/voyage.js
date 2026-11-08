/* Nine Realms — stable legacy voyage plus independently unlocked themed expeditions. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./engine.js"), require("./training.js"));
  else root.SudokuVoyage = factory(root.SudokuEngine, root.NineRealmsTraining);
})(typeof globalThis !== "undefined" ? globalThis : this, function (Engine, Training) {
  "use strict";

  var CHAPTERS = [
    {"id":"dawn","trackId":"legacy","index":0,"title":"启明星","subtitle":"从第一束光出发","mode":"classic","difficulty":"easy"},
    {"id":"orbit","trackId":"legacy","index":1,"title":"双轨","subtitle":"沿两条对角线相遇","mode":"diagonal","difficulty":"easy"},
    {"id":"window","trackId":"legacy","index":2,"title":"方窗","subtitle":"点亮四扇隐秘的窗口","mode":"hyper","difficulty":"easy"},
    {"id":"pegasus","trackId":"legacy","index":3,"title":"天马","subtitle":"跟随马步探索星空","mode":"knight","difficulty":"easy"},
    {"id":"echo","trackId":"legacy","index":4,"title":"回声","subtitle":"在九宫之间寻找呼应","mode":"classic","difficulty":"medium"},
    {"id":"cross","trackId":"legacy","index":5,"title":"交汇","subtitle":"让两束星光各归其位","mode":"diagonal","difficulty":"medium"},
    {"id":"chamber","trackId":"legacy","index":6,"title":"光室","subtitle":"解开窗口之间的联系","mode":"hyper","difficulty":"medium"},
    {"id":"jump","trackId":"legacy","index":7,"title":"跃迁","subtitle":"让每一步跳跃都有答案","mode":"knight","difficulty":"medium"},
    {"id":"home","trackId":"legacy","index":8,"title":"归星","subtitle":"用逻辑点亮最后一颗星","mode":"classic","difficulty":"hard"},
    {"id":"lines-rise-v1","trackId":"lines","index":0,"title":"微光升温","subtitle":"先看方向，再填数字","mode":"thermo","difficulty":"easy","sourceId":"V-thermo-easy-1"},
    {"id":"lines-mirror-v1","trackId":"lines","index":1,"title":"星河镜面","subtitle":"读出两端的回应","mode":"palindrome","difficulty":"medium","sourceId":"V-palindrome-medium-1"},
    {"id":"lines-spectrum-v1","trackId":"lines","index":2,"title":"流光成谱","subtitle":"从单格走向数字集合","mode":"renban","difficulty":"hard","sourceId":"V-renban-hard-1"},
    {"id":"sums-sparks-v1","trackId":"sums","index":0,"title":"星火相聚","subtitle":"认识不重复的总和","mode":"killer","difficulty":"easy","sourceId":"V-killer-easy-1"},
    {"id":"sums-arrows-v1","trackId":"sums","index":1,"title":"光束汇流","subtitle":"拆开圆圈里的数字","mode":"arrow","difficulty":"medium","sourceId":"V-arrow-medium-1"},
    {"id":"sums-constellation-v1","trackId":"sums","index":2,"title":"群星合奏","subtitle":"让总和与九宫相互印证","mode":"killer","difficulty":"hard","sourceId":"V-killer-hard-1"},
    {"id":"fusion-homecoming-v1","trackId":"fusion","index":0,"title":"归航合鸣","subtitle":"让两种规则在同一格相遇","mode":"thermo-killer","difficulty":"hard","sourceId":"F-thermo-killer-hard-v1"}
  ];

  var TRACKS = [
    {"id":"legacy","title":"九星远征","subtitle":"原来的九站旅程，进度原样保留","description":"校准九处定位星：从行列宫出发，再用对角线、窗口与马步交叉核对。完成后，同时开放循线和汇能两路。"},
    {"id":"lines","title":"循线之旅","subtitle":"递增 · 镜像 · 连续","description":"连接三段航线：递增定方向，相等校信号，连续集合补齐频谱。三站完成后，与汇能前两站在群星合奏汇合。"},
    {"id":"sums","title":"星火求和","subtitle":"组合 · 拆分 · 交叉验证","description":"先读笼的总和，再拆分箭头，最后联合行列宫检查组合。完成与循线的汇合后，再校准归航核心。"},
    {"id":"fusion","title":"归航合鸣","subtitle":"递增与求和 · 同盘相证","description":"第十六处归航核心：前十五处星点全部点亮后开放，在同一盘中同时使用温度计与杀手笼。"}
  ];

  // One source of chapter copy: scene, observation, rule, example, resolution, next, objective.
  var TEACHING = [
    ["返航星图只留下一束微光。先校准第一处坐标。","先找候选只剩一个的空格，再核对交叉的行、列与宫。","每行、列、宫都恰好包含1–9。一个空格排除已出现的数后若只剩一个候选，才可确定它。","某行只缺7，唯一空格的列与宫也允许7，即可填入7。","第一颗定位星归位，两条航道显出交点。","下一站沿两条对角线继续定位。","naked-single"],
    ["两条航道穿过九宫中心，交叉点需要再次校对。","从对角线上的空格出发，把对角线已有的数字也加入排除。","两条主对角线各自包含1–9，行、列、宫的限制仍同时成立；中心格属于两条对角线。","主对角线已有5，同一对角线的其他格不能再填5。","交叉航道已定位，四扇窗口从星图里显现。","下一站检查额外窗口里的数字。","diagonal"],
    ["四扇窗口透出微光，照见平常九宫之外的联系。","检查额外窗口已有的数，再观察它怎样缩小交叉行列宫的候选。","标出的四个窗口各自包含1–9。一个格可以同时属于普通宫和额外窗口，两边限制都要满足。","额外窗口已有3，窗口中的空格排除3，即使它不在该数的普通宫里。","窗口校准，远处跳跃的信标变得清晰。","下一站追踪马步相隔的格子。","hyper"],
    ["定位信标按马步跳跃，留下成对的检查位置。","从已填数出发，检查与它相隔一个马步的空格。","马步相隔的两格不能相同：横向走两格再纵向一格，或纵向两格再横向一格。它不代替行列宫规则。","一个格为4，与它呈马步的空格不能填4。","信标的位置已确认，把交叉核对带回经典九宫。","下一站从数字的落点反查空格。","knight"],
    ["熟悉的坐标传回一段回声，需要从另一个方向核对。","除了看单格候选，也反查一个数字在同一区域里是否只剩一个落点。","区域唯一位置是看某个数字能去哪里，不要求那个格本来就只有一个候选。","某宫的2只在一个空格的候选中出现，即可确定它的落点。","回声已经对齐，两条航道还需进一步校准。","下一站把区域落点与对角线约束一起检查。","hidden-single"],
    ["双轨的空白需要彼此印证，单看一个区域还不够。","把对角线与行列宫同时列入候选检查，再寻找数字的唯一落点。","对角线也属于必须放齐1–9的区域。它与行、列、宫共有的格子，要同时接受这些区域的限制。","某数字在对角线上只剩一个位置时，该位置也必须符合所在行列宫。","双轨校准，信号传入更深一层的窗口。","下一站用窗口限制检查区域落点。","diagonal"],
    ["窗口同时亮起，信号开始在多个区域间传递。","比较窗口与行列宫的候选，再反查某个数字是否只有一个位置。","额外窗口不是独立的小盘。窗口排除的数字会影响其所在行、列和普通宫，区域落点也要一起检查。","窗口排除一个格的6，可能让交叉行的6只剩另一个位置。","光室接通，最后一段跳跃轨迹可以继续追踪。","下一站联合马步排除与区域落点。","hyper"],
    ["信标留下一段更稀疏的轨迹，返航坐标逐渐收拢。","先按马步排除，再检查区域中某个数字的剩余落点。","马步约束会缩小候选，但一个空格仍可能有多个候选。需要继续与行列宫配合，不凭跳跃方向猜数。","两个空格都与已填8呈马步时，都应排除8，再重新检查所在区域。","信标回到九宫中心，只差骨架的最后校准。","下一站观察宫与行列的候选交集。","knight"],
    ["九处坐标即将归位，先把骨架中的最后一处关系接通。","若某宫的一个候选只落在同一行或列，检查交集外能否排除它。","锁定候选依靠一个区域的全部候选落点都被限制在交集内。先确认全部落点，再到另一区域排除。","某宫所有候选2都在同一行，该行宫外的格子即可排除2。","九处定位星归位，循线与汇能两条航路同时开放。","两条航路都要完成，先探索哪一条由你决定。","locked-candidate"],
    ["一段航线从微光中升温，先让它的方向变得确定。","认出球端后，先看第8行第6列：它位于线上两个给定数之间。","从圆球到尖端严格递增。相邻两格至少相差1；已知两端时，先夹出中间格的范围，再与行列宫核对。","一格位于温度计上已知4和6之间，只能取两者之间的整数；这是规则例，不是本盘答案。","航线有了方向，下一束信号将在两端回应。","下一站沿回文线寻找对应的位置。","thermo-bounds"],
    ["同一束信号出现在航线两端，开始校对它们的回应。","沿回文线从两端向内配对，优先找一端已知、另一端空着的组合。","回文线对应位置的数字相等，行列宫仍需成立；它不是递增线，奇数长度线的正中格没有另一端配对。","五格线的第一格为4，则第五格也为4；第二格与第四格再成一对。","两端信号吻合，接下来把散落光点连成频谱。","下一站观察整段连续集合，顺序不限。","palindrome-pair"],
    ["散落的光点等待组成一段完整频谱。","结合线长和线上已有数字，缩小连续区间；不要把视觉方向当成大小顺序。","连续线上数字不重复，并组成连续整数集合，在线上的排列顺序不限。先确定可能的集合，再检查每格位置。","三格连续线可以依次为4、2、3，它们构成同一连续集合。","连续频谱已补齐，循线航路可以与汇能航路汇合。","循线三站与汇能前两站都完成时，进入群星合奏。","renban-set"],
    ["沿途星火收进带有总量标记的小笼，需要先读懂角标。","可先看左上角的两格笼：用角标减去已知数，再核对行列宫。","每个虚线笼的数字不重复，合计等于角标。只有一个空格时可用总和减法；多个空格时先列不重复组合。","两格和为3的笼只能用1与2；组合尚未决定各自的位置。","第一束能量已聚拢，下一站把总量沿箭头拆开。","下一站区分箭头总和与笼内不重复。","cage-remainder"],
    ["圆圈记录一束光的总量，箭身标出它的组成。","从已知圆圈或已知箭身作减法，再用行列宫检查每种拆分。","圆圈数字等于箭身各格之和。箭身是否能重复，由所在行列宫等限制决定，不能直接套用笼内不重复。","两格箭身的圆圈为6，其中一格给定2，另一格的数由减法确定。","总量与拆分已对齐，汇能航路可以与循线航路汇合。","循线三站与汇能前两站都完成时，进入群星合奏。","arrow-sum"],
    ["坐标、航线与能量汇合，需要对同一组格子交叉核对。","笼的组合仍有多个时，用所在行列宫继续筛选，而不是只看总和。","先列不重复组合，再按行列宫决定位置。每行列宫总和为45，可用于完整区域的合计复核；跨区域的笼不能整笼相减。","一个和为5的两格笼有1与4或2与3两组可能时，已有行列宫数字可以继续排除组合。","两路已完成校准，归航核心等待最后的同盘核对。","前十五处星点齐亮后，进入归航合鸣。","cage-combinations"],
    ["归途只剩最后一道校准，两条推理路径在同一盘相遇。","当温度计和笼各自还不能确定时，试着交叉检查同一格的候选。","本盘同时满足温度计递增与杀手笼不重复求和。把线上界限与笼组合取交集，两个规则都不能省略。","若某两格和为5的笼沿温度计排列，1与4、2与3两组都必须按递增方向放置；这是规则例。","十六处星点归位，返航星图已经复原。","可以重访任一星点，或去可选练习站继续观察。","joint-intersection"]
  ];
  CHAPTERS.forEach(function (chapter, index) {
    var copy = TEACHING[index]; chapter.storyIndex = index;
    chapter.scene = chapter.bridge = chapter.transition = copy[0];
    chapter.observation = chapter.goal = copy[1]; chapter.lesson = copy[2];
    chapter.mission = copy[1] + " 例如，" + copy[3];
    chapter.resolution = chapter.outcome = copy[4]; chapter.nextLink = chapter.nextStep = copy[5];
    chapter.objective = copy[6];
    chapter.ratingNote = chapter.mode === "classic" ? "固定关卡沿用原分档；观察点用于练习，不限定解题顺序。" : "难度沿用来源题库分档，尚未按完整求解技巧校准。";
  });

  // New puzzle identities leave both old boards and chapter progress readable.
  var REVISIONS = {
    "lines-rise-v1": { id: "voyage-lines-rise-lesson-v2", sourceId: "VOYAGE-THERMO-INTRO-V2", remove: [68], lines: [2] },
    "sums-sparks-v1": { id: "voyage-sums-sparks-lesson-v2", sourceId: "VOYAGE-KILLER-INTRO-V2", remove: [23] }
  };
  CHAPTERS.forEach(function (chapter) { var revision = REVISIONS[chapter.id]; if (revision) { chapter.legacySourceId = chapter.sourceId; chapter.sourceId = revision.sourceId; } });
  var puzzleCache = Object.create(null);
  function copy(value) { return JSON.parse(JSON.stringify(value)); }

  function tracks() { return TRACKS.map(function (track) { return Object.assign({}, track); }); }

  function chapterFor(id) {
    return CHAPTERS.find(function (chapter) { return chapter.id === id; }) || null;
  }

  function chapters(trackId) {
    return CHAPTERS.filter(function (chapter) { return !trackId || chapter.trackId === trackId; }).map(function (chapter) { return Object.assign({}, chapter); });
  }

  function originalPuzzle(id) {
    var chapter = chapterFor(id);
    if (!chapter) throw new RangeError("未知的星图关卡。");
    var key = id + ":original";
    if (!puzzleCache[key]) {
      var legacy = chapter.trackId === "legacy";
      puzzleCache[key] = Object.assign({}, Engine.getPuzzle(chapter.difficulty,
        (legacy ? "nine-realms-voyage-v1:" : "nine-realms-themed-voyage-v1:") + id,
        chapter.mode, legacy ? { legacyPool: true } : { sourceId: chapter.legacySourceId || chapter.sourceId }), { voyageId: id });
    }
    return puzzleCache[key];
  }

  function currentPuzzle(id) {
    var original = originalPuzzle(id), revision = REVISIONS[id];
    if (!revision) return original;
    var key = id + ":lesson-v2";
    if (!puzzleCache[key]) {
      var revised = copy(original); revised.id = revision.id; revised.sourceId = revision.sourceId;
      revision.remove.forEach(function (index) { revised.givens[index] = 0; });
      if (revision.lines) revised.clues = Engine.normalizeClues(revised.mode, { version: 1, lines: revision.lines.map(function (index) { return original.clues.lines[index]; }) });
      puzzleCache[key] = revised;
    }
    return puzzleCache[key];
  }
  function getPuzzle(id) { return copy(currentPuzzle(id)); }
  function getLegacyPuzzle(id) { return copy(originalPuzzle(id)); }

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

  function puzzleInfo(id, givens, mode, difficulty, clues) {
    var chapter = chapterFor(id);
    if (!chapter || !Array.isArray(givens) || givens.length !== 81) return null;
    if (chapter.trackId === "legacy" && !legacyClues(clues)) return null;
    function matches(puzzle) {
      return puzzle.mode === mode && puzzle.difficulty === difficulty &&
        (chapter.trackId === "legacy" || canonical(clues) === canonical(puzzle.clues)) &&
        puzzle.givens.every(function (value, index) { return value === givens[index]; });
    }
    if (matches(currentPuzzle(id))) return { edition: REVISIONS[id] ? "lesson-v2" : "original", label: REVISIONS[id] ? "教学题面 v2" : "", sourceId: currentPuzzle(id).sourceId, revised: Boolean(REVISIONS[id]) };
    if (REVISIONS[id] && matches(originalPuzzle(id))) return { edition: "original", label: "旧版题面", sourceId: originalPuzzle(id).sourceId, revised: true };
    return null;
  }
  function matchesPuzzle(id, givens, mode, difficulty, clues) { return Boolean(puzzleInfo(id, givens, mode, difficulty, clues)); }

  function presentation(id, snapshot) {
    var chapter = chapterFor(id); if (!chapter) return null;
    var result = Object.assign({}, chapter), info = snapshot && puzzleInfo(id, snapshot.givens, snapshot.mode, snapshot.difficulty, snapshot.clues);
    result.editionLabel = REVISIONS[id] ? info ? info.label : "教学题面 v2" : "";
    result.legacyEdition = Boolean(REVISIONS[id] && info && info.edition === "original");
    if (result.legacyEdition) {
      result.observation = result.goal = id === "lines-rise-v1" ? "沿球端到尖端检查递增，再与行列宫交叉核对候选。" : "从短笼的角标与已填数字入手，检查不重复组合。";
      result.mission = result.observation;
      result.ratingNote = "旧版题面保持原样，继续不会换题。章节历史最佳包含旧版成绩。";
    }
    return result;
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
      Number.isInteger(stats.hints) && stats.hints >= 0 && stats.hints <= 1e9 &&
      (stats.errorCheckIncomplete === undefined || typeof stats.errorCheckIncomplete === "boolean");
  }

  function starsFor(stats) {
    return 1 + (stats.hints === 0 ? 1 : 0) + (stats.mistakes === 0 && stats.errorCheckIncomplete !== true ? 1 : 0);
  }

  function copyRecord(record) {
    var copy = {
      stars: starsFor(record),
      elapsedMs: Math.floor(record.elapsedMs),
      mistakes: record.mistakes,
      hints: record.hints
    };
    if (record.errorCheckIncomplete === true) copy.errorCheckIncomplete = true;
    return copy;
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
    if (result["fusion-homecoming-v1"] && !(result.__journey && result.__journey.granted.indexOf("fusion-homecoming-v1") >= 0) &&
        CHAPTERS.some(function (chapter) { return chapter.id !== "fusion-homecoming-v1" && !result[chapter.id]; })) delete result["fusion-homecoming-v1"];
    if (Object.prototype.hasOwnProperty.call(raw, "__practice")) {
      var practice = Training.validateProgress(raw.__practice);
      if (canonical(practice) !== canonical(raw.__practice)) throw new TypeError("练习进度格式无效，原数据不应被覆盖。");
      result.__practice = practice;
    }
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
    if (raw && typeof raw === "object" && Object.prototype.hasOwnProperty.call(raw, "__practice")) {
      try {
        if (canonical(Training.validateProgress(raw.__practice)) !== canonical(raw.__practice)) throw new TypeError("练习标记不规范");
      } catch (_) {
        var practiceError = new Error("练习进度来自不支持的版本或格式已损坏；原数据已保留，请勿覆盖。");
        practiceError.code = "VOYAGE_PROGRESS_UNSUPPORTED";
        throw practiceError;
      }
    }
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
      TRACKS.filter(function (track) { return track.id !== "fusion"; }).forEach(function (track) {
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
    if (chapter.id === "fusion-homecoming-v1") return CHAPTERS.filter(function (stage) { return stage.id !== chapter.id; }).map(function (stage) { return stage.id; });
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
        chapter.id === "fusion-homecoming-v1" ? "旧十五处星点全部完成后，开放温度计与杀手笼的同盘归航。" :
        chapter.id === "sums-constellation-v1" ? "循线三站与求和前两站都完成后，开放两路汇合。" : "完成九星远征后，线条与求和两路同时开放。";
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
    return { title: "修复返航星图", objective: "先校准九颗定位星，再沿循线与求和两路准备；两路完成后汇合，再完成双规则归航核心，点亮全部十六处星点。",
      total: overall.total, completed: overall.completed, stars: overall.stars, finished: overall.completed === overall.total,
      nextId: next ? next.id : null, nextTrackId: next ? next.trackId : null, stages: stages,
      inheritedPassage: inheritedPassage, granted: grants.slice(), returning: returning,
      continuityMessage: overall.completed === overall.total ? "十六处星点全部点亮，返航星图已修复。你仍可重访任意关卡。" :
        returning ? "后段成绩全部保留。可回访尚未点亮的早期星点，补全十六处星图；已通关部分无需重玩。" :
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

  function practiceProgress(progress) {
    return Training.validateProgress(normalizeProgress(progress).__practice);
  }

  function recordPractice(progress, id, index, digit) {
    var clean = normalizeProgress(progress);
    clean.__practice = Training.recordSuccess(clean.__practice, id, index, digit);
    return clean;
  }

  function worldState(progress) {
    var clean = normalizeProgress(progress), practice = practiceProgress(clean);
    var phaseDefinitions = [
      { id: "coordinate", title: "定位星", total: 9 }, { id: "lines", title: "航路", total: 3 },
      { id: "energy", title: "能量", total: 2 }, { id: "convergence", title: "两路汇合", total: 1 },
      { id: "homecoming", title: "归航核心", total: 1 }
    ];
    function phase(chapter) {
      if (chapter.trackId === "legacy") return "coordinate";
      if (chapter.trackId === "lines") return "lines";
      if (chapter.trackId === "fusion") return "homecoming";
      return chapter.id === "sums-constellation-v1" ? "convergence" : "energy";
    }
    var nodes = CHAPTERS.map(function (chapter) { return { id: chapter.id, title: chapter.title,
      phase: phase(chapter), order: chapter.storyIndex, repaired: Boolean(clean[chapter.id]),
      stars: clean[chapter.id] ? clean[chapter.id].stars : 0 }; });
    var edges = [];
    CHAPTERS.forEach(function (chapter) { dependencies(chapter).forEach(function (id) {
      edges.push({ from: id, to: chapter.id, repaired: Boolean(clean[id] && clean[chapter.id]) });
    }); });
    var phases = phaseDefinitions.map(function (item) {
      var count = nodes.filter(function (node) { return node.phase === item.id && node.repaired; }).length;
      return Object.assign({}, item, { repaired: count, complete: count === item.total });
    });
    var satellites = Training.stations().map(function (station) {
      var completed = station.exerciseIds.filter(function (id) { return practice.completed.indexOf(id) >= 0; });
      return { id: station.id, title: station.title, after: station.after, optional: true,
        completed: completed.length, total: station.exerciseIds.length, complete: completed.length === station.exerciseIds.length };
    });
    var repaired = nodes.filter(function (node) { return node.repaired; }).length;
    return { title: "返航星图", total: nodes.length, repaired: repaired, finished: repaired === nodes.length,
      nodes: nodes, edges: edges, phases: phases, satellites: satellites };
  }

  function award(progress, id, stats) {
    var chapter = chapterFor(id);
    if (!chapter) throw new RangeError("未知的星图关卡。");
    if (!validStats(stats)) throw new TypeError("星图通关记录无效。");
    var clean = normalizeProgress(progress);
    if (chapter.id === "fusion-homecoming-v1" && !canEnter(clean, id)) return clean;
    if (chapter.index >= getStatus(clean, chapter.trackId).unlocked &&
        !(clean.__journey && clean.__journey.granted.indexOf(id) >= 0)) return clean;
    var next = copyRecord(stats);
    var previous = clean[id];
    if (!previous || next.stars > previous.stars ||
        (next.stars === previous.stars && next.elapsedMs < previous.elapsedMs)) clean[id] = next;
    return clean;
  }

  return { tracks: tracks, chapters: chapters, getPuzzle: getPuzzle, getLegacyPuzzle: getLegacyPuzzle, puzzleInfo: puzzleInfo, presentation: presentation, matchesPuzzle: matchesPuzzle, starsFor: starsFor,
    normalizeProgress: normalizeProgress, award: award, getStatus: getStatus,
    journey: journey, canEnter: canEnter, nextAfter: nextAfter, migrateProgress: migrateProgress, retainCurrent: retainCurrent,
    practiceProgress: practiceProgress, recordPractice: recordPractice, worldState: worldState };
});
