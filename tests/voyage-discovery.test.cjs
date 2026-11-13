'use strict';
const assert = require('node:assert/strict');
const V = require('../src/voyage.js');
const C = require('../src/curated.js');
const stats = {elapsedMs: 10000, mistakes: 0, hints: 0};
let progress = V.migrateProgress(null, null, {existing: false});
assert.deepEqual(V.discovery(progress), []);
progress = V.award(progress, 'dawn', stats);
assert.equal(V.discovery(progress).length, 1);
assert.equal(V.discovery(progress)[0].puzzleId, 'curated-thermo-intro-1-v1');
progress = V.award(progress, 'orbit', stats);
const before = JSON.stringify(progress);
const encounters = V.discovery(progress);
assert.equal(encounters.length, 2);
assert.equal(JSON.stringify(progress), before, 'reading encounters never changes earned progress');
for (const encounter of encounters) {
  assert(C.getPuzzle(encounter.puzzleId));
  assert(!V.chapters().some(chapter => chapter.id === encounter.id));
  assert.throws(() => V.award(progress, encounter.id, stats), /未知/);
}
assert.equal(V.journey(progress).completed, 2);
assert.equal(V.worldState(progress).total, 16);
assert(!V.canEnter(progress, 'lines-rise-v1'));
assert(!V.canEnter(progress, 'sums-sparks-v1'));
for (const chapter of V.chapters('legacy').slice(2)) progress = V.award(progress, chapter.id, stats);
assert.deepEqual(V.discovery(progress), []);
assert(V.canEnter(progress, 'lines-rise-v1'));
assert(V.canEnter(progress, 'sums-sparks-v1'));
console.log('voyage discovery: early variants preserve all sixteen chapter identities and unlocks');
