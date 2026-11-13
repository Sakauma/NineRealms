'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto'),{Worker:NativeThread}=require('node:worker_threads');
const Daily=require('../src/daily.js'),G=require('../src/generator.js');
const hash=p=>crypto.createHash('sha256').update(JSON.stringify(p)).digest('hex');
const globals={Worker:global.Worker,make:URL.createObjectURL,revoke:URL.revokeObjectURL},sources=new Map(),workers=[];let serial=0,behavior='run',requests=0;
URL.createObjectURL=blob=>{const id='daily-worker:'+ ++serial;sources.set(id,blob);return id;};URL.revokeObjectURL=id=>sources.delete(id);
global.Worker=class{constructor(url){workers.push(this);this.ready=sources.get(url).text();this.behavior=behavior;}postMessage(request){this.request=request;requests++;if(this.behavior==='hold')return;
 this.ready.then(code=>{if(this.stopped)return;if(this.behavior!=='run'){this.onmessage({data:{key:request.key,error:this.behavior}});return;}
 this.thread=new NativeThread("const {parentPort}=require('node:worker_threads');var module=undefined;var self={postMessage:x=>parentPort.postMessage(x)};"+code+";parentPort.on('message',data=>self.onmessage({data}));",{eval:true});this.thread.on('message',data=>{if(!this.stopped)this.onmessage({data});});this.thread.on('error',e=>{if(!this.stopped)this.onerror(e);});this.thread.postMessage(request);});}
 terminate(){this.stopped=true;if(this.thread)this.thread.terminate();}};
(async()=>{try{
 const client=Daily.createClient(),goldens=require('./fixtures/daily-v3.json');
 assert.equal(Daily.peekPuzzle(goldens[0].date),null);assert.deepEqual(Daily.describe(goldens[0].date),{mode:'classic',difficulty:'easy'});assert.equal(requests,0);
 let ticked=false;setImmediate(()=>{ticked=true;});const pending=client.run(goldens[0].date);assert.equal(Daily.peekPuzzle(goldens[0].date),null);const first=await pending;assert(ticked,'worker generation yields to main event loop');assert.equal(hash(first),goldens[0].sha256);
 const before=requests;first.givens.fill(0);assert.equal(hash(await client.run(goldens[0].date)),goldens[0].sha256);assert.equal(requests,before,'cache should not launch worker');
 for(const item of goldens.slice(1))assert.equal(hash(await client.run(item.date)),item.sha256,'async worker changed delivered daily');
 const old=await client.run('2026-11-14');assert.deepEqual(old,Daily.getPuzzle('2026-11-14'));assert.equal(requests,before+goldens.length-1,'old dates stay lightweight');
 behavior='hold';const cancelled=client.run('2040-01-01'),late=workers.at(-1);client.cancel();await assert.rejects(cancelled,{name:'AbortError'});late.onmessage({data:{key:'2040-01-01',puzzle:{}}});assert.equal(Daily.peekPuzzle('2040-01-01'),null,'late cancelled result must not enter cache');
 const stale=client.run('2040-01-02'),staleWorker=workers.at(-1);const newer=client.run('2040-01-03');await assert.rejects(stale,{name:'AbortError'});staleWorker.onmessage({data:{key:'2040-01-02',puzzle:{}}});client.cancel();await assert.rejects(newer,{name:'AbortError'});assert.equal(Daily.peekPuzzle('2040-01-02'),null);
 const malformed=client.run('2040-01-04');workers.at(-1).onmessage({data:{key:'wrong',puzzle:{}}});await assert.rejects(malformed,/INVALID_RESULT/);assert.equal(Daily.peekPuzzle('2040-01-04'),null);
 const incomplete=client.run('2040-01-08'),partial=G.generateDailyV1({mode:Daily.describe('2040-01-08').mode,seed:'nine-realms-daily-v3:2040-01-08'});partial.generation.unique=false;workers.at(-1).onmessage({data:{key:'2040-01-08',puzzle:partial}});await assert.rejects(incomplete,/INVALID_RESULT/);assert.equal(Daily.peekPuzzle('2040-01-08'),null);
 behavior='DENSITY_NOT_REACHED';const fallback=await client.run('2040-01-05');assert.equal(fallback.dailyFallback,true);assert.equal(fallback.dailyEdition,'fallback-v3');assert(!fallback.generation);
 behavior='MISSING_RESOURCE';await assert.rejects(client.run('2040-01-06'),/MISSING_RESOURCE/);assert.equal(Daily.peekPuzzle('2040-01-06'),null,'transport/unknown errors never select a different daily');
 behavior='hold';const nativeTimer=global.setTimeout;global.setTimeout=(fn,ms)=>nativeTimer(fn,0);try{await assert.rejects(client.run('2040-01-07'),/DAILY_GENERATION_TIMEOUT/);}finally{global.setTimeout=nativeTimer;}assert.equal(Daily.peekPuzzle('2040-01-07'),null);
 assert.equal(sources.size,0);assert(workers.every(w=>w.stopped),'workers must terminate on every path');
 console.log('PASS daily async client: 11 delivered golden dates, real worker/main-loop responsiveness, cache copies, old dates, replacement/cancel/late/wrong-date results, pinned deterministic fallback, no fallback on unknown errors or timeout, resource cleanup.');
}finally{workers.forEach(w=>w.terminate());global.Worker=globals.Worker;URL.createObjectURL=globals.make;URL.revokeObjectURL=globals.revoke;}})().catch(e=>{console.error(e);process.exitCode=1;});
