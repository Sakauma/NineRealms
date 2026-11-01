'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),V=require('../src/voyage.js'),B=require('../src/backup.js');
const fixture=require('./fixtures/compatibility.json'),hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const stats={elapsedMs:100,mistakes:0,hints:0};
function complete(p,track,count=Infinity){for(const c of V.chapters(track).slice(0,count))p=V.award(p,c.id,stats);return p;}
function storage(initial={}){const m=new Map(Object.entries(initial));return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};}
let fresh=V.migrateProgress(null,null,{existing:false});assert.deepEqual(fresh,{__journey:{version:1,granted:[]}});
assert(V.canEnter(fresh,'dawn'));assert(!V.canEnter(fresh,'orbit'));assert(!V.canEnter(fresh,'lines-rise-v1'));assert(!V.canEnter(fresh,'sums-sparks-v1'));
assert.equal(V.journey(fresh).nextId,'dawn');assert.equal(V.journey(fresh).total,15);
let oldNine=complete(fresh,'legacy');assert(V.canEnter(oldNine,'lines-rise-v1'));assert(V.canEnter(oldNine,'sums-sparks-v1'));assert(!V.canEnter(oldNine,'sums-constellation-v1'));
assert.equal(V.nextAfter(oldNine,'home'),'lines-rise-v1');
let sumsFirst=complete(oldNine,'sums',2);assert(!V.canEnter(sumsFirst,'sums-constellation-v1'),'sum progress alone never bypasses join');
assert.equal(V.nextAfter(sumsFirst,'sums-arrows-v1'),'lines-rise-v1');
let linesFirst=complete(oldNine,'lines');assert(!V.canEnter(linesFirst,'sums-constellation-v1'));assert(V.canEnter(linesFirst,'sums-sparks-v1'));
let joined=complete(sumsFirst,'lines');assert(V.canEnter(joined,'sums-constellation-v1'));assert.equal(V.nextAfter(joined,'lines-spectrum-v1'),'sums-constellation-v1');
let all=V.award(joined,'sums-constellation-v1',stats);assert.equal(V.journey(all).completed,15);assert.equal(V.journey(all).stars,45);assert(V.journey(all).finished);assert.equal(V.nextAfter(all,'sums-constellation-v1'),null);
// Exact old access migration is durable; later completions do not expand grants.
const rawPartial=complete({},'lines',1),oldPartial=V.migrateProgress(rawPartial,null,{existing:true});
assert(oldPartial.__journey.granted.includes('lines-mirror-v1'));assert(!oldPartial.__journey.granted.includes('lines-spectrum-v1'));
assert(V.canEnter(oldPartial,'lines-mirror-v1'));assert(!V.canEnter(oldPartial,'lines-spectrum-v1'));assert(V.journey(oldPartial).inheritedPassage);assert.equal(V.journey(oldPartial).nextId,'lines-mirror-v1','continue the actually active later route before unrelated open routes');
const same=JSON.parse(JSON.stringify(oldPartial));assert.deepEqual(V.migrateProgress(oldPartial,'sums-constellation-v1',{existing:true}),same,'migration must only happen once');
const existingEmpty=V.migrateProgress({},null,{existing:true});assert(V.canEnter(existingEmpty,'lines-rise-v1'));assert(V.canEnter(existingEmpty,'sums-sparks-v1'));
const oldSums1=V.migrateProgress(complete({},'sums',1),null,{existing:true});const nowSums2=V.award(oldSums1,'sums-arrows-v1',stats);assert(!V.canEnter(nowSums2,'sums-constellation-v1'),'newly obtained sums2 cannot inherit final permission');
const oldSums2=V.migrateProgress(complete({},'sums',2),null,{existing:true});assert(V.canEnter(oldSums2,'sums-constellation-v1'),'actual old final unlock is preserved');
const current=V.migrateProgress({},'lines-rise-v1',{existing:true});assert(V.canEnter(current,'lines-rise-v1','lines-rise-v1'));assert.equal(V.journey(current,'lines-rise-v1').stages.find(c=>c.id==='lines-rise-v1').status,'current');
assert(V.canEnter(fresh,'lines-mirror-v1','lines-mirror-v1'),'verified active puzzle can continue');assert(!V.canEnter(fresh,'lines-mirror-v1','bogus'));
const homeOnly=V.award(V.retainCurrent(fresh,'home'),'home',stats);assert(homeOnly.home);assert(!V.canEnter(homeOnly,'lines-rise-v1'));assert(!V.canEnter(homeOnly,'sums-sparks-v1'));
const historical=V.retainCurrent(fresh,'sums-constellation-v1');assert.deepEqual(historical.__journey.granted,['sums-constellation-v1']);assert(!V.canEnter(historical,'lines-rise-v1'));assert(V.canEnter(historical,'sums-constellation-v1'));assert.throws(()=>V.retainCurrent(fresh,'bogus'));assert.deepEqual(V.retainCurrent(historical,'sums-constellation-v1'),historical);
const historicalWon=V.award(historical,'sums-constellation-v1',stats);assert(historicalWon['sums-constellation-v1']);assert.equal(V.journey(historicalWon).completed,1);assert(!V.journey(historicalWon).finished);
const currentHigh=V.migrateProgress({},'lines-spectrum-v1',{existing:true});
assert(V.canEnter(currentHigh,'lines-spectrum-v1'));const highWon=V.award(currentHigh,'lines-spectrum-v1',stats);
assert(highWon['lines-spectrum-v1']);assert(!highWon['lines-rise-v1']);assert(!highWon['lines-mirror-v1']);
assert.deepEqual(V.normalizeProgress(highWon),highWon);assert.equal(V.getStatus(highWon,'lines').completed,1);assert.equal(V.getStatus(highWon,'lines').unlocked,1);
assert(!V.canEnter(highWon,'sums-constellation-v1'));const highWithSums=complete(highWon,'sums',2);assert(!V.canEnter(highWithSums,'sums-constellation-v1'),'orphan line final does not mean all three lines complete');assert(!V.normalizeProgress({'lines-spectrum-v1':highWon['lines-spectrum-v1']})['lines-spectrum-v1']);
const lateRaw=complete(complete({},'lines'),'sums'),late=V.migrateProgress(lateRaw,null,{existing:true}),lateState=V.journey(late);
assert.equal(lateState.completed,6);assert(!lateState.finished);assert(lateState.returning);assert.equal(lateState.nextId,'dawn');
assert.deepEqual(Object.fromEntries(Object.entries(late).filter(([k])=>k!=='__journey')),lateRaw,'migration cannot erase or invent completions');
for(const c of V.chapters()){assert(c.bridge&&c.mission&&c.outcome&&c.nextLink);assert(c.mission.includes('例如'));}
for(const p of fixture.voyage)assert.equal(hash(V.getPuzzle(p.id)),p.sha256);
assert.deepEqual(V.normalizeProgress(rawPartial),rawPartial,'legacy normalization does not add metadata');
for(const marker of [{version:2,granted:[]},null,{},[],{version:1,granted:['unknown']},{version:1,granted:['dawn','dawn']},{version:1,granted:[],extra:true}]){
 const raw={__journey:marker},before=JSON.stringify(raw);assert.throws(()=>V.migrateProgress(raw,null,{existing:true}),e=>e.code==='VOYAGE_PROGRESS_UNSUPPORTED');assert.equal(JSON.stringify(raw),before);
}
const malformed=JSON.parse(JSON.stringify(existingEmpty));malformed.__journey.granted.push('bogus',malformed.__journey.granted[0]);assert.notDeepEqual(V.normalizeProgress(malformed),malformed);
const highStore=storage({[B.keys[4]]:JSON.stringify(highWon)});assert.deepEqual(B.create(highStore).entries[B.keys[4]],highWon);
const source=storage({[B.keys[4]]:JSON.stringify(late)}),backup=B.create(source,{appVersion:'1.0.1'}),target=storage();assert(B.replace(target,backup).replaced);assert.deepEqual(JSON.parse(target.getItem(B.keys[4])),late);
const bad=JSON.parse(JSON.stringify(backup));bad.entries[B.keys[4]]=malformed;assert.throws(()=>B.validate(bad));
console.log('PASS voyage story: fresh DAG gates; parallel routes and real final join; exact one-time inherited access; current resume; 15-stage completion; old stats/puzzles and backup marker retained; malformed grants rejected.');
