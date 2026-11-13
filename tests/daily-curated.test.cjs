'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Daily = require('../src/daily.js');
const Engine = require('../src/engine.js');
const fixtures = require('./fixtures/compatibility.json');
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const dateAt = offset => new Date(Date.parse('2026-11-14T00:00:00Z') + offset * 86400000).toISOString().slice(0, 10);
const matches = (key, p, clues = p.clues) => Daily.matchesPuzzle(key, p.givens, p.mode, p.difficulty, clues);
for (const item of fixtures.daily) {
  assert.equal(hash(Daily.getLegacyPuzzle(item.date)), item.sha256, `v1 changed: ${item.date}`);
  if (item.date < Daily.curatedStart) assert.equal(hash(Daily.getPuzzle(item.date)), item.sha256);
  assert(matches(item.date, Daily.getLegacyPuzzle(item.date)), 'old-version saves remain resumable');
}
assert.equal(Daily.dateKey('2026-11-13T15:59:59Z'), '2026-11-13');
assert.equal(Daily.dateKey('2026-11-13T16:00:00Z'), Daily.curatedStart);
const slots = {1:'thermo',4:'killer',8:'arrow',11:'thermo-killer'};
const selected = new Set();
for (let offset = -30; offset < 84; offset++) {
  const key = dateAt(offset), p = Daily.getCuratedPuzzle(key);
  assert.deepEqual(Daily.getCuratedPuzzle(key), p, 'deterministic daily selection');
  assert.equal(p.dailyDate, key);
  assert(matches(key, p));
  assert(matches(key, Daily.getLegacyPuzzle(key)));
  const mode = offset >= 0 && slots[offset % 14];
  if (!mode) {
    assert.deepEqual(p, Daily.getLegacyPuzzle(key), 'non-variant dates keep exact v1 puzzle');
    continue;
  }
  assert.equal(p.mode, mode);
  assert.equal(p.curatedLevel, 'intro');
  assert(['easy','medium'].includes(p.difficulty), 'daily selection must stay approachable');
  assert.equal(p.curatedId, `curated-${mode}-intro-${Math.floor(offset / 14) % 2 + 1}-v1`);
  selected.add(p.curatedId);
  assert.equal(Daily.matchesPuzzle(key, p.givens, p.mode, p.difficulty), false, 'missing rules cannot claim daily identity');
  assert.equal(matches(key, p, {}), false);
  const clues = JSON.parse(JSON.stringify(p.clues));
  const field = ['cages','lines'].find(field => clues[field] && clues[field].length);
  assert(field, 'curated puzzle must have variant clues');
  clues[field].pop();
  assert.equal(matches(key, p, clues), false, 'modified rule geometry cannot claim daily identity');
  assert.equal(matches(key, p, {...p.clues, extra:true}), false, 'unknown constraints rejected');
  const wrong = {...p,givens:p.givens.slice()};
  wrong.givens[0] = (wrong.givens[0] + 1) % 10;
  assert.equal(matches(key, wrong), false);
}
assert.equal(selected.size, 8);
for (const id of selected) {
  const p = require('../src/curated.js').getPuzzle(id);
  const result = Engine.analyzeSolutions(p.givens, {mode:p.mode,clues:p.clues}, {limit:2,maxNodes:1000000});
  assert.equal(result.count,1,id);
  assert.equal(result.exhausted,false,id);
}
const key = dateAt(1), first = {elapsedMs:93000,mistakes:0,hints:1};
let records = Daily.recordCompletion({},key,first);
records = Daily.recordCompletion(records,key,{elapsedMs:100,mistakes:5,hints:9});
assert.deepEqual(records[key],first,'switching daily schedules never replaces first completion');
assert.deepEqual(Daily.getStats(records,key),{total:1,streak:1,todayCompleted:true});
assert.equal(Daily.hasCompletion(records,key),true);
assert.equal(Daily.matchesPuzzle('2026-02-30',[], 'thermo','easy',{}),false);
assert.equal(Daily.matchesPuzzle(key,Array(81).fill(0),'thermo','easy',{lines:null}),false);
console.log('daily curated: pinned schedule, uniqueness, complete clue identity, Beijing cutoff and legacy preservation passed');
