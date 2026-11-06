/* Real isolated Chromium windows; all downloads are intercepted in memory. */
'use strict';
const assert=require('node:assert/strict');
const {launch,fixture,delay}=require('./browser-helper.cjs');
const E=require('../src/engine.js'),B=require('../src/backup.js'),R=require('../src/save-recovery.js'),Branches=require('../src/branches.js');
const KEY=R.key,ARCHIVE=R.archiveKey;
function snapshot(seed,preferences={}){const s=fixture(seed);s.game.started=false;s.preferences={...s.preferences,...preferences};return s;}
(async()=>{
 const b=await launch(),report={crossWindow:0,recovery:0,quota:0,correction:0,thermometer:false};
 const click=id=>b.evaluate('document.getElementById('+JSON.stringify(id)+').click();void 0');
 const raw=()=>b.evaluate('localStorage.getItem('+JSON.stringify(KEY)+')');
 const read=async()=>JSON.parse(await raw());
 const all=()=>b.evaluate('Object.fromEntries(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)]))');
 function enter(name,index,value){return b.evaluate('(()=>{const d='+name+'.document;d.querySelectorAll("#board .cell")['+index+'].click();d.querySelector('+JSON.stringify('#number-pad [data-value="'+value+'"]')+').click();})()');}
 async function windowReady(name){await b.waitFor('!!window.'+name+'&&!window.'+name+'.closed&&window.'+name+'.document.readyState==="complete"&&window.'+name+'.document.querySelectorAll("#board .cell").length===81');}
 async function focus(name){await b.evaluate('window.'+name+'.focus();void 0');await b.waitFor('!window.'+name+'.document.hidden');}
 function winClick(name,id){return b.evaluate('window.'+name+'.document.getElementById('+JSON.stringify(id)+').click();void 0');}
 function downloads(name='window'){return b.evaluate('(()=>{const w='+name+';w.__downloads=[];w.URL.createObjectURL=blob=>{w.__downloads.push({blob});return "blob:test";};w.HTMLAnchorElement.prototype.click=function(){w.__downloads[w.__downloads.length-1].name=this.download;};})()');}
 try{
  // A non-app control page lets us close the writer without losing CDP access.
  await b.evaluate('window.__beforeControl=true');await b.send('Page.navigate',{url:b.url+'/src/styles.css'});
  await b.waitFor('!window.__beforeControl&&location.pathname==="/src/styles.css"&&document.readyState==="complete"');
  const s=snapshot('writer-windows'),empty=s.game.givens.map((v,i)=>v?-1:i).filter(i=>i>=0),i=empty[0],j=empty[1];
  await b.evaluate('localStorage.clear();localStorage.setItem('+JSON.stringify(KEY)+','+JSON.stringify(JSON.stringify(s))+');window.a=window.open("/dist/index.html","writer-a");void 0');await windowReady('a');await focus('a');await winClick('a','start-btn');await enter('window.a',i,s.game.solution[i]);
  await b.evaluate('window.c=window.open("/dist/index.html","writer-c");void 0');await windowReady('c');
  assert.equal(await b.evaluate('window.c.document.getElementById("save-conflict-dialog").open'),true);
  await b.evaluate('window.a.NineRealmsHistory.flush();void 0');const retained=await raw();
  await winClick('c','save-conflict-reload');await b.waitFor('window.c.document.getElementById("save-conflict-status").textContent.includes("另一窗口仍在保存")');assert.equal(await raw(),retained);
  await downloads('window.c');await winClick('c','save-conflict-export');await b.waitFor('window.c.__downloads.length===1');
  const exported=JSON.parse(await b.evaluate('window.c.__downloads[0].blob.text()'));B.validate(exported);assert.equal(exported.entries[KEY].game.board[i],s.game.solution[i]);assert.equal(await raw(),retained);
  await winClick('c','save-conflict-temporary');await focus('c');await winClick('c','resume-btn');await enter('window.c',j,s.game.solution[j]);
  assert.equal(await b.evaluate('window.c.document.querySelectorAll("#board .cell")['+j+'].querySelector(".value").textContent'),String(s.game.solution[j]));assert.equal(await raw(),retained);
  await b.evaluate('window.c.dispatchEvent(new Event("beforeunload"));window.c.close();void 0');assert.equal(await raw(),retained);report.crossWindow++;
  // Read again only after the owning window has closed; no stale pagehide save.
  await b.evaluate('window.c=window.open("/dist/index.html","writer-c2");void 0');await windowReady('c');
  await b.evaluate('window.a.close();void 0');await b.waitFor('window.a.closed');await b.waitFor('(async()=>{const s=await navigator.locks.query();return !s.held.length;})()');
  await b.evaluate('window.c.__beforeReload=true');await winClick('c','save-conflict-reload');await b.waitFor('!window.c.__beforeReload&&window.c.document.readyState==="complete"&&window.c.document.querySelectorAll("#board .cell").length===81');
  assert.equal(await b.evaluate('window.c.document.getElementById("save-conflict-dialog").open'),false);
  await focus('c');await winClick('c','resume-btn');await enter('window.c',j,s.game.solution[j]);assert.equal((await read()).game.board[i],s.game.solution[i]);assert.equal((await read()).game.board[j],s.game.solution[j]);
  await b.evaluate('window.c.close();void 0');await b.waitFor('window.c.closed');report.crossWindow++;
  // The compatibility path catches changes even before a storage event arrives.
  const legacy=snapshot('legacy-change');await b.loadStorage({[KEY]:JSON.stringify(legacy)},'/dist/index.html','Object.defineProperty(navigator,"locks",{value:undefined});');
  await click('start-btn');const own=await read(),external=structuredClone(own),cell=external.game.givens.indexOf(0);external.game.board[cell]=external.game.solution[cell];
  await b.evaluate('localStorage.setItem('+JSON.stringify(KEY)+','+JSON.stringify(JSON.stringify(external))+');document.querySelectorAll("#board .cell")['+cell+'].click();void 0');
  await b.waitFor('document.getElementById("save-conflict-dialog").open');assert.equal(await raw(),JSON.stringify(external));
  await downloads();await click('save-conflict-export');await b.waitFor('window.__downloads.length===1');B.validate(JSON.parse(await b.evaluate('window.__downloads[0].blob.text()')));assert.equal(await raw(),JSON.stringify(external));report.crossWindow++;
  await b.evaluate('window.__beforeFresh=true');await click('save-conflict-reload');await b.waitFor('!window.__beforeFresh&&document.readyState==="complete"&&document.querySelectorAll("#board .cell").length===81');assert.equal((await read()).game.board[cell],external.game.solution[cell]);report.crossWindow++;
  // Both broken files stay byte-for-byte intact and can be exported separately.
  const broken='{current broken\n原文',archive='{archive broken\n副本';
  await b.loadStorage({[KEY]:broken,[ARCHIVE]:archive,unrelated:'keep'},'/dist/index.html');const original=await all();assert.deepEqual(original,{[ARCHIVE]:archive,[KEY]:broken,unrelated:'keep'});
  await click('save-recovery-new');assert.match(await b.evaluate('document.getElementById("save-recovery-status").textContent'),/均未改变/);
  await downloads();await click('save-recovery-export');await b.waitFor('window.__downloads.length===1');assert.equal(await b.evaluate('window.__downloads[0].blob.text()'),broken);
  await click('save-recovery-export-archive');await b.waitFor('window.__downloads.length===2');assert.equal(await b.evaluate('window.__downloads[1].blob.text()'),archive);
  await click('save-recovery-temporary');await click('start-btn');const first=await b.evaluate('[...document.querySelectorAll("#board .cell")].findIndex(e=>e.getAttribute("aria-readonly")==="false")');await enter('window',first,1);
  await b.evaluate('window.dispatchEvent(new Event("pagehide"));window.dispatchEvent(new Event("beforeunload"));');assert.deepEqual(await all(),original);assert.match(await b.evaluate('document.getElementById("save-status").textContent'),/不自动保存/);report.recovery++;
  // Inaccessible current data also uses a wholly non-persistent session.
  await b.loadStorage({[KEY]:'unreadable existing value',unrelated:'keep'},'/dist/index.html','window.__getItem=Storage.prototype.getItem;Storage.prototype.getItem=function(k){if(k==='+JSON.stringify(KEY)+')throw new DOMException("denied","SecurityError");return window.__getItem.call(this,k);};');
  await click('save-recovery-new');await click('start-btn');assert.equal(await b.evaluate('window.__getItem.call(localStorage,'+JSON.stringify(KEY)+')'),'unreadable existing value');assert.equal(await b.evaluate('Object.keys(localStorage).length'),2);report.recovery++;
  // If every storage read is denied, a temporary game's own bytes still export.
  await b.loadStorage({[KEY]:'original unreadable data',unrelated:'keep'},'/dist/index.html','window.__getItem=Storage.prototype.getItem;Storage.prototype.getItem=function(){throw new DOMException("denied","SecurityError");};');
  await click('save-recovery-new');await click('start-btn');await downloads();await click('save-recovery-open');
  assert.match(await b.evaluate('document.getElementById("save-recovery-description").textContent'),/不是完整备份/);await click('save-recovery-export');await b.waitFor('window.__downloads.length===1');
  const rawGame=JSON.parse(await b.evaluate('window.__downloads[0].blob.text()'));assert.equal(rawGame.version,8);assert.equal(rawGame.game.started,true);assert.equal(await b.evaluate('window.__getItem.call(localStorage,'+JSON.stringify(KEY)+')'),'original unreadable data');report.recovery++;
  // Failed writes retain a persistent status; export contains the live board.
  const q=snapshot('quota-feedback');await b.load(q,'/dist/index.html');const old=await raw(),qi=q.game.givens.indexOf(0);
  await b.evaluate('window.__setItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException("full","QuotaExceededError");};');await click('start-btn');await enter('window',qi,q.game.solution[qi]);await click('pause-btn');
  assert.equal(await raw(),old);assert.match(await b.evaluate('document.getElementById("save-status").textContent'),/尚未保存/);assert.match(await b.evaluate('document.getElementById("pause-description").textContent'),/尚未保存/);
  await delay(3400);assert.match(await b.evaluate('document.getElementById("save-status").textContent'),/尚未保存/);
  await downloads();await click('backup-open');await click('backup-export');await b.waitFor('window.__downloads.length===1');const latest=JSON.parse(await b.evaluate('window.__downloads[0].blob.text()'));B.validate(latest);assert.equal(latest.entries[KEY].game.board[qi],q.game.solution[qi]);assert.equal(await raw(),old);
  await click('backup-close');await b.evaluate('Storage.prototype.setItem=window.__setItem;');await click('resume-btn');await click('pause-btn');assert.equal((await read()).game.board[qi],q.game.solution[qi]);assert.match(await b.evaluate('document.getElementById("save-status").textContent'),/自动保存/);assert.match(await b.evaluate('document.getElementById("pause-description").textContent'),/已经保存/);report.quota++;
  // A view opened for the live raw save keeps that export intent after recovery.
  await b.evaluate('Storage.prototype.setItem=function(){throw new DOMException("full","QuotaExceededError");};');await click('resume-btn');await click('pause-btn');
  await downloads();await click('save-recovery-open');assert.match(await b.evaluate('document.getElementById("save-recovery-export").textContent'),/当前对局/);
  await b.evaluate('Storage.prototype.setItem=window.__setItem;window.dispatchEvent(new Event("beforeunload"));');await click('save-recovery-export');await b.waitFor('window.__downloads.length===1');
  assert.equal(JSON.parse(await b.evaluate('window.__downloads[0].blob.text()')).version,8);await click('save-recovery-close');report.quota++;
  // Zen hides the footer, so an actual save failure keeps its existing toast.
  const zen=snapshot('zen-save-failure',{zen:true});await b.load(zen,'/dist/index.html');
  await b.evaluate('window.__setItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException("full","QuotaExceededError");};');await click('start-btn');
  await delay(3400);assert.equal(await b.evaluate('document.getElementById("toast").hidden'),false);assert.match(await b.evaluate('document.getElementById("toast").textContent'),/尚未保存/);
  await b.evaluate('Storage.prototype.setItem=window.__setItem;');await click('zen-pause');assert.equal(await b.evaluate('document.getElementById("toast").hidden'),true);assert.match(await b.evaluate('document.getElementById("pause-description").textContent'),/棋局已为你保留/);report.quota++;
  // Off means no entry-specific correctness feedback; accumulated history stays.
  const off=snapshot('correction-off',{errorCheck:false});off.game.mistakes=4;off.game.started=true;await b.load(off,'/dist/index.html');await click('resume-btn');
  const choice=off.game.givens.map((v,i)=>({i,v,c:E.candidates(off.game.givens,i,'classic')})).find(x=>!x.v&&x.c.some(v=>v!==off.game.solution[x.i])),wrong=choice.c.find(v=>v!==off.game.solution[choice.i]);
  async function feedback(){return b.evaluate('({status:document.getElementById("status-message").textContent,mistakes:document.getElementById("mistakes").textContent,progress:document.getElementById("progress-count").textContent,width:document.getElementById("progress-fill").style.width,conflicts:document.querySelectorAll("#board .conflict").length})');}
  await enter('window',choice.i,wrong);const incorrect=await feedback();assert.equal((await read()).game.mistakes,4);assert.equal(incorrect.mistakes,'—');assert.equal(incorrect.conflicts,0);assert.match(incorrect.progress,/^1 \/ /);
  await click('erase-btn');await enter('window',choice.i,off.game.solution[choice.i]);assert.deepEqual(await feedback(),incorrect);assert.equal((await read()).game.mistakes,4);report.correction++;
  await click('error-toggle');await click('erase-btn');await enter('window',choice.i,wrong);assert.equal((await read()).game.mistakes,5);await click('error-toggle');assert.equal((await read()).game.mistakes,5);assert.equal((await feedback()).mistakes,'—');
  await click('check-btn');assert((await feedback()).conflicts>0);assert.equal((await read()).game.mistakes,5);report.correction++;
  const trial=snapshot('branch-correction-off',{errorCheck:false});trial.game.started=true;trial.game.mistakes=4;
  const at=trial.game.givens.map((v,i)=>({i,v,c:E.candidates(trial.game.givens,i,'classic')})).find(x=>!x.v&&x.c.some(v=>v!==trial.game.solution[x.i]));
  trial.game.draft=require('../src/drafts.js').empty(81);Branches.begin(trial.game,false);trial.game.board[at.i]=at.c.find(v=>v!==trial.game.solution[at.i]);Branches.sync(trial.game,false);
  await b.load(trial,'/dist/index.html');await click('resume-btn');await click('branch-commit');
  assert.equal((await read()).game.mistakes,4);assert.doesNotMatch(await b.evaluate('document.getElementById("status-message").textContent'),/答案核对|新增/);report.correction++;
  // The actual accessibility tree includes the bulb and ordered thermometer path.
  const p=E.getPuzzle('easy','accessible-thermo','thermo'),t=snapshot('accessible-thermo');t.game={...t.game,...p,puzzleId:p.id,board:p.givens.slice(),notes:Array(81).fill(0),selected:p.givens.indexOf(0)};delete t.game.id;delete t.game.rating;await b.load(t,'/dist/index.html');await click('start-btn');
  const line=p.clues.lines.find(l=>l.type==='thermo'),label=await b.evaluate('document.querySelectorAll("#board .cell")['+line.cells[0]+'].getAttribute("aria-label")');assert.match(label,/球端在第/);assert(label.includes(line.cells.map(i=>(Math.floor(i/9)+1)+' 行 '+(i%9+1)+' 列').join('、')));
  const tree=await b.send('Accessibility.getFullAXTree');assert(tree.nodes.some(n=>n.role?.value==='gridcell'&&n.name?.value===label));report.thermometer=true;
  // A missing protection module must leave stored data intact and show a clear error.
  const missing=snapshot('missing-protection-module'),missingRaw=JSON.stringify(missing);
  await b.send('Network.enable');await b.send('Network.setCacheDisabled',{cacheDisabled:true});await b.send('Network.setBlockedURLs',{urls:['*save-recovery.js*']});
  const injection=await b.send('Page.addScriptToEvaluateOnNewDocument',{source:'localStorage.setItem('+JSON.stringify(KEY)+','+JSON.stringify(missingRaw)+');'});
  await b.evaluate('window.__beforeMissing=true');await b.send('Page.navigate',{url:b.url+'/src/index.html'});
  await b.waitFor('!window.__beforeMissing&&document.readyState==="complete"&&document.getElementById("status-message").textContent.includes("资源未完整加载")');
  assert.equal(await raw(),missingRaw);assert.equal(await b.evaluate('document.getElementById("status-message").parentElement.classList.contains("status-quiet")'),false);
  await b.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:injection.identifier});report.missingModule=true;
  assert.deepEqual(b.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.exception?.description),[]);
  console.log('PASS save safety Chromium:',JSON.stringify(report));
 }finally{await b.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
