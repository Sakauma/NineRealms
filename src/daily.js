/* Nine Realms — deterministic daily puzzles, Beijing calendar, no storage or network. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./engine.js"), require("./curated.js"), function(){return require("./generator.js");}, function(){return {Hints:require("./hints.js"),Frozen:require("./daily-generator-v1.js")};});
  else root.SudokuDaily = factory(root.SudokuEngine, root.NineRealmsCurated, function(){return root.NineRealmsGenerator;}, function(){return {Hints:root.SudokuHints,Frozen:root.NineRealmsDailyGeneratorV1};});
})(typeof globalThis !== "undefined" ? globalThis : this, function (Engine, Curated, generator, workerDependencies) {
  "use strict";
  var DAY = 86400000;
  var OFFSET = 8 * 60 * 60 * 1000;
  var MODES = ["classic", "diagonal", "hyper", "knight"];
  var MAX_RECORDS = 400;
  var CURATED_START = "2026-11-14";
  var CONSTRUCTED_START = "2026-11-15", DAILY_MODES = ["classic", "thermo", "diagonal", "killer", "hyper", "arrow", "knight", "thermo-killer"];
  var CACHE_LIMIT=32, constructedCache=new Map();
  // Versioned, pinned IDs: adding future catalog entries must not reroll a date.
  // Four short introductory variants per fortnight; other dates retain v1 exactly.
  var CURATED_SLOTS = { 1: "thermo", 4: "killer", 8: "arrow", 11: "thermo-killer" };

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

  function getLegacyPuzzle(key) {
    var day = requireDate(key);
    var mode = MODES[modulo(day, MODES.length)];
    // Five gentle days and two medium days per seven-day cycle; never hard/master.
    var difficulty = modulo(day, 7) < 5 ? "easy" : "medium";
    var puzzle = Engine.getPuzzle(difficulty, "nine-realms-daily-v1:" + key, mode, { legacyPool: true });
    return Object.assign({}, puzzle, { dailyDate: key });
  }

  function getCuratedPuzzle(key) {
    var day = requireDate(key), offset = day - requireDate(CURATED_START);
    var mode = offset >= 0 && CURATED_SLOTS[modulo(offset, 14)];
    if (!mode) return getLegacyPuzzle(key);
    var edition = modulo(Math.floor(offset / 14), 2) + 1;
    var puzzle = Curated.getPuzzle("curated-" + mode + "-intro-" + edition + "-v1");
    return Object.assign({}, puzzle, { dailyDate: key });
  }

  function clone(value){return JSON.parse(JSON.stringify(value));}
  function constructedMode(key){return DAILY_MODES[modulo(requireDate(key)-requireDate(CONSTRUCTED_START),DAILY_MODES.length)];}
  var DETERMINISTIC_FAILURES=["DIVERSITY_BUDGET","DIVERSITY_LAYOUT_UNAVAILABLE","DENSITY_NOT_REACHED","UNCHANGED_MASK","FRESH_LOGIC_NOT_REACHED","FRESH_RULE_NOT_USED","FRESH_BUDGET"];
  function cachePuzzle(key,puzzle){
    puzzle.dailyDate=key;constructedCache.delete(key);constructedCache.set(key,clone(puzzle));
    if(constructedCache.size>CACHE_LIMIT)constructedCache.delete(constructedCache.keys().next().value);
    return clone(puzzle);
  }
  function peekPuzzle(key){
    requireDate(key);if(key<CONSTRUCTED_START)return getCuratedPuzzle(key);
    if(!constructedCache.has(key))return null;
    var cached=constructedCache.get(key);constructedCache.delete(key);constructedCache.set(key,cached);return clone(cached);
  }
  function describe(key){var cached=peekPuzzle(key);return cached?{mode:cached.mode,difficulty:cached.difficulty}:{mode:constructedMode(key),difficulty:"easy"};}
  function fallbackPuzzle(key){
    var day=requireDate(key),mode=constructedMode(key),edition=modulo(day,2)+1;
    var puzzle=MODES.indexOf(mode)>=0 ? Engine.getPuzzle("easy","nine-realms-daily-v3-fallback:"+key,mode,{legacyPool:true}) : Curated.getPuzzle("curated-"+mode+"-intro-"+edition+"-v1");
    puzzle.dailyEdition="fallback-v3";puzzle.dailyFallback=true;return puzzle;
  }
  function getPuzzle(key) {
    var cached=peekPuzzle(key);if(cached)return cached;
    var G=generator(),mode=constructedMode(key),puzzle;
    if(!G||typeof G.generateDailyV1!=="function")throw new Error("每日新题资源尚未完整加载，请重新打开完整游戏。");
    try {puzzle=G.generateDailyV1({mode:mode,seed:"nine-realms-daily-v3:"+key});puzzle.dailyEdition="constructed-v3";puzzle.dailyFallback=false;}
    catch(error){if(DETERMINISTIC_FAILURES.indexOf(error.code)<0)throw error;puzzle=fallbackPuzzle(key);}
    return cachePuzzle(key,puzzle);
  }
  function createClient(){
    var active=null;
    function cancel(){if(active)active();}
    function run(key){
      cancel();
      return new Promise(function(resolve,reject){
        var cached;try{cached=peekPuzzle(key);}catch(error){reject(error);return;}if(cached){resolve(cached);return;}
        var worker,url,timer,settled=false,mode=constructedMode(key);
        function finish(error,puzzle){
          if(settled)return;settled=true;clearTimeout(timer);if(worker)worker.terminate();if(url)URL.revokeObjectURL(url);active=null;
          if(error){reject(error);return;}resolve(cachePuzzle(key,puzzle));
        }
        active=function(){var error=new Error("DAILY_CANCELLED");error.name="AbortError";finish(error);};
        try{
          var deps=workerDependencies();
          if(typeof Worker==="undefined"||typeof Blob==="undefined"||!Engine.workerSource||!deps.Hints||!deps.Frozen)throw new Error("DAILY_WORKER_UNAVAILABLE");
          var program=Engine.workerSource()+deps.Hints.workerSource()+deps.Frozen.workerSource()+
            "self.onmessage=function(event){var x=event.data;try{self.postMessage({key:x.key,puzzle:NineRealmsDailyGeneratorV1.generate({mode:x.mode,seed:x.seed})});}catch(error){self.postMessage({key:x.key,error:error.code||error.message});}};";
          url=URL.createObjectURL(new Blob([program],{type:"text/javascript"}));worker=new Worker(url);
          worker.onmessage=function(event){
            if(settled)return;
            try{
              var data=event.data;if(!data||data.key!==key)throw new Error("DAILY_WORKER_INVALID_RESULT");
              if(data.error){if(DETERMINISTIC_FAILURES.indexOf(data.error)>=0){finish(null,fallbackPuzzle(key));return;}throw new Error(data.error);}
              var p=data.puzzle;
              if(!p||p.mode!==mode||p.difficulty!=="easy"||!p.generation||p.generation.version!==3||p.generation.kind!=="constructed"||p.generation.seed!=="nine-realms-daily-v3:"+key||p.generation.logicVerified!==true||p.generation.unique!==true||!Array.isArray(p.givens)||p.givens.length!==81||!Engine.validateComplete(p.solution,{mode:mode,clues:p.clues})||!p.givens.every(function(n,i){return Number.isInteger(n)&&n>=0&&n<=9&&(!n||n===p.solution[i]);}))throw new Error("DAILY_WORKER_INVALID_RESULT");
              p.dailyEdition="constructed-v3";p.dailyFallback=false;finish(null,p);
            }catch(error){finish(error);}
          };
          worker.onerror=function(){finish(new Error("DAILY_WORKER_FAILED"));};
          timer=setTimeout(function(){finish(new Error("DAILY_GENERATION_TIMEOUT"));},8000);
          worker.postMessage({key:key,mode:mode,seed:"nine-realms-daily-v3:"+key});
        }catch(error){finish(error);}
      });
    }
    return {run:run,cancel:cancel};
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

  function sameClues(mode, expected, actual) {
    try {
      // Normalization rejects unknown fields and preserves every rule marker.
      // Missing clues must never turn a different variant board into a daily game.
      return JSON.stringify(Engine.normalizeClues(mode, expected)) ===
        JSON.stringify(Engine.normalizeClues(mode, actual));
    } catch (error) { return false; }
  }

  function sameBoard(puzzle, givens, mode, difficulty) {
    return puzzle.mode === mode && puzzle.difficulty === difficulty &&
      puzzle.givens.every(function (value, index) { return value === givens[index]; });
  }

  function needsConstruction(key,givens,mode,difficulty,clues){
    if(!isDateKey(key)||!Array.isArray(givens)||givens.length!==81||key<CONSTRUCTED_START)return false;
    if(legacyClues(clues)&&sameBoard(getLegacyPuzzle(key),givens,mode,difficulty))return false;
    var old=getCuratedPuzzle(key);if(sameBoard(old,givens,mode,difficulty)&&sameClues(mode,old.clues,clues))return false;
    if(mode!==constructedMode(key)||difficulty!=="easy")return false;
    try{Engine.normalizeClues(mode,clues);}catch(error){return false;}return !constructedCache.has(key);
  }
  function matchesPuzzle(key, givens, mode, difficulty, clues) {
    if (!isDateKey(key) || !Array.isArray(givens) || givens.length !== 81) return false;
    if(legacyClues(clues)&&sameBoard(getLegacyPuzzle(key),givens,mode,difficulty))return true;
    if(key>=CURATED_START){var old=getCuratedPuzzle(key);if(sameBoard(old,givens,mode,difficulty)&&sameClues(mode,old.clues,clues))return true;}
    if(key<CONSTRUCTED_START||mode!==constructedMode(key)||difficulty!=="easy")return false;
    try{Engine.normalizeClues(mode,clues);}catch(error){return false;}
    var puzzle=getPuzzle(key);
    return sameBoard(puzzle,givens,mode,difficulty)&&sameClues(mode,puzzle.clues,clues);
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

  return { createClient:createClient, peekPuzzle:peekPuzzle, describe:describe, needsConstruction:needsConstruction, dateKey: dateKey, isDateKey: isDateKey, getPuzzle: getPuzzle, getLegacyPuzzle: getLegacyPuzzle, getCuratedPuzzle:getCuratedPuzzle, curatedStart: CURATED_START, constructedStart: CONSTRUCTED_START,
    matchesPuzzle: matchesPuzzle, recentDates: recentDates, normalizeRecords: normalizeRecords,
    recordCompletion: recordCompletion, getStats: getStats, hasCompletion: hasCompletion, validateRecords: validateRecords, detailDates: detailDates };
});
