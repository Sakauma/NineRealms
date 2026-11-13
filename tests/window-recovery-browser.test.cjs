/* Real Chromium file selection, confirmation, reload, storage and writer locks. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {launch,fixture,delay}=require('./browser-helper.cjs');
const B=require('../src/backup.js'),R=require('../src/save-recovery.js'),Branches=require('../src/branches.js'),Drafts=require('../src/drafts.js'),History=require('../src/history.js'),E=require('../src/engine.js');
const KEY=R.key,HK=B.keys[1],AK=R.archiveKey,out=process.env.RECOVERY_EVIDENCE_DIR;
const source=fixture('import-window-progress'),i=source.game.givens.indexOf(0),j=source.game.givens.findIndex((v,n)=>!v&&n!==i);
source.preferences.theme='nebula';source.preferences.sound=true;source.game.sessionId='window-original-session';source.game.elapsedMs=34567;
source.game.draft=Drafts.empty(81);source.game.draft.colors[i]=2;source.game.redo=[];
source.game.noteMode=Branches.begin(source.game,false);source.game.notes[i]=5;source.game.board[j]=source.game.solution[j];Branches.sync(source.game,source.game.noteMode);
B.validateWindow(source);
(async()=>{
 const b=await launch(),report={checks:[],screenshots:[]};
 const ev=code=>b.evaluate(code),click=id=>ev('document.getElementById('+JSON.stringify(id)+').click();void 0');
 const raw=k=>ev('localStorage.getItem('+JSON.stringify(k)+')'),read=async k=>JSON.parse(await raw(k));
 const all=()=>ev('Object.fromEntries(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)]))');
 async function pick(value){await ev('(()=>{const f=document.getElementById("backup-file"),d=new DataTransfer();d.items.add(new File(['+JSON.stringify(typeof value==='string'?value:JSON.stringify(value))+'],"Nine-Realms-window-save.json",{type:"application/json"}));f.files=d.files;f.dispatchEvent(new Event("change",{bubbles:true}));})()');await b.waitFor('!document.getElementById("backup-file").disabled');}
 async function prepare(value=source){await click('backup-open');await pick(value);assert.match(await ev('document.getElementById("backup-status").textContent'),/对局校验通过/);}
 async function confirm(){await click('backup-confirm');assert.equal(await ev('document.getElementById("backup-replace").disabled'),false,JSON.stringify(await ev('({checked:document.getElementById("backup-confirm").checked,preview:document.getElementById("backup-preview").textContent,status:document.getElementById("backup-status").textContent})')));}
 async function replace(){await ev('window.__beforeRestore=true');await click('backup-replace');try{await b.waitFor('!window.__beforeRestore&&document.readyState==="complete"&&document.querySelectorAll("#board .cell").length===81');}catch(e){console.error('Restore diagnostic',await ev('({status:document.getElementById("backup-status").textContent,conflict:document.getElementById("save-conflict-dialog").open,transition:document.body.dataset.storageTransition,history:NineRealmsHistory.originalState().status})'));throw e;}}
 async function downloads(){await ev('window.__downloads=[];URL.createObjectURL=blob=>{window.__downloads.push({blob});return "blob:test";};HTMLAnchorElement.prototype.click=function(){window.__downloads.at(-1).name=this.download;};');}
 async function shot(name){if(!out)return;fs.mkdirSync(out,{recursive:true});await delay(100);const s=await b.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});const p=path.join(out,name+'.png');fs.writeFileSync(p,Buffer.from(s.data,'base64'));report.screenshots.push(p);}
 try{
  await b.send('Emulation.setDeviceMetricsOverride',{width:1360,height:1000,deviceScaleFactor:1,mobile:false});
  const current=fixture('before-window-restore');current.preferences.sound=false;current.preferences.musicEnabled=false;
  const otherKeys={[B.keys[2]]:JSON.stringify({version:1,found:['gate']}),[B.keys[3]]:'{}',[B.keys[4]]:'{}','other.app':'keep exact'};
  await b.loadStorage({[KEY]:JSON.stringify(current),...otherKeys},'/dist/index.html');await ev('NineRealmsHistory.flush()');await prepare();
  assert.equal(await ev('document.getElementById("backup-replace").disabled'),true);assert.match(await ev('document.getElementById("backup-confirm-text").textContent'),/原对局与原历史先留存副本/);
  const before=await all();await click('backup-replace');assert.deepEqual(await all(),before);await confirm();await shot('window-recovery-preview-desktop');
  await ev('document.getElementById("backup-close").click();document.getElementById("backup-open").click();void 0');assert.equal(await ev('document.getElementById("backup-confirm").checked'),false);assert.equal(await ev('document.getElementById("backup-replace").disabled'),true);
  await pick(source);await confirm();const original=await raw(KEY),historyBefore=await read(HK);await replace();
  const saved=await read(KEY);assert.notEqual(saved.game.sessionId,current.game.sessionId);assert.notEqual(saved.game.sessionId,source.game.sessionId);assert.equal(saved.preferences.theme,'ivory');assert.equal(saved.preferences.sound,false);assert.equal(saved.preferences.musicEnabled,false);
  for(const k of ['board','notes','draft','history','redo','branch','givens','clues','solution'])assert.deepEqual(saved.game[k],source.game[k]??(k==='redo'?[]:undefined));
  assert.equal(saved.game.elapsedMs,34567);assert.equal(saved.game.paused,true);for(const k of Object.keys(otherKeys))assert.equal(await raw(k),before[k]);
  const copies=(await read(AK)).entries;assert(copies.some(e=>e.reason==='window-restore'&&e.raw===original));
  const historyAfter=await read(HK);for(const r of historyBefore.records)assert(historyAfter.records.some(n=>n.sessionId===r.sessionId&&JSON.stringify(n.snapshot.game.board)===JSON.stringify(r.snapshot.game.board)));
  assert.equal(await ev('document.getElementById("save-recovery-dialog").open'),false);await click('backup-open');assert.equal(await ev('document.getElementById("backup-window-original").hidden'),false);await downloads();await click('backup-window-original');await b.waitFor('window.__downloads.length===1');assert.equal(await ev('window.__downloads[0].blob.text()'),original);B.validateWindow(original);await click('backup-close');report.checks.push('confirmed game-only restore with branch/notes/draft/undo, fresh session, original export, retained history/settings/results and paused reload');
  for(const bad of ['{broken',JSON.stringify({...source,version:99}),JSON.stringify({format:'nine-realms-unreadable-saves',version:1,entries:[]})]){
   await click('backup-open');await ev('NineRealmsHistory.flush()');const unchanged=await all();await pick(bad);assert.equal(await ev('document.getElementById("backup-replace").disabled'),true);assert.deepEqual(await all(),unchanged);await click('backup-close');
  }report.checks.push('invalid/future/archive files rejected before mutation');
  for(const kind of ['quota-archive','quota-history-copy','corrupt-archive','quota-game','quota-history']){
   const entries={[KEY]:JSON.stringify(current),...otherKeys};if(kind==='corrupt-archive')entries[AK]='{broken existing original copies';
   await b.loadStorage(entries,'/dist/index.html');await ev('NineRealmsHistory.flush()');await prepare();await confirm();
   const beforeGame=await raw(KEY),beforeOther=await raw(B.keys[3]);
   if(kind==='quota-archive')await ev('window.__set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='+JSON.stringify(AK)+')throw new DOMException("full","QuotaExceededError");return window.__set.call(this,k,v);};');
   if(kind==='quota-history-copy')await ev('window.__set=Storage.prototype.setItem;window.__archiveWrites=0;Storage.prototype.setItem=function(k,v){if(k==='+JSON.stringify(AK)+'&&++window.__archiveWrites>1)throw new DOMException("full","QuotaExceededError");return window.__set.call(this,k,v);};');
   if(kind==='quota-game')await ev('window.__set=Storage.prototype.setItem;window.__gameWrites=0;Storage.prototype.setItem=function(k,v){if(k==='+JSON.stringify(KEY)+'&&++window.__gameWrites>1)throw new DOMException("full","QuotaExceededError");return window.__set.call(this,k,v);};');
   if(kind==='quota-history')await ev('window.__set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='+JSON.stringify(HK)+')throw new DOMException("full","QuotaExceededError");return window.__set.call(this,k,v);};document.getElementById("backup-dialog").close();document.getElementById("resume-btn").click();document.getElementById("notes-btn").click();document.querySelectorAll("#board .cell")['+current.game.selected+'].click();document.querySelector('+JSON.stringify('#number-pad [data-value="2"]')+').click();document.getElementById("backup-open").click();');
   if(kind==='quota-history'){await pick(source);await confirm();}
   await click('backup-replace');await b.waitFor('!document.getElementById("backup-replace").disabled');assert.equal((await read(KEY)).game.puzzleId,current.game.puzzleId);assert.equal(await raw(B.keys[3]),beforeOther);
   if(kind!=='quota-history')assert.equal(await raw(KEY),beforeGame);
   if(kind.startsWith('quota'))assert.match(await ev('document.getElementById("backup-status").textContent'),/空间/);
   if(kind==='quota-history-copy'){assert.equal(await ev('document.getElementById("backup-window-original").hidden'),false);await downloads();await click('backup-window-original');await b.waitFor('window.__downloads.length===1');assert.equal(await ev('window.__downloads[0].blob.text()'),beforeGame);}
   if(kind==='corrupt-archive')assert.equal(await raw(AK),entries[AK]);
   report.checks.push(kind+' stops before replacing current board');
  }
  for(const originalHistory of ['{unreadable historical raw',JSON.stringify({version:99,records:[]})]){
   await b.loadStorage({[KEY]:JSON.stringify(current),[HK]:originalHistory,...otherKeys},'/dist/index.html');await prepare();await confirm();await replace();assert.equal(await raw(HK),originalHistory);assert.deepEqual((await read(KEY)).game.board,source.game.board);report.checks.push('game restored while exact unreadable/future history stays protected');
  }
  const memory=new Map(),store=History.createStore({Engine:E,storage:{getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)}});let fullCurrent;
  for(let n=0;n<40;n++){fullCurrent=fixture('full-history-'+n);fullCurrent.game.sessionId='capacity-session-'+n;store.capture(fullCurrent,{origin:'new'});}assert(store.flush());
  await b.loadStorage({[KEY]:JSON.stringify(fullCurrent),[HK]:memory.get(HK)},'/dist/index.html');await ev('NineRealmsHistory.flush()');await prepare();await confirm();const completeOriginal=await raw(HK);assert.equal(JSON.parse(completeOriginal).records.length,40);await replace();
  assert.equal((await read(HK)).records.length,40);assert((await read(AK)).entries.some(e=>e.key===HK&&e.reason==='window-restore'&&e.raw===completeOriginal));report.checks.push('40-record capacity keeps the exact complete original history before ordinary retention trims the new session');
  // Fallback engines must detect a stale import after preview, before any archive.
  await b.loadStorage({[KEY]:JSON.stringify(current)},'/dist/index.html','Object.defineProperty(navigator,"locks",{value:undefined});');await prepare();await confirm();const external=JSON.stringify(fixture('newer-other-window'));await ev('localStorage.setItem('+JSON.stringify(KEY)+','+JSON.stringify(external)+');');await click('backup-replace');await b.waitFor('document.getElementById("save-conflict-dialog").open');assert.equal(await raw(KEY),external);assert.equal(await raw(AK),null);report.checks.push('stale preview rejects changed source without archiving or overwriting it');
  // A genuine second window holding no writer lock cannot import into this profile.
  await b.send('Page.navigate',{url:b.url+'/src/styles.css'});await b.waitFor('document.readyState==="complete"&&location.pathname==="/src/styles.css"');
  await ev('localStorage.clear();localStorage.setItem('+JSON.stringify(KEY)+','+JSON.stringify(JSON.stringify(current))+');window.a=window.open("/dist/index.html","import-writer");void 0');await b.waitFor('window.a?.document.querySelectorAll("#board .cell").length===81');await ev('window.c=window.open("/dist/index.html","import-reader");void 0');await b.waitFor('window.c?.document.getElementById("save-conflict-dialog")?.open');await ev('window.c.document.getElementById("save-conflict-temporary").click();window.c.document.getElementById("backup-open").click();void 0');
  await ev('(()=>{const d=window.c.document,f=d.getElementById("backup-file"),dt=new window.c.DataTransfer();dt.items.add(new window.c.File(['+JSON.stringify(JSON.stringify(source))+'],"window.json",{type:"application/json"}));f.files=dt.files;f.dispatchEvent(new window.c.Event("change"));})()');await b.waitFor('window.c.document.getElementById("backup-status").textContent.includes("对局校验通过")');const writer=await raw(KEY);await ev('window.c.document.getElementById("backup-confirm").click();window.c.document.getElementById("backup-replace").click();void 0');await b.waitFor('window.c.document.getElementById("backup-status").textContent.includes("尚未启用安全保存")');assert.equal(await raw(KEY),writer);assert.equal(await raw(AK),null);await ev('window.c.close();window.a.close();void 0');await b.waitFor('window.a.closed&&window.c.closed');report.checks.push('real second-window temporary session cannot replace writer data');
  await b.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await b.load(current,'/dist/index.html');await prepare();
  assert.equal(await ev('document.documentElement.scrollWidth>innerWidth+1'),false);assert.equal(await ev('(()=>{const d=document.getElementById("backup-dialog"),r=d.getBoundingClientRect();return [...d.querySelectorAll("button:not([hidden]),label")].every(e=>{const b=e.getBoundingClientRect();return b.left>=r.left&&b.right<=r.right+1;});})()'),true);await shot('window-recovery-preview-phone');
  const ax=await b.send('Accessibility.getFullAXTree');assert(ax.nodes.some(n=>n.role?.value==='checkbox'&&n.name?.value.includes('原对局与原历史先留存副本')));
  assert.deepEqual(b.events.filter(e=>e.method==='Runtime.exceptionThrown'),[]);report.status='passed';if(out)fs.writeFileSync(path.join(out,'window-recovery-browser.json'),JSON.stringify(report,null,2));console.log('PASS window recovery Chromium:',JSON.stringify(report));
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
