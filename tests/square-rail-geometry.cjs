/* Rendered rectangles only. Calling the collector requires a real browser;
 * its Node self-test exercises assertion failures, not CSS rendering. */
'use strict';
const assert = require('node:assert/strict');

function readSquareRailGeometry() {
  const rect = element => element.getBoundingClientRect().toJSON();
  const tools = document.querySelector('.desktop-tools');
  const style = getComputedStyle(tools);
  const number = value => parseFloat(value) || 0;
  const children = [...tools.children].filter(element => !element.hidden &&
    getComputedStyle(element).display !== 'none').map(element => ({
      id:element.id || element.className, ...rect(element)
    }));
  const hint = document.querySelector('#hint-panel');
  const alerts = document.querySelector('.desktop-board-alerts');
  const alertRect = alerts && rect(alerts);
  return {
    board:rect(document.querySelector('#board-card')), tools:rect(tools), children,
    keys:[...document.querySelectorAll('#number-pad button')].map(rect),
    gap:number(style.rowGap),
    insetTop:number(style.paddingTop) + number(style.borderTopWidth),
    insetBottom:number(style.paddingBottom) + number(style.borderBottomWidth),
    nestedScroll:[tools, ...tools.querySelectorAll('.control-panel,#play-controls,#number-pad')]
      .some(element => /^(auto|scroll)$/.test(getComputedStyle(element).overflowY) &&
        element.scrollHeight > element.clientHeight + 1),
    horizontalOverflow:document.documentElement.scrollWidth > innerWidth,
    hint:hint.hidden ? null : rect(hint), hintParent:hint.parentElement.id || hint.parentElement.className,
    controls:rect(document.querySelector('#play-controls')),
    newGameVisible:getComputedStyle(document.querySelector('#new-game')).display !== 'none',
    status:rect(document.querySelector('.desktop-status')),
    newGame:rect(document.querySelector('#new-game')),
    alerts:alertRect && alertRect.height > 0 ? alertRect : null,
    handedness:document.body.dataset.handedness || 'right',
    zen:document.body.dataset.zen === 'on'
  };
}

function assertSquareRailGeometry(geometry, label = 'desktop') {
  const g = geometry;
  // CSS grid tracks are subpixel-rounded independently of their aspect ratio.
  const close = (actual, expected, message) => assert(Math.abs(actual - expected) <= .25,
    label + ': ' + message + ' (' + actual + ' vs ' + expected + ')');
  close(g.tools.top, g.board.top, 'board and tools start together');
  close(g.board.width, g.board.height, 'the real board card keeps its square shape');
  const leftHanded = g.handedness === 'left';
  close(leftHanded ? g.board.left - g.tools.right : g.tools.left - g.board.right,
    24, 'board and keypad retain a nonoverlapping gutter in either handedness');
  if (g.alerts) {
    assert(g.alerts.bottom <= g.board.top - 15.75, label + ': multi-navigation and alerts sit before both main columns');
    assert(g.alerts.left <= Math.min(g.board.left, g.tools.left) + .25 &&
      g.alerts.right >= Math.max(g.board.right, g.tools.right) - .25,
      label + ': visible multi-navigation and alerts span both columns');
  }
  for (const key of g.keys) {
    close(key.width, key.height, 'each digit is truly square');
    close(key.width, g.keys[0].width, 'equal digit width');
    close(key.height, g.keys[0].height, 'equal digit height');
    assert(key.width >= 83 - .25, label + ': square targets retain readable desktop size');
  }
  assert.equal(g.keys.length, 9, label + ': all nine input keys remain');
  assert(g.children.length, label + ': visible rail content exists');
  const intrinsic = g.children.reduce((sum, child) => sum + child.height, 0) +
    Math.max(0, g.children.length - 1) * g.gap + g.insetTop + g.insetBottom;
  close(g.tools.height, Math.max(g.board.height, intrinsic),
    'rail matches board or expands naturally for intrinsic content');
  close(g.children.at(-1).bottom, g.tools.bottom - g.insetBottom,
    'visible last rail section, not an empty wrapper, reaches the lower edge');
  for (let index = 0; index < g.children.length; index++) {
    const child = g.children[index];
    assert(child.top >= g.tools.top + g.insetTop - .25 &&
      child.bottom <= g.tools.bottom - g.insetBottom + .25, label + ': rail content is not clipped');
    if (index) assert(child.top >= g.children[index - 1].bottom + g.gap - .25,
      label + ': visible rail sections do not overlap or collapse their gap');
  }
  assert(!g.nestedScroll, label + ': oversized rail uses document scrolling');
  assert(!g.horizontalOverflow, label + ': no horizontal overflow');
  assert(g.status.top >= Math.max(g.board.bottom, g.tools.bottom) + 15.75,
    label + ': status follows the taller main column');
  if (g.hint) {
    assert.equal(g.hintParent, 'play-controls', label + ': hint stays in the primary controls');
    assert.equal(g.newGameVisible, false, label + ': hint replaces New Game instead of overlapping it');
    close(g.hint.height, 44, 'hint occupies the existing 44px action row');
    close(g.hint.bottom, g.controls.bottom, 'hint occupies the final control row');
    assert(g.hint.top >= g.controls.top - .25 && g.hint.bottom <= g.tools.bottom + .25,
      label + ': hint remains contained in both controls and input rail');
    assert(g.hint.top >= Math.max(...g.keys.map(key=>key.bottom)) + 9.75,
      label + ': hint leaves the keypad and its normal gutter unobscured');
    close(g.hint.left, g.controls.left, 'hint starts at input content edge');
    close(g.hint.right, g.controls.right, 'hint ends at input content edge');
  }
  if (g.zen) close((g.hint || g.newGame).bottom, g.tools.bottom - g.insetBottom,
    'Zen anchors the visible final action/result at the board bottom');
  return {intrinsic, overflow:intrinsic > g.board.height + .25};
}

module.exports = {readSquareRailGeometry, assertSquareRailGeometry};
