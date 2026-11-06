/* Check the multi-grid high-contrast borders in a real Chromium CSS engine. */
'use strict';
const assert = require('node:assert/strict');
const Engine = require('../src/engine.js');
const {launch, fixture} = require('./browser-helper.cjs');

(async () => {
  const browser = await launch();
  try {
    for (const mode of ['twin', 'samurai']) {
      const state = fixture('readability-' + mode);
      const puzzle = Engine.getPuzzle('easy', 'reading-test', mode);
      Object.assign(state.game, {
        mode, puzzleId: puzzle.id, sourceId: puzzle.sourceId, clues: puzzle.clues,
        givens: puzzle.givens, solution: puzzle.solution, board: puzzle.givens.slice(),
        notes: puzzle.givens.map(() => 0), selected: puzzle.givens.findIndex(value => !value)
      });
      state.preferences.lineContrast = 'strong';
      await browser.load(state, '/dist/index.html');
      const result = await browser.evaluate(`(() => {
        const cells = [...document.querySelectorAll('#board .cell')];
        return {
          multi: document.body.dataset.multi,
          contrast: document.body.dataset.lineContrast,
          marked: cells.filter(cell => cell.getAttribute('style')?.includes('--reading-strong-width')).length,
          strong: cells.filter(cell => {
            const style = getComputedStyle(cell);
            return style.borderRightWidth === '3px' || style.borderBottomWidth === '3px';
          }).length
        };
      })()`);
      assert.equal(result.multi, 'true', mode);
      assert.equal(result.contrast, 'strong', mode);
      assert(result.marked > 0 && result.strong > 0, mode + ': strong borders must render');
    }
    console.log('PASS Chromium high-contrast borders for twin and samurai boards.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
