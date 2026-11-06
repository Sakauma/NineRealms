/* Removed advanced tools are explicitly re-enabled only for dormant regression fixtures. */
/* Measured layout and actual keyboard/pointer regression in Chromium. */
'use strict';
const {enableDormantTools}=require('./dormant-tools-fixture.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {launch,fixture,delay}=require('./browser-helper.cjs');
const E=require('../src/engine.js');
const {readSquareRailGeometry,assertSquareRailGeometry}=require('./square-rail-geometry.cjs');
(async()=>{
 const b=await launch(),{evaluate:run,send,waitFor}=b;
 const dir=process.env.NINE_REALMS_EVIDENCE_DIR||path.join(b.root,'evidence','classic-workspace');fs.mkdirSync(dir,{recursive:true});
 const measurements=[],checks=[];
 const saved=()=>run('JSON.parse(localStorage.getItem("nine-realms.sudoku.v1")).game');
 async function click(selector){
  if(await run(`!!document.querySelector(${JSON.stringify(selector)})?.closest('#more-tools-panel[hidden]')`)) { await enableDormantTools(run); await click('#more-tools-toggle'); }

  const p=await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest',inline:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);return {x,y,width:r.width,height:r.height,hit:!!hit&&(e===hit||e.contains(hit)),disabled:!!e.disabled};})()`);
  assert(p.width>0&&p.height>0&&p.hit&&!p.disabled,'visible pointer target: '+selector+' '+JSON.stringify(p));
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',clickCount:1});await delay(40);
 }
 async function key(key,code,text='',modifiers=0){await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,modifiers,...(text?{text,unmodifiedText:text}:{})});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,modifiers:0});await delay(40);}
 async function load(width,height,theme='ivory',large=false,route='/dist/index.html',mode='classic'){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<768});
  const s=fixture('ui-audit-classic');if(mode!=='classic'){const p=E.getPuzzle('easy','workspace-'+mode,mode);Object.assign(s.game,{mode,puzzleId:p.id,sourceId:p.sourceId,clues:p.clues,givens:p.givens,solution:p.solution,board:p.givens.slice(),notes:Array(p.givens.length).fill(0),selected:p.givens.findIndex(x=>!x)});}
  Object.assign(s.preferences,{theme,textSize:large?'large':'normal',fx:false,zenMotion:false,sound:false,intensity:'soft'});
  await b.load(s,route);await click('#resume-btn');await run('document.fonts.ready');await run('scrollTo(0,0)');await delay(70);return s;
 }
 async function shot(name){await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:0,y:0});await delay(80);const p=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(dir,name+'.png'),Buffer.from(p.data,'base64'));}
 async function geometry(){return run(`(()=>{const rect=s=>{const e=document.querySelector(s),r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right}};return {width:innerWidth,height:innerHeight,clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,scrollY,workspace:document.body.dataset.workspace,desktop:document.body.dataset.desktop,tool:document.body.dataset.workspaceTool,board:rect('#board'),card:rect('#board-card'),dock:rect('.control-panel'),notes:parseFloat(getComputedStyle(document.querySelector('.notes')).fontSize),toolsWidth:document.querySelector('.desktop-tools').getBoundingClientRect().width,font:document.fonts.check('26px "Nine Realms Numerals"'),controls:[...document.querySelectorAll('#number-pad button,.control-panel .tool-btn,#pause-btn')].filter(e=>!e.hidden).map(e=>{const r=e.getBoundingClientRect();return {id:e.id||e.dataset.value,x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}})}})()`);}
 try{
  for(const [width,height,theme] of [[1920,1080,'ocean'],[1440,900,'nebula'],[1280,720,'ivory'],[390,844,'ivory'],[360,740,'sakura']])for(const large of [false,true]){
   await load(width,height,theme,large);const g=await geometry();measurements.push({theme,large,...g});
   assert.equal(g.workspace,'unified');assert(g.scrollWidth<=width,'page overflow');assert(Math.abs(g.board.width-g.board.height)<1,'square board');const centerOffset=g.desktop==='on'?-(g.toolsWidth+24)/2:0;assert(Math.abs(g.board.x+g.board.width/2-g.clientWidth/2-centerOffset)<1,'centered desktop workspace / centered mobile board');assert(g.card.y>=0,'board begins in normal page flow '+width+'x'+height+' '+large+' '+JSON.stringify(g));assert(g.notes>=10.5,'readable candidates');assert(g.font,'embedded numeral font ready');
   for(const c of g.controls){const min=g.desktop==='on'&&c.id==='pause-btn'?32:44;assert(c.width>=min-.5&&c.height>=min-.5,'usable input target '+JSON.stringify(c));}assert(await run(`[...document.querySelectorAll('.desktop-tools,.control-panel,#play-controls')].every(e=>{const s=getComputedStyle(e);return !/^(auto|scroll)$/.test(s.overflowY)||e.scrollHeight<=e.clientHeight+1})`),'controls use natural page scrolling');
   await click('#appearance-settings summary');const overflow=await run(`(()=>{const p=document.querySelector('.appearance-panel'),h=document.querySelector('.reading-help');return {client:p.clientWidth,scroll:p.scrollWidth,wrap:getComputedStyle(h).whiteSpace,helpClient:h.clientWidth,helpScroll:h.scrollWidth}})()`);assert(overflow.scroll<=overflow.client+1,'appearance overflow '+JSON.stringify(overflow));assert.equal(overflow.wrap,'normal');assert(overflow.helpScroll<=overflow.helpClient+1,'help text wraps without clipping');await click('#appearance-settings summary');
   await shot('layout-'+width+'x'+height+(large?'-large':'')+'-'+theme);
  }
  checks.push('10 measured viewport/theme/font combinations: balanced desktop / centered mobile square board, natural page flow for controls, compact pause and 44px primary targets, removed More Tools entry, embedded font, no page or appearance overflow');

  await load(390,844);let g=await saved(),i=g.board.findIndex(x=>!x),v=g.solution[i];await click('#board [data-index="'+i+'"]');await key(String(v),'Digit'+v,String(v));assert.equal((await saved()).board[i],v);await key('z','KeyZ','',2);assert.equal((await saved()).board[i],0);await key('Z','KeyZ','',10);assert.equal((await saved()).board[i],v);
  await click('#notes-btn');g=await saved();const j=g.board.findIndex((x,k)=>!x&&k!==i),n=g.solution[j];await click('#board [data-index="'+j+'"]');await key(String(n),'Digit'+n,String(n));assert.equal((await saved()).notes[j],1<<(n-1));await key('z','KeyZ','',2);assert.equal((await saved()).notes[j],0);await key('y','KeyY','',2);assert.equal((await saved()).notes[j],1<<(n-1));
  await click('#pause-btn');assert(await run('!document.querySelector("#pause-overlay").hidden'));await click('#resume-btn');
  await run('window.__workspaceReload=true');await send('Page.reload');await waitFor('!window.__workspaceReload&&document.readyState==="complete"&&!!document.querySelector("#resume-btn")&&!document.querySelector("#resume-btn").hidden');await click('#resume-btn');g=await saved();assert.equal(g.board[i],v);assert.equal(g.notes[j],1<<(n-1));
  checks.push('actual pointer/keyboard number and notes entry, Ctrl Z / Shift Z / Y, pause/resume and reload persistence');

  for(const [width,height] of [[1440,900],[1280,720],[390,844],[360,740]]){
   await load(width,height);const prior=await saved();await click('#hint-btn');await waitFor('document.body.dataset.workspaceTool==="hint"');assert.equal(await run('document.getElementById("hint-value").textContent'),String(prior.solution[prior.selected]));for(const field of ['board','notes','history','redo'])assert.deepEqual((await saved())[field],prior[field]);
   let visible=await run(`(()=>{const p=document.querySelector('#hint-panel').getBoundingClientRect(),b=document.querySelector('#board').getBoundingClientRect(),s=document.querySelector('#board .hint-cell').getBoundingClientRect();return {panel:p.toJSON(),board:b.toJSON(),selected:s.toJSON(),height:innerHeight,focus:document.activeElement.id}})()`);
   assert(await run('getComputedStyle(document.querySelector(".control-panel")).display!=="none"'),'result leaves primary input available');assert(visible.panel.y>=0&&visible.panel.bottom<=visible.height+1,'hint card visible '+JSON.stringify(visible));await shot('hint-'+width+'x'+height);await click('#hint-close');assert.equal(await run('document.activeElement.id'),'hint-btn');
   const before=await saved();await click('#lens-rules');await click('#lens-digits [data-digit="4"]');await waitFor('document.querySelector("#candidate-lens").dataset.activeDigit==="4"');const after=await saved();assert.deepEqual(after.board,before.board);assert.deepEqual(after.notes,before.notes);await run('document.querySelector("#candidate-lens").scrollIntoView({block:"nearest"})');
   visible=await run(`(()=>{const s=document.querySelector('#board .selected').getBoundingClientRect(),p=document.querySelector('#candidate-lens').getBoundingClientRect();return {selected:s.toJSON(),panel:p.toJSON(),height:innerHeight}})()`);assert(visible.panel.y>=0,'filter visible after scrolling');assert(visible.panel.bottom<=height+1,'compact lens fits '+JSON.stringify(visible));await shot('filter-'+width+'x'+height);await click('#lens-digits [data-digit="4"]');
   await run('scrollTo(0,0)');await click('#draft-toggle');await waitFor('document.body.dataset.workspaceTool==="draft"');const draft=await run(`(()=>{const p=document.querySelector('#draft-panel').getBoundingClientRect(),s=document.querySelector('#board .selected').getBoundingClientRect();return {panel:p.toJSON(),selected:s.toJSON(),placement:document.querySelector('#draft-panel').dataset.placement}})()`);if(draft.placement!=='docked')assert(draft.selected.y>=0&&draft.selected.bottom<=height,'floating draft target in viewport');assert(!(draft.selected.right>draft.panel.x&&draft.selected.x<draft.panel.right&&draft.selected.bottom>draft.panel.y&&draft.selected.y<draft.panel.bottom),'draft does not cover selected cell');assert(await run('getComputedStyle(document.querySelector(".control-panel")).visibility==="visible"&&getComputedStyle(document.querySelector(".control-panel")).display!=="none"'),'draft keeps controls visible');
   await click('#draft-colors [data-color="2"]');assert.equal((await saved()).draft.colors[(await saved()).selected],2);await shot('draft-'+width+'x'+height);await click('#draft-close');assert.equal(await run('document.activeElement.id'),'draft-toggle');
  }
  checks.push('4 viewports: single-result non-writing hint and focus return; explicit dormant fixtures for rule lens and nonmodal draft');

  await load(1440,900);await click('#draft-toggle');const old=await run('document.querySelector("#draft-panel").getBoundingClientRect().toJSON()');await click('#draft-move');await key('ArrowLeft','ArrowLeft');const moved=await run('document.querySelector("#draft-panel").getBoundingClientRect().toJSON()');assert(moved.x<old.x,'keyboard movable draft');await click('#draft-resize');await key('ArrowRight','ArrowRight','',8);const resized=await run('document.querySelector("#draft-panel").getBoundingClientRect().toJSON()');assert(resized.width>moved.width,'keyboard resizable draft');await click('#draft-close');await click('#draft-toggle');assert.equal(await run('document.querySelector("#draft-panel").dataset.placement'),'manual');await click('#draft-close');
  await click('#batch-toggle');await click('#batch-all');await click('#batch-add');g=await saved();assert(g.notes.some(Boolean));await key('z','KeyZ','',2);assert((await saved()).notes.every(x=>!x));await key('Z','KeyZ','',10);assert.deepEqual((await saved()).notes,g.notes);assert(await run('document.getElementById("batch-panel").hidden'),'undo/redo clears transient multi-selection');
  const backup=await run('(async()=>{NineRealmsHistory.flush();return await NineRealmsBackup.createAsync(localStorage)})()');assert.equal(Object.keys(backup.entries).length,8);assert.deepEqual(backup.entries['nine-realms.sudoku.v1'].game.notes,g.notes);assert(!JSON.stringify(backup).includes('workspaceTool'),'presentation is not persisted');
  checks.push('movable/resizable/session-retained desktop draft; atomic batch undo/redo; actual eight-key backup retains notes without UI state');

  for(const {id:mode} of E.getModes()){
   const initial=await load(1280,900,'nebula',false,'/dist/index.html',mode),layout=E.getLayout(initial.game);
   assert.equal(await run('document.body.dataset.workspace'),'unified');assert.equal(await run('document.body.dataset.desktop'),'on');
   assert((await saved()).board.length===initial.game.board.length);assert(await run('document.documentElement.scrollWidth<=innerWidth'));
   for(const hand of ['right','left']){
    await run(`document.body.dataset.handedness=${JSON.stringify(hand)}`);
    const views=layout.cellCount>81?['all',...layout.boards.map(board=>board.id),'all']:['all'];
    for(const view of views){
     if(layout.cellCount>81)await run(`document.querySelector('#grid-view').value=${JSON.stringify(view)};document.querySelector('#grid-view').dispatchEvent(new Event('change',{bubbles:true}))`);
     await delay(40);await run('scrollTo(0,0)');const before=await saved(),rect=await run('document.querySelector("#board").getBoundingClientRect().toJSON()');
     assert(rect.width>0&&rect.height>0);assert.equal(await run('document.querySelectorAll("#board .cell:not([hidden])").length'),view==='all'?layout.cellCount:81);
     assertSquareRailGeometry(await run('('+readSquareRailGeometry.toString()+')()'),mode+'/'+view+'/'+hand);
     if(initial.game.clues?.outside?.length){
      const gutter=await run(`(()=>{const card=document.querySelector('#board-card').getBoundingClientRect();return [...document.querySelectorAll('#variant-overlay text')].map(e=>{const r=e.getBoundingClientRect();return r.left>=card.left-.5&&r.right<=card.right+.5&&r.top>=card.top-.5&&r.bottom<=card.bottom+.5})})()`);
      assert(gutter.length&&gutter.every(Boolean),'all outside labels fit their retained card gutter: '+mode);
     }
     const target=await run(`(()=>{const g=JSON.parse(localStorage.getItem('nine-realms.sudoku.v1')).game;return [...document.querySelectorAll('#board .cell:not([hidden])')].find(e=>!g.board[Number(e.dataset.index)]).dataset.index})()`);
     await click('#board [data-index="'+target+'"]');await click('#hint-btn');
     assert.equal(await run('document.querySelector("#hint-value").textContent'),String(before.solution[Number(target)]));
     for(const field of ['board','notes','history','redo','clues'])assert.deepEqual((await saved())[field],before[field]);
     assertSquareRailGeometry(await run('('+readSquareRailGeometry.toString()+')()'),mode+'/'+view+'/'+hand+'/hint');
     await click('#hint-close');assert.equal(await run('document.activeElement.id'),'hint-btn');
    }
   }
   await click('#rules-open');assert(await run('document.querySelector("#rules-dialog").open'));await click('#rules-close');
  }
  checks.push('all 33 unified modes, both handedness layouts, every twin/samurai detail and overview, square rail, complete outside labels, read-only selected hints and accessible rules');

  // Identical synthetic puzzle and UI actions, old and new standalone builds.
  for(const [width,height,theme,name] of [[1440,900,'nebula','desktop'],[390,844,'ivory','mobile']])for(const before of (process.env.NINE_REALMS_BEFORE_ROUTE?[true,false]:[false])){
   await load(width,height,theme,false,before?process.env.NINE_REALMS_BEFORE_ROUTE:'/dist/index.html');await run('scrollTo(0,0)');await shot((before?'before-':'after-')+name);
  }
  fs.writeFileSync(path.join(dir,'measurements.json'),JSON.stringify(measurements,null,2));fs.writeFileSync(path.join(dir,'checks.json'),JSON.stringify(checks,null,2));
  console.log('PASS classic workspace Chromium: '+checks.length+' groups; '+measurements.length+' layout combinations. Evidence: '+dir);
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
