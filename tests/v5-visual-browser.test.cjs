/* Real Chromium render/input evidence. Never substitutes jsdom for pixels. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {launch,fixture}=require('./browser-helper.cjs'),E=require('../src/engine');
const {readSquareRailGeometry,assertSquareRailGeometry}=require('./square-rail-geometry.cjs');
const fixed=require('./fixtures/v5-visual-puzzles.json');
const root=path.resolve(__dirname,'..'),out=path.join(root,'evidence/v5-browser'),route=process.env.V5_VISUAL_ROUTE||'/dist/index.html';
if(!['/dist/index.html','/src/index.html'].includes(route))throw Error('Only local source or built routes are supported');
const profiles=[
 {id:'desktop-light-100',width:1440,height:1000,dpr:1,theme:'ivory',description:'Desktop Linux Chromium, 100% CSS viewport'},
 {id:'desktop-dark-125-equivalent',width:1093,height:614,dpr:1.25,theme:'nebula',description:'1366x768 at effective 125% CSS viewport/DPR equivalence; NOT native browser menu zoom'},
 {id:'portrait-light-emulated',width:390,height:844,dpr:2,theme:'ivory',description:'Narrow portrait viewport + touch emulation; NOT physical phone testing'}
];
fs.mkdirSync(out,{recursive:true});
const report={status:'not-run',route,platform:process.platform,profiles,fixtures:fixed.puzzles.map(p=>({mode:p.mode,id:p.id,version:p.generation.version})),cases:[],failures:[],screenshots:[],limitations:['Not Windows/Tauri/Electron packaged-app verification.','Not a physical phone, actual OS scaling, native browser menu zoom or GPU matrix.','Geometry/input assertions and screenshots do not certify aesthetic quality or digit/candidate/line clarity; human image review is required.']};
function save(){fs.writeFileSync(path.join(out,'visual-report.json'),JSON.stringify(report,null,2));}
function snapshot(p,profile){
 const s=fixture('v5-isolated-visual-state'),context={mode:p.mode,clues:p.clues};
 Object.assign(s.preferences,{theme:profile.theme,fx:false,zenMotion:false,sound:false,music:false,lineContrast:'standard'});
 const onLines=new Set(p.clues.lines.flatMap(l=>l.cells)),ordered=p.givens.map((n,i)=>i).filter(i=>!p.givens[i]).sort((a,b)=>Number(onLines.has(b))-Number(onLines.has(a)));
 const noteCells=new Set(ordered.slice(0,30));for(const b of E.getLayout(p.mode).boards)for(const i of b.cells.filter(i=>!p.givens[i]).slice(0,8))noteCells.add(i);
 const notes=p.givens.map(()=>0);for(const i of noteCells){const candidates=E.candidates(p.givens,i,context);notes[i]=candidates.slice(0,5).reduce((mask,n)=>mask|(1<<(n-1)),0);}
 Object.assign(s.game,{sessionId:'v5-visual-'+p.mode+'-'+profile.id,puzzleId:p.id,sourceId:p.sourceId,mode:p.mode,difficulty:p.difficulty,clues:p.clues,givens:p.givens,solution:p.solution,generation:p.generation,board:p.givens.slice(),notes,selected:ordered[0],started:true,paused:false,completed:false,history:[],branch:null});return s;
}
function measure(){
 const rect=e=>e.getBoundingClientRect().toJSON(),shown=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
 const cells=[...document.querySelectorAll('#board .cell')],visible=cells.filter(shown),glyphs=[];
 for(const cell of visible)for(const el of cell.querySelectorAll('.value,.notes>span')){
  if(!el.textContent.trim()||!shown(el))continue;
  if(el.parentElement.classList.contains('notes')&&(!shown(el.parentElement)||Number(getComputedStyle(el.parentElement).opacity)===0))continue;
  const range=document.createRange();range.selectNodeContents(el);const g=range.getBoundingClientRect();if(g.width&&g.height)glyphs.push({index:Number(cell.dataset.index),kind:el.classList.contains('value')?'digit':'candidate',text:el.textContent.trim(),bounds:g.toJSON(),cell:rect(cell)});
 }
 return {innerWidth,innerHeight,scrollWidth:document.documentElement.scrollWidth,desktop:document.body.dataset.desktop,multi:document.body.dataset.multi,cells:cells.length,visibleCells:visible.map(c=>Number(c.dataset.index)),board:rect(document.querySelector('#board')),keys:[...document.querySelectorAll('#number-pad button')].map(rect),glyphs,primaryLines:[...document.querySelectorAll('[data-line-index][data-line-cells]')].map(e=>({index:Number(e.dataset.lineIndex),type:e.dataset.lineType,cells:e.dataset.lineCells,tag:e.tagName})),notesButton:document.getElementById('notes-btn').getAttribute('aria-pressed')};
}
(async()=>{
 let b;
 try{
  if(!fs.existsSync(path.join(root,route.slice(1)))){report.status='blocked-build-missing';report.reason='Build the current v5 standalone page before browser acceptance.';save();process.exitCode=2;return;}
  try{b=await launch({finePointer:true});}catch(error){report.status='blocked-environment';report.reason=error.message;report.actualRenderedScreenshots=0;save();process.exitCode=2;console.error('BLOCKED real Chromium startup:',error.message);return;}
  report.browser=await b.send('Browser.getVersion');
  async function click(selector){const p=await b.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing click target');e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);await b.send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});}
  async function shot(name){await b.evaluate('scrollTo(0,0)');const m=await b.send('Page.getLayoutMetrics'),size=m.cssContentSize||m.contentSize,height=Math.min(2500,Math.ceil(size.height));const s=await b.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:Math.ceil(size.width),height,scale:1}});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(s.data,'base64'));report.screenshots.push({file:name+'.png',fullPageCappedAt2500:height<size.height});}
  for(const p of fixed.puzzles)for(const profile of profiles){
   const entry={mode:p.mode,profile:profile.id,status:'pending'};report.cases.push(entry);
   try{
    assert.equal(p.generation.version,5);assert(E.validateComplete(p.solution,{mode:p.mode,clues:p.clues}));
    await b.send('Emulation.setDeviceMetricsOverride',{width:profile.width,height:profile.height,deviceScaleFactor:profile.dpr,mobile:profile.width<600});
    await b.send('Emulation.setTouchEmulationEnabled',{enabled:profile.width<600});
    await b.load(snapshot(p,profile),route);await click('#resume-btn');await b.evaluate('document.fonts.ready');await b.evaluate('scrollTo(0,0)');
    const before=await b.evaluate('('+measure.toString()+')()');entry.geometry=before;
    const saved=await b.evaluate('JSON.parse(localStorage.getItem("nine-realms.sudoku.v1")).game');assert.equal(saved.mode,p.mode);assert.equal(saved.generation.version,5,'current app must accept v5, not silently restore a bank game');assert.deepEqual(saved.givens,p.givens);
    assert.equal(before.cells,p.givens.length);assert.equal(before.keys.length,9);assert(before.scrollWidth<=before.innerWidth+1,'horizontal viewport overflow');assert(before.glyphs.some(g=>g.kind==='digit'),'digits rendered');assert(before.glyphs.some(g=>g.kind==='candidate'),'candidate glyphs rendered');
    for(const g of before.glyphs){const a=g.bounds,c=g.cell;assert(a.left>=c.left-1&&a.right<=c.right+1&&a.top>=c.top-1&&a.bottom<=c.bottom+1,'glyph escaped cell '+g.index);}
    if(before.desktop==='on')assertSquareRailGeometry(await b.evaluate('('+readSquareRailGeometry.toString()+')()'),p.mode+'/'+profile.id);
    for(let i=0;i<p.clues.lines.length;i++)assert(before.primaryLines.some(l=>l.index===i&&l.cells===p.clues.lines[i].cells.join(',')),'rule path geometry matches its source cells');
    await shot(p.mode+'-'+profile.id+'-candidates');
    const lineCells=new Set(p.clues.lines.flatMap(l=>l.cells)),blank=before.visibleCells.filter(i=>!p.givens[i]),index=blank.find(i=>lineCells.has(i))??blank[0];assert(Number.isInteger(index),'visible editable cell');
    if(before.notesButton==='true')await click('#notes-btn');await click('#board .cell[data-index="'+index+'"]');await click('#number-pad button[data-value="'+p.solution[index]+'"]');
    await b.waitFor('JSON.parse(localStorage.getItem("nine-realms.sudoku.v1")).game.board['+index+']==='+p.solution[index]);
    entry.filled={index,value:p.solution[index],onRuleLine:lineCells.has(index)};await shot(p.mode+'-'+profile.id+'-filled');
    if(p.givens.length>81){const options=await b.evaluate('[...document.querySelector("#grid-view").options].map(o=>o.value)');assert(options.includes('all'));entry.multiViews=options;await b.evaluate('(()=>{const e=document.querySelector("#grid-view");e.value="all";e.dispatchEvent(new Event("change",{bubbles:true}));})()');await shot(p.mode+'-'+profile.id+'-overview');}
    const errors=b.events.filter(e=>e.method==='Runtime.exceptionThrown');assert.equal(errors.length,0,'uncaught browser exceptions');entry.status='automated-checks-passed-manual-image-review-required';
   }catch(error){entry.status='failed';entry.error=error.stack||error.message;report.failures.push({mode:p.mode,profile:profile.id,error:error.message});try{await shot(p.mode+'-'+profile.id+'-failure');}catch{} }
   save();
  }
  report.actualRenderedScreenshots=report.screenshots.length;report.status=report.failures.length?'failed':'automated-checks-passed-manual-image-review-required';save();if(report.failures.length)process.exitCode=1;console.log(JSON.stringify({status:report.status,cases:report.cases.length,screenshots:report.screenshots.length,failures:report.failures}));
 }finally{if(b)await b.close();}
})().catch(error=>{report.status='failed';report.reason=error.stack||error.message;save();console.error(error);process.exitCode=1;});
