'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const V=require('../src/voyage.js'),B=require('../src/backup.js'),S=require('../src/sound.js');
const {fixture}=require('./browser-helper.cjs');
const stats={elapsedMs:123,mistakes:0,hints:0};
assert.equal(V.starsFor(stats),3);
assert.equal(V.starsFor({...stats,errorCheckIncomplete:true}),2);
assert.equal(V.starsFor({...stats,errorCheckIncomplete:true,hints:1}),1);
const legacy={dawn:{stars:3,...stats}};
assert.deepEqual(V.normalizeProgress(legacy),legacy,'legacy stars remain byte-for-byte data');
assert.deepEqual(V.award(legacy,'dawn',{...stats,elapsedMs:1,errorCheckIncomplete:true}),legacy,'unchecked replay cannot replace the old best');
const unchecked=V.award({},'dawn',{...stats,errorCheckIncomplete:true});
assert.equal(unchecked.dawn.stars,2);assert.equal(unchecked.dawn.errorCheckIncomplete,true);
assert.deepEqual(V.normalizeProgress(unchecked),unchecked);
const verified=V.award(unchecked,'dawn',stats);assert.equal(verified.dawn.stars,3);assert(!Object.hasOwn(verified.dawn,'errorCheckIncomplete'));
assert.throws(()=>V.award({},'dawn',{...stats,errorCheckIncomplete:'true'}));
const s=fixture('coverage-backup');s.preferences.soundVolume=0.4;s.game.errorCheckIncomplete=true;
function storage(snapshot,progress){return{getItem:k=>k===B.keys[0]?JSON.stringify(snapshot):k===B.keys[4]?JSON.stringify(progress):null};}
const backup=B.create(storage(s,unchecked));assert.equal(backup.entries[B.keys[0]].game.errorCheckIncomplete,true);assert.deepEqual(backup.entries[B.keys[4]],unchecked);
for(const value of [-0.1,1.1,NaN,'0.5']){const bad=structuredClone(s);bad.preferences.soundVolume=value;assert.throws(()=>B.create(storage(bad,unchecked)));}
for(const value of [null,1,'true']){const bad=structuredClone(s);bad.game.errorCheckIncomplete=value;assert.throws(()=>B.create(storage(bad,unchecked)));}
assert.equal(V.chapters().length,16);assert(V.chapters().every(c=>c.scene&&c.observation&&c.resolution));
assert(!V.chapters().find(c=>c.id==='sums-constellation-v1').mission.includes('完整覆盖一行'));
for(const kind of ['place','mistake','unit','win','voyage-select','voyage-enter','voyage-repair','voyage-unlock','voyage-home']){
 const notes=S.score(kind);assert(notes.length&&notes.length<=12);
 assert(notes.every(n=>n.frequency>20&&n.frequency<12000&&n.offset>=0&&n.duration>0.03&&n.attack>0&&n.attack<n.duration-0.012&&n.peak>0&&n.peak<0.1));
 assert(Math.max(...notes.map(n=>n.offset+n.duration))<=2.5);
 assert.equal(JSON.stringify(S.score(kind)),JSON.stringify(notes),'deterministic original score');
}
assert.deepEqual(S.score('unknown'),[]);assert.notDeepEqual(S.score('voyage-enter'),S.score('voyage-unlock'));assert.notDeepEqual(S.score('voyage-unlock'),S.score('voyage-home'));
const html=fs.readFileSync('src/index.html','utf8');assert.equal((html.match(/id="voyage-btn"/g)||[]).length,1);assert(!html.includes('id="voyage-map"'));assert(!html.includes('id="voyage-tracks"'));assert(html.includes('id="voyage-signal"'));assert(html.includes('src="./sound.js"'));
console.log('PASS voyage prototype: legacy bests retained; unchecked and verified new awards, optional-field backup validation, fixed16 content, one picker, original bounded deterministic sound scores.');
