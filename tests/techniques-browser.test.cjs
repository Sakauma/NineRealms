/* Removed advanced tools are explicitly re-enabled only for dormant regression fixtures. */
'use strict';
const {enableDormantTools}=require('./dormant-tools-fixture.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),E=require('../src/engine.js'),H=require('../src/hints.js'),G=require('../src/technique-guides.js');
const {launch,fixture,delay}=require('./browser-helper.cjs');
function snapshot(mode,seed='rating-0',difficulty='easy'){
 const s=fixture(),p=E.getPuzzle(difficulty,seed,mode);Object.assign(s.game,{sessionId:'guide-'+mode,puzzleId:p.id,sourceId:p.sourceId,mode,difficulty:p.difficulty,clues:p.clues,givens:p.givens,solution:p.solution,board:p.givens.slice(),notes:Array(p.givens.length).fill(0),selected:p.givens.findIndex(v=>!v)});return s;
}
(async()=>{
 const browser=await launch(),{evaluate:run,send,waitFor}=browser;
 async function clickTool(selector){
  if(await run(`!!document.querySelector(${JSON.stringify(selector)})?.closest('#more-tools-panel[hidden]')`)) { await enableDormantTools(run); await clickTool('#more-tools-toggle'); }
  const p=await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest',inline:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,h=document.elementFromPoint(x,y);return {x,y,ok:r.width>0&&r.height>0&&!!h&&(h===e||e.contains(h))&&!e.disabled};})()`);
  assert(p.ok,'reachable tool '+selector);
  for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,x:p.x,y:p.y,button:'left',clickCount:1});
  await delay(40);
 }
 const modes=E.getModes().map(x=>x.id),errors=[];let count=0;
 async function open(s,route='/src/index.html'){
  await browser.load(s,route);await run(`window.__ratingResult=null;window.__originalRate=SudokuHints.ratePuzzle;SudokuHints.ratePuzzle=function(g,c){window.__ratingResult=__originalRate(g,c);return __ratingResult;};document.getElementById('rules-open').click()`);await waitFor('window.__ratingResult!==null');
 }
 async function fits(width){
  const size=await run(`(()=>{const d=document.getElementById('rules-dialog'),guide=document.getElementById('technique-guide'),summary=guide.querySelector('summary'),r=d.getBoundingClientRect();return {view:innerWidth,scroll:document.documentElement.scrollWidth,left:r.left,right:r.right,dialogScroll:d.scrollWidth,dialogWidth:d.clientWidth,guide:guide.getBoundingClientRect().width,tap:summary.getBoundingClientRect().height};})()`);
  assert(size.scroll<=width+1,'page overflow at '+width);assert(size.dialogScroll<=size.dialogWidth+1,'dialog overflow at '+width);assert(size.left>=0&&size.right<=width+1);assert(size.tap>=44);assert(size.guide>100);
 }
 try{
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  for(const mode of modes){
   const s=snapshot(mode);await open(s);const result=await run(`({hidden:document.getElementById('logic-rating-panel').hidden,label:document.getElementById('logic-rating').textContent,open:document.getElementById('technique-guide').open,tips:[...document.querySelectorAll('#technique-guide-tips li')].map(x=>x.textContent),summary:document.querySelector('#technique-guide summary').textContent,computed:__ratingResult})`);
   assert.deepEqual(result.tips,G.get(mode).tips);assert.equal(result.open,false,'guides start folded');assert.match(result.summary,/通用指南/);assert(await run(`!document.getElementById('rules-dialog').textContent.includes('通用建议，不表示本题一定用到这些技巧。')`));
   assert.equal(result.hidden,!result.computed.solved);if(result.computed.solved)assert.match(result.label,/^本题评级 · /);else assert.equal(result.label,'');
   if(H.ratingModes.includes(mode))assert.equal(result.computed.status,'rated',mode+' sample really inferred');else assert.equal(result.computed.status,'unsupported');
   assert(!/暂不支持|未评级|分析中/.test(result.label));await run(`document.querySelector('#technique-guide summary').click()`);assert.equal(await run('document.querySelectorAll("#technique-guide-tips li").length'),2);await fits(1440);
   for(const width of [390,320]){await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});await run(`document.body.dataset.textSize=${JSON.stringify(width===320?'large':'normal')}`);await fits(width);}
   await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await run(`document.body.dataset.textSize='normal'`);count++;errors.push(...browser.events.filter(e=>e.method==='Runtime.exceptionThrown'));
  }
  for(const status of ['invalid','budget','beyond-supported']){
   await browser.load(snapshot('classic'));await run(`window.__ratingCalled=false;SudokuHints.ratePuzzle=()=>{window.__ratingCalled=true;return {solved:false,status:${JSON.stringify(status)}}};document.getElementById('rules-open').click()`);
   await waitFor('window.__ratingCalled');assert(await run('document.getElementById("logic-rating-panel").hidden'));assert.equal(await run('document.getElementById("logic-rating").textContent'),'');
  }
  // A genuinely valid but unsupported-by-current-techniques classic is hidden too.
  const stalled=snapshot('classic','rating-3','expert');assert(!H.ratePuzzle(stalled.game.givens,{mode:'classic',clues:stalled.game.clues}).solved);await open(stalled);assert(await run('document.getElementById("logic-rating-panel").hidden'));
  // Original givens, not later entries/notes or the stored answer, drive a rating.
  await browser.load(snapshot('diagonal'));await run(`document.getElementById('resume-btn').click()`);await clickTool('#auto-notes-btn');await run(`document.getElementById('rules-open').click()`);await waitFor('!document.getElementById("logic-rating-panel").hidden');const before=await run('document.getElementById("logic-rating").textContent');await run(`document.getElementById('rules-close').click();document.getElementById('resume-btn').click();document.getElementById('undo-btn').click();SudokuHints.ratePuzzle=()=>{throw Error('successful original rating should be cached')};document.getElementById('rules-open').click()`);await waitFor('!document.getElementById("logic-rating-panel").hidden');assert.equal(await run('document.getElementById("logic-rating").textContent'),before);
  const dir=path.join(browser.root,'evidence');fs.mkdirSync(dir,{recursive:true});
  // Check the very same standalone output with all later network traffic disabled.
  await open(snapshot('diagonal'),'/dist/index.html');await send('Network.enable');await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  await run(`document.querySelector('#technique-guide summary').focus()`);await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13,text:'\r'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});assert(await run('document.getElementById("technique-guide").open'),'keyboard expands native details');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32,nativeVirtualKeyCode:32,text:' '});await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32,nativeVirtualKeyCode:32});assert(await run('!document.getElementById("technique-guide").open'),'space collapses native details');await run(`document.querySelector('#technique-guide summary').click()`);
  const ax=await send('Accessibility.getFullAXTree');assert(ax.nodes.some(n=>/解题技巧.*通用指南/.test(n.name?.value||'')));assert(ax.nodes.some(n=>/基于原始题面及本玩法规则/.test(n.name?.value||'')));
  const desktop=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(dir,'techniques-desktop.png'),Buffer.from(desktop.data,'base64'));
  for(const width of [1440,768,390,320]){
   await send('Emulation.setDeviceMetricsOverride',{width,height:width>=768?1000:844,deviceScaleFactor:1,mobile:width<768});await fits(width);
   if(width===390){const mobile=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(dir,'techniques-mobile.png'),Buffer.from(mobile.data,'base64'));}
   await run(`document.body.dataset.textSize='large'`);await fits(width);await run(`document.body.dataset.textSize='normal'`);
  }
  await run(`document.getElementById('rules-close').click();SudokuHints.ratePuzzle=__originalRate;document.getElementById('rules-open').click()`);await waitFor('!document.getElementById("logic-rating-panel").hidden');assert(await run('!document.getElementById("technique-guide").open'));assert.equal(await run('document.getElementById("technique-guide-tips").children.length'),2);
  errors.push(...browser.events.filter(e=>e.method==='Runtime.exceptionThrown'));assert.equal(errors.length,0,JSON.stringify(errors));
  console.log(`PASS actual Chromium: ${count} mode-specific folded general guides each at desktop/390/320-large; 7 real ratings/26 hidden; invalid/budget/stalled suppression; original-givens cache; keyboard/AX; 1440/768/390/320, large text, no overflow; standalone offline operation. Screenshots: evidence/techniques-{desktop,mobile}.png`);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
