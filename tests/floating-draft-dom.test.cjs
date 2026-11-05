/* Dependency-free shell regression with a fake DOM and synthetic geometry.
 * This checks placement decisions and events, not CSS rendering, real hit targets,
 * browser pointer-capture behavior, contrast, or puzzle-data integration. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/floating-draft.js'), 'utf8');
const box = (left, top, width, height) => ({left, top, width, height, right:left + width, bottom:top + height});
const overlap = (a, b) => a.width > 0 && a.height > 0 && b.width > 0 && b.height > 0 && a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;

function fixture(width = 1500, height = 900, options = {}) {
  const timers = [], observers = [], mutations = [], scrolls = [], captures = new Map();
  const state = {width, height, column:600, toolsWidth:Math.min(320, Math.max(288, width * .24)), gap:24, selected:box(0, 0, 0, 0), controls:null, modal:false, syncs:0, selectCloses:0};
  class Target {
    constructor() { this.listeners = new Map(); }
    addEventListener(type, fn) { const list = this.listeners.get(type) || []; list.push(fn); this.listeners.set(type, list); }
    dispatchEvent(event) {
      if (!event.target) event.target = this;
      event.currentTarget = this;
      for (const fn of this.listeners.get(event.type) || []) fn(event);
      if (event.bubbles && !event.stopped && this.parentElement) this.parentElement.dispatchEvent(event);
      return !event.defaultPrevented;
    }
  }
  const doc = new Target();
  const ids = new Map();
  class Element extends Target {
    constructor(id, tagName = 'DIV') {
      super(); this.id = id; this.tagName = tagName; this.parentElement = null; this.children = []; this.dataset = {}; this.attributes = {}; this.hidden = false; this.disabled = false; this.textContent = ''; this.inert = false;
      this.style = {setProperty(name, value) { this[name] = value; }, getPropertyValue(name) { return this[name] || ''; }, removeProperty(name) { delete this[name]; }};
      const classes = new Set(); this.classList = {add:name => classes.add(name), remove:name => classes.delete(name), contains:name => classes.has(name)};
      ids.set(id, this);
    }
    appendChild(node) {
      if (node.parentElement) node.parentElement.children.splice(node.parentElement.children.indexOf(node), 1);
      node.parentElement = this; this.children.push(node); return node;
    }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    get isConnected() { return this === doc.body || !!this.parentElement?.isConnected; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name] ?? null; }
    focus(options) { doc.activeElement = this; this.lastFocusOptions = options; doc.dispatchEvent(event('focusin', {target:this})); }
    click() { this.dispatchEvent(event('click', {bubbles:true})); }
    matches() { return this.tagName === 'BUTTON'; }
    closest() { return this.id === 'selected-cell' || this.id === 'number-key' ? this : null; }
    querySelector(selector) { return this === panel && selector === '#draft-colors button:not(:disabled)' ? color : null; }
    scrollIntoView(options) { scrolls.push({id:this.id, ...options}); }
    setPointerCapture(id) { captures.set(id, this); this.captureCount = (this.captureCount || 0) + 1; }
    hasPointerCapture(id) { return captures.get(id) === this; }
    releasePointerCapture(id) { captures.delete(id); }
    getBoundingClientRect() { return this.rect ? this.rect() : box(0, 0, 0, 0); }
  }
  const body = new Element('body'); doc.body = body; body.parentElement = doc;
  const html = new Element('html'); doc.documentElement = html; doc.activeElement = body;
  const area = new Element('area'); body.appendChild(area);
  const context = new Element('desktop-context'); area.appendChild(context);
  const board = new Element('board-card'); area.appendChild(board);
  const input = new Element('control-panel'); area.appendChild(input);
  const more = options.moreTools ? new Element('more-tools-panel', 'SECTION') : null;
  if (more) area.appendChild(more);
  const trigger = new Element('draft-toggle', 'BUTTON');
  (more && !options.legacyTrigger ? more : input).appendChild(trigger); trigger.setAttribute('aria-expanded', 'false');
  const dock = new Element('draft-dock'); input.appendChild(dock);
  const panel = new Element('draft-panel', 'SECTION'); panel.hidden = true; dock.appendChild(panel);
  const placement = new Element('draft-placement'); panel.appendChild(placement);
  const close = new Element('draft-close', 'BUTTON'); panel.appendChild(close);
  const move = new Element('draft-move', 'BUTTON'); panel.appendChild(move);
  const resize = new Element('draft-resize', 'BUTTON'); panel.appendChild(resize);
  const reset = new Element('draft-reset-window', 'BUTTON'); panel.appendChild(reset);
  const color = new Element('draft-color', 'BUTTON'); panel.appendChild(color);
  const selected = new Element('selected-cell', 'BUTTON'); board.appendChild(selected);
  const key = new Element('number-key', 'BUTTON'); input.appendChild(key);
  body.dataset = {workspace:'unified', desktop:'on', handedness:'right'};
  function layout() {
    const rail = body.dataset.draftRail === 'on' ? parseFloat(body.style.getPropertyValue('--draft-rail-width')) || 0 : 0;
    const desktop = body.dataset.desktop === 'on';
    const shell = desktop ? state.column + state.toolsWidth + state.gap + (rail ? rail + state.gap : 0) : Math.max(0, Math.min(600, state.width - 24));
    const left = (state.width - shell) / 2;
    const reverse = body.dataset.handedness === 'left';
    const boardLeft = desktop ? left + (reverse ? state.toolsWidth + state.gap + (rail ? rail + state.gap : 0) : 0) : left;
    const controlsLeft = desktop ? left + (reverse ? (rail ? rail + state.gap : 0) : state.column + state.gap) : left;
    const boardSize = desktop ? state.column : shell;
    return {area:box(left, 100, shell, boardSize + 160), board:box(boardLeft, 100, boardSize, boardSize), controls:state.controls || box(controlsLeft, desktop ? 100 : boardSize + 124, desktop ? state.toolsWidth : shell, desktop ? 500 : 196)};
  }
  context.rect = () => box(0, 0, state.column, 44);
  board.rect = () => layout().board;
  area.rect = () => layout().area;
  input.rect = () => layout().controls;
  selected.rect = () => state.selected;
  key.rect = () => { const r = input.getBoundingClientRect(); return box(r.left, r.top, (state.toolsWidth - 39) / 3, Math.min(88, Math.max(72, state.height * .09)));  };
  panel.rect = () => {
    if (panel.hidden) return box(0, 0, 0, 0);
    if (panel.dataset.placement === 'docked') { const l = layout(); return box(l.area.left, Math.max(l.board.bottom, l.controls.bottom) + 24, l.area.width, parseFloat(panel.style.height) || 340); }
    return box(parseFloat(panel.style.left) || 0, parseFloat(panel.style.top) || 0, parseFloat(panel.style.width) || 340, parseFloat(panel.style.height) || 300);
  };
  doc.getElementById = id => ids.get(id) || null;
  doc.querySelector = selector => ({'.game-layout':area, '.desktop-context':context, '.control-panel':input, '.desktop-tools':input, '#board .cell.selected':selected, 'dialog[open]':state.modal ? {} : null}[selector] || null);
  const win = new Target(); win.document = doc;
  win.getComputedStyle = () => ({columnGap:state.gap + 'px'});
  Object.defineProperties(win, {innerWidth:{get:() => state.width}, innerHeight:{get:() => state.height}});
  const viewport = new Target(); Object.defineProperties(viewport, {width:{get:() => viewport._width ?? state.width}, height:{get:() => viewport._height ?? state.height}, offsetLeft:{get:() => viewport._left || 0}, offsetTop:{get:() => viewport._top || 0}}); win.visualViewport = viewport;
  win.setTimeout = fn => { timers.push(fn); return timers.length; };
  win.ResizeObserver = class { constructor(fn) { this.fn = fn; this.targets = []; observers.push(this); } observe(target) { this.targets.push(target); } };
  win.MutationObserver = class { constructor(fn) { this.fn = fn; mutations.push(this); } observe(target, options) { this.target = target; this.options = options; } };
  win.NineRealmsWorkspace = {sync() { state.syncs++; }};
  win.NineRealmsSelect = {close() { state.selectCloses++; }};
  vm.runInNewContext(source, {window:win}, {filename:'floating-draft.js'});
  const flush = () => { let count = 0; while (timers.length) { assert(++count < 30, 'scheduled placement must settle'); timers.shift()(); } };
  const safe = () => assert(!overlap(panel.getBoundingClientRect(), input.getBoundingClientRect()), 'draft must not overlap input region: ' + JSON.stringify({panel:panel.getBoundingClientRect(), input:input.getBoundingClientRect()}));
  const resizeViewport = (w, h, desktop = body.dataset.desktop) => { state.width = w; state.height = h; body.dataset.desktop = desktop; win.dispatchEvent(event('resize')); flush(); };
  return {win, doc, state, body, area, board, input, panel, more, trigger, dock, close, move, resize, reset, color, selected, key, viewport, timers, observers, mutations, captures, scrolls, flush, safe, resizeViewport, api:win.NineRealmsFloatingDraft};
}
function event(type, properties = {}) { return {type, bubbles:false, defaultPrevented:false, stopped:false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...properties}; }
function pointer(target, type, id, x, y, extra = {}) { const e = event(type, {bubbles:true, pointerId:id, clientX:x, clientY:y, button:0, isPrimary:true, ...extra}); target.dispatchEvent(e); return e; }
function key(target, value, shiftKey = false) { const e = event('keydown', {key:value, shiftKey, bubbles:true}); target.dispatchEvent(e); return e; }
function geometry(f) { const r = f.panel.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }
const checks = [];

{
  const f = fixture();
  assert(f.panel.hidden && f.dock.hidden); assert(!f.api.isOpen());
  f.trigger.click(); assert(f.api.isOpen()); assert(!f.panel.hidden); assert.equal(f.trigger.getAttribute('aria-expanded'), 'true');
  assert.equal(f.panel.parentElement, f.body); assert.equal(f.panel.dataset.placement, 'floating'); assert.equal(f.body.dataset.draftRail, 'on'); assert.equal(f.body.style.getPropertyValue('--draft-rail-width'), '340px'); assert.equal(f.doc.activeElement, f.color); f.safe();
  const initial = geometry(f); f.api.open(); assert.deepEqual(geometry(f), initial, 'open is idempotent');
  assert(f.observers[0].targets.includes(f.input), 'input geometry is observed');
  f.observers[0].fn(); f.observers[0].fn(); assert.equal(f.timers.length, 1, 'observer notifications coalesce'); f.flush(); assert.deepEqual(geometry(f), initial);
  key(f.move, 'ArrowRight'); assert.equal(f.panel.dataset.placement, 'manual'); assert.equal(geometry(f)[0], initial[0] + 8); f.safe();
  const beforeHeight = geometry(f)[3]; key(f.resize, 'ArrowDown', true); assert.equal(geometry(f)[3], beforeHeight + 32); f.safe();
  const saved = geometry(f); f.close.click(); assert(!f.api.isOpen() && f.panel.hidden); assert.equal(f.doc.activeElement, f.trigger); assert.equal(f.panel.parentElement, f.dock); assert.equal(f.body.dataset.draftRail, undefined); assert.equal(f.body.style.getPropertyValue('--draft-rail-width'), '');
  f.trigger.click(); assert.equal(f.panel.dataset.placement, 'manual'); assert.deepEqual(geometry(f), saved, 'manual geometry survives close/open in this session');
  key(f.color, 'Escape'); assert(f.panel.hidden); assert.equal(f.doc.activeElement, f.trigger); assert(f.state.selectCloses >= 2);
  f.state.modal = true; f.api.open(); assert(!f.api.isOpen()); f.state.modal = false; f.body.inert = true; f.api.open(); assert(!f.api.isOpen()); f.body.inert = false;
  checks.push('lifecycle, focus, modal/inert guard, rail, observer coalescing, keyboard adjustment and session geometry');
}
{
  const f = fixture(); f.api.open();
  const start = f.panel.getBoundingClientRect();
  pointer(f.move, 'pointerdown', 1, start.left + 20, start.top + 20); assert(f.captures.has(1));
  pointer(f.doc, 'pointermove', 9, 0, 0); assert.equal(f.panel.dataset.placement, 'floating', 'unrelated pointer ignored');
  for (const [x, y] of [[850, 180], [900, 400], [1200, 400], [-500, -500]]) { pointer(f.doc, 'pointermove', 1, x, y); f.safe(); }
  pointer(f.doc, 'pointerup', 1, -500, -500); assert(!f.captures.has(1)); assert(!f.panel.classList.contains('window-adjusting'));
  pointer(f.resize, 'pointerdown', 2, 400, 400); pointer(f.doc, 'pointermove', 2, 9999, 9999); f.safe();
  const large = f.panel.getBoundingClientRect(); assert(large.left >= 12 && large.top >= 12 && large.right <= f.state.width - 12 && large.bottom <= f.state.height - 12, 'huge requested resize stays in viewport');
  pointer(f.doc, 'pointercancel', 2, 9999, 9999); const canceled = geometry(f); pointer(f.doc, 'pointermove', 2, 0, 0); assert.deepEqual(geometry(f), canceled); assert(!f.captures.has(2));
  pointer(f.resize, 'pointerdown', 3, 400, 400); pointer(f.resize, 'lostpointercapture', 3, 400, 400); assert(!f.captures.has(3));
  pointer(f.move, 'pointerdown', 4, 400, 400); f.win.dispatchEvent(event('blur')); assert(!f.captures.has(4));
  const untouched = geometry(f); pointer(f.move, 'pointerdown', 5, 400, 400, {button:2}); pointer(f.doc, 'pointermove', 5, 500, 500); assert.deepEqual(geometry(f), untouched);
  f.reset.click(); assert.equal(f.panel.dataset.placement, 'floating'); assert.equal(f.doc.activeElement, f.reset); f.safe();
  f.body.dataset.handedness = 'left'; f.mutations[0].fn(); f.flush(); f.safe(); assert(f.panel.getBoundingClientRect().right < f.input.getBoundingClientRect().left, 'left-handed rail is outside keypad');
  checks.push('pointer exclusion during movement/resize, clamping, cancellation/lost capture/blur, reset and left-handed rail');
}
{
  const f = fixture(1000, 900); f.api.open();
  assert.equal(f.panel.dataset.placement, 'docked'); assert.equal(f.panel.parentElement, f.area); assert.equal(f.body.dataset.draftRail, undefined); f.safe();
  assert(f.scrolls.length > 0, 'opening an off-screen dock requests reveal');
  const scrollCount = f.scrolls.length; f.observers[0].fn(); f.flush(); assert.equal(f.scrolls.length, scrollCount, 'routine positioning does not repeatedly steal scroll');
  const h = geometry(f)[3]; key(f.resize, 'ArrowDown', true); assert.equal(geometry(f)[3], h + 32); f.safe();
  // Detaching a docked panel must re-establish capture after moving its DOM node.
  pointer(f.move, 'pointerdown', 7, 500, 750); const capturesBefore = f.move.captureCount;
  pointer(f.doc, 'pointermove', 7, 100, 100); assert.equal(f.panel.parentElement, f.body); assert.equal(f.panel.dataset.placement, 'manual'); assert(f.move.captureCount > capturesBefore, 'capture requested again after reparent'); f.safe();
  pointer(f.doc, 'pointermove', 7, 130, 120); f.safe(); pointer(f.doc, 'pointerup', 7, 130, 120); assert(!f.captures.has(7));
  f.resizeViewport(390, 844, 'off'); assert.equal(f.panel.dataset.placement, 'docked'); assert.equal(f.move.getAttribute('aria-disabled'), 'true'); assert.equal(f.body.dataset.draftRail, undefined); f.safe();
  const mobile = geometry(f); pointer(f.move, 'pointerdown', 8, 100, 100); pointer(f.doc, 'pointermove', 8, 300, 300); assert.deepEqual(geometry(f), mobile, 'compact move handle is disabled');
  key(f.resize, 'ArrowDown'); assert.equal(geometry(f)[3], mobile[3] + 8); f.safe();
  pointer(f.resize, 'pointerdown', 9, 300, 700); pointer(f.doc, 'pointermove', 9, 300, 9000); assert(geometry(f)[3] <= 620); pointer(f.doc, 'pointerup', 9, 300, 9000); f.safe();
  f.close.click(); f.api.open(); assert.equal(f.panel.dataset.placement, 'docked'); assert(geometry(f)[3] <= 620);
  f.resizeViewport(1500, 900, 'on'); f.reset.click(); assert.equal(f.panel.dataset.placement, 'floating'); f.safe();
  checks.push('no-room flow docking, reveal only on open, dock resizing, capture renewal on detachment, mobile fallback and restoration');
}
{
  const f = fixture(); f.api.open();
  f.viewport._width = 900; f.viewport._height = 600; f.viewport._left = 50; f.viewport._top = 35;
  f.viewport.dispatchEvent(event('resize')); f.flush(); f.safe();
  key(f.move, 'ArrowUp');
  if (f.panel.dataset.placement !== 'docked') { const r = f.panel.getBoundingClientRect(); assert(r.left >= 62 && r.top >= 47 && r.right <= 938 && r.bottom <= 623, 'manual placement obeys visual viewport offsets'); }
  f.viewport._width = null; f.viewport._height = null; f.viewport._left = 0; f.viewport._top = 0; f.viewport.dispatchEvent(event('resize')); f.flush(); f.reset.click();
  const p = f.panel.getBoundingClientRect(); f.state.selected = box(p.left + 20, p.top + 20, 40, 40); f.selected.click(); assert.equal(f.panel.dataset.placement, 'docked', 'selection under floating panel requests nonoverlapping dock'); f.safe();
  f.api.close(false); assert.notEqual(f.doc.activeElement, f.trigger, 'modal close does not restore trigger focus');
  f.state.selected = box(0, 0, 0, 0); f.api.open(); f.reset.click();
  f.input.rect = () => box(0, 0, f.state.width, f.state.height); key(f.move, 'ArrowLeft'); assert.equal(f.panel.dataset.placement, 'docked', 'impossible manual rectangle falls back to flow');
  checks.push('visual-viewport offsets, selected-target reveal, focus-neutral close and impossible-placement fallback');
}

{
  // Responsive rail math follows the actual tool column and gutter, not old constants.
  for (const toolsWidth of [288, 307.2, 320]) for (const gap of [24, 32, 40]) {
    const f = fixture(1250, 900); f.state.column = 360; f.state.toolsWidth = toolsWidth; f.state.gap = gap;
    f.api.open(); f.safe();
    const available = f.state.width - 64 - f.state.column - toolsWidth - 2 * gap;
    assert.equal(f.body.style.getPropertyValue('--draft-rail-width'), Math.min(340, Math.floor(available)) + 'px');
    assert.equal(f.panel.dataset.placement, 'floating');
    f.body.dataset.handedness = 'left'; f.api.reposition(); f.safe();
    assert(f.panel.getBoundingClientRect().right < f.input.getBoundingClientRect().left);
  }
  const f = fixture(1280, 720); f.state.column = 468; f.state.toolsWidth = 307.2; f.state.gap = 32;
  f.api.open(); f.safe(); assert.equal(f.body.style.getPropertyValue('--draft-rail-width'), '340px');
  checks.push('responsive rail uses actual 288/307.2/320px tools and 24/32/40px gutters in both handedness modes');
}
{
  const f = fixture(); let outerEscapes = 0, outerOtherKeys = 0;
  // Model the More Tools ancestor: real native keyboard navigation is not run.
  f.trigger.parentElement.addEventListener('keydown', e => {
    if (e.key === 'Escape') outerEscapes++; else outerOtherKeys++;
  });
  for (let i = 0; i < 3; i++) {
    f.trigger.focus(); const closedEscape = key(f.trigger, 'Escape');
    assert(!closedEscape.defaultPrevented && !closedEscape.stopped, 'closed draft yields Escape to More Tools');
    assert.equal(outerEscapes, i + 1); assert(!f.api.isOpen());
    const ordinary = key(f.trigger, 'n');
    assert(ordinary.stopped && !ordinary.defaultPrevented, 'other keys retain the trigger shielding behavior');
    assert.equal(outerOtherKeys, 0);
    f.trigger.click(); assert(f.api.isOpen()); f.trigger.focus();
    const openEscape = key(f.trigger, 'Escape');
    assert(openEscape.defaultPrevented && openEscape.stopped, 'open draft consumes its own dismissal');
    assert(!f.api.isOpen() && f.panel.hidden); assert.equal(f.trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(outerEscapes, i + 1, 'one Escape does not dismiss both the draft and its tools region');
    assert(f.doc.activeElement === f.trigger);
  }
  checks.push('closed draft trigger yields Escape to More Tools; open draft consumes only its own dismissal across repeated cycles');
}
{
  for (const scenario of [
    {label:'desktop More Tools', moreTools:true, desktop:'on', workspace:'unified', expected:1},
    {label:'desktop twin overview', moreTools:true, desktop:'on', workspace:'unified', mode:'twin', multi:true, view:'overview', expected:1},
    {label:'desktop samurai detail', moreTools:true, desktop:'on', workspace:'unified', mode:'samurai', multi:true, view:'detail', expected:1},
    {label:'legacy trigger without tools region', desktop:'on', workspace:'unified', expected:0},
    {label:'legacy trigger outside tools region', moreTools:true, legacyTrigger:true, desktop:'on', workspace:'unified', expected:0},
    {label:'narrow shared shell', moreTools:true, desktop:'off', workspace:'unified', expected:0},
    {label:'legacy shell fallback', moreTools:true, desktop:'off', workspace:'standard', expected:0}
  ]) {
    const f = fixture(1500, 900, scenario), calls = [];
    f.body.dataset.desktop = scenario.desktop; f.body.dataset.workspace = scenario.workspace;
    f.body.dataset.mode = scenario.mode || 'classic'; f.body.dataset.multi = String(!!scenario.multi);
    f.body.dataset.multiView = scenario.view || 'overview';
    const originalScroll = f.board.scrollIntoView.bind(f.board), originalRect = f.board.rect;
    f.board.scrollIntoView = options => {
      calls.push('scroll-board');
      assert(f.panel.hidden && !f.api.isOpen(), 'board reveal precedes draft opening: ' + scenario.label);
      assert.equal(f.trigger.getAttribute('aria-expanded'), 'false');
      assert.equal(options.block, 'nearest'); assert.equal(options.behavior, 'instant');
      originalScroll(options);
    };
    f.board.rect = () => { calls.push('read-board'); return originalRect(); };
    for (let cycle = 0; cycle < 2; cycle++) {
      calls.length = 0;
      f.trigger.click(); assert(f.api.isOpen()); f.safe();
      assert.equal(calls.filter(call => call === 'scroll-board').length, scenario.expected, scenario.label);
      if (scenario.expected) {
        assert.equal(calls[0], 'scroll-board', 'board is brought into view before placement measures its position');
        assert(calls.indexOf('read-board') > calls.indexOf('scroll-board'), 'placement uses post-reveal board geometry');
      }
      const previous = f.scrolls.length; f.api.open();
      assert.equal(f.scrolls.length, previous, 'repeated open is scroll-idempotent');
      f.api.close(false);
    }
    assert.equal(f.scrolls.filter(scroll => scroll.id === 'board-card').length, 2 * scenario.expected);
    const previous = f.scrolls.length;
    f.state.modal = true; f.api.open(); f.state.modal = false;
    f.body.inert = true; f.api.open(); f.body.inert = false;
    assert.equal(f.scrolls.length, previous, 'blocked opens never change the viewport');
  }
  // This checks production calls and ordering only. scrollIntoView does not move
  // a real viewport here, so actual board/keypad visibility remains unverified.
  checks.push('desktop More Tools draft open reveals board before measuring; legacy/narrow/variant paths, repeated opens and blocked opens do not add board scrolling');
}
{
  const desktopCss = fs.readFileSync(path.join(root, 'src/desktop-workspace.css'), 'utf8');
  const workspaceCss = fs.readFileSync(path.join(root, 'src/workspace.css'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');
  for (const match of (desktopCss + workspaceCss).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (match[1].includes('data-workspace-tool=draft')) assert(!/visibility\s*:\s*hidden|display\s*:\s*none/.test(match[2]), 'draft state must never hide input UI');
  }
  const keyRule = desktopCss.match(/\.number-key\s*\{([^}]+)\}/);
  assert(keyRule, 'desktop primary key rule exists');
  assert(/box-sizing\s*:\s*border-box/.test(keyRule[1]), 'key dimensions include borders');
  assert(/width\s*:\s*100%/.test(keyRule[1]) && /height\s*:\s*auto/.test(keyRule[1]) && /aspect-ratio\s*:\s*1\/1/.test(keyRule[1]), 'square keys derive height from their filled column width');
  assert(/aspect-ratio\s*:\s*1\/1/.test(keyRule[1]), 'desktop keys explicitly remain square');
  assert(/min-width\s*:\s*44px/.test(keyRule[1]) && /min-height\s*:\s*0/.test(keyRule[1]), 'minimum square pointer width remains 44px without a conflicting height clamp');
  assert(/min-height:0/.test(keyRule[1]), 'old minimum height cannot distort square keys');
  assert(!desktopCss.includes('--desktop-key-height'), 'short windows scroll instead of changing square key size');
  assert(desktopCss.includes('.remaining{display:none}') && styles.includes('.number-key .remaining{visibility:hidden}'));
  assert(styles.includes('#draft-panel[data-placement=docked]{position:relative'));
  assert(desktopCss.includes('background:var(--input-surface)') && styles.includes('--input-surface:'));
  checks.push('static CSS contracts: no draft hiding rules, large adaptive border-box keys, hidden counts, flow docking and theme-linked input colors');
}
console.log('PASS floating draft synthetic DOM: ' + checks.length + ' groups. ' + checks.join('; ') + '. No browser rendering, real pointer capture, contrast or game-data behavior is certified.');
