/* Nine Realms — deterministic daily puzzles, Beijing calendar, no storage or network. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./engine.js"));
  else root.SudokuDaily = factory(root.SudokuEngine);
})(typeof globalThis !== "undefined" ? globalThis : this, function (Engine) {
  "use strict";
  var DAY = 86400000;
  var OFFSET = 8 * 60 * 60 * 1000;
  var MODES = ["classic", "diagonal", "hyper", "knight"];
  var MAX_RECORDS = 400;

  function isDateKey(key) {
    if (typeof key !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
    var value = new Date(key + "T00:00:00.000Z");
    return Number.isFinite(value.getTime()) && value.toISOString().slice(0, 10) === key;
  }

  function requireDate(key) {
    if (!isDateKey(key)) throw new RangeError("每日一境需要有效的 YYYY-MM-DD 日期。");
    return Math.floor(new Date(key + "T00:00:00.000Z").getTime() / DAY);
  }

  function dateKey(date) {
    var time = date === undefined ? Date.now() : new Date(date).getTime();
    if (!Number.isFinite(time)) throw new RangeError("日期无效。");
    var key = new Date(time + OFFSET).toISOString().slice(0, 10);
    requireDate(key);
    return key;
  }

  function modulo(value, divisor) { return ((value % divisor) + divisor) % divisor; }

  function getPuzzle(key) {
    var day = requireDate(key);
    var mode = MODES[modulo(day, MODES.length)];
    // Five gentle days and two medium days per seven-day cycle; never hard/master.
    var difficulty = modulo(day, 7) < 5 ? "easy" : "medium";
    var puzzle = Engine.getPuzzle(difficulty, "nine-realms-daily-v1:" + key, mode, { legacyPool: true });
    return Object.assign({}, puzzle, { dailyDate: key });
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

  function matchesPuzzle(key, givens, mode, difficulty, clues) {
    if (!legacyClues(clues) || !isDateKey(key) || !Array.isArray(givens) || givens.length !== 81) return false;
    var puzzle = getPuzzle(key);
    return puzzle.mode === mode && puzzle.difficulty === difficulty &&
      puzzle.givens.every(function (value, index) { return value === givens[index]; });
  }

  function recentDates(key, count) {
    var day = requireDate(key);
    count = count === undefined ? 7 : count;
    if (!Number.isInteger(count) || count < 1 || count > MAX_RECORDS) {
      throw new RangeError("日期范围需介于 1 到 400 天。");
    }
    var dates = [];
    for (var offset = count - 1; offset >= 0; offset--) {
      var value = new Date((day - offset) * DAY).toISOString().slice(0, 10);
      if (isDateKey(value)) dates.push(value);
    }
    return dates;
  }

  function validRecord(record) {
    return record && typeof record === "object" && !Array.isArray(record) &&
      Number.isFinite(record.elapsedMs) && record.elapsedMs >= 0 && record.elapsedMs <= 1e12 &&
      Number.isInteger(record.mistakes) && record.mistakes >= 0 && record.mistakes <= 1e9 &&
      Number.isInteger(record.hints) && record.hints >= 0 && record.hints <= 1e9;
  }

  function copyRecord(record) {
    return { elapsedMs: Math.floor(record.elapsedMs), mistakes: record.mistakes, hints: record.hints };
  }

  function normalizeRecords(raw) {
    var result = {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return result;
    Object.keys(raw).filter(function (key) {
      return isDateKey(key) && validRecord(raw[key]);
    }).sort().slice(-MAX_RECORDS).forEach(function (key) {
      result[key] = copyRecord(raw[key]);
    });
    return result;
  }

  function recordCompletion(records, key, record) {
    requireDate(key);
    if (!validRecord(record)) throw new TypeError("每日完成记录无效。");
    var result = normalizeRecords(records);
    // The first finish is kept; replaying the same date does not inflate achievements.
    if (!Object.prototype.hasOwnProperty.call(result, key)) result[key] = copyRecord(record);
    return normalizeRecords(result);
  }

  function getStats(records, today) {
    var day = requireDate(today);
    var clean = normalizeRecords(records);
    var total = Object.keys(clean).filter(function (key) { return key <= today; }).length;
    var todayCompleted = Object.prototype.hasOwnProperty.call(clean, today);
    var cursor = day - (todayCompleted ? 0 : 1);
    var streak = 0;
    while (streak < MAX_RECORDS) {
      var key = new Date(cursor * DAY).toISOString().slice(0, 10);
      if (!Object.prototype.hasOwnProperty.call(clean, key)) break;
      streak++;
      cursor--;
    }
    return { total: total, streak: streak, todayCompleted: todayCompleted };
  }

  return { dateKey: dateKey, isDateKey: isDateKey, getPuzzle: getPuzzle,
    matchesPuzzle: matchesPuzzle, recentDates: recentDates, normalizeRecords: normalizeRecords,
    recordCompletion: recordCompletion, getStats: getStats };
});
