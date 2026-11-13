'use strict';
const assert=require('node:assert/strict'),{Worker:NativeThread}=require('node:worker_threads');
const G=require('../src/generator.js'),E=require('../src/engine.js');
const original={Worker:global.Worker,make:URL.createObjectURL,revoke:URL.revokeObjectURL,timer:global.setTimeout};
const sources=new Map(),workers=[],requests=[];let serial=0,actions={},timers=[];
URL.createObjectURL=blob=>{const id='recovery:'+ ++serial;sources.set(id,blob);return id;};URL.revokeObjectURL=id=>sources.delete(id);
global.Worker=class{
 constructor(url){this.ready=sources.get(url).text();workers.push(this);}
 postMessage(request){this.request=request;requests.push(request);const stage=request.recoveryStage||'primary',action=actions[stage];if(action==='hold')return;
 this.ready.then(code=>{if(this.stopped)return;if(action==='fail'){this.onmessage({data:{error:'FORCED_BUDGET'}});return;}if(action==='error'){this.onerror(Error('transport'));return;}
 this.thread=new NativeThread("const {parentPort}=require('node:worker_threads');var module=undefined;var self={postMessage:x=>parentPort.postMessage(x)};"+code+";parentPort.on('message',data=>self.onmessage({data}));",{eval:true});
 this.thread.on('message',data=>{if(!this.stopped)this.onmessage({data});});this.thread.on('error',error=>{if(!this.stopped)this.onerror(error);});this.thread.postMessage(request);
 });}
 terminate(){this.stopped=true;if(this.thread)this.thread.terminate();}
};
const tick=()=>new Promise(r=>setImmediate(r));
async function until(check){for(let i=0;i<1000;i++){if(check())return;await tick();}throw Error('stage not reached');}
(async()=>{try{
 const client=G.createClient(),request={mode:'thermo',difficulty:'easy',seed:'recovery-client-1',fresh:true};
 // Successful primary is unchanged, opt-in stages do not eagerly launch extra work.
 let stages=[],before=requests.length;actions={};let p=await client.run(request,{recovery:true,onStage:s=>stages.push(s.stage)});
 assert.deepEqual(stages,['primary']);assert.equal(requests.length,before+1);assert.equal(p.deliveryRecovery,undefined);
 // Actual worker source performs the recovery API; only the primary failure is injected.
 stages=[];actions={primary:'fail'};let responsive=false;setImmediate(()=>responsive=true);
 p=await client.run(request,{recovery:true,onStage:s=>stages.push(s.stage)});assert(responsive);
 assert.deepEqual(stages,['primary','fresh-retry']);assert.equal(p.deliveryRecovery.kind,'fresh-retry');assert.equal(p.mode,request.mode);assert.equal(p.difficulty,request.difficulty);assert(E.validateComplete(p.solution,{mode:p.mode,clues:p.clues}));
 const expected=G.recover(request,{stage:'fresh-retry'});assert.deepEqual(p,{...expected.puzzle,deliveryRecovery:expected.recovery});
 // Actual final-stage worker returns only a validated same-mode/tier inventory candidate.
 const inventoryRequest={mode:'classic',difficulty:'easy',seed:'recovery-inventory-1',fresh:true};stages=[];actions={primary:'error','fresh-retry':'fail'};
 p=await client.run(inventoryRequest,{recovery:true,onStage:s=>stages.push(s.stage)});
 assert.deepEqual(stages,['primary','fresh-retry','verified-catalog']);assert(['verified-catalog','verified-reserve'].includes(p.deliveryRecovery.kind));
 assert.equal(p.mode,'classic');assert.equal(p.difficulty,'easy');assert.deepEqual(p,{...G.recover(inventoryRequest,{stage:'verified-catalog'}).puzzle,deliveryRecovery:G.recover(inventoryRequest,{stage:'verified-catalog'}).recovery});
 // Every phase can be cancelled; stale callbacks from any old worker are inert.
 for(const target of ['primary','fresh-retry','verified-catalog']){
  actions={primary:target==='primary'?'hold':'fail','fresh-retry':target==='fresh-retry'?'hold':'fail','verified-catalog':'hold'};
  const pending=client.run(request,{recovery:true});await until(()=>workers.at(-1).request&&(workers.at(-1).request.recoveryStage||'primary')===target);
  const stale=workers.at(-1),count=requests.length;client.cancel();await assert.rejects(pending,{name:'AbortError'});
  stale.onmessage({data:{puzzle:p,recovery:p.deliveryRecovery}});stale.onerror(Error('late'));await tick();assert.equal(requests.length,count);
 }
 // A second request supersedes the whole recovery sequence, not merely one worker.
 actions={primary:'hold'};const stale=client.run(request,{recovery:true}),fresh=client.run(request,{recovery:true});await assert.rejects(stale,{name:'AbortError'});client.cancel();await assert.rejects(fresh,{name:'AbortError'});
 // Real watchdog budget values, fast simulated expiry: exactly 8+8+4, never a loop.
 actions={primary:'hold','fresh-retry':'hold','verified-catalog':'hold'};timers=[];
 global.setTimeout=(fn,ms)=>{timers.push(ms);return original.timer(fn,0);};before=requests.length;
 await assert.rejects(client.run(request,{recovery:true}),e=>e.message==='GENERATION_TIMEOUT'&&e.recoveryExhausted===true);assert.deepEqual(timers,[8000,8000,4000]);assert.equal(requests.length,before+3);
 timers=[];before=requests.length;await assert.rejects(client.run(request),/GENERATION_TIMEOUT/);assert.deepEqual(timers,[8000]);assert.equal(requests.length,before+1,'legacy run remains single attempt');
 timers=[];before=requests.length;await assert.rejects(client.run(request,{recovery:true,allowCatalog:false}),/GENERATION_TIMEOUT/);assert.deepEqual(timers,[8000,8000]);assert.equal(requests.length,before+2,'new-puzzle-only entry cannot silently receive inventory');
 global.setTimeout=original.timer;global.Worker=undefined;await assert.rejects(client.run(request,{recovery:true}),/WORKER_UNAVAILABLE/);
 assert.equal(sources.size,0);assert(workers.every(w=>w.stopped));
 console.log('PASS generation recovery client: actual worker primary/search/inventory, same-tier result, bounded 8+8+4 watchdogs, opt-in legacy contract, stage cancellation, supersession, late callbacks and cleanup.');
 }finally{global.setTimeout=original.timer;global.Worker=original.Worker;URL.createObjectURL=original.make;URL.revokeObjectURL=original.revoke;for(const w of workers)w.terminate();}
})().catch(e=>{console.error(e);process.exitCode=1;});
