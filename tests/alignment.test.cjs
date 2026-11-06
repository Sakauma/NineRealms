'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync('src/index.html','utf8'),css=fs.readFileSync('src/styles.css','utf8');
const dom=new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g,''),{runScripts:'outside-only'}),w=dom.window,d=w.document,$=id=>d.getElementById(id);
const main=d.querySelector('.game-layout'),workspace=d.querySelector('.reasoning-workspace');
assert.equal($('rules-open').parentElement,$('puzzle-settings'),'rules share main toolbar, not an empty separate row');assert(d.querySelector('.mode-explainer').classList.contains('sr-only'));assert.match(css,/grid-template-areas:"mode actions rules"/);assert.match(css,/grid-template-areas:"mode rules" "actions actions"/);assert.match(css,/\.number-pad\{flex:1;grid-template-rows:repeat\(3,minmax\(56px,1fr\)\)/);
assert.equal(workspace.parentElement,main);assert.equal($('draft-panel').parentElement,$('draft-dock'));assert($('draft-dock').hidden);assert($('draft-panel').hidden);assert.equal($('draft-panel').getAttribute('role'),'region');assert.equal($('hint-panel').parentElement,workspace);
assert($('draft-toggle').getAttribute('aria-controls')==='draft-panel');assert(!d.querySelector('.control-panel').contains($('hint-panel')));assert(workspace.contains($('status-message')),'actionable live status remains visible below the board without stretching controls');
assert.match(css,/\.difficulty-wrap>\.glass-select\{width:100%;flex:1\}/);assert.match(css,/\.reasoning-workspace\{grid-column:1\/-1/);
assert.match(css,/\.training-board\{aspect-ratio:1;grid-template-rows:repeat\(9,minmax\(0,1fr\)\)\}/);
assert.match(css,/\.glass-select \.glass-select-trigger\{white-space:normal;overflow-wrap:anywhere\}/);
assert.match(css,/\.draft-mark,\.history-draft-mark\{top:3px;bottom:3px;right:1px;width:3px;overflow:hidden;font-size:0/);
w.NineRealmsTraining=require('../src/training.js');w.eval(fs.readFileSync('src/training-ui.js','utf8'));
const ui=w.NineRealmsTrainingUI({progress:()=>({version:1,completed:[]}),blocked:()=>false,success(){},open(el){el.open=true},close(el){el.open=false},afterClose(){}});
for(const station of w.NineRealmsTraining.stations()){
 ui.open(station.id);
 for(const exerciseButton of Array.from($('training-exercises').children)){
  exerciseButton.click();const id=exerciseButton.dataset.exercise,e=w.NineRealmsTraining.exercise(id),cells=$('training-board').children;assert.equal(cells.length,81);
  for(let i=0;i<81;i++){
   const cell=cells[i];if(e.board[i]){assert.equal(cell.textContent,String(e.board[i]));continue;}
   const slots=cell.querySelectorAll('.training-candidates>span');assert.equal(slots.length,9);
   for(let n=1;n<=9;n++)assert.equal(slots[n-1].textContent,(e.candidateMasks[i]&(1<<(n-1)))?String(n):'');
   assert.equal(cell.querySelector('.training-candidates').getAttribute('aria-hidden'),'true');assert.match(cell.getAttribute('aria-label'),/候选/);
  }
 }
}
dom.window.close();console.log('PASS alignment structure: shared reasoning row, mobile visible-select sizing, bounded labels, nine equal training rows and nine exact candidate slots for all nine exercises, non-overlapping edge-mark CSS contract. Static/DOM assertions, not pixel measurement.');
