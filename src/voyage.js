/* Nine Realms — a deterministic nine-stop voyage, with local progress handled by the caller. */
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
    return Object.assign({ index: index }, chapter);
  });

  function chapterFor(id) {
    return CHAPTERS.find(function (chapter) { return chapter.id === id; }) || null;
  }

  function chapters() {
    return CHAPTERS.map(function (chapter) { return Object.assign({}, chapter); });
  }

  function getPuzzle(id) {
    var chapter = chapterFor(id);
    if (!chapter) throw new RangeError("未知的星图关卡。");
    return Object.assign({}, Engine.getPuzzle(chapter.difficulty, "nine-realms-voyage-v1:" + id, chapter.mode, { legacyPool: true }),
      { voyageId: id });
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
    if (!legacyClues(clues) || !chapterFor(id) || !Array.isArray(givens) || givens.length !== 81) return false;
    var puzzle = getPuzzle(id);
    return puzzle.mode === mode && puzzle.difficulty === difficulty &&
      puzzle.givens.every(function (value, index) { return value === givens[index]; });
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
    // A valid journey is a contiguous prefix. Orphaned later records cannot unlock
    // levels immediately or become free completions when an earlier gap is filled.
    for (var index = 0; index < CHAPTERS.length; index++) {
      var id = CHAPTERS[index].id;
      if (!Object.prototype.hasOwnProperty.call(raw, id)) break;
      var record = raw[id];
      if (!validStats(record) || !Number.isInteger(record.stars) ||
          record.stars < 1 || record.stars > 3 || record.stars !== starsFor(record)) break;
      result[id] = copyRecord(record);
    }
    return result;
  }

  function getStatus(progress) {
    var clean = normalizeProgress(progress);
    var ids = Object.keys(clean);
    var completed = ids.length;
    return {
      stars: ids.reduce(function (sum, id) { return sum + clean[id].stars; }, 0),
      total: CHAPTERS.length,
      completed: completed,
      unlocked: Math.min(CHAPTERS.length, completed + 1),
      nextId: completed < CHAPTERS.length ? CHAPTERS[completed].id : null
    };
  }

  function award(progress, id, stats) {
    var chapter = chapterFor(id);
    if (!chapter) throw new RangeError("未知的星图关卡。");
    if (!validStats(stats)) throw new TypeError("星图通关记录无效。");
    var clean = normalizeProgress(progress);
    if (chapter.index >= getStatus(clean).unlocked) return clean;
    var next = copyRecord(stats);
    var previous = clean[id];
    if (!previous || next.stars > previous.stars ||
        (next.stars === previous.stars && next.elapsedMs < previous.elapsedMs)) clean[id] = next;
    return clean;
  }

  return { chapters: chapters, getPuzzle: getPuzzle, matchesPuzzle: matchesPuzzle,
    normalizeProgress: normalizeProgress, award: award, getStatus: getStatus };
});
