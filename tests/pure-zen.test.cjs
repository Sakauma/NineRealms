/* Execute production Zen/state/keyboard functions on a small DOM facade.
 * This verifies behavior and immutable puzzle data, not browser layout/pixels. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Engine = require('../src/engine.js');
const Branches = require('../src/branches.js');
const Drafts = require('../src/drafts.js');
const source = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze); Object.freeze(value);
  }
  return value;
}
function productionFunction(name) {
  const start = source.indexOf('  function ' + name + '(');
  assert(start >= 0, 'production function exists: ' + name);
  const first = source.slice(start, source.indexOf('\n', start));
  if (/\}\s*$/.test(first)) return first;
  const end = source.indexOf('\n  }', start + 1);
  assert(end > start, 'production function ends: ' + name);
  return source.slice(start, end + 4);
}
function fixture(mode = 'classic') {
  const puzzle = Engine.getPuzzle('easy', 'pure-zen-' + mode, mode);
  const size = puzzle.givens.length;
  const game = {...puzzle, puzzleId:puzzle.id, sessionId:'zen-' + mode, createdAt:123,
    started:true, paused:false, completed:false, logicMode:false, branch:null,
    board:puzzle.givens.slice(), notes:Array(size).fill(0), draft:Drafts.empty(size),
    selected:puzzle.givens.findIndex(value => !value), fog:true,
    fogSeen:Array.from({length:size}, (_, i) => i % 3 === 0),
    history:[], redo:[], hints:4, mistakes:3, elapsedMs:65432,
    energy:{points:51, combo:2, best:7, claimed:Array(size).fill(false), units:[]}};
  game.notes[game.selected] = 21;
  game.draft.colors[game.selected] = 2;
  game.draft.marks[game.selected] = 1;
  game.history.push({board:game.board.slice(), notes:game.notes.slice(),
    draft:clone(game.draft), selected:game.selected, noteMode:true});
  const preferences = {theme:'ocean', fx:true, errorCheck:true, logicMode:false,
    customDraft:'saved puzzle text', fog:true, sound:true, focus:true, zen:false,
    zenMotion:true, intensity:'cinematic', textSize:'large', lineContrast:'strong',
    colorAssist:true, handedness:'left'};
  const nodes = new Map();
  let doc;
  function node(id = '') {
    const attrs = new Map(), children = new Map(), classes = new Set();
    return {id, hidden:false, disabled:false, open:false, textContent:'', title:'',
      dataset:{}, focuses:0, tagName:'BUTTON', isConnected:true, tabIndex:0,
      style:{values:new Map(), setProperty(k,v){this.values.set(k,String(v));},
        getPropertyValue(k){return this.values.get(k)||'';}, removeProperty(k){this.values.delete(k);}},
      classList:{toggle(k,on){if(on)classes.add(k);else classes.delete(k);},
        remove(...keys){keys.forEach(k=>classes.delete(k));}, contains:k=>classes.has(k)},
      setAttribute(k,v){attrs.set(k,String(v));}, getAttribute:k=>attrs.get(k)??null,
      querySelector(selector){if(!children.has(selector))children.set(selector,node(id+'/'+selector));return children.get(selector);},
      querySelectorAll(){return [];}, replaceChildren(){}, appendChild(){},
      contains(target){return target===this;}, focus(options){this.focuses++;this.lastFocus=options;doc.activeElement=this;},
      scrollIntoView(){}, getContext(){return null;}};
  }
  const $ = id => {if(!nodes.has(id))nodes.set(id,node(id));return nodes.get(id);};
  doc = {body:node('body'), hidden:false, activeElement:null,
    querySelectorAll(){return [];}, createElement:()=>node(),
    addEventListener(type,callback){assert.equal(type,'keydown');s.keydown=callback;}};
  doc.body.dataset = {zen:'off', advancedTools:'on'};
  const calls = {save:[], status:[], toast:[], configure:[], unlock:0, sync:0,
    selectClose:0, draftClose:[], pulses:0, stop:0, tilt:0, render:0,
    undo:0, redo:0, numbers:[], erase:0, notes:0, moves:[], fog:[], dialogs:[], clocks:0};
  const s = {Engine, Branches, Drafts, game, preferences, document:doc, $, Set,
    cells:game.board.map((_,i)=>node('cell-'+i)), activeBoardId:'all', noteMode:true,
    pendingHint:null, batchSelection:new Set([game.selected]), batchSelecting:true,
    lensDigit:7, lensKey:'cached', lensResult:{indices:[game.selected]}, checkedReveal:true,
    checkTimeout:1, toastTimeout:2, reducedMotion:{matches:false},
    generatingPuzzle:false, storageTransition:false, dialogOpen:false,
    LIGHT_THEMES:['ivory','sakura','sunset'], THEME_NAMES:{ocean:'深海'},
    clearTimeout(){}, clearPulse(){calls.pulses++;},
    stopCelebration(){calls.stop++;}, resetTilt(){calls.tilt++;},
    save:message=>calls.save.push(message), setStatus:message=>calls.status.push(message),
    toast:message=>calls.toast.push(message),
    dialogIsOpen:()=>s.dialogOpen, gameContext:()=>({mode:game.mode,clues:game.clues}),
    inBranch:()=>Branches.active(game.branch),
    modeInfo:mode=>Engine.getModes().find(entry=>entry.id===mode),
    difficultyInfo:(mode,difficulty)=>Engine.getDifficulties(mode).find(entry=>entry.id===difficulty),
    cellLocation:index=>Engine.getCellLabel(index,{mode:game.mode,clues:game.clues}),
    Atmosphere:{configure:settings=>calls.configure.push(clone(settings)),unlock(){calls.unlock++;},play(){}},
    window:{NineRealmsSelect:{syncAll(){},close(){calls.selectClose++;}},
      NineRealmsFloatingDraft:{close(focus){calls.draftClose.push(focus);}},
      NineRealmsWorkspace:{sync(){calls.sync++;},revealHint(){throw Error('Zen must not reveal a hint');}}},
    undo(){calls.undo++;},redo(){calls.redo++;},enterNumber(value,fromHint){calls.numbers.push([value,fromHint]);},
    erase(){calls.erase++;},toggleNotes(){calls.notes++;},moveOnLayout(...args){calls.moves.push(args);},
    revealFog(index){calls.fog.push(index);},
    favoriteStore:null, dailyRecords:{}, Daily:{recordCompletion(){throw Error('unexpected daily fixture');}},
    saveDaily(){},renderDaily(){},finishVoyage(){},suspendClock(){calls.clocks++;},
    formatTime:()=> '01:05',showDialog:dialog=>calls.dialogs.push(dialog.id),
    particleFrame:null,cancelAnimationFrame(){},requestAnimationFrame(){throw Error('Zen must not animate');},
    Logic:{complete:board=>Engine.validateComplete(board,{mode:game.mode,clues:game.clues})}};
  const context = vm.createContext(s);
  const names = ['motionEnabled','automaticErrors','renderPreferences','renderZenContext',
    'clearTransientMarks','prepareZenView','setZen','exitZenOnEscape','canTravelEdit','canInteract',
    'advancedToolsEnabled','selectCell',
    'ruleOnly','isBoard','respectsGivens','hintSignature','selectedHintResult','renderHint','requestHint',
    'checkCompletion','celebrate'];
  vm.runInContext('"use strict";\n'+names.map(productionFunction).join('\n'),context);
  s.render = () => {calls.render++;s.renderHint();s.renderZenContext();};
  const keyStart = source.indexOf('  document.addEventListener("keydown", function (event) {');
  const keyEnd = source.indexOf('\n  });',keyStart);
  assert(keyStart>=0&&keyEnd>keyStart,'production keyboard listener boundaries');
  vm.runInContext(source.slice(keyStart,keyEnd+6),context);
  $('appearance-settings').open=true;$('more-tools-panel').hidden=false;
  $('hint-panel').hidden=false;$('hint-value').textContent='9';$('hint-text').textContent='stale warning';
  s.pendingHint={index:game.selected,value:game.solution[game.selected],signature:s.hintSignature()};
  return {s,$,calls,doc};
}
function key(key, extras = {}) {
  return {key,target:{tagName:'BUTTON'},defaultPrevented:false,
    preventDefault(){this.defaultPrevented=true;}, ...extras};
}
const modes = Engine.getModes().map(entry=>entry.id);
assert.equal(modes.length,33,'all released variants are covered');
let transitions=0;
for(const mode of modes) for(const state of ['playing','ready','paused','completed','branch']) {
  const {s,$,calls,doc}=fixture(mode),g=s.game;
  if(state==='ready')g.started=false;
  if(state==='paused')g.paused=true;
  if(state==='completed'){g.completed=true;g.board=g.solution.slice();g.notes.fill(0);}
  if(state==='branch')Branches.begin(g,true);
  const layout=Engine.getLayout(g);
  if(layout.boards.length>1)s.activeBoardId=layout.boards.at(-1).id;
  const before=clone(g),prefs=clone(s.preferences),view=s.activeBoardId;
  const board=g.board,notes=g.notes,clues=g.clues,branch=g.branch,history=g.history;
  deepFreeze(g);
  s.setZen(true);
  assert.deepEqual(clone(g),before,mode+' '+state+' entry preserves entire game');
  assert.strictEqual(g.board,board);assert.strictEqual(g.notes,notes);assert.strictEqual(g.clues,clues);
  assert.strictEqual(g.branch,branch);assert.strictEqual(g.history,history);
  assert.equal(s.activeBoardId,view,'multi-board detail/overview remains selected');
  assert.equal(s.noteMode,true,'visible note toggle preserves intentional input mode');
  assert.deepEqual(clone(s.preferences),{...prefs,zen:true},'only Zen preference changes');
  assert.equal(doc.body.dataset.zen,'on');assert.equal(doc.body.dataset.fx,'off');assert.equal(doc.body.dataset.focus,'off');
  assert.equal(s.motionEnabled(),false);assert.equal(s.automaticErrors(),false);
  assert.equal(s.advancedToolsEnabled(),false,'hidden optional tools cannot reactivate via keyboard');
  assert.equal(calls.configure.at(-1).fx,false);assert.equal(calls.configure.at(-1).sound,false);
  assert.equal(s.pendingHint,null);assert.equal(s.batchSelection.size,0);assert.equal(s.batchSelecting,false);
  assert.equal(s.lensDigit,0);assert.equal(s.lensResult,null);assert.equal(s.lensKey,'');assert.equal(s.checkedReveal,false);
  assert($('hint-panel').hidden);assert.equal($('hint-value').textContent,'');assert.equal($('hint-text').textContent,'');
  assert.equal($('appearance-settings').open,false);assert($('more-tools-panel').hidden);assert($('toast').hidden);
  assert(calls.draftClose.length>0);assert(calls.draftClose.every(value=>value===false),'close draft without focus theft');
  assert.equal($('zen-toggle').getAttribute('aria-keyshortcuts'),'Escape');
  const expectedFocus=state==='ready'?$('start-btn'):state==='paused'?$('resume-btn'):state==='completed'?$('zen-toggle'):s.cells[g.selected];
  assert.strictEqual(doc.activeElement,expectedFocus,mode+' '+state+' entry focus is usable');
  assert.equal($('zen-context').hidden,!['completed','branch'].includes(state));
  if(state==='branch')assert.match($('zen-context').textContent,/假设/);
  if(state==='completed')assert.match($('zen-context').textContent,/圆满/);
  const saves=calls.save.length,renders=calls.render;s.setZen(true);
  assert.equal(calls.save.length,saves,'repeated entry is idempotent');assert.equal(calls.render,renders);
  s.requestHint();assert.equal(s.pendingHint,null);assert.equal(calls.save.length,saves,'hidden hint cannot count or reveal');
  const escape=key('Escape');s.keydown(escape);
  assert(escape.defaultPrevented,mode+' '+state+' Escape exits before interaction guards');
  assert.equal(doc.body.dataset.zen,'off');assert.deepEqual(clone(s.preferences),prefs);
  assert.equal(doc.body.dataset.fx,'on');assert.equal(doc.body.dataset.focus,'on');
  assert.equal(calls.configure.at(-1).sound,true);assert.equal(calls.unlock,1);
  assert.equal(s.motionEnabled(),true);assert.equal(s.automaticErrors(),true);
  assert.equal(s.advancedToolsEnabled(),true,'previous optional-tool availability resumes');
  assert.deepEqual(clone(g),before,'exit preserves entire game including clock, scores, drafts, fog and branch');
  assert.equal(s.activeBoardId,view);assert.strictEqual(doc.activeElement,$('zen-toggle'));
  assert.equal($('zen-context').hidden,true);
  const after=calls.save.length;s.setZen(false);assert.equal(calls.save.length,after,'repeated exit is idempotent');
  transitions++;
}
for(const zenMotion of [false,true]) for(const fx of [false,true]) for(const reduced of [false,true]) {
  const {s,doc}=fixture();Object.assign(s.preferences,{zen:true,zenMotion,fx});s.reducedMotion.matches=reduced;
  const prefs=clone(s.preferences),before=clone(s.game);s.renderPreferences();s.render();
  assert.equal(doc.body.dataset.zen,'on');assert.equal(s.motionEnabled(),false,'saved Zen is always static');
  assert.equal(s.pendingHint,null);assert.equal(s.batchSelection.size,0);assert.equal(s.lensDigit,0);
  s.setZen(false);assert.deepEqual(clone(s.preferences),{...prefs,zen:false});
  assert.equal(s.motionEnabled(),fx&&!reduced,'original FX preference and system motion setting resume');
  assert.deepEqual(clone(s.game),before,'restoring Zen does not change game data');
}
for(const guard of ['dialog','prevented','other-key']) {
  const {s,calls}=fixture();s.setZen(true);
  const event=key(guard==='other-key'?'Tab':'Escape',{defaultPrevented:guard==='prevented'});
  s.dialogOpen=guard==='dialog';const saves=calls.save.length;
  assert.equal(s.exitZenOnEscape(event),false,guard+' does not exit');
  assert(s.preferences.zen);assert.equal(calls.save.length,saves);
}
for(const mode of modes) {
  const {s}=fixture(mode);s.setZen(true);
  const target=s.game.board.findIndex((value,index)=>!value&&index!==s.game.selected);
  const notes=clone(s.game.notes),clues=clone(s.game.clues);
  s.selectCell(target,false,true); // Ctrl/Meta click reaches the normal click path.
  assert.equal(s.game.selected,target);assert.equal(s.batchSelection.size,0,mode+' ignores hidden Ctrl-click multi-selection');
  s.selectCell(target,true,'extend'); // Shift+arrow reaches the same selection path.
  assert.equal(s.batchSelection.size,0,mode+' ignores hidden Shift-arrow multi-selection');
  assert.equal(s.batchSelecting,false);assert.deepEqual(clone(s.game.notes),notes);
  assert.deepEqual(clone(s.game.clues),clues,'selecting in Zen leaves variant metadata intact');
}
{
  const {s,calls}=fixture();s.setZen(true);
  for(const value of ['1','5','9'])s.keydown(key(value));
  assert.deepEqual(calls.numbers,[[1,false],[5,false],[9,false]]);
  for(const value of ['0','Backspace','Delete'])s.keydown(key(value));assert.equal(calls.erase,3);
  s.keydown(key('n'));s.keydown(key('N'));assert.equal(calls.notes,2);
  s.keydown(key('z',{ctrlKey:true}));s.keydown(key('z',{metaKey:true}));assert.equal(calls.undo,2);
  s.keydown(key('z',{ctrlKey:true,shiftKey:true}));s.keydown(key('y',{ctrlKey:true}));assert.equal(calls.redo,2);
  for(const value of ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'])s.keydown(key(value));
  assert.deepEqual(calls.moves,[[0,-1,false],[0,1,false],[-1,0,false],[1,0,false]]);
  for(const tagName of ['INPUT','SELECT','TEXTAREA'])s.keydown(key('1',{target:{tagName}}));
  s.keydown(key('1',{target:{isContentEditable:true,tagName:'DIV'}}));
  s.keydown(key('1',{ctrlKey:true}));assert.equal(calls.numbers.length,3,'typing in controls/modifier combinations is not stolen');
}
for(const mode of modes) {
  const {s,$,calls}=fixture(mode);s.game.board=s.game.solution.slice();s.game.notes.fill(0);s.setZen(true);
  const saves=calls.save.length;s.checkCompletion();
  assert(s.game.completed,mode+' still validates and saves completion');assert.equal(s.game.paused,false);
  assert.equal(calls.dialogs.length,0,'Zen never opens the score modal');assert.equal(calls.clocks,1);
  assert.equal(calls.save.length,saves+1);assert.equal(calls.save.at(-1),'完成');
  assert.equal($('zen-context').hidden,false);assert.match($('zen-context').textContent,/圆满/);
  s.checkCompletion();assert.equal(calls.save.length,saves+1,'completion persists only once');
}
{
  const {s,calls}=fixture();s.game.board=s.game.solution.slice();s.preferences.fx=false;s.checkCompletion();
  assert.deepEqual(calls.dialogs,['completion-dialog'],'normal completion dialog is unchanged');
}
console.log('PASS pure Zen: '+transitions+' mode/state transitions across all 33 variants, immutable board/notes/drafts/fog/branches/history, transient cleanup, restored preferences, usable focus and Escape, keyboard input, and quiet persisted completion. DOM facade only; browser geometry is not certified.');
