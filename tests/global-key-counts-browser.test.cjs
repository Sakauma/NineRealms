/* All modes use the shared input pad. Counts must never paint, in any layout. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {launch,fixture,delay}=require('./browser-helper.cjs'),E=require('../src/engine.js');
(async()=>{
 const b=await launch(),{evaluate:run,send}=b,out=process.env.NINE_REALMS_COUNTS_EVIDENCE_DIR||path.join(b.root,'evidence/global-key-counts');fs.mkdirSync(out,{recursive:true});const records=[];
 function state(mode){const s=fixture('ui-audit-classic');if(mode!=='classic'){const p=E.getPuzzle('easy','count-audit-'+mode,mode);Object.assign(s.game,{mode,puzzleId:p.id,sourceId:p.sourceId,clues:p.clues,givens:p.givens,solution:p.solution,board:p.givens.slice(),notes:Array(p.givens.length).fill(0),selected:p.givens.findIndex(n=>!n)});}s.preferences.sound=false;return s;}
 async function load(mode,w,h,route='/dist/index.html',source){await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:w<768});await send('Emulation.setTouchEmulationEnabled',{enabled:w<768});await b.load(source||state(mode),route);await run('document.querySelector("#resume-btn").click();document.fonts.ready');await run('scrollTo(0,0)');}
 async function geometry(){return run(`(()=>{const r=s=>{const e=document.querySelector(s),c=getComputedStyle(e);return {rect:e.getBoundingClientRect().toJSON(),font:c.fontSize,weight:c.fontWeight,background:c.backgroundImage+' '+c.backgroundColor,radius:c.borderRadius,position:c.position}};return {board:r('#board-card'),pad:r('#number-pad'),key:r('.number-key'),value:r('.key-value'),count:r('.remaining'),prefix:getComputedStyle(document.querySelector('.remaining'),'::before').content}})()`);}
 async function inspect(){return run(`(()=>{const keys=[...document.querySelectorAll('#number-pad button')];return {mode:document.body.dataset.mode,keys:keys.map(e=>{const r=e.querySelector('.remaining'),s=getComputedStyle(r);return {value:e.dataset.value,text:e.innerText.trim(),hidden:s.display==='none'||s.visibility==='hidden',label:e.getAttribute('aria-label'),disabled:e.disabled,key:e.getBoundingClientRect().toJSON()}}),overflow:document.documentElement.scrollWidth>innerWidth}})()`);}
 async function shot(name){const p=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(p.data,'base64'));}
 async function click(selector){const p=await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});await delay(30);}
 try{
  const modes=E.getModes().map(x=>x.id),compare=new Set(['classic','diagonal','killer','jigsaw','twin']);assert.equal(modes.length,33);
  for(const [w,h] of [[1440,900],[390,844]])for(const mode of modes){
   let before;if(process.env.NINE_REALMS_COUNTS_BEFORE_ROUTE&&compare.has(mode)){await load(mode,w,h,process.env.NINE_REALMS_COUNTS_BEFORE_ROUTE);before=await geometry();}
   await load(mode,w,h);const afterGeometry=await geometry();
   const r=await inspect();assert.equal(r.keys.length,9);assert.equal(r.mode,mode);assert(!r.overflow,'horizontal overflow '+mode+' '+w);for(const k of r.keys){assert(k.hidden,'visible count '+mode+' '+w);assert.equal(k.text,k.value,'only the input digit is visible');assert(k.label.startsWith('填入 '+k.value),'accessible name retained');}records.push({mode,viewport:[w,h],beforeGeometry:before,geometry:afterGeometry,...r});
   if(['classic','killer','twin'].includes(mode))await shot(mode+'-'+w);
  }
  await load('classic',360,740);const small=await inspect();small.keys.forEach(k=>assert(k.hidden&&k.text===k.value));await shot('classic-360');
  // Existing quantities and input semantics remain accessible and functional.
  for(const mode of ['classic','diagonal','twin']){
   await load(mode,390,844);const g=await run('JSON.parse(localStorage.getItem("nine-realms.sudoku.v1")).game'),i=g.board.findIndex(n=>!n),v=g.solution[i];await click('#board [data-index="'+i+'"]');await click('#number-pad [data-value="'+v+'"]');assert.equal(await run('JSON.parse(localStorage.getItem("nine-realms.sudoku.v1")).game.board['+i+']'),v,'pointer number entry '+mode);
   await send('Input.dispatchKeyEvent',{type:'keyDown',key:'z',code:'KeyZ',modifiers:2});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'z',code:'KeyZ'});assert.equal(await run('JSON.parse(localStorage.getItem("nine-realms.sudoku.v1")).game.board['+i+']'),0,'undo '+mode);await click('#pause-btn');assert(await run('[...document.querySelectorAll("#number-pad button")].every(e=>e.disabled)'));const paused=await inspect();paused.keys.forEach(k=>assert(k.hidden&&k.text===k.value));
  }
  const full=state('classic');full.game.logicMode=true;full.game.board=full.game.board.map((n,i)=>full.game.solution[i]===1?1:n);full.game.selected=full.game.board.findIndex(n=>!n);await load('classic',390,844,'/dist/index.html',full);const complete=await inspect(),one=complete.keys.find(k=>k.value==='1');assert(one.hidden&&one.text==='1'&&one.label.includes('还可填写 0 个')&&!one.disabled);await shot('classic-mobile-complete-digit');
  fs.writeFileSync(path.join(out,'measurements.json'),JSON.stringify(records,null,2));console.log('PASS global key counts Chromium: all 33 modes x desktop/mobile (66 states), optional old/new geometry records (every mode intentionally uses the unified shell), 360px phone, actual classic/diagonal/twin input+undo/pause, hidden completed count and retained accessible labels. Evidence: '+out);
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
