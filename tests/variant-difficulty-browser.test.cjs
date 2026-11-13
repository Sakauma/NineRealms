'use strict';
const assert=require('node:assert/strict');
const {launch,fixture}=require('./browser-helper.cjs'),E=require('../src/engine.js'),H=require('../src/hints.js'),G=require('../src/generator.js'),B=require('../src/backup.js');
const KEY=B.keys[0];
function snapshot(mode){const s=fixture('browser-calibration-'+mode),p=E.getPuzzle('easy','browser-calibration-'+mode,mode);Object.assign(s.game,{mode,difficulty:'easy',clues:p.clues,puzzleId:p.id,sourceId:p.sourceId,givens:p.givens,solution:p.solution,board:p.givens.slice(),notes:p.givens.map(()=>0),started:false,elapsedMs:0,selected:p.givens.indexOf(0)});return s;}
(async()=>{
 const b=await launch(),report={calibrated:[],fallbacks:[],legacy:true,unsupported:true};
 const ev=code=>b.evaluate(code),click=id=>ev('document.getElementById('+JSON.stringify(id)+').click();void 0'),read=async()=>JSON.parse(await ev('localStorage.getItem('+JSON.stringify(KEY)+')'));
 try{
  for(const mode of H.ratingModes.filter(m=>m!=='classic')){
   await b.load(snapshot(mode),'/dist/index.html');
   for(const difficulty of ['easy','medium','hard']){
    await ev('NineRealmsGenerator.seed=()=>'+JSON.stringify('real-worker-'+mode+'-'+difficulty)+';');
    if(difficulty==='easy')await click('new-game');else await ev('document.getElementById("difficulty").value='+JSON.stringify(difficulty)+';document.getElementById("difficulty").dispatchEvent(new Event("change",{bubbles:true}));');
    await b.waitFor('document.getElementById("new-game").getAttribute("aria-busy")!=="true"&&JSON.parse(localStorage.getItem('+JSON.stringify(KEY)+')).game.difficulty==='+JSON.stringify(difficulty));
    const saved=await read(),g=saved.game;
    if(g.generation){assert.equal(g.generation.version,2);assert.equal(g.generation.difficultyBasis,'supported-logic');assert.equal(G.ratingTier(H.ratePuzzle(g.givens,{mode,clues:g.clues},{timeLimitMs:1000})),difficulty);assert.match(await ev('document.getElementById("puzzle-bank-status").textContent'),/技巧校准/);B.validateWindow(saved);report.calibrated.push(mode+'/'+difficulty);}
    else{assert.match(await ev('document.getElementById("status-message").textContent'),/未能.*技巧校准.*题库原分档/);assert.match(await ev('document.getElementById("puzzle-bank-status").title'),/未经本次技巧校准/);report.fallbacks.push(mode+'/'+difficulty);}
   }
   assert(report.calibrated.includes(mode+'/easy'));assert(report.calibrated.includes(mode+'/medium'));
  }
  await ev('window.Worker=class{postMessage(){setTimeout(()=>this.onmessage({data:{error:"VARIANT_DIFFICULTY_NOT_REACHED"}}),0);}terminate(){}};');await click('new-game');await b.waitFor('document.getElementById("new-game").getAttribute("aria-busy")!=="true"');assert.equal((await read()).game.generation,null);assert.match(await ev('document.getElementById("status-message").textContent'),/未经本次技巧校准/);
  await b.load(snapshot('thermo'),'/dist/index.html');await click('new-game');await b.waitFor('document.getElementById("new-game").getAttribute("aria-busy")!=="true"');assert.equal((await read()).game.generation.difficultyBasis,'clue-density');assert.match(await ev('document.getElementById("puzzle-bank-status").title'),/不是人类技巧评级/);
  const old=snapshot('classic'),givens=[0,5,6,0,7,3,0,4,8,8,2,1,0,0,9,3,5,7,0,0,3,0,0,1,9,6,0,7,0,0,0,5,2,0,0,0,0,1,0,9,6,0,7,3,0,6,9,5,1,0,7,2,8,4,0,6,9,0,2,0,4,0,1,0,0,0,7,0,0,8,0,0,1,0,0,0,0,0,5,0,3];
  Object.assign(old.game,{puzzleId:'G1-classic-technique-calibration-29',sourceId:null,givens,board:givens.slice(),solution:E.solve(givens,'classic'),selected:givens.indexOf(0)});
  old.game.generation={version:1,kind:'carved',seed:'technique-calibration-29',difficultyBasis:'supported-logic',fingerprint:G.fingerprint(old.game),givenCount:givens.filter(Boolean).length};
  await b.load(old,'/dist/index.html');const restored=await read();assert.deepEqual(restored.game.board,givens);assert.equal(restored.game.puzzleId,old.game.puzzleId);assert.equal(restored.game.difficulty,'easy');assert.equal(restored.game.generation.version,1);assert.equal(restored.game.generation.difficultyBasis,'clue-density');assert.equal(await ev('document.getElementById("save-recovery-dialog").open'),false);assert.match(await ev('document.getElementById("puzzle-bank-status").textContent'),/密度档/);B.validateWindow(restored);
  assert.deepEqual(b.events.filter(e=>e.method==='Runtime.exceptionThrown'),[]);console.log('PASS variant difficulty Chromium:',JSON.stringify(report));
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
