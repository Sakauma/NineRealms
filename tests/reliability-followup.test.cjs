'use strict';
const assert=require('node:assert/strict'),E=require('../src/engine.js'),L=require('../src/logic.js'),H=require('../src/history.js'),R=require('../src/save-recovery.js'),D=require('../src/daily.js'),B=require('../src/backup.js'),{fixture}=require('./browser-helper.cjs');
function memory(initial={}){const data=new Map(Object.entries(initial));return{data,hook:null,getItem(k){return data.get(k)??null;},setItem(k,v){if(this.hook)this.hook(k,v);data.set(k,String(v));},removeItem(k){data.delete(k);}};}
function history(storage){return H.createStore({storage,Engine:E,preserveOriginal:state=>R.preserve(storage,state,H.KEY)});}
for(const raw of ['', '{broken history',JSON.stringify({version:99,records:[{future:'preserve me'}]})]){
 const s=memory({[H.KEY]:raw}),store=history(s);assert(['invalid','unsupported'].includes(store.originalState().status));assert.equal(store.originalState().raw,raw);assert(store.capture(fixture()));assert.equal(store.flush(),false);assert.equal(s.getItem(H.KEY),raw);assert.throws(()=>store.exportData(),/原文/);
 assert(store.resumeAfterPreserve());assert.equal(JSON.parse(s.getItem(H.KEY)).version,1);assert.equal(store.status().readOnly,false);const copy=JSON.parse(s.getItem(R.archiveKey)).entries[0];assert.equal(copy.key,H.KEY);assert.equal(copy.raw,raw);assert.equal(store.exportData().records.length,1);
}
for(const failedKey of [R.archiveKey,H.KEY]){
 const raw='{quota history',s=memory({[H.KEY]:raw}),store=history(s);store.capture(fixture());s.hook=k=>{if(k===failedKey)throw Error('quota');};assert.throws(()=>store.resumeAfterPreserve(),/quota/);assert.equal(s.getItem(H.KEY),raw);assert.equal(store.flush(),false);if(failedKey===H.KEY)assert.equal(JSON.parse(s.getItem(R.archiveKey)).entries[0].raw,raw);
}
{
 const raw='{bad history',s=memory({[H.KEY]:raw,[R.archiveKey]:'{bad copies'}),store=history(s);store.capture(fixture());assert.throws(()=>store.resumeAfterPreserve(),/副本/);assert.equal(s.getItem(H.KEY),raw);assert.equal(s.getItem(R.archiveKey),'{bad copies');
}
{
 const s=memory({[H.KEY]:'{old history'}),store=history(s);store.capture(fixture());s.setItem(H.KEY,'other window');assert.throws(()=>store.resumeAfterPreserve(),/其他窗口/);assert.equal(s.getItem(H.KEY),'other window');assert.equal(s.getItem(R.archiveKey),null);
}
{
 const s=memory({[H.KEY]:'{old history'}),store=history(s);store.capture(fixture());s.hook=k=>{if(k===R.archiveKey)s.data.set(H.KEY,'new concurrent history');};assert.throws(()=>store.resumeAfterPreserve(),/其他窗口/);assert.equal(s.getItem(H.KEY),'new concurrent history');assert.equal(JSON.parse(s.getItem(R.archiveKey)).entries[0].raw,'{old history');
}
{
 const s=memory({[H.KEY]:'{old history'}),session=R.createSession({storage:s});session.start();const store=history(session.storage);store.capture(fixture());s.data.set(H.KEY,'new writer');assert.throws(()=>store.resumeAfterPreserve());assert.equal(s.getItem(H.KEY),'new writer');session.release();
}
{
 const seed=memory(),valid=history(seed);valid.capture(fixture());valid.flush();const data=JSON.parse(seed.getItem(H.KEY));data.records.push({sessionId:'broken',snapshot:null});seed.data.set(H.KEY,JSON.stringify(data));const recovered=history(seed);assert.equal(recovered.status().readOnly,true);assert.equal(recovered.getRecords().length,1);assert.equal(recovered.flush(),false);
}
for(const damage of [s=>{s.version=99;},s=>{s.game.solution[0]=s.game.solution[1];}]){
 const s=memory(),seed=history(s);seed.capture(fixture());seed.flush();const data=JSON.parse(s.getItem(H.KEY));damage(data.records[0].snapshot);const raw=JSON.stringify(data);s.data.set(H.KEY,raw);const recovered=history(s);assert.equal(recovered.originalState().status,'invalid');recovered.capture(fixture('new-after-damage'));assert.equal(recovered.flush(),false);assert.equal(s.getItem(H.KEY),raw);
}
const {openPuzzle}=require('./rule-only-fixtures.cjs');
for(const mode of ['killer','thermo','arrow','thermo-killer']){
 const p=openPuzzle(mode),ctx={mode,clues:p.clues};assert(E.validateComplete(p.solution,ctx));assert(E.validateComplete(p.other,ctx));assert.notDeepEqual(p.solution,p.other);assert(L.scope(ctx).complete);assert(L.complete(p.other,ctx));
 const proof=E.analyzeSolutions(p.givens,ctx,{limit:2,maxNodes:10000,timeLimitMs:1000});assert.equal(proof.count,2);assert(!proof.exhausted);
 const bad=p.solution.map(n=>mode==='arrow'?(n===3?4:n===4?3:n):(n===1?3:n===3?1:n));assert(E.validateComplete(bad,'classic'));assert(!L.complete(bad,ctx));
 const patch={};for(const key of ['solve','analyzeSolutions','countSolutions','getHint']){patch[key]=E[key];E[key]=()=>{throw Error('answer oracle '+key);};}
 try{assert(L.complete(p.other,ctx));assert(L.conflicts(bad,ctx).length);const near=p.other.slice();near[0]=0;assert(L.masks(near,ctx)[0]);}finally{Object.assign(E,patch);}
 const s=fixture();Object.assign(s.game,{puzzleId:p.id,sourceId:null,mode,difficulty:'easy',clues:p.clues,givens:p.givens,solution:p.solution,board:p.other,notes:Array(81).fill(0),selected:0,logicMode:true,completed:true,started:true});
 const storage=memory({[B.keys[0]]:JSON.stringify(s)}),hs=history(storage);hs.capture(s);hs.flush();const backup=B.create(storage),target=memory();assert(B.replace(target,backup).replaced);assert.deepEqual(JSON.parse(target.getItem(B.keys[0])).game.board,p.other);
}
const start=Date.parse('2024-01-01T00:00:00Z'),key=i=>new Date(start+i*86400000).toISOString().slice(0,10),record={elapsedMs:1000,mistakes:0,hints:0};let days={};
for(let i=0;i<800;i++)days=D.recordCompletion(days,key(i),record);
assert.equal(D.detailDates(days).length,400);assert.deepEqual(D.getStats(days,key(799)),{total:800,streak:800,todayCompleted:true});assert.equal(days.__summary.ranges.length,1);assert(D.hasCompletion(days,key(0)));
const replay=D.recordCompletion(days,key(0),{...record,hints:9});assert.equal(D.getStats(replay,key(799)).total,800);assert.deepEqual(replay.__summary,days.__summary);
let gaps={};for(const i of [0,2,4])gaps=D.recordCompletion(gaps,key(i),record);assert.equal(D.getStats(gaps,key(4)).streak,1);gaps=D.recordCompletion(gaps,key(3),record);gaps=D.recordCompletion(gaps,key(1),record);assert.deepEqual(D.getStats(gaps,key(4)),{total:5,streak:5,todayCompleted:true});assert.equal(D.getStats(gaps,key(2)).total,3);
const legacy={};for(let i=0;i<400;i++)legacy[key(i)]=record;assert.equal(D.getStats(legacy,key(399)).totalIncomplete,true);const migrated=D.recordCompletion(legacy,key(400),record),ms=D.getStats(migrated,key(400));assert.equal(ms.total,401);assert.equal(ms.streak,401);assert(ms.totalIncomplete&&ms.streakIncomplete);assert.equal(D.detailDates(migrated).length,400);
const small={};for(let i=0;i<3;i++)small[key(i)]=record;assert.deepEqual(D.getStats(D.recordCompletion(small,key(3),record),key(3)),{total:4,streak:4,todayCompleted:true});
for(const bad of [{__summary:{version:2,ranges:[]}},{__summary:{version:1,ranges:[[key(1),key(0)]]}},{__summary:{version:1,ranges:[[key(0),key(1)],[key(2),key(3)]]}},{[key(0)]:record,__summary:{version:1,ranges:[]}}])assert.throws(()=>D.normalizeRecords(bad));
const rangeKey=i=>new Date(Date.UTC(1970,0,1)+i*86400000).toISOString().slice(0,10),atLimit={__summary:{version:1,ranges:Array.from({length:10000},(_,i)=>[rangeKey(i*2),rangeKey(i*2)])}},limitRaw=JSON.stringify(atLimit);D.validateRecords(atLimit);assert.throws(()=>D.recordCompletion(atLimit,rangeKey(20002),record),/超出/);assert.equal(JSON.stringify(atLimit),limitRaw);
D.validateRecords(days);const ds=memory({[B.keys[3]]:JSON.stringify(days)}),backup=B.create(ds),target=memory();assert.equal(B.preview(backup).dailyCount,400);assert(B.replace(target,backup).replaced);assert.deepEqual(D.getStats(JSON.parse(target.getItem(B.keys[3])),key(799)),{total:800,streak:800,todayCompleted:true});
console.log('PASS three followups: history original protection/export gating/archive reset/quota/concurrent writes/partial recovery; four rule-only variants with valid alternative solutions and backup/replay; 800-day totals/streaks, bounded details, replay deduplication, gap bridging, honest legacy lower bounds and backup migration.');

