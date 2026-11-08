/* Original Nine Realms compositions and synthesis, distributed under the repository MIT license. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.NineRealmsMusic = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  var PERIOD = 32, RATE = 24000;
  var TRACKS = [
    { id: "coordinates", title: "微光定位", description: "疏落琴音与开阔和声", chords: [[50,57,64,66],[47,54,57,62],[43,50,57,59],[45,52,57,59]], bass: [38,35,43,45], melody: [74,69,66,64,71,69,64,62], times: [2,6,10,14,18,22,26,30] },
    { id: "routes", title: "双路星航", description: "左右呼应的轻拨弦", chords: [[50,57,59,66],[43,54,57,62],[47,54,62,64],[45,52,59,62]], bass: [38,43,35,45], melody: [69,74,76,71,69,66,74,71,69,64,66,62], times: [1,3,6,9,11,14,17,19,22,25,27,30] },
    { id: "home", title: "归航合鸣", description: "温暖低音与舒展的归航动机", chords: [[50,54,57,64],[47,54,57,62],[43,50,59,62],[50,54,57,64]], bass: [38,35,43,38], melody: [62,69,76,74,71,69,66,62], times: [1,5,9,13,17,21,25,29] }
  ];
  function track(id) { return TRACKS.find(function (t) { return t.id === id; }) || TRACKS[0]; }
  function tracks() { return TRACKS.map(function (t) { return { id: t.id, title: t.title, description: t.description, duration: PERIOD }; }); }
  function phaseFor(id) {
    return id === "fusion-homecoming-v1" ? "home" : /^(lines-|sums-)/.test(id || "") ? "routes" : "coordinates";
  }
  function score(id) {
    var t = track(id), notes = [];
    t.chords.forEach(function (chord, index) {
      chord.forEach(function (midi, n) { notes.push({ midi: midi, at: index * 8, duration: 12, attack: 2.4, release: 4.5, peak: 0.05, overtone: 0.12, pan: (n % 2 ? 1 : -1) * 0.34 }); });
      notes.push({ midi: t.bass[index], at: index * 8, duration: 10.5, attack: 1.6, release: 4, peak: 0.036, overtone: 0.16, pan: 0 });
    });
    t.melody.forEach(function (midi, n) { notes.push({ midi: midi, at: t.times[n], duration: id === "home" ? 3.4 : 2.8, attack: 0.035, release: id === "home" ? 3.1 : 2.5, peak: 0.07, overtone: 0.1, pan: (n % 2 ? 1 : -1) * (id === "routes" ? 0.38 : 0.2) }); });
    return notes;
  }
  function instrument(context, destination, note, start) {
    var envelope = context.createGain(), pan = context.createStereoPanner(), oscillators = [];
    var end = start + note.duration, release = Math.max(start + note.attack, end - note.release);
    pan.pan.value = note.pan; envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(note.peak, start + note.attack);
    envelope.gain.setValueAtTime(note.peak, release);
    envelope.gain.exponentialRampToValueAtTime(0.000001, end - 0.025); envelope.gain.linearRampToValueAtTime(0, end);
    envelope.connect(pan); pan.connect(destination);
    [1,2].forEach(function (harmonic) {
      var oscillator = context.createOscillator(), gain = context.createGain();
      oscillator.type = "sine"; oscillator.frequency.value = 440 * Math.pow(2, (note.midi - 69) / 12) * harmonic;
      gain.gain.value = harmonic === 1 ? 1 : note.overtone; oscillator.connect(gain); gain.connect(envelope);
      oscillator.start(start); oscillator.stop(end + 0.02); oscillators.push({ oscillator: oscillator, gain: gain });
    });
    return function () { oscillators.forEach(function (v) { try { v.oscillator.stop(); } catch (_) {} v.oscillator.disconnect(); v.gain.disconnect(); }); envelope.disconnect(); pan.disconnect(); };
  }
  async function render(Offline, id, rate) {
    if (!Offline) throw new Error("当前浏览器不支持离线音乐合成。");
    rate = rate || RATE;
    var context = new Offline(2, PERIOD * 2 * rate, rate), cleanups = [], notes = score(id);
    // The second cycle includes the previous cycle's sustained tails. It is the exact loop buffer.
    for (var cycle = 0; cycle < 2; cycle++) notes.forEach(function (n) { cleanups.push(instrument(context, context.destination, n, cycle * PERIOD + n.at)); });
    try {
      var rendered = await context.startRendering(), buffer = context.createBuffer(2, PERIOD * rate, rate);
      for (var channel = 0; channel < 2; channel++) buffer.copyToChannel(rendered.getChannelData(channel).subarray(PERIOD * rate), channel);
      return buffer;
    } finally { cleanups.forEach(function (close) { close(); }); }
  }
  function createPlayer(context, options) {
    options = options || {};
    var output = context.createGain(), duck = context.createGain(), current = null, fading = null;
    var desired = null, active = false, disposed = false, epoch = 0, volume = 0, state = "idle", error = null;
    var cache = new Map(), offsets = new Map(), queue = Promise.resolve(), pending = null, duckUntil = 0;
    output.gain.value = 0; duck.gain.value = 1; output.connect(duck); duck.connect(options.destination || context.destination);
    function status() { return { state: state, phase: desired, playing: Boolean(current), sources: Number(Boolean(current)) + Number(Boolean(fading)), cached: cache.size, offset: current ? ((Math.max(0, context.currentTime-current.started)+current.offset)%PERIOD) : desired ? offsets.get(desired)||0 : 0, error: error }; }
    function changed(next) { if (next === state) return; state = next; if (options.onState) options.onState(status()); }
    function remove(slot) {
      if (!slot || slot.removed) return; slot.removed = true;
      try { slot.source.stop(); } catch (_) {} slot.source.disconnect(); slot.gain.disconnect();
      if (current === slot) current = null; if (fading === slot) fading = null;
    }
    function remember(slot) { if (slot) offsets.set(slot.phase, (Math.max(0, context.currentTime-slot.started)+slot.offset)%PERIOD); }
    function stop() {
      epoch++; active = false; remember(current); desired = null; pending = null;
      remove(current); remove(fading); duckUntil = 0;
      output.gain.cancelScheduledValues(context.currentTime); output.gain.setValueAtTime(0, context.currentTime);
      duck.gain.cancelScheduledValues(context.currentTime); duck.gain.setValueAtTime(1, context.currentTime);
      error = null; changed("idle");
    }
    function trim() { while (cache.size > 2) { var key = Array.from(cache.keys()).find(function (id) { return id !== desired && (!current || id !== current.phase); }); if (!key) break; cache.delete(key); } }
    function prepare(id) {
      if (cache.has(id)) { var entry = cache.get(id); cache.delete(id); cache.set(id,entry); return Promise.resolve(entry); }
      var job = queue.catch(function () {}).then(function () {
        if (disposed || !active || desired !== id) return null;
        return options.render ? options.render(id) : render(options.OfflineAudioContext, id);
      });
      queue = job.catch(function () {}); cache.set(id,job); trim();
      job.then(function (buffer) { if (cache.get(id) === job) { if (buffer) cache.set(id,buffer); else cache.delete(id); } trim(); },function () { if (cache.get(id) === job) cache.delete(id); });
      return job;
    }
    function begin(buffer,id) {
      var now = context.currentTime, transition = 1.2;
      remove(fading);
      if (current) {
        remember(current); fading = current; current = null;
        fading.gain.gain.cancelScheduledValues(now); fading.gain.gain.setValueAtTime(fading.gain.gain.value,now); fading.gain.gain.linearRampToValueAtTime(0,now+transition);
        fading.source.stop(now+transition+0.02);
      }
      var source = context.createBufferSource(), gain = context.createGain(), offset = offsets.get(id)||0;
      source.buffer=buffer; source.loop=true; source.loopStart=0; source.loopEnd=PERIOD;
      gain.gain.setValueAtTime(0,now); gain.gain.linearRampToValueAtTime(1,now+transition);
      source.connect(gain); gain.connect(output);
      var slot={source:source,gain:gain,phase:id,offset:offset,started:now+0.02,removed:false};
      source.onended=function(){remove(slot);}; source.start(slot.started,offset); current=slot; changed("playing");
    }
    function update(next) {
      if (disposed) return Promise.resolve(false);
      if (!next.active || !(next.volume>0)) { stop(); return Promise.resolve(false); }
      var nextVolume = Math.max(0,Math.min(0.9,next.volume));
      if (!active || nextVolume !== volume) { output.gain.cancelScheduledValues(context.currentTime); output.gain.setTargetAtTime(nextVolume,context.currentTime,0.08); } volume = nextVolume;
      var id=track(next.phase).id;
      if (active && desired===id && (current && current.phase===id || pending || state==="error")) return pending||Promise.resolve(Boolean(current));
      active=true; desired=id; error=null; var request=++epoch; changed("loading");
      pending=prepare(id).then(function(buffer){
        if(disposed||!active||epoch!==request)return false;
        pending=null; if(!buffer||context.state!=="running"){changed("idle");return false;} begin(buffer,id);return true;
      }).catch(function(reason){if(epoch===request&&active){pending=null;remove(current);remove(fading);error=reason.message||"音乐暂不可用";changed("error");}return false;});
      return pending;
    }
    function reduce(seconds) {
      if(!current||disposed)return;
      var now=context.currentTime;duckUntil=Math.max(duckUntil,now+seconds);
      duck.gain.cancelScheduledValues(now);duck.gain.setValueAtTime(duck.gain.value,now);duck.gain.linearRampToValueAtTime(0.42,now+0.035);duck.gain.setValueAtTime(0.42,duckUntil);duck.gain.linearRampToValueAtTime(1,duckUntil+0.8);
    }
    function release(){if(disposed)return;stop();disposed=true;cache.clear();offsets.clear();output.disconnect();duck.disconnect();changed("released");}
    return { update:update,stop:stop,duck:reduce,release:release,status:status };
  }
  return { tracks:tracks, phaseFor:phaseFor, score:score, render:render, createPlayer:createPlayer, period:PERIOD, sampleRate:RATE };
});
