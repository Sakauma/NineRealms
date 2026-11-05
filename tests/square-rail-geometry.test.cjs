/* Assertion self-tests only: these synthetic rectangles are not render evidence. */
'use strict';
const assert = require('node:assert/strict');
const {assertSquareRailGeometry} = require('./square-rail-geometry.cjs');
const rectangle = (top, height, left = 824, width = 301) =>
  ({top, height, bottom:top + height, left, width, right:left + width});
function fixture(heights = [58, 440, 14, 31], zen = false, boardSize = 620) {
  const gap = 14, intrinsic = heights.reduce((sum, value) => sum + value, 0) + (heights.length - 1) * gap;
  const tools = rectangle(180, Math.max(boardSize, intrinsic), 805, 320);
  let top = tools.top;
  const children = heights.map((height, index) => {
    if (index === 2) top += Math.max(0, boardSize - intrinsic);
    const child = {id:String(index), ...rectangle(top, height)}; top = child.bottom + gap; return child;
  });
  return {board:rectangle(180, boardSize, 781-boardSize, boardSize), tools, children, gap,
    keys:Array.from({length:9}, () => rectangle(0, 301 / 3 - 20 / 3, 0, 301 / 3 - 20 / 3)),
    insetTop:0, insetBottom:0, nestedScroll:false, horizontalOverflow:false,
    hint:rectangle((zen ? tools : children[1]).bottom - 44, 44), hintParent:'play-controls',
    controls:zen ? children[0] : children[1], newGameVisible:false,
    status:rectangle(tools.bottom + 16, 28, 161, 620),
    newGame:rectangle(zen ? tools.bottom - 44 : children[1].bottom - 44, 44), zen};
}
assert.equal(assertSquareRailGeometry(fixture()).overflow, false);
assert.equal(assertSquareRailGeometry(fixture([58, 510, 14, 31])).overflow, true);
assert.equal(assertSquareRailGeometry(fixture([620], true)).overflow, false);
const left = fixture();
left.handedness = 'left';
left.board = rectangle(180,620,505,620); left.tools = rectangle(180,620,161,320);
left.children = left.children.map(child=>({...child,left:161,right:462}));
left.controls = left.children[1];
left.hint = rectangle(left.controls.bottom-44,44,161,301);
left.status = rectangle(left.tools.bottom+16,28,505,620);
assert.equal(assertSquareRailGeometry(left).overflow, false);
const multi = fixture(undefined, false, 760);
multi.alerts = rectangle(98,66,multi.board.left,multi.tools.right-multi.board.left);
assert.equal(assertSquareRailGeometry(multi).overflow, false);
const failures = [
  ['rectangular digits', g => { g.keys[0].height = 80; }],
  ['empty stretched rail', g => { g.children.at(-1).bottom -= 20; }],
  ['unanchored rail', g => { g.tools.height = 590; g.tools.bottom -= 30; }],
  ['overlapping footer', g => { g.children.at(-1).top = g.children.at(-2).bottom - 1; }],
  ['nested rail scroll', g => { g.nestedScroll = true; }],
  ['status over taller rail', g => { g.status.top = g.tools.bottom - 1; }],
  ['hint escapes input rail', g => { g.hint.bottom = g.tools.bottom + 20; }],
  ['hint returns below rail', g => { g.hintParent = 'desktop-help'; }],
  ['hint enlarges final action row', g => { g.hint.height = 78; }],
  ['hint overlaps visible New Game', g => { g.newGameVisible = true; }],
  ['hint overlaps a numeric key', g => { g.keys[0].bottom = g.hint.top + 1; }],
  ['hint escapes input width', g => { g.hint.right += 20; }],
  ['rectangular board card', g => { g.board.width -= 10; }],
  ['board overlaps input rail', g => { g.tools.left = g.board.right - 1; }],
  ['left-handed rail on wrong side', g => { g.handedness = 'left'; }],
  ['multi navigation overlaps main row', g => { g.alerts = rectangle(98,90,161,964); }],
  ['multi navigation spans only board', g => { g.alerts = rectangle(98,66,161,620); }]
];
for (const [label, mutate] of failures) {
  const geometry = fixture(); mutate(geometry);
  assert.throws(() => assertSquareRailGeometry(geometry), assert.AssertionError, label + ' must fail');
}
console.log('PASS square/rail assertion self-tests: 5 synthetic fit/overflow/Zen/left-hand/multi cases and 17 rejected regressions. Not a browser geometry pass.');
