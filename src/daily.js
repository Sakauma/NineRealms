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

  var SUMMARY = "__summary", MAX_RANGES = 10000;
  function invalid(message, future) { var error = new Error(message); error.code = future ? "DAILY_RECORDS_UNSUPPORTED" : "DAILY_RECORDS_INVALID"; throw error; }
  function detailDates(raw) { return raw && typeof raw === "object" && !Array.isArray(raw) ? Object.keys(raw).filter(function (key) { return isDateKey(key) && validRecord(raw[key]); }).sort() : []; }
  function keyFor(day) { return new Date(day * DAY).toISOString().slice(0, 10); }
  function includes(ranges, day) {
    var low = 0, high = ranges.length - 1;
    while (low <= high) { var mid = (low + high) >> 1, range = ranges[mid];
      if (day < requireDate(range[0])) high = mid - 1;
      else if (day > requireDate(range[1])) low = mid + 1;
      else return true;
    }
    return false;
  }
  function addDate(ranges, key) {
    var start = requireDate(key), end = start, result = [], inserted = false;
    ranges.forEach(function (range) {
      var a = requireDate(range[0]), b = requireDate(range[1]);
      if (b + 1 < start) result.push(range.slice());
      else if (end + 1 < a) { if (!inserted) { result.push([keyFor(start), keyFor(end)]); inserted = true; } result.push(range.slice()); }
      else { start = Math.min(start, a); end = Math.max(end, b); }
    });
    if (!inserted) result.push([keyFor(start), keyFor(end)]);
    if (result.length > MAX_RANGES) invalid("每日汇总超出可保存范围，原记录未改变。");
    return result;
  }
  function summaryFor(raw, dates) {
    if (Object.prototype.hasOwnProperty.call(raw, SUMMARY)) {
      var value = raw[SUMMARY];
      if (value && Number.isInteger(value.version) && value.version > 1) invalid("每日汇总来自较新版本，已暂停覆盖。", true);
      if (!value || typeof value !== "object" || Array.isArray(value) || value.version !== 1 || !Array.isArray(value.ranges) || value.ranges.length > MAX_RANGES || Object.keys(value).some(function (key) { return ["version", "ranges", "unknownBefore"].indexOf(key) < 0; })) invalid("每日汇总格式无法读取，已暂停覆盖。");
      var last = null;
      value.ranges.forEach(function (range) {
        if (!Array.isArray(range) || range.length !== 2 || !isDateKey(range[0]) || !isDateKey(range[1])) invalid("每日日期区间无效。");
        var a = requireDate(range[0]), b = requireDate(range[1]);
        if (a > b || last !== null && a <= last + 1) invalid("每日日期区间重叠或未合并。"); last = b;
      });
      if (dates.some(function (key) { return !includes(value.ranges, requireDate(key)); })) invalid("每日明细与汇总不一致，原记录已保留。");
      if (value.unknownBefore !== undefined && (!isDateKey(value.unknownBefore) || !includes(value.ranges, requireDate(value.unknownBefore)))) invalid("每日旧记录范围标记无效。");
      var result = { version: 1, ranges: value.ranges.map(function (range) { return range.slice(); }) };
      if (value.unknownBefore !== undefined) result.unknownBefore = value.unknownBefore;
      return result;
    }
    var result = { version: 1, ranges: [] };
    dates.forEach(function (key) { result.ranges = addDate(result.ranges, key); });
    // The old writer retained at most 400 details. Earlier losses cannot be reconstructed.
    if (dates.length >= MAX_RECORDS) result.unknownBefore = dates[0];
    return result;
  }
  function normalizeRecords(raw) {
    var result = {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return result;
    var dates = detailDates(raw), summary = summaryFor(raw, dates);
    dates.slice(-MAX_RECORDS).forEach(function (key) { result[key] = copyRecord(raw[key]); });
    if (Object.prototype.hasOwnProperty.call(raw, SUMMARY) || dates.length > MAX_RECORDS) result[SUMMARY] = summary;
    return result;
  }
  function validateRecords(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) invalid("每日记录格式无效。");
    var dates = detailDates(raw);
    if (dates.length > MAX_RECORDS || Object.keys(raw).some(function (key) {
      if (key === SUMMARY) return false;
      var value = raw[key];
      return !isDateKey(key) || !validRecord(value) || !Number.isInteger(value.elapsedMs) || Object.keys(value).length !== 3 || Object.keys(value).some(function (field) { return ["elapsedMs", "mistakes", "hints"].indexOf(field) < 0; });
    })) invalid("每日记录包含无法读取的明细，原文已保留。");
    summaryFor(raw, dates); return raw;
  }
  function recordCompletion(records, key, record) {
    requireDate(key);
    if (!validRecord(record)) throw new TypeError("每日完成记录无效。");
    var result = normalizeRecords(records), summary = summaryFor(result, detailDates(result));
    if (!includes(summary.ranges, requireDate(key))) summary.ranges = addDate(summary.ranges, key);
    if (!Object.prototype.hasOwnProperty.call(result, key)) result[key] = copyRecord(record);
    result[SUMMARY] = summary;
    return normalizeRecords(result);
  }
  function hasCompletion(records, key) {
    var clean = normalizeRecords(records), summary = summaryFor(clean, detailDates(clean));
    return includes(summary.ranges, requireDate(key));
  }
  function getStats(records, today) {
    var day = requireDate(today), clean = normalizeRecords(records), summary = summaryFor(clean, detailDates(clean));
    var total = summary.ranges.reduce(function (sum, range) { return sum + Math.max(0, Math.min(day, requireDate(range[1])) - requireDate(range[0]) + 1); }, 0);
    var todayCompleted = includes(summary.ranges, day), cursor = day - (todayCompleted ? 0 : 1), streak = 0, start = null;
    summary.ranges.forEach(function (range) { var a = requireDate(range[0]), b = requireDate(range[1]); if (a <= cursor && cursor <= b) { streak = cursor - a + 1; start = a; } });
    var result = { total: total, streak: streak, todayCompleted: todayCompleted };
    if (summary.unknownBefore !== undefined) { result.totalIncomplete = true; if (streak && start <= requireDate(summary.unknownBefore)) result.streakIncomplete = true; }
    return result;
  }

  return { dateKey: dateKey, isDateKey: isDateKey, getPuzzle: getPuzzle,
    matchesPuzzle: matchesPuzzle, recentDates: recentDates, normalizeRecords: normalizeRecords,
    recordCompletion: recordCompletion, getStats: getStats, hasCompletion: hasCompletion, validateRecords: validateRecords, detailDates: detailDates };
});
