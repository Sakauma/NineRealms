/* Removed advanced tools are explicitly re-enabled only for dormant regression fixtures. */
/* Actual desktop composition, resizing and input in Chromium; no mock DOM. */
'use strict';
const {enableDormantTools}=require('./dormant-tools-fixture.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {launch,fixture,delay}=require('./browser-helper.cjs');
const {keypadMetrics}=require('./tactile-keypad-metrics.cjs');
const {readSquareRailGeometry,assertSquareRailGeometry}=require('./square-rail-geometry.cjs');
(async()=>{
 const b=await launch(),{evaluate:run,send,waitFor}=b;
 const out=process.env.NINE_REALMS_DESKTOP_EVIDENCE_DIR||path.join(b.root,'evidence','desktop-workspace');fs.mkdirSync(out,{recursive:true});
 const records=[],checks=[];
 async function metrics(width,height,scale=1){await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:scale,mobile:width<768});await delay(80);}
 async function click(selector){
  if(await run(`!!document.querySelector(${JSON.stringify(selector)})?.closest('#more-tools-panel[hidden]')`)) { await enableDormantTools(run); await click('#more-tools-toggle'); }
const p=await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,h=document.elementFromPoint(x,y);return {x,y,visible:r.width>0&&r.height>0&&!!h&&(e===h||e.contains(h)),disabled:!!e.disabled}})()`);assert(p.visible&&!p.disabled,'pointer target '+selector);await send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',clickCount:1});await delay(40);}
 async function key(key,code,text='',modifiers=0){await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,modifiers,...(text?{text,unmodifiedText:text}:{})});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code});await delay(40);}
 const saved=()=>run('JSON.parse(localStorage.getItem("nine-realms.sudoku.v1")).game');
 const puzzleState=g=>({board:g.board,notes:g.notes,draft:g.draft,branches:g.branches,branch:g.branch,history:g.history,redo:g.redo});
 async function load(w=1440,h=900,preferences={},resume=true){await metrics(w,h);const s=fixture('ui-audit-classic');Object.assign(s.preferences,{sound:false,...preferences});await b.load(s,'/dist/index.html');if(resume)await click('#resume-btn');await run('document.fonts.ready');await run('scrollTo(0,0)');return s;}
 async function shot(name){await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:0,y:0});await delay(80);const p=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(p.data,'base64'));}
 async function geometry(){return run(`(()=>{
  const r=s=>{const e=document.querySelector(s),v=e.getBoundingClientRect();return {...v.toJSON(),documentY:v.y+scrollY}}, id=e=>e.id||e.className;
  const scrollable=e=>{const s=getComputedStyle(e);return /^(auto|scroll)$/.test(s.overflowY)&&e.scrollHeight>e.clientHeight+1};
  return {desktop:document.body.dataset.desktop,hand:document.body.dataset.handedness,workspace:document.body.dataset.workspace,width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,
   header:r('.topbar'),extras:r('.scene-drawer'),board:r('#board-card'),grid:r('#board-grid-shell'),context:r('.desktop-context'),tools:r('.desktop-tools'),pad:r('#number-pad'),padHeading:r('.pad-heading'),heading:r('.desktop-heading'),status:r('.desktop-status'),controls:r('.control-panel'),shortcuts:r('.keyboard-guide'),stats:r('.stats'),progress:r('.board-bottomline'),difficulty:r('.difficulty-wrap'),mode:r('#mode-picker-open'),rules:r('#rules-open'),newGame:r('#new-game'),
   toolButtons:[...document.querySelectorAll('#play-controls>.tool-btn')].map(e=>({id:e.id,...e.getBoundingClientRect().toJSON()})),keys:[...document.querySelectorAll('#number-pad button')].map(e=>e.getBoundingClientRect().toJSON()),
   railOrder:[...document.querySelector('.desktop-tools').children].map(id),controlOrder:[...document.querySelector('#play-controls').children].filter(e=>!e.hidden&&e.matches('button,.pad-heading,#number-pad')).map(id),
   padHeadingVisible:getComputedStyle(document.querySelector('.pad-heading')).clipPath==='none'&&getComputedStyle(document.querySelector('.pad-heading')).position==='static',
   nestedScroll:[...document.querySelectorAll('.desktop-tools,.control-panel,#play-controls,#number-pad')].some(scrollable),boardPosition:getComputedStyle(document.querySelector('.desktop-board-area')).position,
   unique:[...document.querySelectorAll('[id]')].map(e=>e.id).filter((id,i,a)=>a.indexOf(id)!==i),settingsParent:document.querySelector('#puzzle-settings').parentElement.className,hintParent:document.querySelector('#hint-panel').parentElement.id || document.querySelector('#hint-panel').parentElement.className};
 })()`);}
 const close=(a,b,label)=>assert(Math.abs(a-b)<.1,label+': '+a+' vs '+b);
 function stableGeometry(a,b,label){for(const name of ['board','grid','pad','controls'])for(const key of ['x','documentY','width','height'])close(a[name][key],b[name][key],label+' '+name+' '+key);}
 async function privacy(expected){
  const cover=await run(`(()=>{const shell=document.querySelector('#board-grid-shell'),overlay=document.querySelector('#pause-overlay'),card=overlay.querySelector('.pause-card'),s=getComputedStyle(overlay,'::before');return {
   state:document.body.dataset.gameState,desktop:document.body.dataset.desktop,visible:!overlay.hidden,shellVisibility:getComputedStyle(shell).visibility,
   privateNodes:[...shell.querySelectorAll('.cell,.value,.notes,#draft-overlay,#variant-overlay')].every(e=>getComputedStyle(e).visibility==='hidden'),
   coverHasPuzzle:!!overlay.querySelector('.cell,.value,.notes,[data-index],#board,#draft-overlay,#variant-overlay'),
   cardContainsControls:['pause-title','pause-description','start-btn','resume-btn'].every(id=>card.contains(document.getElementById(id))),
   startVisible:!document.querySelector('#start-btn').hidden,resumeVisible:!document.querySelector('#resume-btn').hidden,
   scaffold:s.backgroundImage,scaffoldSize:s.backgroundSize,scaffoldContent:s.content,scaffoldPointer:s.pointerEvents,
   keysDisabled:[...document.querySelectorAll('#number-pad button')].every(e=>e.disabled)};})()`);
  assert.equal(cover.state,expected);assert(cover.visible&&cover.privateNodes&&cover.cardContainsControls&&cover.keysDisabled,'private puzzle and real pause controls');
  assert.equal(cover.shellVisibility,'hidden','hide the actual board, notes and overlays without removing layout');assert(!cover.coverHasPuzzle,'cover never copies puzzle cells or candidates');
  assert.equal(cover.startVisible,expected==='ready');assert.equal(cover.resumeVisible,expected==='paused');
  if(cover.desktop==='on'){assert.notEqual(cover.scaffold,'none','CSS scaffold remains behind pause card');assert.match(cover.scaffoldSize,/11\.1111/,'nine-by-nine scaffold');assert.equal(cover.scaffoldContent,'""');assert.equal(cover.scaffoldPointer,'none');}
  return cover;
 }
 function desktopLayout(g){
  assert.equal(g.desktop,'on');assert.equal(g.settingsParent,'desktop-context');assert.equal(g.hintParent,'play-controls');assert.deepEqual(g.unique,[],'no cloned IDs');
  const expected=keypadMetrics(g.width,g.height);close(g.tools.width,expected.rail,'bounded adaptive rail width');close(g.hand==='left'?g.board.left-g.tools.right:g.tools.left-g.board.right,24,'board to rail gutter');
  close(g.tools.y,g.board.y,'board and rail share top');close(g.hand==='left'?g.tools.right-g.controls.right:g.controls.left-g.tools.left,19,'board-facing rail divider and inset');close(g.hand==='left'?g.controls.left:g.controls.right,g.hand==='left'?g.tools.left:g.tools.right,'controls align with outer rail edge');
  close(g.board.left,g.context.left,'mode toolbar starts at board edge');close(g.board.right,g.context.right,'rules toolbar ends at board edge');close(g.board.y-g.context.bottom,16,'heading gutter');
  close(g.difficulty.left,g.controls.left,'difficulty aligns with rail contents');close(g.difficulty.right,g.controls.right,'difficulty fills rail contents');
  assert(g.mode.left>=g.context.left&&g.mode.right<=g.rules.left,'mode and rules share top board row');assert(g.rules.right<=g.context.right+.1);assert(g.difficulty.bottom<=g.tools.top,'difficulty stays above rail');
  assert.deepEqual(g.railOrder,['stats','control-panel','board-bottomline','keyboard-guide'],'session, controls, progress, shortcuts; bounded hint replaces final action row');
  close(g.stats.y,g.tools.y,'stats start rail');assert(g.stats.bottom<g.controls.top,'stats precede controls');assert(g.progress.top>=g.controls.bottom,'progress follows controls');assert(g.shortcuts.top>=g.progress.bottom,'shortcuts follow progress');
  assert.deepEqual(g.controlOrder,['undo-btn','redo-btn','erase-btn','notes-btn','hint-btn','pad-heading','number-pad','new-game'],'grouped controls retain their original nodes');
  const [undo,redo,erase,notes,hint]=g.toolButtons;
  for(const t of [redo,erase,notes,hint]){close(t.top,undo.top,'five routine actions share row');assert(t.width>=44&&t.height>=44,'routine actions keep 44px targets');}
  assert(g.padHeading.top>=notes.bottom+9.9&&g.padHeadingVisible,'visible heading follows notes and hint');assert(g.pad.top>=g.padHeading.bottom+9.9,'keypad follows visible label');
  for(let i=0;i<9;i++){const k=g.keys[i];close(k.height,expected.keyHeight,'width-derived square key height');close(k.width,expected.keyWidth,'rail key width');close(k.width,k.height,'square key');assert(k.width>=83-.1&&k.height>=83-.1,'primary controls retain large square targets');close(k.y,g.keys[Math.floor(i/3)*3].y,'three key columns');if(i>=3)close(k.y-g.keys[i-3].bottom,10,'key row gap');if(i%3)close(k.x-g.keys[i-1].right,10,'key column gap');}
  close(undo.left,g.pad.left,'action row starts at keypad edge');close(hint.right,g.pad.right,'action row ends at keypad edge');
  for(let i=1;i<5;i++){close(g.toolButtons[i].left-g.toolButtons[i-1].right,6,'compact action gap');close(g.toolButtons[i].width,undo.width,'five equal action widths');}
  for(const t of [g.newGame]){close(t.left,g.pad.left,'full-width action left edge');close(t.right,g.pad.right,'full-width action right edge');}
  assert(g.newGame.top>=g.pad.bottom+9.9,'New Game is the final primary action');
  const left=Math.min(g.board.left,g.tools.left),right=Math.max(g.board.right,g.tools.right);for(const section of [g.header,g.extras]){close(section.left,left,'workspace left edge');close(section.right,right,'workspace right edge');}
  close(g.board.width,expected.board,'width-aware board capped at 620px');close(g.board.width,g.board.height,'square board');assert(!g.overflow&&!g.nestedScroll,'natural page scrolling without horizontal or inner overflow');assert.equal(g.boardPosition,'static');
 }
 try{
  for(const [w,h] of [[1280,720],[1440,900],[1920,1080],[390,844]])for(const hand of ['right','left']){
   await load(w,h,{handedness:hand},false);const covered=await geometry();await privacy('paused');await shot('paused-'+w+'x'+h+'-'+hand);
   await click('#resume-btn');await run('scrollTo(0,0)');const resumed=await geometry();stableGeometry(covered,resumed,'initial resume');assert.equal(await run('getComputedStyle(document.querySelector("#board-grid-shell")).visibility'),'visible');
   assert(await run('document.getElementById("more-tools-toggle").hidden&&document.getElementById("more-tools-toggle").disabled&&document.getElementById("more-tools-panel").inert'));await run('scrollTo(0,0)');const g=await geometry();records.push(g);
   if(w>=980){desktopLayout(g);const rail=await run('('+readSquareRailGeometry.toString()+')()');assertSquareRailGeometry(rail,w+'x'+h+' '+hand);records.push({rail});}else{assert.equal(g.desktop,'off');assert.equal(await run('document.querySelector("#puzzle-settings").parentElement.tagName'),'MAIN');assert.equal(await run('document.querySelector("#new-game").parentElement.className'),'game-actions');assert(!g.overflow);}
   const puzzle=puzzleState(await saved());await click('#pause-btn');await privacy('paused');const paused=await geometry();stableGeometry(g,paused,'pause');
   await key('1','Digit1','1');assert.deepEqual(puzzleState(await saved()),puzzle,'paused keyboard input cannot edit puzzle');
   await click('#resume-btn');await run('scrollTo(0,0)');stableGeometry(g,await geometry(),'repeat resume');assert.deepEqual(puzzleState(await saved()),puzzle,'pause/resume preserves notes and history');await shot('desktop-'+w+'x'+h+'-'+hand);
  }
  checks.push('Both handedness modes at 1280x720, 1440x900, 1920x1080 and 390x844: bottom-aligned adaptive rail, 24px gutter, square glass keys, unchanged mobile order, no inner scroll, and stable private pause/resume geometry.');
  for(const [w,h] of [[1440,900],[390,844]])for(const hand of ['right','left']){
   await metrics(w,h);const ready=fixture('ready-privacy');ready.game.started=false;Object.assign(ready.preferences,{handedness:hand,sound:false});await b.load(ready,'/dist/index.html');await run('document.fonts.ready');await run('scrollTo(0,0)');await privacy('ready');const before=await geometry();
   await click('#start-btn');await run('scrollTo(0,0)');stableGeometry(before,await geometry(),'start');assert.equal(await run('getComputedStyle(document.querySelector("#board-grid-shell")).visibility'),'visible');assert.equal((await saved()).started,true);
  }
  checks.push('Ready state also hides the real board and uses the original start control; starting preserves board and keypad geometry on desktop and mobile, both handedness modes.');
  await load();let g=await saved(),i=g.board.findIndex(v=>!v),v=g.solution[i];await click('#board [data-index="'+i+'"]');await click('#number-pad [data-value="'+v+'"]');assert.equal((await saved()).board[i],v);await key('z','KeyZ','',2);assert.equal((await saved()).board[i],0);await key('y','KeyY','',2);assert.equal((await saved()).board[i],v);
  await key('n','KeyN','n');assert.equal(await run('document.querySelector("#notes-btn").getAttribute("aria-pressed")'),'true');g=await saved();const j=g.board.findIndex((n,k)=>!n&&k!==i);await click('#board [data-index="'+j+'"]');await key('4','Digit4','4');assert.equal((await saved()).notes[j],8);await click('#erase-btn');assert.equal((await saved()).notes[j],0);await key('z','KeyZ','',2);assert.equal((await saved()).notes[j],8);
  const selected=(await saved()).selected;await key('ArrowDown','ArrowDown');assert.equal((await saved()).selected,selected+9);await click('#pause-btn');assert(await run('!document.querySelector("#pause-overlay").hidden'));await click('#resume-btn');
  checks.push('desktop pointer keypad, keyboard numbers/N/arrows, erase, Ctrl Z/Y and pause/resume');
  // Resizing moves the same live nodes and never changes the puzzle, notes or history.
  await click('#board [data-index="'+j+'"]');await run('window.__originalWorkspaceNodes=[document.querySelector("#board"),document.querySelector("#number-pad"),document.querySelector("#puzzle-settings")]');const before=puzzleState(await saved());
  for(const [w,h] of [[390,844],[360,740],[1440,900],[1024,576],[853,480],[1280,720]]){
   await metrics(w,h);await run('scrollTo(0,0)');await delay(70);const m=await geometry();records.push(m);assert(!m.overflow,'resize overflow '+w);assert.deepEqual(m.unique,[]);assert.deepEqual(puzzleState(await saved()),before,'resize preserves game');assert(await run('window.__originalWorkspaceNodes.every(e=>e.isConnected)&&window.__originalWorkspaceNodes[0]===document.querySelector("#board")&&window.__originalWorkspaceNodes[1]===document.querySelector("#number-pad")&&window.__originalWorkspaceNodes[2]===document.querySelector("#puzzle-settings")'),'original nodes retained');
   if(w>=980&&h>=560)assert.equal(m.desktop,'on');else{assert.equal(m.desktop,'off');assert(await run('document.querySelector("#puzzle-settings").parentElement.tagName==="MAIN"'));}
  }
  checks.push('live desktop/mobile/short-window transitions preserve original nodes, board/notes/draft/branches/history, and mobile DOM order');
  // These are effective CSS viewport/DPR equivalents of browser zoom, not native Chrome menu zoom.
  for(const [w,h,scale,label] of [[1152,720,1.25,'1440 at 125%'],[1024,576,1.25,'1280 at 125%'],[1280,720,1.5,'1920 at 150%'],[853,480,1.5,'1280 at 150%']]){
   await load(w,h,{textSize:'large'});await metrics(w,h,scale);await run('scrollTo(0,0)');const m=await geometry();records.push({...m,zoomEquivalent:label,deviceScaleFactor:scale});assert(!m.overflow,label);if(m.desktop==='on'){assertSquareRailGeometry(await run('('+readSquareRailGeometry.toString()+')()'),label);assert(!m.nestedScroll,label+' controls remain in page flow');}await click('#notes-btn');await click('#notes-btn');await click('#rules-open');assert(await run('document.querySelector("#rules-dialog").open'));await click('#rules-close');
  }
  checks.push('125%/150% effective CSS viewport+DPR equivalents, large text, no horizontal overflow and reachable notes/rules; short/narrow window scrolls');
  await load(1440,900,{handedness:'left',theme:'nebula'});let m=await geometry();assert(m.tools.right<m.board.left&&m.context.left===m.board.left,'left-hand arrangement');await click('#draft-toggle');await waitFor('document.body.dataset.workspaceTool==="draft"');let p=await run('document.querySelector("#draft-panel").getBoundingClientRect().toJSON()');m=await geometry();assert(p.right<=m.board.left-12,'left draft does not cover board');await click('#draft-close');
  await click('#appearance-settings summary');await click('[data-reading-pref="handedness"][data-reading-value="right"]');await click('#appearance-settings summary');await click('#draft-toggle');p=await run('document.querySelector("#draft-panel").getBoundingClientRect().toJSON()');m=await geometry();assert(p.left>=m.board.right+12,'right draft does not cover board');await click('#draft-close');
  checks.push('left/right handed desktop layout and automatic nonoverlapping draft placement');
  await load(1280,720);const resting=await geometry();await click('#explore-settings summary');await click('#branch-btn');await run('scrollTo(0,0)');await waitFor('!document.querySelector("#branch-banner").hidden');m=await geometry();close(m.board.width,resting.board.width,'branch alert never shrinks board');assert(!m.nestedScroll,'branch alert uses page flow');assertSquareRailGeometry(await run('('+readSquareRailGeometry.toString()+')()'),'branch alert');assert.equal(m.context.x,resting.context.x,'status changes keep context column anchored');assert.equal(m.tools.x,resting.tools.x,'status changes keep tool column anchored');assert(await run('document.querySelector("#branch-banner").parentElement.className==="desktop-board-alerts"'));await shot('desktop-branch-1280');await click('#branch-rollback');
  await click('#logic-toggle');await run('scrollTo(0,0)');await delay(80);m=await geometry();close(m.board.width,resting.board.width,'logic badge never shrinks board');assertSquareRailGeometry(await run('('+readSquareRailGeometry.toString()+')()'),'logic badge');assert(await run('!document.querySelector("#logic-badge").hidden'));await shot('desktop-logic-1280');
  const backup=await run('(async()=>{NineRealmsHistory.flush();return await NineRealmsBackup.createAsync(localStorage)})()');assert.equal(Object.keys(backup.entries).length,8);assert(!JSON.stringify(backup).includes('desktop-context'));checks.push('active assumption banner and logic badge retain full-size board with page scrolling; eight-key backup excludes presentation state');
  const errors=b.events.filter(e=>e.method==='Runtime.exceptionThrown');assert.deepEqual(errors,[],'no unhandled runtime exceptions');
  fs.writeFileSync(path.join(out,'measurements.json'),JSON.stringify(records,null,2));fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify(checks,null,2));console.log('PASS desktop workspace Chromium: '+checks.length+' groups; '+records.length+' measured states. Evidence: '+out);
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
