/* DOM integration via npm ci; not a rendering test. */
'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');
const Backup=require('../src/backup.js'),Engine=require('../src/engine.js');
const mode=process.env.MODE||'classic',puzzle=Engine.getPuzzle('easy','personal-dom-'+mode,mode);
const initial={version:8,preferences:{theme:'nebula',fx:false,intensity:'soft'},game:{sessionId:'dom-'+mode,createdAt:1,puzzleId:puzzle.id,sourceId:puzzle.sourceId,mode,difficulty:'easy',clues:puzzle.clues,givens:puzzle.givens,solution:puzzle.solution,board:puzzle.givens.slice(),notes:puzzle.givens.map(()=>0),selected:0,mistakes:0,hints:0,elapsedMs:0,started:false,paused:false,completed:false,history:[],branch:null}};
const html=fs.readFileSync('dist/index.html','utf8'),downloads=[],blobs=new Map(),errors=[],workers=[];
const virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',e=>{if(!String(e.message).includes('navigation'))errors.push(e.message)});
const dom=new JSDOM(html,{url:'https://ninerealms.test/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole,beforeParse(w){
 w.localStorage.setItem('nine-realms.sudoku.v1',JSON.stringify(initial));
 w.matchMedia=()=>({matches:true,addEventListener(){},addListener(){}});w.requestAnimationFrame=()=>0;w.cancelAnimationFrame=()=>{};
 w.HTMLElement.prototype.scrollIntoView=function(){};
 if(process.env.CROSSTAB)w.Worker=class {constructor(){this.stopped=false;workers.push(this)}postMessage(request){this.request=request}terminate(){this.stopped=true}};
 w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.Blob=Blob;w.File=File;
 w.HTMLCanvasElement.prototype.getContext=function(type){if(type!=='2d')return null;return new Proxy({canvas:this},{get:(o,k)=>k in o?o[k]:k==='createLinearGradient'||k==='createRadialGradient'?()=>({addColorStop(){}}):()=>{}})};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};
 w.URL.createObjectURL=b=>{const key='blob:test-'+blobs.size;blobs.set(key,b);return key};w.URL.revokeObjectURL=id=>blobs.delete(id);
 w.HTMLAnchorElement.prototype.click=function(){downloads.push({name:this.download,blob:blobs.get(this.href)})};
}});
const w=dom.window,$=id=>w.document.getElementById(id),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const saved=()=>JSON.parse(w.localStorage.getItem('nine-realms.sudoku.v1'));
(async()=>{
 await sleep(30);assert.equal(errors.length,0,JSON.stringify(errors));assert(saved());
 if(process.env.CROSSTAB){
  $('new-game').click();await sleep(10);assert.equal(workers.length,1);assert.equal($('new-game').getAttribute('aria-busy'),'true');
  w.NineRealmsHistory.flush();const before=JSON.stringify(Object.entries(w.localStorage));
  w.dispatchEvent(new w.StorageEvent('storage',{key:Backup.journalKey,newValue:'{}'}));
  assert(workers[0].stopped);assert.equal(w.document.body.inert,true);
  workers[0].onmessage({data:{puzzle:Engine.getPuzzle('easy','stale','classic')}});await sleep(30);
  w.dispatchEvent(new w.Event('beforeunload'));assert.equal(JSON.stringify(Object.entries(w.localStorage)),before);
  console.log('PASS cross-tab import race: generation terminated, late result ignored, history/autosave suspended.');dom.window.close();return;
 }
 $('start-btn').click();let s=saved(),index=s.game.givens.findIndex(v=>!v);
 w.document.querySelectorAll('.cell')[index].click();$('notes-btn').click();w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'2',bubbles:true}));
 assert(saved().game.notes.some(Boolean));
 $('personal-open').click();assert($('personal-dialog').open);$('favorite-current').click();
 let fav=JSON.parse(w.localStorage.getItem('nine-realms.favorites.v1'));assert.equal(fav.records.length,1);assert.equal($('favorite-current').disabled,true);
 const later=[...$('personal-list').querySelectorAll('button')].find(b=>b.textContent==='稍后再玩');later.focus();later.click();assert.equal(w.document.activeElement.textContent,'取消稍后');assert(JSON.parse(w.localStorage.getItem('nine-realms.favorites.v1')).records[0].later);
 $('personal-filter').value='later';$('personal-filter').dispatchEvent(new w.Event('change'));assert.equal($('personal-list').querySelectorAll('article').length,1);
 $('personal-close').click();
 // Even quota failure must not force export of an older persisted board.
 const originalSet=w.Storage.prototype.setItem;w.Storage.prototype.setItem=function(){throw new w.DOMException('full','QuotaExceededError')};
 w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'3',bubbles:true}));
 const storedNotes=saved().game.notes.slice();
 $('backup-open').click();$('backup-export').click();
 for(let i=0;i<100&&!downloads.length;i++)await sleep(10);
 assert.equal(downloads.length,1,$('backup-status').textContent);const text=await downloads[0].blob.text();const good=Backup.validate(text);
 assert.equal(good.appVersion,require('../package.json').version);assert.equal(good.entries['nine-realms.sudoku.v1'].version,8);assert.equal(good.entries['nine-realms.favorites.v1'].records.length,1);assert(good.entries['nine-realms.sudoku.v1'].game.notes.some(Boolean));
 assert(good.entries['nine-realms.history.v1'].records.length);
 assert.notDeepEqual(good.entries['nine-realms.sudoku.v1'].game.notes,storedNotes,'Export must include unsaved in-memory notes');
 w.Storage.prototype.setItem=originalSet;
 // Cancelled restarts preserve the original session; accepted restart freezes the same puzzle.
 $('backup-close').click();const original=saved();$('personal-open').click();
 [...$('personal-list').querySelectorAll('button')].find(b=>b.textContent==='重新挑战').click();await sleep(5);assert($('confirm-dialog').open);$('confirm-cancel').click();await sleep(5);assert.equal(saved().game.sessionId,original.game.sessionId);
 $('personal-open').click();[...$('personal-list').querySelectorAll('button')].find(b=>b.textContent==='重新挑战').click();await sleep(5);$('confirm-accept').click();await sleep(20);
 assert.notEqual(saved().game.sessionId,original.game.sessionId);assert.deepEqual(saved().game.givens,original.game.givens);assert.deepEqual(saved().game.clues,original.game.clues);
 assert(w.NineRealmsHistory.getSnapshot(original.game.sessionId).game.notes.some(Boolean));
 w.NineRealmsHistory.open(original.game.sessionId);$('history-favorite').click();assert.equal(JSON.parse(w.localStorage.getItem('nine-realms.favorites.v1')).records.length,1);w.NineRealmsHistory.close();
 $('backup-open').click();
 // Invalid imports do not touch any existing key.
 const before=JSON.stringify(Object.entries(w.localStorage));
 Object.defineProperty($('backup-file'),'files',{configurable:true,value:[new File(['{"format":"bad"}'],'bad.json')]});$('backup-file').dispatchEvent(new w.Event('change'));
 await sleep(40);assert($('backup-replace').disabled);assert.equal(JSON.stringify(Object.entries(w.localStorage)),before);
 // Preview and cancellation perform no writes. Closing clears confirmation.
 Object.defineProperty($('backup-file'),'files',{configurable:true,value:[new File([text],'backup.json')]});$('backup-file').dispatchEvent(new w.Event('change'));
 for(let i=0;i<100&&!$('backup-preview').textContent;i++)await sleep(10);
 assert($('backup-preview').textContent.includes('收藏 1 题'));assert($('backup-replace').disabled);assert.equal(JSON.stringify(Object.entries(w.localStorage)),before);
 $('backup-close').click();assert(!$('backup-dialog').open);$('backup-open').click();assert(!$('backup-preview').textContent);assert($('backup-replace').disabled);
 // Prepare a different valid backup, confirm replacement, then exercise unload protection.
 const replacement=JSON.parse(text);replacement.entries['nine-realms.sudoku.v1'].preferences.theme='ivory';replacement.entries['nine-realms.favorites.v1'].records[0].later=false;
 Object.defineProperty($('backup-file'),'files',{configurable:true,value:[new File([JSON.stringify(replacement)],'replace.json')]});$('backup-file').dispatchEvent(new w.Event('change'));
 for(let i=0;i<100&&!$('backup-preview').textContent;i++)await sleep(10);
 $('backup-confirm').checked=true;$('backup-confirm').dispatchEvent(new w.Event('change'));assert(!$('backup-replace').disabled);$('backup-replace').click();await sleep(20);
 assert.equal(saved().preferences.theme,'ivory');assert.equal(JSON.parse(w.localStorage.getItem('nine-realms.favorites.v1')).records[0].later,false);
 w.dispatchEvent(new w.Event('beforeunload'));w.dispatchEvent(new w.Event('pagehide'));await sleep(750);
 assert.equal(saved().preferences.theme,'ivory','Old autosave must not overwrite imported preferences');
 assert.equal(w.localStorage.getItem(Backup.journalKey),null);assert.equal(errors.length,0,JSON.stringify(errors));
 console.log('PASS DOM simulation ('+mode+'): startup, notes, favorite/later/filter, export, invalid import, preview/cancel, confirmed replacement and delayed/unload-write protection. No actual browser rendering or navigation tested.');
 dom.window.close();
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1});
