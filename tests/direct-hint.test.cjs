/* Execute the production hint controller without a browser. These checks cover
 * behavior and immutability; they make no claim about rendered geometry. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const Engine = require('../src/engine.js');
const source = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
function expectedLocation(location) {
  const first = location.split(' / ')[0];
  return '提示 · ' + (/^第/.test(first) ? first.replace(/\s+/g,'') : first.replace(/第\s*(\d+)\s*行第\s*(\d+)\s*列/, '$1行$2列'));
}
function productionFunction(name) {
  const start = source.indexOf('  function ' + name + '(');
  const end = source.indexOf('\n  }', start + 1);
  assert(start >= 0 && end > start, 'production function exists: ' + name);
  return source.slice(start, end + 4);
}
function fixture(mode = 'classic') {
  const puzzle = Engine.getPuzzle('easy', 'direct-selected-hint-' + mode, mode);
  const size = puzzle.givens.length;
  const game = {...puzzle, puzzleId:puzzle.id, started:true, paused:false, completed:false,
    logicMode:false, branch:null, board:puzzle.givens.slice(), notes:Array(size).fill(0),
    fog:true, fogSeen:Array(size).fill(false), hints:0, mistakes:0,
    selected:puzzle.givens.findIndex(value => !value), history:[], redo:[], energy:{combo:5, amount:34}};
  const nodes = new Map();
  const $ = id => {
    if (!nodes.has(id)) nodes.set(id, {hidden:true, textContent:'', scrolls:0, focuses:0, attrs:{},
      setAttribute(name,value){this.attrs[name]=String(value);}, getAttribute(name){return this.attrs[name] ?? null;},
      scrollIntoView(){this.scrolls++;}, focus(){this.focuses++;}});
    return nodes.get(id);
  };
  const calls = {save:[], status:[], toast:[], reveal:0};
  const s = {Engine, game, pendingHint:null, generatingPuzzle:false, storageTransition:false,
    noteMode:true, dialogOpen:false, $, window:{NineRealmsWorkspace:{revealHint(){calls.reveal++;}}},
    dialogIsOpen:()=>s.dialogOpen,
    gameContext:()=>({mode:game.mode, clues:game.clues}),
    inBranch:()=>!!game.branch,
    setStatus:message=>calls.status.push(message), toast:message=>calls.toast.push(message),
    save:message=>calls.save.push(message),
    cellLocation:index=>Engine.getCellLabel(index, {mode:game.mode, clues:game.clues})};
  const context = vm.createContext(s);
  const names = ['ruleOnly', 'isBoard', 'respectsGivens', 'canTravelEdit', 'canInteract',
    'hintSignature', 'selectedHintResult', 'renderHint', 'requestHint'];
  vm.runInContext(names.map(productionFunction).join('\n'), context);
  s.render = () => s.renderHint();
  let close;
  s.bind = (id, event, callback) => { assert.equal(id, 'hint-close'); assert.equal(event, 'click'); close = callback; };
  const closeBinding = source.match(/  bind\("hint-close", "click", function \(\) \{[^\n]+\}\);/);
  assert(closeBinding, 'production close binding is present');
  vm.runInContext(closeBinding[0], context);
  const keyStart=source.indexOf('  document.addEventListener("keydown", function (event) {');
  const keyEnd=source.indexOf('    if (event.key === "Escape" && (batchSelection',keyStart);
  assert(keyStart>=0&&keyEnd>keyStart,'production global Escape handler boundaries');
  s.exitZenOnEscape=()=>false;
  s.document={body:{dataset:{zen:'off'}},addEventListener(name,callback){assert.equal(name,'keydown');s.keydown=callback;}};
  vm.runInContext(source.slice(keyStart,keyEnd)+'  });',context);
  return {s, $, calls, puzzle, close};
}
function assertUnchanged(before, after) {
  const expected = clone(before);
  expected.hints++;
  expected.energy.combo = 0;
  assert.deepEqual(clone(after), expected,
    'viewing an answer changes only hint count and streak, never board, notes, fog, selection or history');
}
function assertNoResult(f, message) {
  const {s, $, calls} = f;
  const before = clone(s.game), oldSaves = calls.save.length;
  s.requestHint();
  assert.equal(s.pendingHint, null, message);
  assert($('hint-panel').hidden, message);
  assert.equal($('hint-value').textContent, '', message);
  assert.equal(calls.save.length, oldSaves, message);
  assert.deepEqual(clone(s.game), before, message);
}
const modes = Engine.getModes().map(mode => mode.id);
assert.equal(modes.length, 33, 'exercise all released variants');
for (const mode of modes) {
  const f = fixture(mode), {s, $, calls} = f;
  const selected = s.game.selected;
  s.game.notes[selected] = 511;
  const before = clone(s.game);
  Object.freeze(s.game.board); Object.freeze(s.game.notes); Object.freeze(s.game.givens);
  Object.freeze(s.game.solution); Object.freeze(s.game.fogSeen);
  s.requestHint();
  assert(!$('hint-panel').hidden, mode + ' shows direct result immediately');
  assert.equal($('hint-value').textContent, String(s.game.solution[selected]), mode);
  assert.equal($('hint-value').getAttribute('aria-label'), '答案 ' + s.game.solution[selected], 'polite answer output has context');
  assert.equal(s.pendingHint.index, selected, 'selected cell, never an automatically chosen move');
  assert.equal($('hint-title').textContent, expectedLocation(s.cellLocation(selected)), mode + ' includes concise unambiguous location');
  assert.equal($('hint-title').title, s.cellLocation(selected), mode + ' retains full multi-grid location');
  assert.equal($('hint-title').getAttribute('aria-label'), '提示，' + s.cellLocation(selected) + '的答案', 'accessible hint identity and full answer context are retained');
  assert.equal($('hint-text').textContent, '', 'normal answer contains no filler prose');
  assert.equal(calls.status.length, 0, 'successful result is not repeated in the board status');
  assert.equal(calls.toast.length, 0, 'successful result is not repeated in a toast');
  assertUnchanged(before, s.game);
  assert.equal(calls.save.length, 1); assert.equal(calls.reveal, 1);
  const revealed = clone(s.game);
  s.requestHint();
  assert.deepEqual(clone(s.game), revealed, 'repeat while open is not another hint');
  assert.equal(calls.save.length, 1, 'repeat while open does not save duplicate history');
  assert(s.noteMode, 'reading never changes input mode');
  const beforeClose = clone(s.game), savesBeforeClose = calls.save.length;
  f.close();
  assert.equal(s.pendingHint, null, 'production close binding clears cached answer');
  assert($('hint-panel').hidden); assert.equal($('hint-value').textContent, '');
  assert.equal($('hint-text').textContent, '');
  assert.deepEqual(clone(s.game), beforeClose, 'closing never edits game data');
  assert.equal(calls.save.length, savesBeforeClose, 'closing never persists a gameplay event');
}
for (const mode of modes) {
  const f=fixture(mode),{s,$,calls}=f;s.requestHint();const before=clone(s.game),saved=calls.save.length;
  let prevented=0;
  const event={key:'Escape',target:{tagName:'BUTTON'},preventDefault(){prevented++;}};
  s.keydown({...event,target:{tagName:'INPUT'}});assert(s.pendingHint,'editing a form does not steal Escape');
  s.keydown(event);assert.equal(prevented,1);assert.equal(s.pendingHint,null);assert($('hint-panel').hidden);
  assert.equal($('hint-value').textContent,'');assert.equal($('hint-title').title,'');
  assert.equal($('hint-title').getAttribute('aria-label'),'提示');
  assert.equal($('hint-value').getAttribute('aria-label'),'答案');
  assert.equal($('hint-btn').focuses,1,'Escape outside the result returns focus to trigger');
  assert.equal(calls.save.length,saved);assert.deepEqual(clone(s.game),before,'keyboard dismissal does not alter gameplay');
  s.keydown(event);assert.equal(prevented,1,'repeated Escape is a no-op after dismissal');
}
for (const selected of [-1, 81, 999, 0.5, NaN, null, undefined, '0']) {
  const f = fixture(); f.s.game.selected = selected;
  assertNoResult(f, 'no valid selection cannot disclose or auto-select');
  assert.match(f.calls.toast.at(-1), /请先点选.*空格/);
}
{
  const f = fixture(); f.s.game.selected = f.s.game.givens.findIndex(Boolean);
  assertNoResult(f, 'given cells are not hint targets');
  assert.match(f.calls.toast.at(-1), /题目给定/);
}
for (const correct of [true, false]) {
  const f = fixture(), {game} = f.s, index = game.selected;
  game.board[index] = correct ? game.solution[index] : game.solution[index] % 9 + 1;
  assertNoResult(f, 'filled cells do not reveal a correction or auto-clear');
  assert.match(f.calls.toast.at(-1), /已有数字.*先清空/);
}
{
  const {s, $, calls} = fixture();
  const wrong = s.game.board.findIndex((v,i) => !v && i !== s.game.selected);
  s.game.board[wrong] = s.game.solution[wrong] % 9 + 1;
  const before = clone(s.game);
  s.requestHint();
  assert.equal(s.pendingHint.index, before.selected, 'a wrong entry elsewhere does not redirect selection');
  assert.equal($('hint-value').textContent, String(before.solution[before.selected]));
  assert.equal($('hint-text').textContent, '另有已填错误', 'retain only the meaningful warning');
  assert.equal(calls.status.length, 0, 'warning is not repeated in board status');
  assertUnchanged(before, s.game); assert.equal(calls.toast.length, 0);
}
for (const field of ['board', 'givens', 'solution']) {
  for (const mutation of ['missing', 'short', 'invalid', 'fractional', 'sparse']) {
    const f = fixture(), g = f.s.game;
    if (mutation === 'missing') g[field] = null;
    if (mutation === 'short') g[field] = g[field].slice(1);
    if (mutation === 'invalid') g[field][g.selected] = field === 'solution' ? 0 : 10;
    if (mutation === 'fractional') g[field][g.selected] = 2.5;
    if (mutation === 'sparse') delete g[field][g.selected];
    assertNoResult(f, field + ' ' + mutation + ' fails closed');
    assert.match(f.calls.toast.at(-1), /答案无法验证/);
  }
}
for (const mode of modes) {
  const f = fixture(mode), g = f.s.game;
  g.solution[g.selected] = g.solution[g.selected] % 9 + 1;
  assertNoResult(f, mode + ' rejects invalid completed solution');
}
for (const field of ['board', 'solution']) {
  const f = fixture(), g = f.s.game, given = g.givens.findIndex(Boolean);
  g[field][given] = g.givens[given] % 9 + 1;
  assertNoResult(f, 'answers and board must respect all givens');
}
{
  const f = fixture();
  f.s.Engine = Object.assign({}, Engine, {validateComplete(){throw Error('invalid variant metadata');}});
  assertNoResult(f, 'variant-validation failure is contained');
  assert.match(f.calls.toast.at(-1), /答案无法验证/);
}
for (const blocked of ['paused','completed','unstarted','branch','logicMode','generatingPuzzle','storageTransition','dialogOpen']) {
  const f = fixture(), {s, $} = f;
  s.requestHint(); assert(!$('hint-panel').hidden);
  if (blocked === 'unstarted') s.game.started = false;
  else if (blocked === 'branch') s.game.branch = {activeId:'b1'};
  else if (['generatingPuzzle','storageTransition','dialogOpen'].includes(blocked)) s[blocked] = true;
  else s.game[blocked] = true;
  const before = clone(s.game), oldSaves = f.calls.save.length;
  // No answer oracle or even stored answer access is allowed in pure logic/branches.
  if (blocked === 'logicMode' || blocked === 'branch') {
    Object.defineProperty(s.game, 'solution', {get(){throw Error('answer read in rule-only mode');}, configurable:true});
    s.Engine = new Proxy(Engine, {get(target,key){if (['validateComplete','solve','getHint'].includes(key)) throw Error('answer oracle'); return target[key];}});
  }
  s.renderHint();
  assert.equal(s.pendingHint, null, blocked + ' clears cached result');
  assert($('hint-panel').hidden); assert.equal($('hint-value').textContent, '');
  assert.equal(s.hintSignature(), blocked === 'logicMode' || blocked === 'branch' ? null : s.hintSignature());
  s.requestHint();
  assert.equal(s.pendingHint, null); assert.equal(f.calls.save.length, oldSaves);
  if (blocked === 'logicMode' || blocked === 'branch') {
    assert.match(s.selectedHintResult().message, /不揭晓答案/);
    Object.defineProperty(s.game, 'solution', {value:before.solution, configurable:true});
  }
  assert.deepEqual(clone(s.game), before, blocked + ' does not mutate game');
}
for (const changed of ['selected','board','givens','solution','puzzleId','clues']) {
  const {s, $} = fixture(); s.requestHint();
  if (changed === 'selected') s.game.selected = s.game.board.findIndex((v,i) => !v && i !== s.game.selected);
  if (changed === 'board') s.game.board[s.game.selected] = s.game.solution[s.game.selected];
  if (changed === 'givens') s.game.givens[s.game.selected] = s.game.solution[s.game.selected];
  if (changed === 'solution') s.game.solution[s.game.selected] = s.game.solution[s.game.selected] % 9 + 1;
  if (changed === 'puzzleId') s.game.puzzleId += '-new';
  if (changed === 'clues') s.game.clues = {changed:true};
  s.renderHint();
  assert.equal(s.pendingHint, null, changed + ' invalidates stale answers');
  assert($('hint-panel').hidden); assert.equal($('hint-value').textContent, '');
}
{
  const {s, $} = fixture(); s.window.NineRealmsWorkspace = null; s.requestHint();
  assert.equal($('hint-panel').scrolls, 1, 'standalone shell reveals the result');
}
assert(!/function (advanceHint|applyHint)\(/.test(source), 'no staged or auto-apply controller remains');
assert(!/bind\("hint-(next|apply)"/.test(source), 'no staged or auto-apply bindings remain');
assert(!/pendingHint\.step/.test(source), 'board highlighting uses one selected result');
assert.match(source, /\$\("hint-btn"\)\.disabled = blocked \|\| ruleOnly\(\)/, 'pure logic/branch button stays disabled');
console.log('PASS direct selected-cell hint: all 33 variants including multi-grids, read-only one-result display, unchanged notes/fog/history, repeat handling, invalid/missing/filled/given selections, corrupt solutions, wrong entries, lifecycle invalidation, and no answer reads in logic mode or branches.');
