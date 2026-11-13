/* Production board-view and direct-hint functions on a dependency-free DOM
 * facade. This checks game behavior and clue data, not rendered geometry. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Engine = require('../src/engine.js');
const app = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
function productionFunction(name) {
  const start = app.indexOf('  function ' + name + '(');
  assert(start >= 0, 'production function exists: ' + name);
  const first = app.slice(start, app.indexOf('\n', start));
  if (/\}\s*$/.test(first)) return first;
  const end = app.indexOf('\n  }', start + 1);
  assert(end > start, 'production function ends: ' + name);
  return app.slice(start, end + 4);
}
function node() {
  const attributes = {}, classes = new Set();
  return {hidden:false, dataset:{}, textContent:'', children:[], value:'',
    style:{setProperty(name, value) { this[name] = String(value); }},
    classList:{toggle(name, on) { if (on) classes.add(name); else classes.delete(name); }, contains:name=>classes.has(name)},
    setAttribute(name, value) { attributes[name] = String(value); },
    getAttribute:name=>attributes[name] ?? null,
    appendChild(child) { this.children.push(child); }, replaceChildren() { this.children = []; },
    querySelectorAll() { return []; }, scrollIntoView() {}};
}
function fixture(mode) {
  const puzzle = Engine.getPuzzle('easy', 'unified-view-state-' + mode, mode);
  const game = {...puzzle, puzzleId:puzzle.id, started:true, paused:false, completed:false,
    logicMode:false, branch:null, board:puzzle.givens.slice(), notes:puzzle.givens.map(()=>0),
    selected:puzzle.givens.findIndex(value=>!value), hints:0, mistakes:0,
    fog:false, fogSeen:puzzle.givens.map(()=>false), history:[], redo:[], energy:{combo:5, amount:34}};
  const nodes = new Map(), $ = id => {
    if (!nodes.has(id)) nodes.set(id, node());
    return nodes.get(id);
  };
  $('hint-panel').hidden = true;
  const document = {body:node(), createElement:node};
  const calls = {save:0, reveal:0, selectSync:0, variant:[]};
  const s = {Engine, game, $, document, boardElement:$('board'), boardRows:null, boardLayout:Engine.getLayout(puzzle),
    activeBoardId:'all', cells:game.board.map(node), MODES:Engine.getModes(), PUZZLE_CATALOG:[],
    pendingHint:null, generatingPuzzle:false, storageTransition:false, noteMode:true,
    gameContext:()=>({mode:game.mode, clues:game.clues}), inBranch:()=>!!game.branch,
    dialogIsOpen:()=>false, setStatus(){}, toast(){}, save(){ calls.save++; },
    modeInfo:id=>Engine.getModes().find(mode=>mode.id===id),
    difficultyInfo:(mode,id)=>Engine.getDifficulties(mode).find(entry=>entry.id===id),
    cellLocation:index=>Engine.getCellLabel(index, {mode:game.mode, clues:game.clues}),
    window:{NineRealmsSelect:{syncAll(){ calls.selectSync++; }},
      NineRealmsWorkspace:{revealHint(){ calls.reveal++; }},
      SudokuVariantView:{render(element, context){ calls.variant.push(clone(context)); return 'variant legend'; }}}};
  vm.runInContext(['applyBoardView', 'renderModeControls', 'isMulti', 'ruleOnly', 'isBoard',
    'respectsGivens', 'canTravelEdit', 'canInteract', 'hintSignature', 'selectedHintResult',
    'renderHint', 'requestHint'].map(productionFunction).join('\n'), vm.createContext(s));
  s.render = () => s.renderHint();
  return {s, $, calls};
}
const modes = Engine.getModes();
assert.equal(modes.length, 33, 'all released modes are covered');
const outsideModes = [], multiModes = [];
let views = 0, answers = 0;
for (const {id:mode} of modes) {
  const {s, $, calls} = fixture(mode), g = s.game, layout = s.boardLayout;
  const multi = layout.cellCount > 81, outside = !!g.clues?.outside?.length;
  if (multi) multiModes.push(mode);
  if (outside) outsideModes.push(mode);
  const before = clone(g), cells = s.cells.slice(), clues = g.clues;
  s.renderModeControls(); s.applyBoardView();
  assert.equal(s.document.body.dataset.mode, mode);
  assert.equal(s.document.body.dataset.multi, String(multi));
  assert.equal(s.document.body.dataset.outsideClues, String(outside));
  assert.equal($('mode-rule').textContent, modes.find(entry=>entry.id===mode).description);
  assert.equal($('multigrid-tools').hidden, !multi);
  assert.deepEqual(clone(g), before, mode + ': mode/view rendering never edits game data');
  assert.equal(g.clues, clues, mode + ': immutable variant clue identity is retained');
  if (multi) assert.equal(calls.variant.length, 0, 'multi-grid keeps its own board renderer');
  else assert.deepEqual(calls.variant.at(-1), {mode, clues:clone(clues)}, 'variant renderer receives complete unchanged clues');
  const sequence = multi ? ['all', ...layout.boards.map(board=>board.id), 'all', 'missing-board', ...layout.boards.map(board=>board.id).reverse(), 'all'] : ['all', 'missing-board', 'all'];
  for (const id of sequence) {
    const focused = layout.boards.find(board=>board.id===id), expectedId = focused ? id : 'all';
    s.activeBoardId = id;
    const stable = clone(g), saves = calls.save;
    s.applyBoardView();
    assert.equal(s.activeBoardId, expectedId, mode + ': invalid detail falls back to overview');
    assert.equal($('grid-view').value, expectedId);
    assert.equal(s.document.body.dataset.multiView, focused ? 'detail' : 'overview');
    assert.equal(s.boardElement.getAttribute('aria-rowcount'), String(focused ? 9 : layout.columns));
    assert.equal(s.boardElement.getAttribute('aria-colcount'), String(focused ? 9 : layout.columns));
    assert.equal(s.boardElement.style['--board-dimension'], String(focused ? 9 : layout.columns));
    assert.equal(s.cells.filter(cell=>!cell.hidden).length, focused ? 81 : layout.cellCount);
    for (let index = 0; index < layout.cellCount; index++) {
      assert.equal(s.cells[index], cells[index], 'view never clones or replaces live cells');
      const position = layout.cells[index], local = focused ? position.boards.find(board=>board.id===id) : position;
      assert.equal(s.cells[index].hidden, !local);
      if (!local) continue;
      assert.equal(s.cells[index].getAttribute('aria-rowindex'), String(local.row + 1));
      assert.equal(s.cells[index].getAttribute('aria-colindex'), String(local.col + 1));
      assert.equal(s.cells[index].classList.contains('shared-cell'), multi && position.boards.length > 1);
    }
    assert.deepEqual(clone(g), stable, mode + '/' + id + ': view switching is nonmutating');
    assert.equal(calls.save, saves, 'view switching never writes persistence');
    views++;
    if (id === 'missing-board') continue;
    const selected = g.board.findIndex((value,index)=>!value && !s.cells[index].hidden);
    assert(selected >= 0, 'each view has an editable hint target');
    g.selected = selected; g.notes[selected] = 511;
    s.pendingHint = null; s.renderHint();
    const hintBefore = clone(g);
    s.requestHint();
    assert.equal(s.pendingHint.index, selected, mode + '/' + id + ': hint remains on selected cell');
    assert.equal($('hint-value').textContent, String(g.solution[selected]));
    const firstLocation=s.cellLocation(selected).split(' / ')[0];
    assert.equal($('hint-title').textContent, '提示 · '+(/^第/.test(firstLocation)?firstLocation.replace(/\s+/g,''):firstLocation.replace(/第\s*(\d+)\s*行第\s*(\d+)\s*列/, '$1行$2列')));
    assert.equal($('hint-title').title, s.cellLocation(selected), 'full shared-cell coordinates remain available');
    assert.equal($('hint-text').textContent, '', 'valid view hint contains only location and result');
    assert.equal($('hint-panel').hidden, false);
    const expected = clone(hintBefore); expected.hints++; expected.energy.combo = 0;
    assert.deepEqual(clone(g), expected, 'revealing an answer preserves board, notes, clues, selection, fog and history');
    const repeated = clone(g); s.requestHint();
    assert.deepEqual(clone(g), repeated, 'repeated open hint does not consume another hint');
    answers++;
  }
}
assert.deepEqual(multiModes, ['twin', 'samurai']);
assert.deepEqual(outsideModes, ['sandwich', 'skyscraper', 'xsum', 'littlekiller']);
console.log('PASS unified mode game/view state: all 33 modes, ' + views + ' overview/detail/invalid-view transitions, ' + answers + ' selected hints, immutable outside clues, original multi-grid cells and unchanged game data. Extracted production functions with a DOM facade, not a browser pass.');
