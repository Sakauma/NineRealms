'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {launch,fixture}=require('./browser-helper.cjs'),V=require('../src/voyage.js');
const KEY='nine-realms.sudoku.v1',VK='nine-realms.voyage.v1',out=process.env.NINE_REALMS_LESSONS_EVIDENCE;
function progress(count=16){let p={__journey:{version:1,granted:[]}};for(const c of V.chapters().slice(0,count))p=V.award(p,c.id,{elapsedMs:600000,mistakes:0,hints:0});return p;}
function snapshot(id,old=false){
 const s=fixture('mainline-lessons');s.preferences={...s.preferences,theme:'nebula',sound:false,musicEnabled:false};s.game.started=false;
 if(id){const p=old?V.getLegacyPuzzle(id):V.getPuzzle(id);Object.assign(s.game,{puzzleId:p.id,sourceId:p.sourceId,mode:p.mode,difficulty:p.difficulty,clues:p.clues,givens:p.givens,solution:p.solution,board:p.givens.slice(),notes:Array(81).fill(0),selected:p.givens.indexOf(0),voyageId:id});}
 return s;
}
(async()=>{
 const b=await launch({finePointer:true}),report={layouts:[],compatibility:[],flows:[],screenshots:[]};
 const ev=code=>b.evaluate(code),click=id=>ev('document.getElementById('+JSON.stringify(id)+').click()');
 const read=()=>ev('JSON.parse(localStorage.getItem('+JSON.stringify(KEY)+'))');
 function noErrors(){assert.deepEqual(b.events.filter(e=>e.method==='Runtime.exceptionThrown'),[]);}
 async function load(s=snapshot(),route='/src/index.html',count=16){noErrors();await b.loadStorage({[KEY]:JSON.stringify(s),[VK]:JSON.stringify(progress(count))},route);noErrors();}
 async function select(id){await ev(`(()=>{const n=document.querySelector('[data-world-id="${id}"]');n.closest('details').open=true;n.click();})()`);}
 async function shot(name){if(!out)return;fs.mkdirSync(out,{recursive:true});await ev('document.fonts.ready');const result=await b.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});const file=path.join(out,name+'.png');fs.writeFileSync(file,Buffer.from(result.data,'base64'));report.screenshots.push(file);}
 try{
  for(const width of [320,390,768,1440])for(const large of [false,true]){
   await b.send('Emulation.setDeviceMetricsOverride',{width,height:width<500?900:1000,deviceScaleFactor:1,mobile:width<500});
   const s=snapshot();s.preferences.textSize=large?'large':'normal';s.preferences.theme=large?'ivory':'nebula';await load(s,width===390?'/dist/index.html':'/src/index.html');await click('voyage-btn');
   for(const c of V.chapters()){
    await select(c.id);
    assert.equal(await ev('document.getElementById("voyage-observation").textContent'),c.observation);
    assert.match(await ev('document.getElementById("voyage-lesson").textContent'),new RegExp(c.lesson.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
    const m=await ev(`(()=>{const d=document.getElementById('voyage-dialog'),r=d.getBoundingClientRect(),a=document.getElementById('voyage-start').getBoundingClientRect();return{width:innerWidth,large:${large},chapter:${JSON.stringify(c.id)},overflow:d.scrollWidth-d.clientWidth,documentOverflow:document.documentElement.scrollWidth-innerWidth,startVisible:a.top>=r.top&&a.bottom<=r.bottom}})()`);
    assert.equal(m.overflow,0);assert(m.documentOverflow<=0);assert(m.startVisible,JSON.stringify(m));report.layouts.push(m);
   }
   if(!large&&(width===390||width===1440)){
    await load(s,width===390?'/dist/index.html':'/src/index.html',9);await click('voyage-btn');
    await select(width===390?'sums-sparks-v1':'lines-rise-v1');
    await ev('document.querySelector(".voyage-teaching").open=true;document.getElementById("voyage-dialog").scrollTop=0');
    await shot('lesson-'+(width===390?'killer':'thermo')+'-map-'+width);
   }
   noErrors();
  }
  await b.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  for(const id of ['lines-rise-v1','sums-sparks-v1'])for(const old of [false,true])for(const route of ['/src/index.html','/dist/index.html']){
   const s=snapshot(id,old),p=old?V.getLegacyPuzzle(id):V.getPuzzle(id),empty=s.game.givens.indexOf(0);
   s.game.started=true;s.game.elapsedMs=12345;s.game.hints=1;s.game.notes[empty]=3;
   await load(s,route);const before=(await read()).game;
   assert.equal(before.voyageId,id);assert.equal(before.sourceId,p.sourceId);assert.equal(before.puzzleId,p.id);assert.deepEqual(before.clues,p.clues);assert.deepEqual(before.givens,p.givens);assert.equal(before.notes[empty],3);assert.equal(before.elapsedMs,12345);
   await click('resume-btn');await click('voyage-btn');
   assert.match(await ev('document.getElementById("voyage-selected-rule").textContent'),old?/旧版题面/:/教学题面 v2/);
   assert.match(await ev('document.getElementById("voyage-gate").textContent'),/含旧版题面/);
   if(old){assert.doesNotMatch(await ev('document.getElementById("voyage-observation").textContent'),/第8行|左上角/);assert.match(await ev('document.getElementById("voyage-game-badge").textContent'),/旧版题面/);}
   await click('voyage-start');const after=(await read()).game;assert.equal(after.sessionId,before.sessionId);assert.deepEqual(after.board,before.board);assert.deepEqual(after.givens,before.givens);assert.deepEqual(after.clues,before.clues);assert.equal(after.notes[empty],3);
   await click('history-open');const history=await ev('NineRealmsHistory.getSnapshot('+JSON.stringify(before.sessionId)+')');assert.equal(history.game.puzzleId,p.id);assert.equal(history.game.sourceId,p.sourceId);assert.deepEqual(history.game.clues,p.clues);await click('history-close');
   const best=await ev('JSON.parse(localStorage.getItem('+JSON.stringify(VK)+'))');assert.deepEqual(best,progress());
   report.compatibility.push({id,old,route,sessionId:before.sessionId,sourceId:after.sourceId});noErrors();
  }
  for(const id of ['lines-rise-v1','sums-sparks-v1']){
   const detached=snapshot(id);detached.game.voyageId=null;await load(detached,'/dist/index.html');
   assert.equal((await read()).game.sourceId,V.getPuzzle(id).sourceId);assert.equal((await read()).game.voyageId,null);
   report.flows.push('independent copy retains new source identity '+id);
  }
  for(const [id,width] of [['lines-rise-v1',1440],['sums-sparks-v1',390]]){
   await b.send('Emulation.setDeviceMetricsOverride',{width,height:width<500?900:1000,deviceScaleFactor:1,mobile:width<500});
   await load(snapshot(),'/dist/index.html',9);await click('voyage-btn');await select(id);await click('voyage-start');
   const game=(await read()).game,p=V.getPuzzle(id);assert.equal(game.puzzleId,p.id);assert.equal(game.sourceId,p.sourceId);assert.equal(game.started,false);assert.deepEqual(game.givens,p.givens);await click('start-btn');
   await ev('document.querySelectorAll("#board .cell")['+(id==='lines-rise-v1'?68:1)+'].click();window.scrollTo(0,0)');
   await shot('lesson-'+(id==='lines-rise-v1'?'thermo':'killer')+'-board-'+width);
   report.flows.push('actual prepare/start '+id+' uses new identity');noErrors();
   // Feed the known answer only to exercise completion/persistence, not to prove logic.
   await ev(`(()=>{const g=JSON.parse(localStorage.getItem('${KEY}')).game;g.givens.forEach((v,i)=>{if(!v){document.querySelectorAll('#board .cell')[i].click();document.dispatchEvent(new KeyboardEvent('keydown',{key:String(g.solution[i]),bubbles:true,cancelable:true}));}});})()`);
   const completed=(await read()).game;assert(completed.completed);assert.equal(completed.puzzleId,p.id);assert.equal(completed.sourceId,p.sourceId);
   const awards=await ev('JSON.parse(localStorage.getItem('+JSON.stringify(VK)+'))');assert.equal(awards[id].stars,3);
   for(const [key,value] of Object.entries(progress(9)))assert.deepEqual(awards[key],value,'earlier chapter record '+key);
   await click('play-again');const next=(await read()).game;assert.equal(next.voyageId,id==='lines-rise-v1'?'lines-mirror-v1':'sums-arrows-v1');assert.equal(next.started,false);
   report.flows.push('automated completion awards only '+id+', retains its source and prepares its next stage');noErrors();
  }
  await b.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await load();await click('voyage-btn');
  await ev('document.querySelector("[data-music-preview]").closest("details").open=true;document.querySelector("[data-music-preview]").click()');
  let text=await ev('document.getElementById("voyage-music-status").textContent');assert.match(text,/关闭星图后.*外观设置.*背景音乐.*声音/);assert.equal((await read()).preferences.musicEnabled,false);assert.equal(await ev('NineRealmsAtmosphere.musicStatus().playing'),false);
  await ev('document.getElementById("voyage-music-status").scrollIntoView({block:"center"})');await shot('bgm-disabled-settings-path-1440');
  await click('voyage-close');await ev('document.getElementById("appearance-settings").open=true');await click('music-toggle');
  assert.match(await ev('document.getElementById("music-status").textContent'),/本面板.*声音/);
  await ev('document.getElementById("appearance-settings").open=false');await click('voyage-btn');await ev('document.querySelector("[data-music-preview]").click()');
  assert.match(await ev('document.getElementById("voyage-music-status").textContent'),/关闭星图后.*外观设置.*声音/);assert.equal(await ev('NineRealmsAtmosphere.musicStatus().playing'),false);
  report.flows.push('BGM audition stays off and names reachable settings for independent and master switches');
  noErrors();if(out)fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify(report,null,2));
  console.log('PASS voyage lessons browser: '+report.layouts.length+' chapter layouts; '+report.compatibility.length+' old/new source/bundle resume and history cases; actual new-board launch, unchanged bests, precise BGM off paths; '+report.screenshots.length+' real screenshots.');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
