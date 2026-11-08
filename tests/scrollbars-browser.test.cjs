'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {launch,fixture}=require('./browser-helper.cjs'),V=require('../src/voyage.js');
const out=process.env.NINE_REALMS_SCROLLBAR_EVIDENCE;
const targets=['html','#voyage-dialog','#rules-dialog','.appearance-panel','#mode-dialog','.history-dialog','.history-list','.history-board-viewport','.history-review-events','.floating-draft-content','#draft-panel .draft-links','.glass-select-list','.secret-cards','.training-explanation','textarea'];
function snapshot(theme,large){const s=fixture('scrollbar-input');s.preferences={...s.preferences,theme,textSize:large?'large':'normal',sound:false,musicEnabled:false};s.game.started=false;const p=V.getPuzzle('lines-rise-v1');Object.assign(s.game,{mode:p.mode,difficulty:p.difficulty,puzzleId:p.id,sourceId:p.sourceId,clues:p.clues,givens:p.givens,solution:p.solution,board:p.givens.slice(),notes:Array(81).fill(0),selected:p.givens.indexOf(0)});return s;}
function progress(){let p={__journey:{version:1,granted:[]}};for(const c of V.chapters().slice(0,9))p=V.award(p,c.id,{elapsedMs:1000,mistakes:0,hints:0});return p;}
(async()=>{const b=await launch({finePointer:true}),report={layouts:[],styles:[],inputs:[],fallback:{}};const ev=s=>b.evaluate(s),click=id=>ev('document.getElementById('+JSON.stringify(id)+').click()');
async function load(width=1440,theme='nebula',large=false,route='/src/index.html'){
 await b.send('Emulation.setDeviceMetricsOverride',{width,height:width<500?844:1000,deviceScaleFactor:1,mobile:width<500});
 await b.loadStorage({'nine-realms.sudoku.v1':JSON.stringify(snapshot(theme,large)),'nine-realms.voyage.v1':JSON.stringify(progress())},route);
}
async function open(area){
 if(area==='voyage'){await click('voyage-btn');await ev('document.querySelector(".voyage-teaching").open=true;document.querySelectorAll(".voyage-phase").forEach(d=>d.open=true)');}
 if(area==='rules'){await click('rules-open');await ev('document.querySelectorAll("#rules-dialog details").forEach(d=>d.open=true)');}
 if(area==='settings')await ev('document.getElementById("appearance-settings").open=true');
 return area==='voyage'?'#voyage-dialog':area==='rules'?'#rules-dialog':'.appearance-panel';
}
async function metrics(selector){return ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),s=getComputedStyle(e),bar=getComputedStyle(e,'::-webkit-scrollbar'),thumb=getComputedStyle(e,'::-webkit-scrollbar-thumb'),track=getComputedStyle(e,'::-webkit-scrollbar-track'),r=e.getBoundingClientRect();return{selector:${JSON.stringify(selector)},bar:bar.width,thumb:thumb.backgroundColor,radius:thumb.borderRadius,track:track.backgroundColor,border:thumb.borderLeftWidth,button:getComputedStyle(e,'::-webkit-scrollbar-button').display,scheme:s.colorScheme,standardWidth:s.scrollbarWidth,standardColor:s.scrollbarColor,overflowX:e.scrollWidth-e.clientWidth,overflowY:e.scrollHeight-e.clientHeight,scrollTop:e.scrollTop,rect:r.toJSON()}})()`);}
function styleOK(m){assert.equal(m.bar,'10px',m.selector);assert.equal(m.radius,'999px');assert.equal(m.border,'3px');assert.equal(m.track,'rgba(0, 0, 0, 0)');assert.equal(m.button,'none');assert.notEqual(m.thumb,'rgba(0, 0, 0, 0)');}
async function key(key){await b.send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:key==='PageDown'?34:36});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key});}
// Native PageDown may still be animating after its first positive scroll offset.
async function settleScroll(selector){await ev(`new Promise((resolve,reject)=>{const e=document.querySelector(${JSON.stringify(selector)});let last=e.scrollTop,stable=0,frames=0;function check(){const value=e.scrollTop;stable=Math.abs(value-last)<.1?stable+1:0;last=value;if(stable>=6)return resolve();if(++frames>120)return reject(Error('Native scrolling did not settle'));requestAnimationFrame(check);}requestAnimationFrame(check);})`);}
function errors(){assert.deepEqual(b.events.filter(e=>e.method==='Runtime.exceptionThrown'),[]);}
try{
 for(const width of [320,390,768,1440])for(const theme of ['nebula','ivory'])for(const area of ['voyage','rules','settings']){
  await load(width,theme,width===320,width===390?'/dist/index.html':'/src/index.html');const selector=await open(area),m=await metrics(selector);styleOK(m);assert.equal(m.overflowX,0,JSON.stringify(m));assert(await ev('document.documentElement.scrollWidth<=innerWidth'));
  assert.equal(m.scheme,theme==='ivory'?'light':'dark');report.layouts.push({width,theme,area,...m});errors();
 }
 // Check all eight themes and the older nested menu/replay/draft surfaces too.
 for(const theme of ['nebula','aurora','ember','ivory','ocean','sakura','firefly','sunset']){
  await load(1440,theme);const results=await ev(`(${JSON.stringify(targets)}).filter(s=>document.querySelector(s)).map(s=>{const e=document.querySelector(s),bar=getComputedStyle(e,'::-webkit-scrollbar'),thumb=getComputedStyle(e,'::-webkit-scrollbar-thumb');return{selector:s,bar:bar.width,radius:thumb.borderRadius}})`);
  for(const m of results){assert.equal(m.bar,'10px',m.selector);assert.equal(m.radius,'999px');}report.styles.push({theme,targets:results.length});
 }
 await load();let selector=await open('voyage');
 await ev('document.getElementById("voyage-dialog").scrollTop=0;document.getElementById("voyage-selected-title").focus({preventScroll:true})');await key('PageDown');await b.waitFor('document.getElementById("voyage-dialog").scrollTop>0');await settleScroll(selector);report.inputs.push('native PageDown scrolls the focused modal');
 await ev('document.getElementById("voyage-dialog").scrollTo({top:0,behavior:"instant"})');await settleScroll(selector);const m=await metrics(selector),x=m.rect.right-5,y=m.rect.top+30;
 // CDP requires the held button on move as well as its buttons bitmask.
 await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});await b.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1});
 for(let step=20;step<=140;step+=20){await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y:y+step,button:'left',buttons:1});await ev('new Promise(requestAnimationFrame)');}
 await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y:y+140,button:'left',buttons:0,clickCount:1});await b.waitFor('document.getElementById("voyage-dialog").scrollTop>0');report.inputs.push('native 10px scrollbar thumb remains draggable');
 await click('voyage-close');selector=await open('settings');await ev('document.querySelector(".appearance-panel").scrollTop=0;document.querySelector(".appearance-panel button").focus({preventScroll:true})');await key('PageDown');await b.waitFor('document.querySelector(".appearance-panel").scrollTop>0');await settleScroll(selector);report.inputs.push('native PageDown reaches lower appearance settings');
 const p=await metrics(selector);await ev('document.querySelector(".appearance-panel").scrollTop=0');await b.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:p.rect.x+p.rect.width/2,y:p.rect.y+p.rect.height/2,deltaY:240,deltaX:0});await b.waitFor('document.querySelector(".appearance-panel").scrollTop>0');report.inputs.push('native mouse wheel scrolls settings');
 await load(390);await b.send('Emulation.setTouchEmulationEnabled',{enabled:true});await open('voyage');await ev('document.getElementById("voyage-dialog").scrollTop=0');
 await b.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:190,y:650,id:1}]});
 for(const y of [610,560,510,460,410,360])await b.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:190,y,id:1}]});
 await b.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await b.waitFor('document.getElementById("voyage-dialog").scrollTop>0');report.inputs.push('native phone touch swipe scrolls the modal');
 await b.send('Emulation.setTouchEmulationEnabled',{enabled:false});await load();await open('voyage');
 await b.send('Emulation.setEmulatedMedia',{features:[{name:'forced-colors',value:'active'}]});const forced=await metrics('#voyage-dialog');assert.equal(forced.standardWidth,'auto');assert.equal(forced.standardColor,'auto');assert.equal(forced.bar,'auto');assert.notEqual(forced.button,'none');report.fallback.highContrast=forced;
 await b.send('Emulation.setEmulatedMedia',{features:[]});
 // Exercise the standards-only properties in Chromium; this is not a Firefox run.
 await ev(`(()=>{const e=document.createElement('style');e.textContent='.game-dialog{scrollbar-width:thin!important;scrollbar-color:var(--scrollbar-thumb) transparent!important}';document.head.appendChild(e)})()`);const standard=await metrics('#voyage-dialog');assert.equal(standard.standardWidth,'thin');assert.match(standard.standardColor,/rgba/);report.fallback.standards=standard;errors();
 if(out){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify(report,null,2));}
 console.log('PASS native scrollbars: '+report.layouts.length+' layouts, eight themes, '+report.inputs.length+' native keyboard/mouse/touch flows, high-contrast system reset and standards-property fallback; no overflow or runtime errors. Firefox/WebKit devices not run.');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
