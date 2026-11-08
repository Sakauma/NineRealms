'use strict';
const assert=require('node:assert/strict'),M=require('../src/music.js'),S=require('../src/sound.js'),B=require('../src/backup.js');
const {fixture}=require('./browser-helper.cjs');
assert.equal(M.tracks().length,3);assert.equal(M.period,32);
assert.equal(M.phaseFor('dawn'),'coordinates');assert.equal(M.phaseFor('lines-rise-v1'),'routes');assert.equal(M.phaseFor('sums-constellation-v1'),'routes');assert.equal(M.phaseFor('fusion-homecoming-v1'),'home');
const scores=M.tracks().map(t=>M.score(t.id));assert.equal(new Set(scores.map(s=>JSON.stringify(s))).size,3);
const sfx=Math.max(...['win','voyage-enter','voyage-unlock','voyage-home'].map(k=>S.score(k).reduce((s,n)=>s+n.peak,0)));
for(const notes of scores){
 assert(notes.every(n=>n.at>=0&&n.at<M.period&&n.duration<M.period&&n.attack>0&&n.attack+n.release<=n.duration&&n.midi>=30&&n.midi<=80&&Math.abs(n.pan)<=0.4));
 let upper=0;for(let t=0;t<M.period;t+=0.025){let peak=0;for(const cycle of [-1,0])for(const n of notes)if(t>=n.at+cycle*M.period&&t<n.at+cycle*M.period+n.duration)peak+=n.peak*(1+n.overtone);upper=Math.max(upper,peak);}
 assert(0.9*(upper+sfx)<0.9,'conservative full-volume music+cue headroom');
}
const old=fixture('bgm-backup');const store=s=>({getItem:k=>k===B.keys[0]?JSON.stringify(s):null});assert(B.create(store(old)));
const current=structuredClone(old);current.preferences.musicEnabled=true;current.preferences.musicVolume=0.35;assert(B.create(store(current)));
for(const [key,value] of [['musicEnabled',1],['musicEnabled','true'],['musicVolume',-1],['musicVolume',1.1],['musicVolume','0.3']]){const bad=structuredClone(current);bad.preferences[key]=value;assert.throws(()=>B.create(store(bad)));}
function context(){
 const nodes=[];function param(){return{value:1,events:[],setValueAtTime(v,t){this.value=v;this.events.push(['set',v,t]);},linearRampToValueAtTime(v,t){this.events.push(['ramp',v,t]);},setTargetAtTime(v,t,c){this.events.push(['target',v,t,c]);},cancelScheduledValues(t){this.events.push(['cancel',t]);}};}
 const c={currentTime:0,state:'running',destination:{},nodes,createGain(){return{gain:param(),connect(){},disconnect(){this.disconnected=true;}};},createBufferSource(){const n={connect(){},disconnect(){this.disconnected=true;},start(at,offset){this.startArgs=[at,offset];},stop(at){this.stopAt=at;}};nodes.push(n);return n;}};return c;
}
(async()=>{
 const c=context(),calls=[],p=M.createPlayer(c,{render:async id=>{calls.push(id);return{duration:32,id};}});
 assert(await p.update({active:true,phase:'coordinates',volume:0.2}));assert.equal(p.status().sources,1);c.currentTime=5;p.stop();assert.equal(p.status().sources,0);assert(c.nodes.every(n=>n.disconnected));
 assert(await p.update({active:true,phase:'coordinates',volume:0.2}));assert(Math.abs(c.nodes.at(-1).startArgs[1]-4.98)<0.001);assert.equal(calls.length,1,'resume uses cached buffer and position');
 await p.update({active:true,phase:'routes',volume:0.2});assert.equal(p.status().sources,2);await p.update({active:true,phase:'home',volume:0.2});assert(p.status().sources<=2);assert(p.status().cached<=2);assert(c.nodes[1].disconnected,'rapid switching retires earlier fade');
 p.duck(2);p.update({active:false,phase:'home',volume:0.2});assert.equal(p.status().sources,0);p.release();assert.equal(p.status().cached,0);assert.equal(p.status().state,'released');assert.equal(await p.update({active:true,phase:'routes',volume:1}),false);
 const pendingContext=context();let done;const pending=M.createPlayer(pendingContext,{render:()=>new Promise(r=>{done=r;})});const task=pending.update({active:true,phase:'coordinates',volume:0.2});await Promise.resolve();await Promise.resolve();pending.stop();done({duration:32});assert.equal(await task,false);assert.equal(pending.status().sources,0);pending.release();
 const rapidContext=context(),rendered=[];const rapid=M.createPlayer(rapidContext,{render:async id=>{rendered.push(id);return{duration:32};}});await Promise.all(['coordinates','routes','home'].map(phase=>rapid.update({active:true,phase,volume:0.2})));assert.deepEqual(rendered,['home'],'stale queued syntheses skipped');assert.equal(rapid.status().sources,1);rapid.release();
 const blockedContext=context();blockedContext.state='suspended';const blocked=M.createPlayer(blockedContext,{render:async()=>({duration:32})});assert.equal(await blocked.update({active:true,phase:'home',volume:0.2}),false);assert.equal(blocked.status().sources,0);blockedContext.state='running';assert(await blocked.update({active:true,phase:'home',volume:0.2}));blocked.release();
 const failure=M.createPlayer(context(),{render:async()=>{throw Error('unsupported');}});assert.equal(await failure.update({active:true,phase:'home',volume:0.2}),false);assert.equal(failure.status().state,'error');assert.equal(failure.status().sources,0);failure.release();
 console.log('PASS BGM: original distinct scores, conservative mixed headroom, optional preference backup validation, bounded sources/cache, resumable position, stale render cancellation, crossfade retirement and complete release.');
})().catch(e=>{console.error(e);process.exitCode=1;});
