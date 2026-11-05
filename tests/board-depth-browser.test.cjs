/* Removed advanced tools are explicitly re-enabled only for dormant regression fixtures. */
/* Real camera projection, themed material and input checks in Chromium. */
'use strict';
const {enableDormantTools}=require('./dormant-tools-fixture.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {launch,fixture,delay}=require('./browser-helper.cjs');
(async()=>{
 const b=await launch(),{evaluate:run,send}=b;
 const out=process.env.NINE_REALMS_DEPTH_EVIDENCE_DIR||path.join(b.root,'evidence','board-depth');fs.mkdirSync(out,{recursive:true});const records=[];
 async function media(reduced=false){await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:reduced?'reduce':'no-preference'}]});}
 async function pointer(x,y){await send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});await delay(300);}
 async function click(selector){
  if(await run(`!!document.querySelector(${JSON.stringify(selector)})?.closest('#more-tools-panel[hidden]')`)) { await enableDormantTools(run); await click('#more-tools-toggle'); }
const r=await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mouseMoved',...r});await send('Input.dispatchMouseEvent',{type:'mousePressed',...r,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...r,button:'left',clickCount:1});await delay(50);}
 async function load(c){await media(c.reduced);await send('Emulation.setDeviceMetricsOverride',{width:c.width,height:c.height,deviceScaleFactor:1,mobile:c.width<768});const s=fixture('ui-audit-classic');Object.assign(s.preferences,{theme:c.theme,fx:c.fx!==false,intensity:c.intensity,zen:false,zenMotion:false,sound:false,textSize:c.large?'large':'normal'});await b.load(s,'/dist/index.html');await click('#resume-btn');await click('#auto-notes-btn');await click('#more-tools-close');if(c.zen)await click('#zen-toggle');await run('document.fonts.ready');await run('scrollTo(0,0)');await pointer(0,0);}
 async function state(){return run(`(()=>{const stage=document.querySelector('#board-stage'),card=document.querySelector('#board-card'),style=getComputedStyle(card),grid=document.querySelector('#board'),selected=document.querySelector('#board .selected'),probe=document.createElement('div');probe.style.cssText='position:fixed;visibility:hidden;pointer-events:none;background:var(--glass-surface);border:1px solid var(--glass-edge);box-shadow:var(--glass-panel-shadow)';document.body.append(probe);const expected=getComputedStyle(probe),r={perspective:getComputedStyle(stage).perspective,transform:style.transform,background:style.backgroundImage,border:style.borderTopColor,shadow:style.boxShadow,filter:style.backdropFilter,expectedBackground:expected.backgroundImage,expectedBorder:expected.borderTopColor,expectedShadow:expected.boxShadow,edgeHeight:parseFloat(getComputedStyle(document.querySelector('.board-edge')).height),shadowFilter:getComputedStyle(document.querySelector('.board-shadow')).filter,gridBorder:getComputedStyle(grid).borderTopWidth,notesFont:parseFloat(getComputedStyle(selected.querySelector('.notes')).fontSize),noteCount:[...grid.querySelectorAll('.notes>span')].filter(e=>e.textContent).length,selected:selected.dataset.index,selectedRect:selected.getBoundingClientRect().toJSON(),card:card.getBoundingClientRect().toJSON(),dock:document.querySelector('.control-panel').getBoundingClientRect().toJSON(),scrollWidth:document.documentElement.scrollWidth,width:innerWidth,height:innerHeight,motion:document.body.dataset.motion,fx:document.body.dataset.fx,zen:document.body.dataset.zen};probe.remove();return r})()`);}
 function shadowLayers(value){const result=[];let depth=0,start=0;for(let i=0;i<value.length;i++){if(value[i]==='(')depth++;if(value[i]===')')depth--;if(value[i]===','&&!depth){result.push(value.slice(start,i));start=i+1;}}result.push(value.slice(start));return result;}
 async function quad(){await send('DOM.enable');const {root}=await send('DOM.getDocument'),q=await send('DOM.querySelector',{nodeId:root.nodeId,selector:'#board-card'}),r=await send('DOM.getBoxModel',{nodeId:q.nodeId});return r.model.border;}
 const distance=(q,a,b)=>Math.hypot(q[b*2]-q[a*2],q[b*2+1]-q[a*2+1]);
 try{
  const cases=[
   {width:1440,height:900,theme:'nebula',intensity:'cinematic'},
   {width:1280,height:720,theme:'ivory',intensity:'balanced',large:true},
   {width:1440,height:900,theme:'ocean',intensity:'balanced'},
   {width:390,height:844,theme:'ivory',intensity:'soft'},
   {width:360,height:740,theme:'sakura',intensity:'balanced',large:true},
   {width:390,height:844,theme:'nebula',intensity:'cinematic'},
   {width:1440,height:900,theme:'sunset',intensity:'soft'},
   {width:390,height:844,theme:'firefly',intensity:'soft',zen:true}
  ];
  for(const c of cases){
   await load(c);const before=await run('JSON.parse(localStorage.getItem("nine-realms.sudoku.v1")).game');const p=await run('(()=>{const r=document.querySelector("#board-stage").getBoundingClientRect();return {x:r.x+r.width*.90,y:r.y+r.height*.16}})()');await pointer(p.x,p.y);let m=await state();
   assert.equal(m.perspective,'1500px','original camera restored');assert.equal(m.background,m.expectedBackground,'use original theme glass');assert.equal(m.border,m.expectedBorder,'use original theme edge');assert(m.filter.includes('saturate(1.25)'),'original glass saturation');assert.equal(m.gridBorder,'1px');assert.equal(m.edgeHeight,1,'only a thin upper highlight');assert(m.notesFont>=10.5&&m.noteCount>0,'new readable candidates retained');assert(m.scrollWidth<=m.width,'no horizontal overflow');
   for(const layer of shadowLayers(m.shadow))if(!layer.includes('inset')&&layer.trim()!=='none'){const px=[...layer.matchAll(/(-?\d*\.?\d+)px/g)].map(x=>Number(x[1]));assert(px[2]>0,'no solid extruded bottom shadow: '+layer);}
   assert(/blur\((2[0-9]|3[0-9])px\)/.test(m.shadowFilter),'diffuse ambient shadow');
   if(!c.zen){assert.notEqual(m.transform,'none');const q=await quad(),convergence=Math.max(Math.abs(distance(q,0,1)-distance(q,3,2)),Math.abs(distance(q,0,3)-distance(q,1,2)));assert(convergence>.5,'actual perspective projection, not parallel orthographic edges');m.convergence=convergence;}
   const after=await run('JSON.parse(localStorage.getItem("nine-realms.sudoku.v1")).game');assert.deepEqual(after.board,before.board);assert.deepEqual(after.notes,before.notes);assert.equal(after.selected,before.selected,'hover does not change selected cell');
   const target=before.board.findIndex((v,i)=>!v&&i!==before.selected);await click('#board [data-index="'+target+'"]');assert.equal(await run('JSON.parse(localStorage.getItem("nine-realms.sudoku.v1")).game.selected'),target,'transformed board hit testing');
   await pointer(p.x,p.y);m=Object.assign(m,{theme:c.theme,intensity:c.intensity,viewport:[c.width,c.height],large:!!c.large});records.push(m);const name='after-'+c.theme+'-'+c.width;const image=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(image.data,'base64'));
   await pointer(0,0);const reset=await run('document.querySelector("#board-stage").style.getPropertyValue("--tilt-x")');assert.equal(reset,'0deg','pointer leave resets camera');
  }
  for(const config of [{fx:false,reduced:false},{fx:true,reduced:true}]){await load({width:1440,height:900,theme:'ivory',intensity:'balanced',...config});await pointer(920,260);assert.equal((await state()).transform,'none','effects off / reduced motion remain still');}
  await load({width:390,height:844,theme:'ivory',intensity:'soft'});await run(`document.querySelector('#board-stage').dispatchEvent(new PointerEvent('pointermove',{pointerType:'touch',clientX:300,clientY:230,bubbles:true}))`);assert.equal(await run('document.querySelector("#board-stage").style.getPropertyValue("--tilt-x")'),'0deg','touch never tilts board');
  fs.writeFileSync(path.join(out,'computed.json'),JSON.stringify(records,null,2));console.log('PASS board depth Chromium: 8 viewport/theme/size/zen combinations, actual perspective convergence, original theme glass and soft shadows, selected/candidate hit testing, off/reduced-motion/touch guards. Screenshots: '+out);
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
