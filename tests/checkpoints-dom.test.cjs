/* Optional DOM simulation only, not actual rendered layout. */
'use strict';
const {enableDormantDOM}=require('./dormant-tools-fixture.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{JSDOM,VirtualConsole}=require('../.build-cache/dom-test/node_modules/jsdom');
const dom=new JSDOM('<button id="history-open">历史</button><dialog id="other"><button id="other-focus">别的对话框</button></dialog>',{url:'https://ninerealms.test/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document,$=id=>d.getElementById(id),resumed=[];
w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
for(const file of ['variant-bank.js','multigrid-bank.js','engine.js','drafts.js','checkpoints.js','history.js'])w.eval(fs.readFileSync(path.join(__dirname,'../src',file),'utf8'));
const E=w.SudokuEngine,H=w.NineRealmsHistory,p=E.getPuzzle('easy','checkpoint-dom','classic'),index=p.givens.findIndex(v=>!v);
H.init({Engine:E,openDialog:x=>x.showModal(),onResume:x=>{resumed.push(x);return true;},onReplayNew:x=>{resumed.push(x);return true;}});
const s={version:8,game:{sessionId:'checkpoint-dom',createdAt:1,puzzleId:p.id,sourceId:p.sourceId,mode:'classic',difficulty:'easy',clues:p.clues,givens:p.givens,solution:p.solution,board:p.givens.slice(),notes:Array(81).fill(0),selected:index,mistakes:0,hints:0,elapsedMs:0,started:true,paused:false,completed:false,history:[],branch:null}};
H.capture(s,{origin:'new'});s.game.hints=1;H.capture(s,{action:'查看提示'});s.game.board[index]=p.solution[index];H.capture(s,{action:'填数字'});
(async()=>{
 H.openCheckpoints();assert($('history-dialog').open);assert($('checkpoint-panel').open);assert.equal(d.activeElement,$('checkpoint-mark-current'));assert.match(d.querySelector('.checkpoint-scope').textContent,/40 局.*3000 步/);assert.match(d.querySelector('.checkpoint-scope').textContent,/不推断/);
 assert(d.querySelector('.checkpoint-row'));H.open('checkpoint-dom',1);$('checkpoint-label').value='<img src=x onerror=bad()>';$('checkpoint-mark-frame').click();assert.equal(H.checkpoints({kind:'manual'}).length,1);assert.equal(H.checkpoints({kind:'manual'})[0].stepIndex,1);assert.equal(d.querySelector('.checkpoint-list img'),null);
 d.querySelector('[data-checkpoint-kind="manual"]').click();let row=d.querySelector('.checkpoint-row'),buttons=row.querySelectorAll('button');assert.equal(buttons[0].textContent,'回看这一刻');buttons[0].click();assert.equal($('history-replay-slider').value,'1');assert.equal(d.activeElement,$('history-replay-slider'));
 row=d.querySelector('.checkpoint-row');buttons=row.querySelectorAll('button');assert.equal(buttons[1].textContent,'继续最新进度');buttons[1].click();await Promise.resolve();await Promise.resolve();assert.equal(resumed.length,1);assert.equal(resumed[0].game.board[index],p.solution[index],'continue latest snapshot, not the old bookmarked frame');
 d.querySelector('.checkpoint-row button:last-child').click();assert.equal(H.checkpoints({kind:'manual'}).length,0);assert.equal(d.activeElement,$('checkpoint-mark-current'));
 $('checkpoint-label').value='当前最新处';$('checkpoint-mark-current').click();assert.equal(H.checkpoints({kind:'manual'})[0].stepIndex,2);assert.match($('checkpoint-status').textContent,/已保存/);H.flush();assert(JSON.parse(w.localStorage.getItem(H.KEY)).records[0].checkpoints.length);
 H.close();$('other').showModal();$('other-focus').focus();H.openCheckpoints();assert.equal(d.activeElement,$('other-focus'));assert(!$('history-dialog').open);dom.window.close();
 await fullApp();
 await capacityUI();
 console.log('PASS checkpoints DOM: manual current/frame marking, safe label text, type filter, precise frame replay vs latest-progress continue, remove/focus, persistence and modal focus isolation. jsdom only.');
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1;});

async function fullApp(){
 const E=require('../src/engine.js'),B=require('../src/backup.js'),p=E.getPuzzle('easy','cp-full','classic'),q=E.getPuzzle('easy','cp-target','classic'),idx=p.givens.findIndex(v=>!v),initial={version:8,preferences:{theme:'nebula',fx:false,intensity:'soft'},game:{sessionId:'cp-live-session',createdAt:1,puzzleId:p.id,sourceId:p.sourceId,mode:'classic',difficulty:'easy',clues:p.clues,givens:p.givens,solution:p.solution,board:p.givens.slice(),notes:Array(81).fill(0),selected:idx,mistakes:0,hints:0,elapsedMs:500,started:true,paused:false,completed:false,history:[],branch:null}};
 initial.game.notes[idx]=1;
 const html=fs.readFileSync('src/index.html','utf8').replace(/<script src="\.\/([^"]+)"><\/script>/g,(_,name)=>'<script>'+fs.readFileSync('src/'+name,'utf8')+'</script>').replace(/<link[^>]*href="\.\/[^"]+"[^>]*>/g,'');
 const errors=[],downloads=[],blobs=new Map(),vc=new VirtualConsole();vc.on('jsdomError',e=>{if(!String(e.message).includes('navigation'))errors.push(e.message);});
 const dom=new JSDOM(html,{url:'https://ninerealms.test/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  w.localStorage.setItem('nine-realms.sudoku.v1',JSON.stringify(initial));w.matchMedia=()=>({matches:true,addEventListener(){},addListener(){}});w.requestAnimationFrame=()=>0;w.cancelAnimationFrame=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.Blob=Blob;w.File=File;
  w.HTMLCanvasElement.prototype.getContext=function(type){if(type!=='2d')return null;return new Proxy({canvas:this},{get:(o,k)=>k in o?o[k]:k==='createLinearGradient'||k==='createRadialGradient'?()=>({addColorStop(){}}):()=>{}})};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};w.URL.createObjectURL=b=>{const id='blob:'+blobs.size;blobs.set(id,b);return id;};w.URL.revokeObjectURL=id=>blobs.delete(id);w.HTMLAnchorElement.prototype.click=function(){downloads.push(blobs.get(this.href));};
 }}),w=dom.window,d=w.document,$=id=>d.getElementById(id),tick=()=>new Promise(r=>setTimeout(r,25)),saved=()=>JSON.parse(w.localStorage.getItem('nine-realms.sudoku.v1')).game;
 try{
  await tick();assert.deepEqual(errors,[]);assert.equal(saved().sessionId,initial.game.sessionId);if(saved().paused)$('resume-btn').click();
  // Explicit dormant draft/checkpoint fixture; no current UI reachability claim.
  enableDormantDOM(w);
  const target=w.JSON.parse(JSON.stringify({version:8,game:{...initial.game,sessionId:'cp-target',puzzleId:q.id,sourceId:q.sourceId,clues:q.clues,givens:q.givens,solution:q.solution,board:q.givens.slice(),notes:Array(81).fill(0)}}));w.NineRealmsHistory.capture(target,{origin:'new'});target.game.hints=1;w.NineRealmsHistory.capture(target,{action:'查看提示'});w.NineRealmsHistory.markCheckpoint('cp-target',1,'回看另一局');
  $('draft-toggle').click();$('checkpoints-open').click();assert($('history-dialog').open);assert($('checkpoint-panel').open);$('checkpoint-label').value='当前笔记卡点';$('checkpoint-mark-current').click();assert(w.NineRealmsHistory.checkpoints({sessionId:'cp-live-session',kind:'manual'}).length,$('checkpoint-status').textContent);
  d.querySelector('[data-checkpoint-kind="manual"]').click();let row=[...d.querySelectorAll('.checkpoint-row')].find(r=>r.dataset.checkpointKey.startsWith('cp-target:'));row.querySelectorAll('button')[0].click();assert.equal($('history-replay-slider').value,'1');
  row=[...d.querySelectorAll('.checkpoint-row')].find(r=>r.dataset.checkpointKey.startsWith('cp-target:'));row.querySelectorAll('button')[1].click();assert($('confirm-dialog').open);$('confirm-cancel').click();await tick();assert.equal(saved().sessionId,'cp-live-session');assert.equal(saved().notes[idx],1);assert(w.NineRealmsHistory.checkpoints({sessionId:'cp-target',kind:'manual'}).length);
  $('draft-toggle').click();$('checkpoints-open').click();row=[...d.querySelectorAll('.checkpoint-row')].find(r=>r.dataset.checkpointKey.startsWith('cp-target:'));row.querySelectorAll('button')[1].click();$('confirm-accept').click();await tick();assert.equal(saved().sessionId,'cp-target');assert.equal(saved().hints,1);
  $('backup-open').click();$('backup-export').click();for(let i=0;i<80&&!downloads.length;i++)await tick();assert.equal(downloads.length,1,$('backup-status').textContent);const backup=B.validate(await downloads[0].text());assert.equal(Object.keys(backup.entries).length,8);assert(backup.entries['nine-realms.history.v1'].records.filter(r=>r.checkpoints&&r.checkpoints.length).length>=2);assert.deepEqual(errors,[]);
 }finally{dom.window.close();}
 console.log('PASS full-app checkpoints: shared reasoning entry, current mark, exact target frame, latest-progress resume cancel/accept, notes preservation and eight-key exported backup.');
}

async function capacityUI(){
 const H=require('../src/history.js'),E=require('../src/engine.js'),p=E.getPuzzle('easy','capacity-roundtrip','classic');
 const game={mode:'classic',difficulty:'easy',clues:p.clues,solution:p.solution,givens:p.givens,sessionId:'capacity-session',createdAt:1,board:p.givens.slice(),notes:Array(81).fill(0),selected:0,mistakes:0,hints:0,elapsedMs:0,started:false,paused:false,completed:false,history:[],branch:null};
 const base={board:game.board,notes:game.notes,selected:0,noteMode:false,branch:false,elapsedMs:0,mistakes:0,hints:0,completed:false};
 const steps=Array.from({length:3000},()=>({action:'候选速记',changes:Array.from({length:40},(_,i)=>[i,game.board[i],0]),selected:0,noteMode:false,branch:false,elapsedMs:0,mistakes:0,hints:0,completed:false}));
 let fixture={version:1,currentId:game.sessionId,removedRecords:0,records:[{sessionId:game.sessionId,createdAt:1,updatedAt:1,origin:'new',snapshot:{version:8,game},base,steps,droppedSteps:0}]};
 fixture=H.createStore({Engine:E,storage:{getItem:()=>JSON.stringify(fixture),setItem(){}}}).exportData();
 let remaining=H.limits.bytes/2-100-JSON.stringify(fixture).length;
 for(const step of fixture.records[0].steps){const n=Math.min(60-step.action.length,remaining);if(n>0){step.action+='x'.repeat(n);remaining-=n;}}
 assert.equal(remaining,0);assert.equal(JSON.stringify(fixture).length,H.limits.bytes/2-100);
 for(const initialIndex of [500,100]){
  const dom=new JSDOM('<button id="history-open">历史</button>',{url:'https://capacity.test/',runScripts:'outside-only'}),w=dom.window,d=w.document,$=id=>d.getElementById(id);
  try{
   w.localStorage.setItem(H.KEY,JSON.stringify(fixture));w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
   for(const file of ['variant-bank.js','multigrid-bank.js','engine.js','drafts.js','checkpoints.js','history.js'])w.eval(fs.readFileSync(path.join(__dirname,'../src',file),'utf8'));
   const h=w.NineRealmsHistory;h.init({Engine:w.SudokuEngine,openDialog:x=>x.showModal()});h.open(game.sessionId,initialIndex);
   $('checkpoint-label').value='记'.repeat(80);$('checkpoint-mark-frame').click();
   assert.equal(h.exportData().records[0].droppedSteps,250,'manual note must actually trigger retention trim');
   assert.equal(h.checkpoints({kind:'manual'})[0].absoluteStep,initialIndex);
   if(initialIndex>=250){
    assert.equal(Number($('history-replay-slider').value),initialIndex-250);
    $('checkpoint-label').value='同一原始步骤';$('checkpoint-mark-frame').click();
    assert.equal(h.checkpoints({kind:'manual'}).length,1,'second mark must update same absolute frame, not drift by 250');
    assert.equal(h.checkpoints({kind:'manual'})[0].absoluteStep,initialIndex);
   }else{
    assert($('checkpoint-mark-frame').disabled);assert.match($('checkpoint-status').textContent,/步骤已被容量清理/);
    $('checkpoint-mark-frame').click();assert.equal(h.checkpoints({kind:'manual'}).length,1);
    $('history-replay-slider').value='1';$('history-replay-slider').dispatchEvent(new w.Event('input'));
    assert(!$('checkpoint-mark-frame').disabled);$('checkpoint-mark-frame').click();assert(h.checkpoints({kind:'manual'}).some(x=>x.absoluteStep===251));
   }
  }finally{dom.window.close();}
 }
 console.log('PASS near-capacity DOM: marking triggers real 250-step trim, retained frame keeps absolute anchor; removed frame warns and cannot be silently remarked.');
}
