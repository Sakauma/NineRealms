/* Protect original saves and coordinate player-data writes across windows. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.NineRealmsSaveRecovery = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  var KEY = "nine-realms.sudoku.v1", ARCHIVE = "nine-realms.sudoku-recovery.v1";
  var PRESERVED_KEYS = [KEY, "nine-realms.history.v1", "nine-realms.daily.v1"];
  function inspect(storage, maxVersion) {
    var raw;
    try { raw = storage.getItem(KEY); }
    catch (error) { return { status: "unavailable", raw: null }; }
    if (raw === null) return { status: "missing", raw: null };
    var value;
    try { value = JSON.parse(raw); }
    catch (error) { return { status: "invalid", raw: raw }; }
    if (value && Number.isInteger(value.version) && value.version > maxVersion)
      return { status: "unsupported", raw: raw, version: value.version };
    if (!value || !Number.isInteger(value.version) || value.version < 1 || value.version > maxVersion)
      return { status: "invalid", raw: raw };
    return { status: "candidate", raw: raw, value: value };
  }
  function archive(storage) {
    var raw = storage.getItem(ARCHIVE);
    if (raw === null) return { format: "nine-realms-unreadable-saves", version: 1, entries: [] };
    var data;
    try { data = JSON.parse(raw); }
    catch (error) { throw new Error("原档副本暂不可读取，请先导出副本，不能覆盖它。"); }
    if (!data || data.format !== "nine-realms-unreadable-saves" || data.version !== 1 ||
        !Array.isArray(data.entries) || !data.entries.every(function (e) {
          return e && typeof e.raw === "string" && typeof e.savedAt === "string" &&
            ["invalid", "unsupported", "window-restore"].indexOf(e.reason) >= 0 &&
            (e.key === undefined || PRESERVED_KEYS.indexOf(e.key) >= 0);
        })) throw new Error("原档副本暂不可读取，请先导出副本，不能覆盖它。");
    return data;
  }
  function preserve(storage, state, sourceKey) {
    sourceKey = sourceKey || KEY;
    if (PRESERVED_KEYS.indexOf(sourceKey) < 0) throw new Error("不能保留未知来源的原档。");
    if (!state || ["invalid", "unsupported", "window-restore"].indexOf(state.status) < 0 || typeof state.raw !== "string")
      throw new Error("当前没有可保留的原档。");
    if (storage.getItem(sourceKey) !== state.raw) throw new Error("其他窗口已改变存档，请先重新读取。");
    var data = archive(storage);
    var existing = data.entries.findIndex(function (entry) { return (entry.key || KEY) === sourceKey && entry.raw === state.raw && entry.reason === state.status; });
    if (existing < 0) {
      var entry = { raw: state.raw, savedAt: new Date().toISOString(), reason: state.status };
      if (sourceKey !== KEY) entry.key = sourceKey;
      data.entries.push(entry);
    } else if (state.status === "window-restore" && existing !== data.entries.length - 1) {
      // Reusing A after A,B makes A the most recent recovery, without copying
      // its original bytes twice. Selection must follow use, not first insert.
      var recent = data.entries.splice(existing, 1)[0];
      recent.savedAt = new Date().toISOString(); data.entries.push(recent);
    }
    var text = JSON.stringify(data);
    storage.setItem(ARCHIVE, text);
    if (storage.getItem(ARCHIVE) !== text) throw new Error("原档副本未能安全保存，原存档未替换。");
    if (storage.getItem(sourceKey) !== state.raw) throw new Error("其他窗口已改变存档，请先重新读取。");
    return data;
  }
  // A window holds the writer lock until pagehide. Every engine also checks
  // the exact last-read bytes before writes; this is the older-engine fallback.
  function createSession(options) {
    var source = options.storage, locks = options.locks, state = "starting", expected;
    var releaseLock = null, starting = null, observed = Object.create(null);
    function read() { return source.getItem(KEY); }
    function baseline() { try { expected = read(); } catch (error) { expected = undefined; } }
    function error(code) { var e = new Error(code); e.code = code; return e; }
    function writable() { return state === "active"; }
    function conflict() {
      if (state !== "conflict") {
        state = "conflict";
        if (options.onConflict) options.onConflict();
      }
      throw error("SAVE_CONFLICT");
    }
    function check() {
      if (!writable()) throw error(state === "temporary" ? "TEMPORARY_SESSION" : "SAVE_CONFLICT");
      if (read() !== expected) conflict();
    }
    function checkKey(key) {
      check();
      if (key !== KEY && Object.prototype.hasOwnProperty.call(observed, key) && source.getItem(key) !== observed[key]) conflict();
    }
    function start() {
      if (starting) return starting;
      if (releaseLock) { state = "active"; baseline(); return Promise.resolve(true); }
      if (!locks || typeof locks.request !== "function") { baseline(); state = "active"; return Promise.resolve(true); }
      starting = new Promise(function (resolve) {
        var answered = false;
        function answer(value) { answered = true; resolve(value); }
        try {
          Promise.resolve(locks.request("nine-realms-player-writer", { ifAvailable: true }, function (lock) {
            if (!lock) { state = "blocked"; answer(false); return; }
            baseline(); state = "active";
            var held = new Promise(function (release) { releaseLock = release; });
            answer(true); return held;
          })).catch(function () {
            if (!answered) { baseline(); state = "active"; answer(true); }
            else if (state === "active") { releaseLock = null; try { conflict(); } catch (error) {} }
          });
        } catch (failure) { baseline(); state = "active"; answer(true); }
      }).then(function (result) { starting = null; return result; });
      return starting;
    }
    function release(next) {
      state = next || "closed";
      var release = releaseLock; releaseLock = null;
      if (release) release();
    }
    var storage = {
      getItem: function (key) {
        var value = source.getItem(key);
        if (!Object.prototype.hasOwnProperty.call(observed, key)) observed[key] = value;
        return value;
      },
      setItem: function (key, value) {
        checkKey(key); value = String(value); source.setItem(key, value); observed[key] = value;
        if (key === KEY) {
          if (read() !== value) conflict();
          expected = value;
        }
      },
      removeItem: function (key) {
        checkKey(key); source.removeItem(key); observed[key] = null;
        if (key === KEY) { if (read() !== null) conflict(); expected = null; }
      }
    };
    return { storage: storage, start: start, check: check, writable: writable,
      temporary: function () { release("temporary"); }, isTemporary: function () { return state === "temporary"; },
      release: function () { release(); },
      rebase: function () { if (!writable()) throw error("SAVE_CONFLICT"); expected = read(); },
      changed: function (event) {
        if (!writable() || event.key !== null && event.key !== KEY) return;
        try { check(); } catch (error) { /* A conflict is announced once; read errors remain retryable. */ }
      }
    };
  }
  return { key: KEY, archiveKey: ARCHIVE, inspect: inspect, preserve: preserve, createSession: createSession,
    preserveWindow: function(storage,raw,sourceKey){return preserve(storage,{status:"window-restore",raw:raw},sourceKey);},
    previousWindow: function(storage){var entries=archive(storage).entries;for(var i=entries.length-1;i>=0;i--)if(entries[i].reason==="window-restore"&&(entries[i].key||KEY)===KEY)return entries[i].raw;return null;}
  };
});
