'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const css = fs.readFileSync(path.join(__dirname, '../src/desktop-workspace.css'), 'utf8');
const rule = css.match(/(?:^|\n)\.desktop-board-area\s*\{([^}]+)\}/);
assert(rule, 'desktop board area rule exists');
assert(!/position\s*:\s*(sticky|fixed|absolute)\b/.test(rule[1]),
  'board must remain in normal grid flow with its following status row');
assert(!/(?:^|;)\s*(?:top|bottom|inset|transform|translate)\s*:/.test(rule[1]),
  'board wrapper cannot be visually offset independently of its following status row');
assert(/grid-row\s*:\s*2(?:;|$)/.test(rule[1]));
assert(/\.desktop-status\{[^}]*grid-row:3/.test(css));
assert(css.includes('>.desktop-status{grid-row:4}'), 'status still follows board when alert row is visible');
console.log('PASS desktop scroll static guard: board wrapper remains in normal flow; status row preserved. Not a browser geometry or visual pass.');
