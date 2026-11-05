/* Removed advanced tools are explicitly re-enabled only for dormant regression fixtures. */
'use strict';
const {enableDormantTools}=require('./dormant-tools-fixture.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {launch,fixture,delay}=require('./browser-helper.cjs');
(async()=>{
 const browser=await launch(),{evaluate:run,send,waitFor}=browser;
 async function clickTool(selector){
  if(await run(`!!document.querySelector(${JSON.stringify(selector)})?.closest('#more-tools-panel[hidden]')`)) { await enableDormantTools(run); await clickTool('#more-tools-toggle'); }
  const p=await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest',inline:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,h=document.elementFromPoint(x,y);return {x,y,ok:r.width>0&&r.height>0&&!!h&&(h===e||e.contains(h))&&!e.disabled};})()`);
  assert(p.ok,'reachable tool '+selector);
  for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,x:p.x,y:p.y,button:'left',clickCount:1});
  await delay(40);
 }
 try{
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await browser.load(fixture('normal-mode'));await run('document.getElementById("resume-btn").click()');
  const normalChoice=await run(`(()=>{const g=JSON.parse(localStorage.getItem('nine-realms.sudoku.v1')).game;for(let i=0;i<81;i++)if(!g.board[i]){const wrong=SudokuEngine.candidates(g.board,i,'classic').find(n=>n!==g.solution[i]);if(wrong)return {i,wrong};}})()`);
  await run(`document.querySelector('#board [data-index="${normalChoice.i}"]').click();document.querySelector('#number-pad [data-value="${normalChoice.wrong}"]').click()`);
  assert.equal(await run('JSON.parse(localStorage.getItem("nine-realms.sudoku.v1")).game.mistakes'),1);assert.match(await run('document.getElementById("progress-count").textContent'),/^0 \/ /);
  await run('document.getElementById("undo-btn").click();document.getElementById("redo-btn").click()');assert.equal(await run('JSON.parse(localStorage.getItem("nine-realms.sudoku.v1")).game.mistakes'),1,'redo must not count the same entry again');
  const s=fixture();await browser.load(s);
  await run('document.getElementById("resume-btn").click();document.getElementById("logic-toggle").click()');
  const choice=await run(`(()=>{const g=JSON.parse(localStorage.getItem('nine-realms.sudoku.v1')).game;for(let i=0;i<81;i++)if(!g.board[i]){const wrong=SudokuEngine.candidates(g.board,i,'classic').find(n=>n!==g.solution[i]);if(wrong)return {i,wrong};}})()`);
  await run(`document.querySelector('#board [data-index="${choice.i}"]').click();document.querySelector('#number-pad [data-value="${choice.wrong}"]').click()`);await clickTool('#check-btn');
  const observed=await run(`({mistakes:document.getElementById('mistakes').textContent,conflict:document.querySelector('#board [data-index="${choice.i}"]').classList.contains('conflict'),points:document.getElementById('energy-points').textContent,progress:document.getElementById('progress-count').textContent,status:document.getElementById('status-message').textContent,g:JSON.parse(localStorage.getItem('nine-realms.sudoku.v1')).game})`);
  assert.equal(observed.mistakes,'—');assert.equal(observed.points,'—');assert.equal(observed.g.mistakes,0);assert.equal(observed.conflict,false);assert.match(observed.progress,/^1 \/ /);assert.match(observed.status,/不代表已证明正确/);
  await run(`SudokuHints.getStep=()=>{throw Error('hidden answer hint called')}`);await clickTool('#auto-notes-btn');await run(`document.getElementById('hint-btn').click();document.getElementById('hint-close').click()`);await clickTool('#lens-digits [data-digit="1"]');
  await waitFor('document.querySelectorAll(".lens-note").length>0');
  const before=await run('localStorage.getItem("nine-realms.sudoku.v1")');await clickTool('#lens-rules');
  assert.match(await run('document.getElementById("lens-status").textContent'),/规则推算/);
  assert.equal(await run('localStorage.getItem("nine-realms.sudoku.v1")'),before,'lens must never write notes or game state');
  assert(await run('document.querySelectorAll(".lens-rule").length>0'));
  await clickTool('#lens-digits [data-digit="1"]');await waitFor('document.querySelectorAll(".lens-rule,.lens-note").length===0');
  await run('NineRealmsHistory.markCurrent("browser checkpoint");NineRealmsHistory.openCheckpoints()');
  assert(await run('!!document.querySelector(".checkpoint-actions button:nth-child(3):not(:disabled)")'));
  assert.equal(browser.events.filter(e=>e.method==='Runtime.exceptionThrown').length,0);
  const dir=path.join(browser.root,'evidence');fs.mkdirSync(dir,{recursive:true});
  await run('NineRealmsHistory.close();window.scrollTo(0,0)');
  const image=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(dir,'reasoning-desktop.png'),Buffer.from(image.data,'base64'));
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await run('window.scrollTo(0,0)');
  const sizes=await run('({scroll:document.documentElement.scrollWidth,width:innerWidth,board:document.getElementById("board").getBoundingClientRect().toJSON()})');assert(sizes.scroll<=sizes.width,'mobile horizontal overflow');
  const mobile=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(dir,'reasoning-mobile.png'),Buffer.from(mobile.data,'base64'));
  const hintFixture=fixture('logical-edit-browser');hintFixture.game.logicMode=true;await browser.load(hintFixture);await run('document.getElementById("resume-btn").click()');await clickTool('#auto-notes-btn');
  const auto=await run('JSON.parse(localStorage.getItem("nine-realms.sudoku.v1")).game.notes');assert(auto.some(Boolean));
  await run('document.getElementById("undo-btn").click()');assert((await run('JSON.parse(localStorage.getItem("nine-realms.sudoku.v1")).game.notes')).every(n=>n===0));
  await run('document.getElementById("redo-btn").click()');assert.deepEqual(await run('JSON.parse(localStorage.getItem("nine-realms.sudoku.v1")).game.notes'),auto);
  const beforeHint=await run('JSON.parse(localStorage.getItem("nine-realms.sudoku.v1")).game');
  assert(await run('document.getElementById("hint-btn").disabled'),'pure logic never offers a stored-answer reveal');
  await run('document.getElementById("hint-btn").click()');assert(await run('document.getElementById("hint-panel").hidden'));
  const blockedHint=await run('JSON.parse(localStorage.getItem("nine-realms.sudoku.v1")).game');
  for(const field of ['board','notes','history','redo','hints'])assert.deepEqual(blockedHint[field],beforeHint[field]);
  await run('document.getElementById("logic-toggle").click()');
  const selected=await run('JSON.parse(localStorage.getItem("nine-realms.sudoku.v1")).game.board.findIndex(v=>!v)');
  await run(`document.querySelector('#board [data-index="${selected}"]').click();document.getElementById("hint-btn").click()`);
  const shownHint=await run('JSON.parse(localStorage.getItem("nine-realms.sudoku.v1")).game');
  assert.equal(await run('document.getElementById("hint-value").textContent'),String(shownHint.solution[selected]));
  assert(await run('!document.getElementById("hint-panel").hidden&&!document.getElementById("hint-next")&&!document.getElementById("hint-apply")'));
  for(const field of ['board','notes','history','redo'])assert.deepEqual(shownHint[field],beforeHint[field]);
  assert.equal(shownHint.hints,beforeHint.hints+1);await run('document.getElementById("hint-close").click()');
  for(const logic of [false,true]){
    const finish=fixture('completion-undo-'+logic),last=finish.game.givens.findIndex(v=>!v);finish.game.board=finish.game.solution.slice();finish.game.board[last]=0;finish.game.selected=last;finish.game.logicMode=logic;
    await browser.load(finish);await run(`document.getElementById('resume-btn').click();document.querySelector('#number-pad [data-value="${finish.game.solution[last]}"]').click()`);
    assert(await run('document.getElementById("completion-dialog").open'));const completed=await run('JSON.parse(localStorage.getItem("nine-realms.sudoku.v1")).game');await run('document.getElementById("close-completion").click()');assert.equal(await run('document.getElementById("undo-btn").disabled'),false);
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'z',code:'KeyZ',modifiers:2});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'z',code:'KeyZ'});let moved=await run('JSON.parse(localStorage.getItem("nine-realms.sudoku.v1")).game');assert.equal(moved.completed,false);assert.equal(moved.board[last],0);
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Z',code:'KeyZ',modifiers:10});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Z',code:'KeyZ'});moved=await run('JSON.parse(localStorage.getItem("nine-realms.sudoku.v1")).game');assert.equal(moved.completed,true);assert.equal(moved.energy.points,completed.energy.points);assert.equal(moved.mistakes,completed.mistakes);assert(await run('document.getElementById("completion-dialog").open'));
    await run('NineRealmsHistory.flush();NineRealmsBackup.create(localStorage)');
  }
  console.log('PASS actual Chromium: pure-mode conflict-free wrong entry has no mistake/energy/progress oracle, dormant candidate generation, blocked direct reveals in pure logic, single non-writing result in ordinary mode, separate nonmutating lenses, practice entry, normal+logical last-cell completion undo/redo without duplicate rewards, desktop/mobile rendering without overflow.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
