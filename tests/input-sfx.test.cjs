'use strict';
const assert=require('node:assert/strict'),S=require('../src/sound.js'),B=require('../src/backup.js'),{fixture}=require('./browser-helper.cjs'),fs=require('node:fs');
const kinds=['input','note','erase','undo','redo'],scores=kinds.map(k=>S.score(k));assert.equal(new Set(scores.map(x=>JSON.stringify(x))).size,5);
for(const notes of scores){assert(notes.length<=2);assert(notes.every(n=>n.offset>=0&&n.offset+n.duration<=.12&&n.attack>=.003&&n.attack<n.duration-.012&&n.peak>0&&n.peak<=.055&&n.frequency>=300&&n.frequency<=1800));assert(notes.reduce((p,n)=>p+n.peak,0)<=.071);}
assert.equal(S.score('undo')[0].frequency,S.score('redo')[1].frequency);assert.equal(S.score('redo')[0].frequency,S.score('undo')[1].frequency);
const old=fixture('effects-compatible'),storage=s=>({getItem:k=>k===B.keys[0]?JSON.stringify(s):null});assert(B.create(storage(old)));const current=structuredClone(old);Object.assign(current.preferences,{effectsEnabled:true,effectsVolume:.6});const backup=B.create(storage(current));assert.equal(backup.entries[B.keys[0]].preferences.effectsVolume,.6);
for(const [k,v] of [['effectsEnabled','true'],['effectsEnabled',1],['effectsVolume',-1],['effectsVolume',1.1],['effectsVolume','1']]){const s=structuredClone(current);s.preferences[k]=v;assert.throws(()=>B.create(storage(s)));}
// The reward routine no longer owns ordinary input/correctness feedback.
const app=fs.readFileSync(require.resolve('../src/app.js'),'utf8'),reward=app.slice(app.indexOf('  function recordEnergy('),app.indexOf('  function chapterInfo('));assert(!/Atmosphere\.play\("(?:place|mistake)"/.test(reward));
console.log('PASS edit sound scores: five short neutral action signatures, conservative levels, undo/redo symmetry, optional preference compatibility and strict backup validation; reward logic does not control ordinary edit audio. Actual UI/PCM verified in Chromium.');
