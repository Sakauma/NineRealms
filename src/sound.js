/* Original procedural glass instrument. No recordings or third-party samples. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.NineRealmsSound = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  function score(kind) {
    var notes = [], D = 293.6648, A = 440, E = 659.2551;
    function glass(f, at, length, level) {
      notes.push({ frequency: f, offset: at, duration: length, peak: level, attack: 0.012 });
      notes.push({ frequency: f * 2.756, offset: at, duration: length * 0.34, peak: level * 0.12, attack: 0.006 });
    }
    function tap(f, at, length, level, attack) { notes.push({ frequency:f, offset:at, duration:length, peak:level, attack:attack }); }
    // Neutral action signatures: independent of digit, answer, difficulty and rewards.
    if (kind === "input") { tap(523.2511,0,.105,.055,.006);tap(1569.7533,0,.04,.004,.004); }
    else if (kind === "note") { tap(880,0,.055,.038,.004);tap(1760,0,.028,.003,.003); }
    else if (kind === "erase") { tap(349.2282,0,.10,.047,.008);tap(523.2511,0,.05,.006,.005); }
    else if (kind === "undo" || kind === "redo") { var pair=kind==="undo"?[659.2551,493.8833]:[493.8833,659.2551];tap(pair[0],0,.075,.035,.006);tap(pair[1],.038,.075,.035,.006); }
    else if (kind === "place") glass(A, 0, 0.12, 0.025);
    else if (kind === "mistake") glass(196, 0, 0.16, 0.024);
    else if (kind === "unit") [523.2511, E, 783.9909].forEach(function (f, i) { glass(f, i * 0.065, 0.3, 0.027); });
    else if (kind === "voyage-select") glass(E, 0, 0.13, 0.015);
    else if (kind === "voyage-enter") {
      glass(D, 0, 0.62, 0.075); glass(A, 0.14, 0.65, 0.06); glass(E, 0.32, 0.78, 0.052);
    } else if (kind === "voyage-unlock") {
      glass(D, 0, 0.8, 0.075); glass(A, 0.16, 0.8, 0.06);
      glass(587.3295, 0.36, 0.85, 0.052); glass(E, 0.55, 0.92, 0.048);
    } else if (kind === "voyage-home") {
      glass(D / 2, 0, 1.6, 0.075); glass(D, 0.09, 1.3, 0.065); glass(A, 0.3, 1.2, 0.058);
      glass(E, 0.52, 1.3, 0.049); glass(587.3295, 0.85, 1.55, 0.047);
    } else if (kind === "win" || kind === "voyage-repair") {
      glass(D, 0, 0.6, 0.065); glass(A, 0.14, 0.65, 0.055); glass(587.3295, 0.33, 0.8, 0.05);
    }
    return notes;
  }
  // Used both by the live game and OfflineAudioContext exports for review.
  function voice(context, destination, note, now, ended) {
    var oscillator = context.createOscillator(), gain = context.createGain();
    var start = now + note.offset, stop = start + note.duration;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(note.frequency, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(note.peak, start + note.attack);
    gain.gain.exponentialRampToValueAtTime(0.00001, stop - 0.012);
    gain.gain.linearRampToValueAtTime(0, stop);
    oscillator.connect(gain); gain.connect(destination);
    var result = { oscillator: oscillator, gain: gain };
    oscillator.onended = function () {
      oscillator.disconnect(); gain.disconnect(); if (ended) ended(result);
    };
    oscillator.start(start); oscillator.stop(stop + 0.02);
    return result;
  }
  return { score: score, voice: voice };
});
