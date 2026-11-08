/* Executes extracted production app.js functions and event bindings with a small
 * DOM facade. This verifies state behavior, not browser geometry or pixels. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/app.js'), 'utf8');
const Engine = require('../src/engine.js'), Logic = require('../src/logic.js'), Edits = require('../src/edits.js');
const clone = value => JSON.parse(JSON.stringify(value));
function productionFunction(name) {
  const start = source.indexOf('  function ' + name + '(');
  assert(start >= 0, 'production function exists: ' + name);
  const firstLine=source.slice(start,source.indexOf('\n',start));
  if (/\}\s*$/.test(firstLine)) return firstLine;
  const end = source.indexOf('\n  }', start + 1);
  assert(end > start, 'production function end: ' + name);
  return source.slice(start, end + 4);
}
function fixture(advancedTools = true) {
  const nodes = new Map();
  function node() {
    const classes = new Set(), attrs = {}, listeners = {};
    return {dataset:{}, hidden:false, disabled:false, children:[], textContent:'',
      classList:{toggle(c,on){if(on) classes.add(c); else classes.delete(c);},contains:c=>classes.has(c)},
      setAttribute(k,v){attrs[k]=String(v);},getAttribute:k=>attrs[k] || '',
      addEventListener(k,f){listeners[k]=f;},appendChild(n){this.children.push(n);},
      querySelectorAll(){return this.children;},focus(){},
      change(){if(listeners.change) listeners.change({currentTarget:this});},
      click(){if(!this.disabled && listeners.click) listeners.click({currentTarget:this});}};
  }
  const $ = id => {if(!nodes.has(id)) nodes.set(id,node()); return nodes.get(id);};
  const puzzle = Engine.getPuzzle('easy', 'compact-filter-state', 'classic');
  const game = {...puzzle,started:true,paused:false,completed:false,board:puzzle.givens.slice(),notes:Array(81).fill(0),history:[],redo:[],selected:0};
  const cells = game.board.map(()=>{const n=node();n.children=Array.from({length:9},node);return n;});
  const sandbox = {$, game, cells, Logic, Edits, document:{createElement:node,body:{dataset:{advancedTools:advancedTools?'on':'off'}}}, Set, JSON,
    batchSelection:new Set(),batchSelecting:false,batchDigit:1,noteMode:false,pendingHint:null,lensKey:'',lensResult:null,
    selectSyncs:[],workspaceRefreshes:[],window:{
      NineRealmsSelect:{syncAll(){sandbox.selectSyncs.push({value:$('batch-digit').value,disabled:$('batch-digit').disabled});}},
      NineRealmsWorkspace:{refreshTools(){sandbox.workspaceRefreshes.push({
        hidden:$('batch-panel').hidden, selecting:sandbox.batchSelecting, count:sandbox.batchSelection.size,
        expanded:$('batch-toggle').getAttribute('aria-expanded'), cancelDisabled:$('batch-selection-clear').disabled,
        activeDigit:$('candidate-lens').dataset.activeDigit,
        pressedDigits:$('lens-digits').children.map(n=>n.getAttribute('aria-pressed'))
      });}}
    },
    sounds:[],playEditSound(kind){sandbox.sounds.push(kind);},
    saves:0,canInteract:()=>game.started&&!game.paused&&!game.completed,
    revealFog(){},gameContext:()=>({mode:game.mode,clues:game.clues}),toast(){},setStatus(){},save(){sandbox.saves++;},
    bind(id,type,fn){$(id).addEventListener(type,fn);}};
  const context = vm.createContext(sandbox);
  const initial = source.match(/var lensDigit = [^;]+;/);
  assert(initial,'actual lens initial state declaration');
  vm.runInContext(initial[0] + '\n' + productionFunction('advancedToolsEnabled') + '\n' + productionFunction('renderLens') + '\n' + productionFunction('batchNotes') + '\n' + productionFunction('toggleLensDigit') + '\n' + productionFunction('selectCell'), context);
  sandbox.render = ()=>{cells.forEach(c=>c.setAttribute('aria-label','cell'));sandbox.renderLens();};
  const start=source.indexOf('  for (var lensNumber = 1;');
  const end=source.indexOf('  bind("logic-toggle",', start);
  assert(start>=0&&end>start,'actual candidate bindings');
  vm.runInContext(source.slice(start,end),context);
  sandbox.render();
  return {s:sandbox,$,cells,clickDigit:d=>$('lens-digits').children[d-1].click()};
}
{
  const {s,$,cells,clickDigit}=fixture(), before=clone(s.game);
  assert.equal(s.lensDigit,0,'filter starts off');
  assert.deepEqual(s.selectSyncs.at(-1),{value:'1',disabled:false},'enhanced batch select receives initial current state');
  assert($('batch-panel').hidden,'batch panel starts hidden');
  assert.equal(s.workspaceRefreshes.length,1,'initial render refreshes the optional-tools presentation');
  assert.deepEqual(s.workspaceRefreshes.at(-1),{hidden:true,selecting:false,count:0,expanded:'false',cancelDisabled:true,activeDigit:'0',pressedDigits:Array(9).fill('false')},'refresh runs after the batch and filter UI state is complete');
  assert.equal($('lens-digits').children.length,9);
  assert(cells.every(c=>!c.classList.contains('lens-note')&&!c.classList.contains('lens-rule')));
  const blank=s.game.board.findIndex(v=>!v);s.game.notes[blank]=1<<3;
  const annotated=clone(s.game);
  clickDigit(4);assert.equal(s.lensDigit,4);assert(cells[blank].classList.contains('lens-note'));
  assert.deepEqual(s.selectSyncs.at(-1),{value:'4',disabled:false},'enhanced select synchronizes after filter updates batch digit');
  assert.equal($('lens-digits').children[3].getAttribute('aria-pressed'),'true');
  assert.equal(s.workspaceRefreshes.at(-1).activeDigit,'4');
  assert.equal(s.workspaceRefreshes.at(-1).pressedDigits[3],'true','workspace receives current filter state, not the previous render');
  $('lens-rules').click();assert.equal(s.lensSource,'rules');assert.equal(s.lensDigit,4);
  assert.match($('lens-status').textContent,/未证明可解/,'rule source keeps limited-possibility disclaimer');
  $('lens-notes').click();assert(cells[blank].classList.contains('lens-note'));
  clickDigit(4);assert.equal(s.lensDigit,0,'repeated digit turns filter off');
  assert(cells.every(c=>!c.classList.contains('lens-note')&&!c.classList.contains('lens-rule')));
  $('lens-rules').click();assert.equal(s.lensDigit,0,'source change does not turn inactive filter on');
  clickDigit(9);clickDigit(2);assert.equal(s.lensDigit,2,'another digit replaces filter');
  assert.deepEqual(clone(s.game),annotated,'filter never changes gameplay, notes, history or selected cell');
  assert.equal(s.saves,0,'filter never writes persistence');
  for (const invalid of [0,10,-1,NaN,2.5]) s.toggleLensDigit(invalid);
  assert.equal(s.lensDigit,2,'invalid filter digits are ignored');
  for(const state of ['paused','completed']) {s.game[state]=true;s.render();assert(cells.every(c=>!c.classList.contains('lens-rule')));assert.deepEqual(s.selectSyncs.at(-1),{value:'2',disabled:true},'enhanced select receives disabled state');s.game[state]=false;s.render();assert.equal(s.selectSyncs.at(-1).disabled,false,'enhanced select re-enabled on resume');}
  assert.deepEqual(s.game.board,before.board);
}
{
  const {s,$,clickDigit}=fixture();
  const blanks=s.game.board.flatMap((v,i)=>v?[]:[i]).slice(0,2);
  $('batch-toggle').click();assert(s.batchSelecting);assert(s.noteMode);
  assert(!$('batch-selection-clear').disabled,'empty active selection must remain cancellable by closing More Tools');
  assert.deepEqual(s.workspaceRefreshes.at(-1),{hidden:false,selecting:true,count:0,expanded:'true',cancelDisabled:false,activeDigit:'0',pressedDigits:Array(9).fill('false')},'workspace learns about an empty active selection after controls update');
  const unselected=clone(s.game), savesBeforeCancel=s.saves;
  $('batch-selection-clear').click();
  assert(!s.batchSelecting && !s.batchSelection.size && $('batch-panel').hidden,'real cancellation handles active mode with zero cells');
  assert.deepEqual(clone(s.game),unselected,'selection cancellation never edits puzzle/history');
  assert.equal(s.saves,savesBeforeCancel,'selection cancellation never writes persistence');
  $('batch-toggle').click();assert(s.batchSelecting);
  blanks.forEach(i=>s.batchSelection.add(i));s.render();
  assert(!$('batch-panel').hidden,'batch panel visible in selection mode');
  assert(!$('batch-add').disabled && !$('batch-remove').disabled,'independent batch digit stays usable with filter off');
  assert.equal(s.batchDigit,1,'batch default is independent of inactive filter');
  assert.deepEqual(s.sounds,[],'selection and filter controls stay silent');
  clickDigit(3);$('batch-add').click();assert(blanks.every(i=>s.game.notes[i]===4));
  assert.deepEqual(s.sounds,['note'],'a multi-cell transaction emits one neutral candidate cue');
  $('batch-add').click();assert.deepEqual(s.sounds,['note'],'unchanged candidate batch stays silent');
  assert.equal(s.game.history.length,1,'batch addition is one undo frame');
  const beforeUndo=clone(s.game.notes);Edits.undo(s.game,s.noteMode);assert(blanks.every(i=>s.game.notes[i]===0));
  Edits.redo(s.game,s.noteMode);assert.deepEqual(s.game.notes,beforeUndo);
  clickDigit(3);assert.equal(s.lensDigit,0);assert.equal(s.batchDigit,3,'filter off retains batch digit');
  s.batchNotes('toggle',1);assert(blanks.every(i=>s.game.notes[i]===5),'keyboard explicit mask works with filter off');
  $('batch-clear').click();assert(blanks.every(i=>s.game.notes[i]===0),'clear works with filter off');
  $('batch-rules').click();const masks=Logic.masks(s.game.board,s.gameContext());assert(blanks.every(i=>s.game.notes[i]===masks[i]),'rules work with filter off');
  $('batch-toggle').click();assert(!s.batchSelecting);assert.equal(s.batchSelection.size,2,'exiting selection mode retains current selection');assert(!$('batch-panel').hidden,'nonempty selection keeps batch panel visible');
  $('batch-selection-clear').click();assert.equal(s.batchSelection.size,0);assert(!s.batchSelecting);assert($('batch-panel').hidden,'cleared inactive selection hides batch panel');
  $('batch-toggle').click();$('batch-all').click();
  assert.equal(s.batchSelection.size,s.game.board.filter(v=>!v).length,'select all includes only empty cells');
  assert([...s.batchSelection].every(i=>!s.game.givens[i]&&!s.game.board[i]));
  $('batch-digit').value='8';$('batch-digit').change();
  assert.deepEqual(s.selectSyncs.at(-1),{value:'8',disabled:false},'independent batch digit change synchronizes enhanced select');
  assert.equal(s.batchDigit,8);assert.equal(s.lensDigit,0,'batch target never activates filter');
  $('batch-digit').value='0';$('batch-digit').change();assert.equal(s.batchDigit,8,'invalid batch digit ignored');
  const sounds=s.sounds.length;const before=clone(s.game);s.game.paused=true;s.batchNotes('add');s.game.paused=false;
  assert.equal(s.sounds.length,sounds,'paused candidate edit stays silent');
  assert.deepEqual(clone(s.game),before,'paused game cannot batch-edit');
}
// More Tools must be able to cancel an existing selection even after gameplay
// becomes unavailable. These execute the production cancel binding, not a fake.
for (const state of ['paused','completed']) for (const count of [0,2]) {
  const {s,$,clickDigit}=fixture();
  clickDigit(6); $('lens-rules').click(); $('batch-toggle').click();
  s.game.board.flatMap((v,i)=>v?[]:[i]).slice(0,count).forEach(i=>s.batchSelection.add(i));
  s.game[state]=true; s.render(); const before=clone(s.game), saves=s.saves;
  assert(!$('batch-selection-clear').disabled,'cancel remains available for '+state+' selection count '+count);
  $('batch-selection-clear').click();
  assert(!s.batchSelecting && !s.batchSelection.size && $('batch-panel').hidden);
  assert.deepEqual(clone(s.game),before,'cancel leaves '+state+' game, notes and history untouched');
  assert.equal(s.saves,saves); assert.equal(s.lensDigit,6); assert.equal(s.lensSource,'rules');
  assert(s.workspaceRefreshes.at(-1).hidden,'workspace receives the cancellation before hiding tools');
}
// Actual shipped state suppresses only transient modes, preserving saved notes,
// draft, undo frames and regular cell selection across Ctrl/Shift requests.
for (const extend of [true, 'extend']) {
  const {s,$,cells,clickDigit}=fixture(false), blanks=s.game.board.flatMap((v,i)=>v?[]:[i]);
  s.game.draft={colors:[1,2],marks:[2]}; s.game.notes[blanks[0]]=4;
  s.game.history=[{notes:s.game.notes.slice()}];
  s.batchSelecting=true; s.batchSelection.add(blanks[0]); s.lensDigit=3;
  const before=clone(s.game); s.render();
  assert.equal(s.lensDigit,0); assert.equal(s.batchSelecting,false); assert.equal(s.batchSelection.size,0);
  assert($('batch-panel').hidden); assert(cells.every(c=>!c.classList.contains('lens-rule')&&!c.classList.contains('lens-note')));
  assert.deepEqual(clone(s.game),before,'turning off removed modes never deletes saved game/draft/history data');
  s.selectCell(blanks[1],true,extend);
  assert.equal(s.game.selected,blanks[1]); assert.equal(s.batchSelection.size,0);
  const expected={...before,selected:blanks[1]}; assert.deepEqual(clone(s.game),expected);
  $('batch-toggle').click(); clickDigit(4); assert.equal(s.batchSelecting,false); assert.equal(s.batchSelection.size,0); assert.equal(s.lensDigit,0);
}
console.log('PASS candidate filter state (including optional-tools refresh ordering and empty-selection cancellation): actual shipped off-mode guard plus explicitly enabled dormant app.js source/digit toggle handlers, nonmutating filter, paused/completed suppression, rule disclaimer, independent batch digit, atomic undo/redo and explicit keyboard masks. DOM mock only, not a browser pass.');
