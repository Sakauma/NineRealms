/* Real Chromium, isolated synthetic player data; downloads captured as actual Blobs. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {launch,fixture,delay}=require('./browser-helper.cjs'),{openPuzzle}=require('./rule-only-fixtures.cjs');
const E=require('../src/engine.js'),D=require('../src/daily.js'),H=require('../src/history.js'),R=require('../src/save-recovery.js'),B=require('../src/backup.js');
const KEY=R.key,HK=H.KEY,DK=B.keys[3],AK=R.archiveKey,out=process.env.FOLLOWUP_EVIDENCE_DIR;
function withPuzzle(p,board){const s=fixture('followup');Object.assign(s.game,{puzzleId:p.id,sourceId:p.sourceId||null,mode:p.mode,difficulty:p.difficulty,clues:p.clues,givens:p.givens,solution:p.solution,board,notes:Array(81).fill(0),selected:board.indexOf(0),logicMode:true});s.preferences.logicMode=true;return s;}
(async()=>{
 const b=await launch(),report={history:[],ruleOnly:[],daily:[],screenshots:[]};
 const ev=code=>b.evaluate(code),click=id=>ev('document.getElementById('+JSON.stringify(id)+').click();void 0');
 const raw=key=>ev('localStorage.getItem('+JSON.stringify(key)+')'),read=async key=>JSON.parse(await raw(key));
 async function downloads(){await ev('window.__downloads=[];URL.createObjectURL=blob=>{window.__downloads.push({blob});return "blob:test";};HTMLAnchorElement.prototype.click=function(){window.__downloads.at(-1).name=this.download;};');}
 async function enter(i,v){await ev('document.querySelectorAll("#board .cell")['+i+'].click();document.querySelector('+JSON.stringify('#number-pad [data-value="'+v+'"]')+').click();void 0');}
 async function shot(name){if(!out)return;fs.mkdirSync(out,{recursive:true});await delay(150);const s=await b.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});const p=path.join(out,name+'.png');fs.writeFileSync(p,Buffer.from(s.data,'base64'));report.screenshots.push(p);}
 async function backup(){await click('backup-open');await downloads();await click('backup-export');await b.waitFor('window.__downloads.length===1');const data=JSON.parse(await ev('window.__downloads[0].blob.text()'));B.validate(data);await click('backup-close');return data;}
 async function reload(){await ev('window.__beforeReload=true;location.reload();void 0');await b.waitFor('!window.__beforeReload&&document.readyState==="complete"&&document.querySelectorAll("#board .cell").length===81');}
 try{
  // Missing history remains writable. Every unreadable/future form keeps exact original bytes.
  const empty=fixture();await b.load(empty,'/dist/index.html');await ev('NineRealmsHistory.flush()');assert.equal((await read(HK)).version,1);
  for(const original of ['', '{history damaged\n原始记录',JSON.stringify({version:99,records:[{future:'保留'}]})]){
   await b.loadStorage({[KEY]:JSON.stringify(fixture()),[HK]:original},'/dist/index.html');await ev('NineRealmsHistory.flush()');assert.equal(await raw(HK),original);
   await click('history-open');assert.equal(await ev('document.getElementById("history-recovery").hidden'),false);assert.match(await ev('document.getElementById("history-recovery").textContent'),/暂停覆盖/);
   await downloads();await click('history-export-original');await b.waitFor('window.__downloads.length===1');assert.equal(await ev('window.__downloads[0].blob.text()'),original);
   await shot(original.includes('99')?'history-future-protection':'history-original-protection');
   await click('history-start-fresh');assert.equal((await read(HK)).version,1);assert.equal((await read(AK)).entries.at(-1).raw,original);assert.equal((await read(AK)).entries.at(-1).key,HK);assert.equal(await ev('document.getElementById("history-recovery").hidden'),true);
   await click('history-close');await reload();assert.equal(await ev('NineRealmsHistory.originalState().status'),'ready');report.history.push('exact original export, archive then resume and reload: '+(original.includes('99')?'future':original?'broken':'empty'));
  }
  // Quota, a broken existing archive and a changed source all fail before replacing history.
  for(const kind of ['quota','broken-archive','concurrent']){
   const original='{protected '+kind,entries={[KEY]:JSON.stringify(fixture()),[HK]:original};if(kind==='broken-archive')entries[AK]='{also broken';
   await b.loadStorage(entries,'/dist/index.html');await click('history-open');
   if(kind==='quota')await ev('window.__set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='+JSON.stringify(AK)+')throw new DOMException("full","QuotaExceededError");return window.__set.call(this,k,v);};');
   if(kind==='concurrent')await ev('localStorage.setItem('+JSON.stringify(HK)+',"other window history");');
   await click('history-start-fresh');assert.equal(await raw(HK),kind==='concurrent'?'other window history':original);assert.equal(await ev('document.getElementById("history-recovery").hidden'),false);assert.match(await ev('document.getElementById("history-recovery-status").textContent'),/原文仍受保护/);report.history.push(kind+' preserved');
  }
  // Browser file-save cancellation never claims success.
  await b.loadStorage({[KEY]:JSON.stringify(fixture()),[HK]:'{cancelled export'},'/dist/index.html');await click('history-open');await ev('window.__TAURI_INTERNALS__={};window.__TAURI__={core:{invoke:async()=>false}};');await click('history-export-original');await b.waitFor('document.getElementById("history-recovery-status").textContent.includes("取消")');assert.equal(await raw(HK),'{cancelled export');report.history.push('cancelled export truthful');
  // Two real windows: the non-writer cannot archive/reset another window's history.
  await b.send('Page.navigate',{url:b.url+'/src/styles.css'});await b.waitFor('location.pathname==="/src/styles.css"&&document.readyState==="complete"');
  const original='{two window history';await ev('localStorage.clear();localStorage.setItem('+JSON.stringify(KEY)+','+JSON.stringify(JSON.stringify(fixture()))+');localStorage.setItem('+JSON.stringify(HK)+','+JSON.stringify(original)+');window.a=window.open("/dist/index.html","history-writer");void 0');
  await b.waitFor('window.a?.document.querySelectorAll("#board .cell").length===81');await ev('window.c=window.open("/dist/index.html","history-reader");void 0');await b.waitFor('window.c?.document.getElementById("save-conflict-dialog")?.open');
  await ev('window.c.document.getElementById("save-conflict-temporary").click();window.c.document.getElementById("history-open").click();window.c.document.getElementById("history-start-fresh").click();void 0');assert.equal(await raw(HK),original);assert.equal(await raw(AK),null);
  await ev('window.c.close();window.a.close();void 0');await b.waitFor('window.a.closed&&window.c.closed');report.history.push('real second-window temporary session cannot replace');
  for(const mode of ['killer','thermo','arrow','thermo-killer']){
   const p=openPuzzle(mode),near=p.other.slice();near[0]=0;const s=withPuzzle(p,near);
   await b.load(s,'/dist/index.html');assert.equal(await ev('document.getElementById("save-recovery-dialog").open'),false);await click('resume-btn');await enter(0,p.other[0]);await b.waitFor('document.getElementById("completion-dialog").open');assert.equal((await read(KEY)).game.completed,true);assert.deepEqual((await read(KEY)).game.board,p.other);assert.equal(await ev('document.getElementById("logic-toggle").disabled'),true);
   await shot('rule-only-'+mode);await click('close-completion');const full=await backup();assert.deepEqual(full.entries[KEY].game.board,p.other);assert(full.entries[HK].records.some(r=>r.snapshot.game.completed));await reload();assert.equal((await read(KEY)).game.completed,true);assert.equal(await ev('document.body.dataset.gameState'),'completed');
   // A filled classic Sudoku that violates the extra rule cannot complete.
   const bad=p.solution.map(n=>mode==='arrow'?(n===3?4:n===4?3:n):(n===1?3:n===3?1:n)),i=mode==='arrow'?2:0,last=bad[i];bad[i]=0;
   await b.load(withPuzzle(p,bad),'/dist/index.html');await click('resume-btn');await enter(i,last);assert.equal((await read(KEY)).game.completed,false);assert.equal(await ev('document.getElementById("completion-dialog").open'),false);report.ruleOnly.push(mode+' alternate solution complete/export/reload and invalid rule rejected');
  }
  const unsupported=E.getPuzzle('easy','followup-unsupported','whispers'),us=withPuzzle(unsupported,unsupported.solution.slice());us.game.mode='whispers';await b.load(us,'/dist/index.html');assert.equal(await ev('document.body.dataset.gameState'),'paused');assert.equal((await read(KEY)).game.completed,false);await click('resume-btn');await click('logic-toggle');await click('logic-toggle');assert.match(await ev('document.getElementById("status-message").textContent'),/附加规则暂未检查/);report.ruleOnly.push('unsupported remains explicit and incomplete');
  const today=D.dateKey(),day=Date.parse(today+'T00:00:00Z'),date=i=>new Date(day+i*86400000).toISOString().slice(0,10),score={elapsedMs:1000,mistakes:0,hints:0};
  for(const legacy of [false,true]){
   let records={};for(let i=-400;i<0;i++)records=legacy?{...records,[date(i)]:score}:D.recordCompletion(records,date(i),score);
   const p=D.getPuzzle(today),i=p.givens.indexOf(0),near=p.solution.slice();near[i]=0;const s=withPuzzle(p,near);s.game.dailyDate=today;s.game.logicMode=false;s.preferences.logicMode=false;
   await b.loadStorage({[KEY]:JSON.stringify(s),[DK]:JSON.stringify(records)},'/dist/index.html');await click('resume-btn');await enter(i,p.solution[i]);await b.waitFor('document.getElementById("completion-dialog").open');const stored=await read(DK);assert.equal(D.detailDates(stored).length,400);assert.equal(D.getStats(stored,today).total,401);assert.equal(D.getStats(stored,today).streak,401);await click('close-completion');await click('daily-btn');assert.equal(await ev('document.getElementById("daily-total").textContent'),legacy?'≥401':'401');assert.equal(await ev('document.getElementById("daily-streak").textContent'),legacy?'≥401':'401');await shot(legacy?'daily-legacy-lower-bound':'daily-401-verified');await click('daily-close');const full=await backup();assert.equal(D.getStats(full.entries[DK],today).total,401);await reload();assert.equal(D.getStats(await read(DK),today).total,401);report.daily.push(legacy?'legacy 400→≥401 with honest lower bound':'new 400→401 exact totals/streak/details400/backup/reload');
  }
  // A bounded-summary refusal must still finish/save the board and retain the exact old statistics.
  const rangeDate=i=>new Date(Date.UTC(1970,0,1)+i*86400000).toISOString().slice(0,10),limit={__summary:{version:1,ranges:Array.from({length:10000},(_,i)=>[rangeDate(i*2),rangeDate(i*2)])}},limitText=JSON.stringify(limit),dp=D.getPuzzle(today),di=dp.givens.indexOf(0),dn=dp.solution.slice();dn[di]=0;const limited=withPuzzle(dp,dn);limited.game.dailyDate=today;limited.game.logicMode=false;
  await b.loadStorage({[KEY]:JSON.stringify(limited),[DK]:limitText},'/dist/index.html');await click('resume-btn');await enter(di,dp.solution[di]);await b.waitFor('document.getElementById("completion-dialog").open');assert.equal((await read(KEY)).game.completed,true);assert.equal(await raw(DK),limitText);assert.match(await ev('document.getElementById("completion-daily").textContent'),/统计尚未更新/);report.daily.push('summary capacity refusal keeps raw stats and still completes/saves current board');
  for(const original of ['{bad daily',JSON.stringify({__summary:{version:99,ranges:[]}})]){
   await b.loadStorage({[KEY]:JSON.stringify(fixture()),[DK]:original},'/dist/index.html');await click('daily-btn');assert.equal(await ev('document.getElementById("daily-start").disabled'),true);assert.equal(await ev('document.getElementById("daily-total").textContent'),'—');await downloads();await click('daily-export-original');await b.waitFor('window.__downloads.length===1');assert.equal(await ev('window.__downloads[0].blob.text()'),original);assert.equal(await raw(DK),original);report.daily.push('unreadable/future summary protected and raw export');
  }
  // A deliberate valid-backup restore archives BOTH unreadable sources before replacement.
  const records=D.recordCompletion({},today,score),valid=B.create({getItem:k=>k===KEY?JSON.stringify(fixture('restore-target')):k===DK?JSON.stringify(records):null});
  async function chooseBackup(){
   await click('backup-open');await ev('(()=>{const f=document.getElementById("backup-file"),dt=new DataTransfer();dt.items.add(new File(['+JSON.stringify(JSON.stringify(valid))+'],"restore.json",{type:"application/json"}));f.files=dt.files;f.dispatchEvent(new Event("change",{bubbles:true}));})()');
   await b.waitFor('document.getElementById("backup-status").textContent.includes("校验通过")');await ev('const check=document.getElementById("backup-confirm");check.checked=true;check.dispatchEvent(new Event("change"));');
  }
  const originalHistory='{restore history',originalDaily=JSON.stringify({__summary:{version:99,ranges:[]}});
  await b.loadStorage({[KEY]:JSON.stringify(fixture()),[HK]:originalHistory,[DK]:originalDaily},'/dist/index.html');await chooseBackup();await ev('window.__beforeRestore=true');await click('backup-replace');await b.waitFor('!window.__beforeRestore&&document.readyState==="complete"&&document.querySelectorAll("#board .cell").length===81');
  const copies=(await read(AK)).entries;assert(copies.some(e=>e.key===HK&&e.raw===originalHistory));assert(copies.some(e=>e.key===DK&&e.raw===originalDaily));assert.equal(D.getStats(await read(DK),today).total,1);assert(['ready','missing'].includes(await ev('NineRealmsHistory.originalState().status')));assert.equal(await ev('NineRealmsHistory.exportData().version'),1);report.history.push('valid full backup restores both sources only after archiving exact originals');
  await b.loadStorage({[KEY]:JSON.stringify(fixture()),[HK]:originalHistory,[DK]:originalDaily},'/dist/index.html');await chooseBackup();await ev('window.__set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='+JSON.stringify(AK)+')throw new DOMException("full","QuotaExceededError");return window.__set.call(this,k,v);};');await click('backup-replace');await b.waitFor('document.getElementById("backup-status").textContent.includes("full")');assert.equal(await raw(HK),originalHistory);assert.equal(await raw(DK),originalDaily);assert.equal(await ev('document.body.dataset.storageTransition||""'),'');report.history.push('archive quota stops full-backup replacement');
  // Error-only controls remain contained on phone and desktop, in light and dark themes.
  for(const [width,height,theme] of [[390,844,'ivory'],[1360,900,'nebula']]){
   const snap=fixture();snap.preferences.theme=theme;await b.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});await b.loadStorage({[KEY]:JSON.stringify(snap),[HK]:originalHistory},'/dist/index.html');await click('history-open');
   assert.equal(await ev('document.documentElement.scrollWidth>innerWidth+1'),false);assert.equal(await ev('(()=>{const d=document.getElementById("history-dialog"),r=d.getBoundingClientRect();return [...document.querySelectorAll("#history-recovery button")].every(e=>{const b=e.getBoundingClientRect();return b.width>0&&b.left>=r.left&&b.right<=r.right;});})()'),true);await shot('history-recovery-'+width+'-'+theme);
   const ax=await b.send('Accessibility.getFullAXTree');assert(ax.nodes.some(n=>n.role?.value==='button'&&n.name?.value==='导出历史原文'));
  }
  const errors=b.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.exception?.description);assert.deepEqual(errors,[]);report.status='passed';if(out)fs.writeFileSync(path.join(out,'followup-browser.json'),JSON.stringify(report,null,2));console.log('PASS three followups Chromium:',JSON.stringify(report));
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
