/* Removed advanced tools are explicitly re-enabled only for dormant regression fixtures. */
'use strict';
const {enableDormantTools}=require('./dormant-tools-fixture.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {launch,fixture,delay}=require('./browser-helper.cjs');
const E=require('../src/engine.js'),C=require('../src/custom-puzzle.js');
const uniqueText='530070000600195000098000060800060003400803001700020006060000280000419005000080079';
(async()=>{
 const browser=await launch(),{evaluate:run,send,waitFor}=browser;
 const saved=()=>run('JSON.parse(localStorage.getItem("nine-realms.sudoku.v1")).game');
 async function clickTool(selector){
  if(await run(`!!document.querySelector(${JSON.stringify(selector)})?.closest('#more-tools-panel[hidden]')`)) { await enableDormantTools(run); await clickTool('#more-tools-toggle'); }
  const p=await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest',inline:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,h=document.elementFromPoint(x,y);return {x,y,ok:r.width>0&&r.height>0&&!!h&&(h===e||e.contains(h))&&!e.disabled};})()`);
  assert(p.ok,'reachable tool '+selector);
  for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,x:p.x,y:p.y,button:'left',clickCount:1});
  await delay(40);
 }
 const click=async id=>{if(id==='more-tools-toggle'||await run(`!!document.getElementById(${JSON.stringify(id)})?.closest('#more-tools-panel')`))return clickTool('#'+id);return run(`document.getElementById(${JSON.stringify(id)}).click()`);};
 const cell=i=>run(`document.querySelector('#board [data-index="${i}"]').click()`);
 const digit=n=>run(`document.querySelector('#number-pad [data-value="${n}"]').click()`);
 const switchBranch=id=>run(`(()=>{const s=document.getElementById('branch-switch'),index=[...s.options].findIndex(o=>o.value===${JSON.stringify(id||'')}),trigger=document.querySelector('.glass-select[data-select-id="branch-switch"] .glass-select-trigger');trigger.click();document.getElementById(trigger.getAttribute('aria-controls')).querySelector('[data-index="'+index+'"]').click();})()`);
 const key=async(k,code,modifiers=0)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key:k,code,modifiers});await send('Input.dispatchKeyEvent',{type:'keyUp',key:k,code,modifiers:0});};
 const reload=async()=>{await run('window.__beforeTestReload=true');await send('Page.reload');await waitFor('!window.__beforeTestReload && document.readyState==="complete" && document.querySelectorAll("#board .cell").length>0');};
 const begin=async(s)=>{await browser.load(s);await click('resume-btn');await run('document.getElementById("explore-settings").open=true');};
 const screenshot=async(name)=>{const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});const dir=path.join(browser.root,'evidence');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,name+'.png'),Buffer.from(shot.data,'base64'));};
 try{
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  let initial=fixture('real-branches');initial.game.logicMode=true;await begin(initial);
  const blanks=initial.game.givens.map((v,i)=>v?-1:i).filter(i=>i>=0),[i,j,k]=blanks;
  await click('branch-btn');await cell(i);await digit(initial.game.solution[i]);await click('branch-new');await cell(j);await digit(initial.game.solution[j]);
  let g=await saved();assert.equal(g.branch.activeId,'b2');assert.equal(g.branch.board[i],0);assert.equal(g.branch.board[j],0);
  await switchBranch(null);g=await saved();assert.equal(g.board[i],0);assert.equal(g.board[j],0);assert.equal(g.branch.activeId,null);
  await click('branch-new');await cell(k);await digit(initial.game.solution[k]);await switchBranch('b2');
  const backup=await run('(async()=>{NineRealmsHistory.flush();return await NineRealmsBackup.createAsync(localStorage)})()');assert.equal(Object.keys(backup.entries).length,8);assert.equal(backup.entries['nine-realms.sudoku.v1'].game.branch.nodes.length,3);
  await reload();g=await saved();assert.equal(g.branch.activeId,'b2');assert.equal(g.board[j],initial.game.solution[j]);await click('resume-btn');await run('window.scrollTo(0,0)');await screenshot('branches-desktop');
  await click('branch-commit');assert.equal((await saved()).branch.activeId,'b1');await click('branch-commit');g=await saved();assert.equal(g.branch.activeId,null);assert.equal(g.board[i],initial.game.solution[i]);assert.equal(g.board[j],initial.game.solution[j]);
  await click('undo-btn');g=await saved();assert.equal(g.board[i],0);assert.equal(g.board[j],0);await click('redo-btn');g=await saved();assert.equal(g.board[i],initial.game.solution[i]);assert.equal(g.board[j],initial.game.solution[j]);
  await switchBranch('b3');await click('branch-commit');assert.match(await run('document.getElementById("toast").textContent'),/上层棋盘已变动/);assert.equal((await saved()).branch.activeId,'b3');
  await click('branch-rollback');g=await saved();assert.equal(g.branch,null);assert.equal(g.board[k],0);assert.equal(g.board[i],initial.game.solution[i]);
  console.log('PASS Chromium branches: main/sibling/nested isolation, per-workspace persistence and actual eight-key backup, reload, child/parent adoption, one-edit undo/redo, stale-parent refusal and discard.');

  initial=fixture('real-batch');initial.game.logicMode=true;await begin(initial);
  const empty=initial.game.givens.map((v,n)=>v?-1:n).filter(n=>n>=0),[a,b,c]=empty;
  await click('batch-toggle');await cell(a);await cell(b);
  await run(`document.querySelector('#board [data-index="${b}"]').focus()`);await key('3','Digit3');g=await saved();assert.equal(g.notes[a],4);assert.equal(g.notes[b],4);assert.equal(g.history.length,1);
  await key('z','KeyZ',2);g=await saved();assert.equal(g.notes[a],0);assert.equal(g.notes[b],0);assert.equal(g.redo.length,1);
  await key('Z','KeyZ',10);g=await saved();assert.equal(g.notes[a],4);assert.equal(g.notes[b],4);
  await key('z','KeyZ',2);await key('y','KeyY',2);assert.equal((await saved()).notes[a],4);
  // Use real Ctrl pointer events to add two cells to the selection again.
  for(const n of [a,b]){const box=await run(`(()=>{const cell=document.querySelector('#board [data-index="${n}"]');cell.scrollIntoView({block:'nearest'});const r=cell.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',...box,button:'left',clickCount:1,modifiers:2});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...box,button:'left',clickCount:1,modifiers:2});}
  await click('batch-add');g=await saved();assert.equal(g.notes[a],5);assert.equal(g.notes[b],5);assert.equal(g.history.length,2);
  await click('undo-btn');assert.equal((await saved()).notes[a],4);await click('redo-btn');assert.equal((await saved()).notes[b],5);
  await click('draft-toggle');await cell(a);await run(`document.querySelector('#draft-colors [data-color="2"]').click();document.querySelector('#draft-colors [data-color="2"]').focus()`);
  await key('z','KeyZ',2);assert.equal((await saved()).draft.colors[a],0);await key('Z','KeyZ',10);assert.equal((await saved()).draft.colors[a],2);
  await run('NineRealmsHistory.markCurrent("exact browser practice")');
  const source=await saved();await click('draft-close');await click('notes-btn');await cell(c);await digit(initial.game.solution[c]);
  const later=await saved();assert.equal(later.board[c],initial.game.solution[c]);
  const openPractice=async()=>{await run('NineRealmsHistory.openCheckpoints()');await run(`(()=>{const row=[...document.querySelectorAll('.checkpoint-row')].find(x=>x.textContent.includes('exact browser practice'));[...row.querySelectorAll('button')].find(x=>x.textContent==='独立复练').click()})()`);await waitFor('document.getElementById("confirm-dialog").open');};
  await openPractice();await click('confirm-cancel');await delay(20);assert.equal((await saved()).sessionId,source.sessionId);
  await openPractice();await click('confirm-accept');await waitFor(`JSON.parse(localStorage.getItem('nine-realms.sudoku.v1')).game.sessionId!==${JSON.stringify(source.sessionId)}`);
  g=await saved();assert.equal(g.practice.sourceSessionId,source.sessionId);assert.equal(g.board[c],0);assert.equal(g.notes[a],5);assert.equal(g.notes[b],5);assert.equal(g.draft.colors[a],2);assert.equal(g.elapsedMs,0);assert.equal(g.started,false);assert.equal(g.history.length,0);
  const original=await run(`NineRealmsHistory.getSnapshot(${JSON.stringify(source.sessionId)}).game`);assert.equal(original.board[c],initial.game.solution[c]);assert.deepEqual(original.notes,later.notes);assert.equal(original.draft.colors[a],2);
  await reload();g=await saved();assert.equal(g.practice.sourceSessionId,source.sessionId);assert.equal(g.notes[a],5);
  console.log('PASS Chromium edits/practice: real Ctrl/Cmd-style pointer selection and Ctrl+Z/Shift+Z/Y, atomic multi-cell notes, draft-panel redo, exact marked-frame clone, cancel/accept, original protection and reload.');

  initial=fixture('real-custom');await begin(initial);await click('custom-open');assert(await run('document.getElementById("custom-dialog").open'));
  await run('window.__customWorkers=0;const NativeWorker=window.Worker;window.Worker=class extends NativeWorker{constructor(...args){super(...args);window.__customWorkers++;}}');
  const inputText=async(text)=>run(`document.getElementById('custom-text').value=${JSON.stringify(text)};document.getElementById('custom-text').dispatchEvent(new Event('input',{bubbles:true}))`);
  const validate=async(text,pattern)=>{await inputText(text);await click('custom-validate');await waitFor(`!document.getElementById('custom-validate').getAttribute('aria-busy') || document.getElementById('custom-validate').getAttribute('aria-busy')==='false'`);assert.match(await run('document.getElementById("custom-status").textContent'),pattern);};
  await validate(uniqueText,/唯一解已验证/);assert(await run('window.__customWorkers>0'),'uniqueness must use an actual offline Worker');assert.equal((await saved()).sessionId,initial.game.sessionId);
  await reload();await run('document.getElementById("explore-settings").open=true');await click('custom-open');assert(await run('document.getElementById("custom-play").disabled'),'a restored editor draft requires a fresh proof');assert.match(await run('document.getElementById("custom-status").textContent'),/已恢复编辑草稿/);await click('custom-validate');await waitFor('!document.getElementById("custom-play").disabled');
  const grid=await run('[...document.querySelectorAll("#custom-board input")].map(x=>Number(x.value)||0)');assert.deepEqual(grid,C.parse(uniqueText),'editor must display only givens');
  await run('document.querySelectorAll("#custom-board input")[1].focus();document.querySelectorAll("#custom-board input")[1].select()');await send('Input.insertText',{text:'5'});
  assert(await run('document.getElementById("custom-play").disabled'));assert(await run('document.querySelectorAll("#custom-board [aria-invalid=true]").length>=2'));await click('custom-validate');await waitFor('document.getElementById("custom-validate").getAttribute("aria-busy")==="false"');assert.match(await run('document.getElementById("custom-status").textContent'),/冲突/);
  await validate('0'.repeat(81),/多解/);
  const impossible=C.parse(uniqueText),answer=C.validate(impossible).solution,wrong=impossible.findIndex((v,n)=>!v&&E.candidates(impossible,n,'classic').some(v=>v!==answer[n]));impossible[wrong]=E.candidates(impossible,wrong,'classic').find(v=>v!==answer[wrong]);await validate(C.toText(impossible),/无解/);
  await inputText(uniqueText);await run('document.getElementById("custom-validate").click();document.querySelectorAll("#custom-board input")[2].value="1";document.querySelectorAll("#custom-board input")[2].dispatchEvent(new Event("input",{bubbles:true}))');await delay(100);assert(await run('document.getElementById("custom-play").disabled'),'edited input must invalidate in-flight proof');
  await validate(uniqueText,/唯一解已验证/);await click('custom-save');assert.match(await run('document.getElementById("custom-status").textContent'),/已收藏/);
  await run('Object.defineProperty(navigator,"clipboard",{configurable:true,value:undefined});document.getElementById("custom-copy").click()');await waitFor('document.getElementById("custom-status").textContent.includes("已选中题面")');assert.deepEqual(C.parse(await run('document.getElementById("custom-text").value')),C.parse(uniqueText));
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await screenshot('custom-mobile');
  assert(await run('document.getElementById("custom-dialog").scrollWidth<=document.getElementById("custom-dialog").clientWidth'));
  const ax=await send('Accessibility.getFullAXTree');assert(ax.nodes.some(n=>n.role?.value==='grid'&&n.name?.value.includes('编辑经典')));assert(ax.nodes.some(n=>n.name?.value==='第 1 行第 1 列的给定数'));
  await click('custom-play');await waitFor('document.getElementById("confirm-dialog").open');await click('confirm-cancel');await waitFor('document.getElementById("custom-dialog").open');assert.equal((await saved()).sessionId,initial.game.sessionId);
  await click('custom-play');await waitFor('document.getElementById("confirm-dialog").open');await click('confirm-accept');await waitFor('JSON.parse(localStorage.getItem("nine-realms.sudoku.v1")).game.custom===true');
  g=await saved();assert.deepEqual(g.givens,C.parse(uniqueText));assert.deepEqual(g.board,g.givens);assert.equal(g.started,false);assert.equal(await run('document.getElementById("difficulty").selectedOptions[0].textContent'),'自建');
  const customBackup=await run('(async()=>{NineRealmsHistory.flush();return await NineRealmsBackup.createAsync(localStorage)})()');assert.equal(customBackup.entries['nine-realms.favorites.v1'].records[0].puzzle.custom,true);assert.deepEqual(C.parse(customBackup.entries['nine-realms.sudoku.v1'].preferences.customDraft),C.parse(uniqueText));
  await reload();assert.equal((await saved()).custom,true);await click('start-btn');await click('share-btn');await click('challenge-plain');assert.deepEqual(C.parse(await run('document.getElementById("challenge-output").value')),C.parse(uniqueText));await click('challenge-close');
  const customSession=(await saved()).sessionId;await click('import-btn');await run(`document.getElementById('challenge-input').value=${JSON.stringify(uniqueText)};document.getElementById('challenge-import').click();document.getElementById('challenge-close').click()`);await delay(150);assert.equal((await saved()).sessionId,customSession,'closing import cancels an in-flight proof');
  await click('import-btn');await run(`document.getElementById('challenge-input').value=${JSON.stringify(uniqueText)};document.getElementById('challenge-import').click()`);await waitFor('document.getElementById("confirm-dialog").open');await click('confirm-accept');await waitFor(`JSON.parse(localStorage.getItem('nine-realms.sudoku.v1')).game.sessionId!==${JSON.stringify(customSession)}`);assert.equal((await saved()).custom,true);
  console.log('PASS Chromium custom: actual Worker for unique/conflict/unsolvable/multiple, native numeric input, stale-proof invalidation, favorites+backup, mobile/AX grid, givens-only clipboard fallback, cancel/accept, custom reload and plain-text sharing/import with close cancellation.');

  // The generated, standalone file must work with all HTTP(S) requests blocked.
  await send('Network.enable');
  const offline=fixture('standalone-offline');offline.game.logicMode=true;
  if(process.env.NINE_REALMS_NO_FILE_NAVIGATION==='1') {
    console.log('BLOCKED file:// launch: previously observed managed Chromium policy ERR_BLOCKED_BY_ADMINISTRATOR; skipped repeating the denied navigation. Testing the standalone bundle from localhost with networking disabled after load.');
    await browser.load(offline,'/dist/index.html');
  } else {
    try { await browser.load(offline,'file://'+path.join(browser.root,'dist/index.html')); }
    catch(error){
      if(!error.message.includes('ERR_BLOCKED_BY_ADMINISTRATOR'))throw error;
      console.log('BLOCKED file:// launch: managed Chromium policy ERR_BLOCKED_BY_ADMINISTRATOR. Testing the same standalone bundle from localhost with networking disabled after load.');
      await send('Page.navigate',{url:'about:blank'});await delay(50);await browser.load(offline,'/dist/index.html');
    }
  }
  await send('Network.setBlockedURLs',{urls:['http://*','https://*']});
  await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  assert.equal(await run('document.querySelectorAll("script[src],link[rel=stylesheet]").length'),0,'standalone must have no external module or stylesheet dependencies');
  assert(await run('document.querySelector("link[rel=icon]").href.startsWith("data:image/png;base64,")'),'preserve the main favicon fix in the standalone bundle');
  assert.equal(await run('typeof NineRealmsCustomUI'), 'function');assert.equal(await run(`(async()=>{const proof=await NineRealmsCustom.createClient().run(${JSON.stringify(C.parse(uniqueText))});return proof.status})()`),'unique');
  for(const viewport of [{width:1440,height:1000,mobile:false},{width:768,height:1024,mobile:false},{width:390,height:844,mobile:true},{width:320,height:740,mobile:true}]){
    await send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1});
    const layout=await run('({width:innerWidth,scroll:document.documentElement.scrollWidth,rect:document.getElementById("board").getBoundingClientRect().toJSON()})');assert(layout.scroll<=layout.width,'standalone overflow at '+viewport.width);assert(Math.abs(layout.rect.width-layout.rect.height)<1,'square board at '+viewport.width);
  }
  const errors=browser.events.filter(e=>e.method==='Runtime.exceptionThrown');assert.deepEqual(errors,[]);
  console.log('PASS Chromium standalone offline runtime: no external script/style dependencies, embedded favicon, actual uniqueness Worker with HTTP(S) blocked and network offline; square board and no horizontal overflow at 1440/768/390/320px.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
