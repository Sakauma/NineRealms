'use strict';
const assert = require('node:assert/strict');
const E = require('../src/engine.js'), L = require('../src/logic.js'), H = require('../src/hints.js');
const blank = () => Array(81).fill(0);
for (const mode of L.supported) {
  const p = E.getPuzzle('easy', 'logic-scope-' + mode, mode);
  assert.equal(L.scope({mode, clues:p.clues}).complete, true, mode);
  assert(L.complete(p.solution, {mode, clues:p.clues}));
  assert.deepEqual(L.conflicts(p.givens, {mode, clues:p.clues}), []);
}
for (const mode of E.getModes().map(m => m.id).filter(m => !L.supported.includes(m))) {
  const p = E.getPuzzle('easy', 'partial-' + mode, mode), scope = L.scope({mode, clues:p.clues});
  assert.equal(scope.complete, false, mode);
  assert.match(scope.message, /附加规则暂未检查/);
  assert.equal(L.complete(p.solution, {mode, clues:p.clues}), false);
  assert.deepEqual(L.conflicts(p.givens, {mode, clues:p.clues}), E.getConflicts(p.givens, 'classic'));
}
const diagonal = blank(); diagonal[0] = diagonal[40] = 4;
assert.deepEqual(L.conflicts(diagonal, 'classic'), []);
assert.deepEqual(L.conflicts(diagonal, 'diagonal'), [0,40]);
const knight = blank(); knight[2] = knight[13] = 5;
assert.deepEqual(L.conflicts(knight, 'classic'), []);
assert.deepEqual(L.conflicts(knight, 'knight'), [2,13]);
const p = E.getPuzzle('easy', 'rule-only-regression', 'classic');
const board = p.givens.slice(), wrong = board.findIndex((v,i) => !v && E.candidates(board,i,'classic').some(n => n !== p.solution[i]));
board[wrong] = E.candidates(board,wrong,'classic').find(n => n !== p.solution[wrong]);
const before = JSON.stringify(board);
assert.deepEqual(L.conflicts(board, 'classic'), [], 'a solution mismatch alone is never a rule conflict');
const masks = L.masks(board, 'classic'); assert.equal(masks[wrong],0);
for (const key of ['solve','analyzeSolutions','countSolutions','getHint']) E[key] = () => { throw Error('answer/search oracle used: ' + key); };
const hint = H.getLogicalStep(board,p.givens,'classic',Array(81).fill(0));
if (hint) { assert(!['solution','correction'].includes(hint.kind)); assert(!/唯一解|对照本题|直接展示/.test(hint.explanation)); }
assert.equal(H.getLogicalStep(diagonal,blank(),'classic'),null);
assert.equal(H.getLogicalStep(p.givens,p.givens,'diagonal'),null);
assert.equal(JSON.stringify(board),before);
console.log('PASS logic mode: explicit full/partial rule scopes, conflict-only observations, bounded classic proof hints without any solution or search oracle, input immutability.');
