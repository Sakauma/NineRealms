/* Dependency-free presentation-controller regression using the source HTML tree.
 * The tiny DOM below models only the APIs this controller uses, including queued
 * MutationObserver callbacks, asynchronous/coalesced details toggle events, and
 * focus exclusion under hidden/closed ancestors. It does not execute app.js or
 * verify browser layout, pixels, native accessibility, pointer targets or 3D. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Engine = require('../src/engine.js');
require('./tactile-keypad-contract.test.cjs');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/workspace.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
const desktopCss = fs.readFileSync(path.join(root, 'src/desktop-workspace.css'), 'utf8');

function event(type, extra = {}) {
  return {type, bubbles:false, defaultPrevented:false, stopped:false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.stopped = true; }, ...extra};
}

function fixture(options = {}) {
  const mutationObservers = [], resizeObservers = [], pendingMutations = new Set();
  const toggleTasks = new Map(), scrolls = [], focusAttempts = [];
  const state = {width:1440, height:900, selectCloses:0, draftOpen:false, draftPositions:0, alertHeight:0, ...options};
  class Target {
    constructor() { this.listeners = new Map(); }
    addEventListener(type, callback) {
      const list = this.listeners.get(type) || []; list.push(callback); this.listeners.set(type, list);
    }
    dispatchEvent(e) {
      if (!e.target) e.target = this;
      e.currentTarget = this;
      for (const callback of this.listeners.get(e.type) || []) callback(e);
      if (e.bubbles && !e.stopped && this.parentNode) this.parentNode.dispatchEvent(e);
      return !e.defaultPrevented;
    }
  }
  function changed(node, name) {
    for (const observer of mutationObservers) {
      if (observer.targets.some(entry => entry.node === node && entry.options.attributes &&
          (!entry.options.attributeFilter || entry.options.attributeFilter.includes(name)))) pendingMutations.add(observer);
    }
  }
  const doc = new Target(); doc.nodeType = 9;
  class Node extends Target {
    constructor(type, tag = '') {
      super(); this.nodeType = type; this.tagName = tag.toUpperCase(); this.parentNode = null; this.childNodes = [];
      this.attributes = new Map(); this._textContent = ''; this.tabIndex = -1;
      this.style = {values:new Map(), setProperty(name, value) { this.values.set(name, String(value)); },
        getPropertyValue(name) { return this.values.get(name) || ''; }, removeProperty(name) { this.values.delete(name); }};
      const values = {};
      this.dataset = new Proxy(values, {set:(target, name, value) => {
        target[name] = String(value); changed(this, 'data-' + name.replace(/[A-Z]/g, c => '-' + c.toLowerCase())); return true;
      }});
    }
    get textContent() { return this._textContent + this.childNodes.map(node => node.textContent).join(''); }
    set textContent(value) { this._textContent = String(value); }
    get children() { return this.childNodes.filter(node => node.nodeType === 1); }
    get parentElement() { return this.parentNode?.nodeType === 1 ? this.parentNode : null; }
    get isConnected() { return this === doc.documentElement || !!this.parentNode?.isConnected; }
    get id() { return this.getAttribute('id') || ''; }
    set id(value) { this.setAttribute('id', value); }
    get className() { return this.getAttribute('class') || ''; }
    set className(value) { this.setAttribute('class', value); }
    get hidden() { return this.attributes.has('hidden'); }
    set hidden(value) { if (value) this.setAttribute('hidden', ''); else this.removeAttribute('hidden'); }
    get open() { return this.attributes.has('open'); }
    set open(value) { if (value) this.setAttribute('open', ''); else this.removeAttribute('open'); }
    get disabled() { return this.attributes.has('disabled'); }
    set disabled(value) { if (value) this.setAttribute('disabled', ''); else this.removeAttribute('disabled'); }
    setAttribute(name, value) {
      const had = this.attributes.has(name); this.attributes.set(name, String(value)); changed(this, name);
      if (name === 'open' && this.tagName === 'DETAILS' && !had && !toggleTasks.has(this)) toggleTasks.set(this, false);
    }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    removeAttribute(name) {
      const had = this.attributes.delete(name); if (!had) return; changed(this, name);
      if (name === 'open' && this.tagName === 'DETAILS' && !toggleTasks.has(this)) toggleTasks.set(this, true);
    }
    contains(node) { return node === this || this.childNodes.some(child => child.contains(node)); }
    detach() {
      if (!this.parentNode) return;
      if (this.contains(doc.activeElement)) doc.activeElement = doc.body;
      this.parentNode.childNodes.splice(this.parentNode.childNodes.indexOf(this), 1); this.parentNode = null;
    }
    appendChild(node) { node.detach(); this.childNodes.push(node); node.parentNode = this; return node; }
    before(node) { this.insertSibling(node, 0); }
    after(node) { this.insertSibling(node, 1); }
    insertSibling(node, offset) {
      assert(this.parentNode, 'sibling insertion needs a parent'); const parent = this.parentNode;
      node.detach(); const index = parent.childNodes.indexOf(this) + offset; parent.childNodes.splice(index, 0, node); node.parentNode = parent;
    }
    matches(selector) {
      if (selector[0] === '#') return this.id === selector.slice(1);
      if (selector[0] === '.') return this.className.split(/\s+/).includes(selector.slice(1));
      return this.tagName === selector.toUpperCase();
    }
    querySelectorAll(selector) {
      assert(/^(?:#[\w-]+|\.[\w-]+|[\w-]+)$/.test(selector), 'unsupported synthetic selector ' + selector);
      const result = [];
      for (const child of this.children) { if (child.matches(selector)) result.push(child); result.push(...child.querySelectorAll(selector)); }
      return result;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    focus(focusOptions) {
      const accepted = this.isConnected && !this.disabled && visible(this);
      focusAttempts.push({node:this, accepted, options:focusOptions});
      if (accepted) { doc.activeElement = this; this.lastFocusOptions = focusOptions; }
    }
    click() { if (!this.disabled) this.dispatchEvent(event('click', {bubbles:true})); }
    scrollIntoView(scrollOptions) { scrolls.push({node:this, options:scrollOptions}); }
    getBoundingClientRect() { return {height:this.className === 'desktop-board-alerts' ? state.alertHeight : 0}; }
  }
  function visible(node) {
    // Model only the explicit, separately asserted desktop replacement rule.
    // This remains a DOM facade, not general computed CSS visibility.
    if (node.id === 'new-game' && doc.body?.dataset.desktop === 'on' && doc.body?.dataset.workspaceTool === 'hint') return false;
    for (let current = node; current; current = current.parentElement) {
      if (current.hidden || current.getAttribute('inert') !== null) return false;
      if (current.tagName === 'DETAILS' && !current.open && node !== current) {
        const summary = current.children.find(child => child.tagName === 'SUMMARY');
        if (!summary?.contains(node)) return false;
      }
    }
    return true;
  }
  doc.documentElement = new Node(1, 'html'); doc.documentElement.parentNode = doc;
  doc.body = new Node(1, 'body'); doc.documentElement.appendChild(doc.body); doc.activeElement = doc.body;
  doc.createElement = tag => new Node(1, tag);
  doc.createComment = text => { const node = new Node(8); node.textContent = text; return node; };
  doc.querySelector = selector => doc.documentElement.querySelector(selector);
  doc.querySelectorAll = selector => doc.documentElement.querySelectorAll(selector);
  doc.getElementById = id => doc.querySelector('#' + id);
  // Parse only element hierarchy and attributes. Text, CSS and scripts are not interpreted.
  const bodyMarkup = html.slice(html.indexOf('<body'), html.indexOf('<script')).replace(/^<body[^>]*>/, '');
  const stack = [doc.body], voids = new Set(['AREA','BASE','BR','COL','EMBED','HR','IMG','INPUT','LINK','META','PARAM','SOURCE','TRACK','WBR']);
  const tags = /<!--[^]*?-->|<\/?([A-Za-z][\w:-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let lastTagEnd = 0;
  for (const match of bodyMarkup.matchAll(tags)) {
    const text = bodyMarkup.slice(lastTagEnd, match.index);
    if (text) { const node = new Node(3); node.textContent = text; stack.at(-1).appendChild(node); }
    lastTagEnd = match.index + match[0].length;
    if (!match[1]) continue;
    const tag = match[1].toUpperCase();
    if (match[0].startsWith('</')) {
      const index = stack.map(node => node.tagName).lastIndexOf(tag);
      assert(index > 0, 'balanced source fixture closing ' + tag); stack.length = index; continue;
    }
    const node = new Node(1, tag);
    const attrs = /([^\s=/'"<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    for (const attr of match[2].matchAll(attrs)) node.setAttribute(attr[1], attr[2] ?? attr[3] ?? attr[4] ?? '');
    stack.at(-1).appendChild(node);
    if (!voids.has(tag) && !match[0].endsWith('/>')) stack.push(node);
  }
  assert.equal(stack.length, 1, 'source body tree closes before scripts');
  const $ = selector => doc.querySelector(selector);
  const body = doc.body, all = node => [node, ...node.children.flatMap(all)];
  // app.js populates the numeric pad later. Existing listeners must survive moves.
  for (let n = 1; n <= 9; n++) { const key = doc.createElement('button'); key.dataset.value = n; key.textContent = String(n); key.setAttribute('aria-label', '填入 ' + n); $('#number-pad').appendChild(key); }
  // One focusable cell stands in for app.js's rendered board; no game code runs here.
  const boardCell = doc.createElement('button'); boardCell.className = 'synthetic-board-cell';
  $('#board').appendChild(boardCell);
  // Source defaults are real product behavior. Advanced-tool coverage below
  // opts into a dormant fixture explicitly; it is not reachable shipped UI.
  body.dataset.advancedTools = html.match(/<body[^>]*data-advanced-tools="([^"]+)"/)[1];
  if (options.legacyTools) {
    body.dataset.advancedTools = 'on';
    $('#more-tools-toggle').hidden = false; $('#more-tools-toggle').disabled = false;
    $('#more-tools-panel').removeAttribute('inert');
  }
  const originals = new Set(all(body));
  const name = node => (node.getAttribute('aria-label') || node.textContent).replace(/\s+/g, ' ').trim();
  const originalNames = new Map([...originals].map(node => [node, name(node)]));
  const originalParents = new Map([...originals].map(node => [node, node.parentNode]));
  const originalChildren = new Map([...originals].map(node => [node, node.children.slice()]));
  const originalById = new Map([...originals].filter(node => node.id).map(node => [node.id, node]));
  const listenerCalls = new Map();
  for (const id of ['undo-btn','redo-btn','erase-btn','notes-btn','hint-btn','draft-toggle','check-btn','error-toggle','auto-notes-btn','daily-btn','voyage-btn','new-game']) {
    $('#' + id).addEventListener('click', () => listenerCalls.set(id, (listenerCalls.get(id) || 0) + 1));
  }
  // Synthetic app-side selection/cancel behavior. The companion app-function test
  // separately exercises the real cancel binding and renderLens state updates.
  state.batchSelecting = false; state.batchCount = 0; state.batchCancels = 0;
  function setBatch(count, selecting = false, refresh = true) {
    state.batchCount = count; state.batchSelecting = selecting;
    $('#batch-panel').hidden = !(count || selecting);
    $('#batch-toggle').setAttribute('aria-pressed', String(selecting));
    $('#batch-toggle').setAttribute('aria-expanded', String(!!(count || selecting)));
    $('#batch-selection-clear').disabled = !(count || selecting);
    if (refresh && win.NineRealmsWorkspace) win.NineRealmsWorkspace.refreshTools();
  }
  $('#batch-selection-clear').addEventListener('click', () => { state.batchCancels++; setBatch(0); });
  body.dataset.mode = options.mode || 'classic'; body.dataset.multi = String(!!options.multi);
  body.dataset.multiView = options.multiView || 'overview';
  body.dataset.outsideClues = String(!!options.outsideClues);
  $('#multigrid-tools').hidden = !options.multi;
  if (options.focus) $(options.focus).focus();
  const media = new Target();
  Object.defineProperty(media, 'matches', {get:() => state.width >= 980 && state.height >= 560});
  const win = new Target(); win.document = doc;
  win.matchMedia = query => { assert.equal(query, '(min-width:980px) and (min-height:560px)'); return media; };
  win.MutationObserver = class {
    constructor(callback) { this.callback = callback; this.targets = []; mutationObservers.push(this); }
    observe(node, config) { this.targets.push({node, options:config}); }
  };
  win.ResizeObserver = class {
    constructor(callback) { this.callback = callback; this.targets = []; resizeObservers.push(this); }
    observe(node) { this.targets.push(node); }
  };
  win.NineRealmsSelect = {close() { state.selectCloses++; }};
  state.draftCloses = [];
  win.NineRealmsFloatingDraft = {
    isOpen:() => state.draftOpen,
    reposition() { state.draftPositions++; },
    close(returnFocus) {
      state.draftCloses.push(returnFocus); state.draftOpen = false;
      $('#draft-toggle').setAttribute('aria-expanded', 'false'); $('#draft-panel').hidden = true;
      if (win.NineRealmsWorkspace) win.NineRealmsWorkspace.sync();
      if (returnFocus !== false) $('#draft-toggle').focus({preventScroll:true});
    }
  };
  for (const name of ['localStorage','sessionStorage','game','SudokuEngine']) Object.defineProperty(win, name, {get() { throw Error('presentation controller must not access ' + name); }});
  function flush() {
    let iterations = 0;
    while (pendingMutations.size || toggleTasks.size) {
      assert(++iterations < 100, 'observer/toggle queues must settle');
      if (pendingMutations.size) {
        const list = [...pendingMutations]; pendingMutations.clear(); list.forEach(observer => observer.callback([])); continue;
      }
      const [node, oldOpen] = toggleTasks.entries().next().value; toggleTasks.delete(node);
      node.dispatchEvent(event('toggle', {oldState:oldOpen ? 'open' : 'closed', newState:node.open ? 'open' : 'closed'}));
    }
  }
  vm.runInNewContext(source, {window:win}, {filename:'workspace.js'}); flush();
  const resize = (width, height) => { state.width = width; state.height = height; media.dispatchEvent(event('change')); flush(); };
  const mode = (name, multi = false, multiView = 'overview', outsideClues = false) => {
    body.dataset.mode = name; body.dataset.multi = String(multi);
    body.dataset.multiView = multiView; body.dataset.outsideClues = String(outsideClues);
    $('#multigrid-tools').hidden = !multi; flush();
  };
  const key = (node, value) => { const e = event('keydown', {key:value, bubbles:true}); node.dispatchEvent(e); flush(); return e; };
  function assertIdentity() {
    const ids = all(body).map(node => node.id).filter(Boolean);
    assert.equal(ids.length, new Set(ids).size, 'no cloned IDs');
    for (const [id, node] of originalById) assert($('#' + id) === node, 'original ID identity ' + id);
  }
  function assertRestored() {
    for (const node of originals) {
      assert(node.parentNode === originalParents.get(node), 'original parent: ' + (node.id || node.className || node.tagName));
      const children = node.children.filter(child => originals.has(child)), expected = originalChildren.get(node);
      assert(children.length === expected.length && children.every((child, index) => child === expected[index]), 'original child order: ' + (node.id || node.className || node.tagName));
    }
    assertIdentity();
  }
  return {$, doc, win, body, state, setBatch, boardCell, media, flush, resize, mode, key, visible, all, originals, originalById,
    assertIdentity, assertRestored, listenerCalls, resizeObservers, scrolls, focusAttempts, name, originalNames, api:win.NineRealmsWorkspace};
}

const legacyFixture = options => fixture({...options, legacyTools:true});
const checks = [];
const controls = ['undo-btn', 'redo-btn', 'erase-btn', 'notes-btn', 'hint-btn', 'number-pad', 'new-game', 'more-tools-toggle'];
const optionalControls = ['draft-toggle', 'check-btn', 'error-toggle', 'auto-notes-btn'];
const entryIds = controls.filter(id => !['number-pad', 'more-tools-toggle'].includes(id))
  .concat(optionalControls, ['pause-btn', 'daily-btn', 'voyage-btn']);
const regionClasses = ['desktop-context', 'desktop-board-area', 'desktop-tools', 'desktop-board-alerts',
  'desktop-heading', 'desktop-status'];
function test(name, callback) {
  try { callback(); checks.push(name); }
  catch (error) { process.exitCode = 1; console.error('FAIL reference workspace: ' + name + '\n' + error.stack); }
}
function assertNodeOrder(actual, expected, message) {
  assert(actual.length === expected.length && actual.every((node, index) => node === expected[index]), message);
}
function assertDesktopOrder(f) {
  const order = f.all(f.$('#play-controls')).filter(node => controls.includes(node.id)).map(node => node.id);
  assert.deepEqual(order, controls, 'original controls follow the requested desktop reading order');
  // Natural keyboard sequence comes from the DOM, not a positive tabindex workaround.
  // This is structural inspection, not a native-browser Tab or accessibility-tree test.
  const natural = f.all(f.$('#play-controls')).filter(node =>
    node.tagName === 'BUTTON' && f.visible(node) && !node.disabled &&
    (node.getAttribute('tabindex') === null || Number(node.getAttribute('tabindex')) >= 0));
  const focusOrder = [...controls.slice(0,-1), 'hint-panel', controls.at(-1)];
  const expected = focusOrder.flatMap(id => id === 'number-pad'
    ? f.$('#number-pad').children : id === 'hint-panel' ? [f.$('#hint-close')] : [f.$('#' + id)]).filter(node => f.visible(node) && !node.disabled);
  assert(natural.length === expected.length && natural.every((node, index) => node === expected[index]),
    'natural focusable source order follows undo/redo/erase, notes/hint, 1–9, New Game; dormant tools stay out of Tab order');
  assert(natural.every(node => !(Number(node.getAttribute('tabindex')) > 0)), 'no positive tabindex');
}
function assertLabels(f) {
  for (const id of entryIds) {
    const node = f.$('#' + id);
    assert.equal(f.name(node), f.originalNames.get(node), 'original accessible-name source retained: ' + id);
    assert(f.name(node).length > 0, 'entry still has a textual name: ' + id);
  }
  assert.equal(f.$('#number-pad').getAttribute('role'), 'group');
  assert.equal(f.$('#number-pad').getAttribute('aria-label'), '数字键盘');
  assert.equal(f.$('#draft-toggle').getAttribute('aria-controls'), 'draft-panel');
  assert.equal(f.$('#draft-panel').getAttribute('aria-labelledby'), 'draft-panel-title');
}
function assertNoNewDrawers(f) {
  for (const node of f.all(f.body)) {
    if (['DETAILS', 'DIALOG'].includes(node.tagName)) assert(f.originals.has(node), 'no new drawer or dialog');
  }
  assert(!f.$('#desktop-assist') && !f.$('#desktop-discovery'), 'rejected supplementary drawers are absent');
}

const releasedModes = Engine.getModes().map(({id}) => {
  const puzzle = Engine.getPuzzle('easy', 'unified-controller-' + id, id);
  return {mode:id, multi:Engine.getLayout(puzzle).cellCount > 81, outsideClues:!!puzzle.clues?.outside?.length};
});
assert.equal(releasedModes.length, 33, 'controller covers the complete released catalog');

test('every released mode initially composes the same desktop controls and accessible hint lifecycle', () => {
  for (const options of releasedModes) {
    const f = fixture(options), {$} = f;
    assert.equal(f.body.dataset.workspace, 'unified', options.mode);
    assert.equal(f.body.dataset.desktop, 'on', options.mode + ' uses the shared desktop layout');
    assert.equal($('#multigrid-tools').parentElement, $('.desktop-board-alerts'));
    assert.equal($('#multigrid-tools').hidden, !options.multi, 'only app state controls multi-navigation visibility');
    assert.equal($('#grid-view').getAttribute('id'), 'grid-view', 'original multi-view selector remains');
    assert.equal(f.body.dataset.outsideClues, String(options.outsideClues));
    assertDesktopOrder(f); assertLabels(f); assertNoNewDrawers(f); f.assertIdentity();
    const trigger = $('#hint-btn'), hint = $('#hint-panel');
    for (const [width, height] of [[1440,900], [980,560], [979,900], [1280,559], [390,844]]) {
      f.resize(width, height);
      assert.equal(f.body.dataset.desktop, width >= 980 && height >= 560 ? 'on' : 'off', options.mode + ' shares breakpoint');
      if (f.body.dataset.desktop === 'off') f.assertRestored(); else assertDesktopOrder(f);
      trigger.focus(); hint.hidden = false; f.flush();
      assert.equal(f.body.dataset.workspaceTool, 'hint', options.mode + ' exposes its hint state at every size');
      assert.equal(f.doc.activeElement, $('#hint-title'));
      assert.equal(trigger.getAttribute('aria-expanded'), 'true');
      assert(f.visible($('#notes-btn')) && f.visible($('#number-pad')), 'hint never replaces numeric input');
      $('#hint-close').focus(); hint.hidden = true; f.flush();
      assert.equal(f.doc.activeElement, trigger);
      assert.equal(trigger.getAttribute('aria-expanded'), 'false');
      assert.equal(f.body.dataset.workspaceTool, '');
    }
    f.resize(1440, 900); f.assertIdentity(); assertDesktopOrder(f);
  }
});

test('all-mode transitions preserve original board children, overlays, multi navigation and input focus', () => {
  const f = fixture(), {$} = f, board = $('#board'), overlay = $('#variant-overlay');
  const clue = f.doc.createElement('path'); clue.setAttribute('data-clue', 'outside-line'); overlay.appendChild(clue);
  const originalBoardChildren = board.childNodes.slice(), originalOverlayChildren = overlay.childNodes.slice();
  const keys = $('#number-pad').children.slice(), input = keys[4], selector = $('#grid-view');
  selector.value = 'all'; input.focus();
  for (let cycle = 0; cycle < 2; cycle++) for (const options of releasedModes) {
    const views = options.multi ? ['overview', 'detail', 'overview', 'detail'] : ['overview'];
    for (const view of views) for (const hand of ['left', 'right']) {
      f.body.dataset.handedness = hand;
      selector.value = view === 'detail' ? 'synthetic-subboard' : 'all';
      const selectedView = selector.value, closes = f.state.selectCloses;
      f.mode(options.mode, options.multi, view, options.outsideClues);
      assert.equal(f.body.dataset.desktop, 'on', options.mode + '/' + view + ' never falls back to legacy desktop UI');
      assert.equal(f.body.dataset.workspace, 'unified');
      assert.equal(f.body.dataset.multiView, view); assert.equal(f.body.dataset.outsideClues, String(options.outsideClues));
      assert.equal(selector.value, selectedView, 'presentation never resets the selected subboard');
      assert.equal(f.state.selectCloses, closes, 'same-size mode/view changes do not detach controls or dismiss selectors');
      assert.equal(f.doc.activeElement, input, 'mode/view changes preserve numeric input focus');
      assert.equal($('#multigrid-tools').hidden, !options.multi);
      assertNodeOrder(board.childNodes, originalBoardChildren, 'board cells remain original and ordered');
      assertNodeOrder(overlay.childNodes, originalOverlayChildren, 'variant overlay and clues remain original and ordered');
      assertNodeOrder($('#number-pad').children, keys, 'numeric input identities remain original');
      assertDesktopOrder(f); f.assertIdentity();
    }
  }
  f.mode('samurai', true, 'detail'); selector.focus(); f.resize(390,844);
  f.assertRestored(); assert.equal(f.doc.activeElement, selector, 'subboard select stays focused when its entire navigation moves home');
  f.resize(980,560); assert.equal(f.doc.activeElement, selector); assertDesktopOrder(f);
  assert(source.includes("'data-multi-view'") && source.includes("'data-outside-clues'"), 'view/clue attributes participate in the presentation lifecycle');
});

test('desktop keeps primary controls visible and optional tools in one fixed closed region', () => {
  const f = fixture(), {$} = f;
  assert.equal(f.body.dataset.desktop, 'on'); assert.equal(f.body.dataset.workspace, 'unified');
  for (const [selector, parent] of [['#puzzle-settings', '.desktop-context'], ['.board-section', '.desktop-board-area'],
    ['.control-panel', '.desktop-tools'], ['#hint-panel', '#play-controls'],
    ['.stats', '.desktop-tools'], ['.difficulty-wrap', '.desktop-heading'],
    ['.session-strip', '.desktop-status'], ['.status-box', '.desktop-status'],
    ['.board-bottomline', '.desktop-tools'], ['.keyboard-guide', '.desktop-tools']]) {
    assert($(selector).parentElement === $(parent), selector + ' moved without cloning');
  }
  assert($('#energy-hud').parentElement === $('.normal-status'), 'energy stays in original status row');
  assert($('#multigrid-tools').parentElement === $('.desktop-board-alerts'), 'existing multi-grid navigation joins the full-width alert row');
  assertNodeOrder($('.game-layout').children.filter(node => regionClasses.includes(node.className)),
    [$('.desktop-context'), $('.desktop-heading'), $('.desktop-board-alerts'), $('.desktop-board-area'), $('.desktop-tools'), $('.desktop-status')],
    'mode and difficulty precede multi-navigation and alerts, then board, keypad and status in natural source order');
  assert($('.desktop-status').contains($('#energy-hud')), 'energy remains below the board');
  assert(!$('.desktop-status').contains($('.board-bottomline')), 'progress leaves the below-board status row');
  assert($('.desktop-tools').contains($('#pause-btn')), 'original pause button travels with rail stats');
  assertNodeOrder($('.normal-status').children, [$('#energy-hud')], 'normal status contains only the quiet energy summary');
  const panel = $('#more-tools-panel'), trigger = $('#more-tools-toggle');
  assert.equal(trigger.tagName, 'BUTTON'); assert.equal(trigger.getAttribute('type'), 'button');
  assert(trigger.hidden && trigger.disabled, 'removed entry stays inaccessible');
  assert.notEqual(panel.getAttribute('inert'), null, 'preserved tools are inert');
  assert.equal(trigger.getAttribute('aria-controls'), panel.id); assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(panel.tagName, 'SECTION'); assert(panel.hidden, 'optional region starts closed');
  assert(panel.parentElement === $('.game-layout'), 'panel is outside the primary board and controls');
  assert($('#candidate-lens').parentElement === $('.more-tools-content')); assert($('#batch-panel').parentElement === $('.more-tools-content'));
  assert(panel.contains($('#candidate-lens')) && panel.contains($('#batch-panel')));
  assert($('#batch-panel').hidden, 'composition does not reveal selection-only batch controls');
  for (const id of optionalControls) {
    assert($('#' + id).parentElement === $('#more-tools-actions'), 'optional action remains in its source home: ' + id);
    assert(!f.visible($('#' + id)), 'optional action hidden by the tools region: ' + id);
    assert(!$('#play-controls').contains($('#' + id)), 'optional action leaves the primary keypad: ' + id);
  }
  for (const id of controls.filter(id => id !== 'more-tools-toggle')) assert(f.visible($('#' + id)), 'primary control is visible: ' + id);
  for (const id of ['candidate-lens', 'lens-notes', 'lens-rules', 'lens-digits']) assert(!f.visible($('#' + id)), 'filter is initially hidden: ' + id);
  assert($('.desktop-tools').children.at(-1) === $('.keyboard-guide'), 'keyboard guide remains with primary tools');
  assert(!$('.desktop-footnotes'), 'no separate footer-alignment region');
  assertDesktopOrder(f); assertLabels(f); assertNoNewDrawers(f); f.assertIdentity();
});

test('compact input rail groups stats, tools, help and progress in readable source order', () => {
  const f = fixture(), {$} = f;
  assertNodeOrder($('.desktop-tools').children,
    [$('.stats'), $('.control-panel'), $('.board-bottomline'), $('.keyboard-guide')],
    'rail starts with live stats, controls, progress and shortcuts');
  assert.equal($('#hint-panel').parentElement,$('#play-controls'));
  assert.equal($('.desktop-help'),null,'no separate overflowing help row remains');
  const controlChildren=$('#play-controls').children;
  assert(controlChildren.indexOf($('#hint-panel'))>controlChildren.indexOf($('#new-game')),'hint result follows digits and New Game in natural DOM order');
  assert(controlChildren.indexOf($('#hint-panel'))<controlChildren.indexOf($('#more-tools-toggle')),'hint stays before optional tooling');
  assertNodeOrder($('.desktop-heading').children, [$('.difficulty-wrap')], 'difficulty is the single aligned rail heading');
  assert.equal($('#difficulty').parentElement, $('.difficulty-wrap'), 'native difficulty select remains in its original wrapper');
  const readingOrder = $('#play-controls').children.filter(node => !node.hidden && (controls.includes(node.id) || node === $('.pad-heading')));
  assertNodeOrder(readingOrder, [$('#undo-btn'), $('#redo-btn'), $('#erase-btn'), $('#notes-btn'), $('#hint-btn'),
    $('.pad-heading'), $('#number-pad'), $('#new-game')],
    'visible pad heading separates reasoning actions from digits before the final New Game row');
  assert.equal($('#new-game').parentElement, $('#play-controls'), 'existing New Game entry follows numeric input');
  assert(!$('#puzzle-settings').contains($('#new-game')), 'New Game does not leave a duplicate action above the board');
  assert.equal($('.board-bottomline').querySelector('#progress-count'), $('#progress-count'), 'existing progress output stays live');
  assert.equal($('.stats').querySelector('#timer'), $('#timer'), 'existing timer stays live');
  for (const mode of ['diagonal', 'classic', 'killer', 'classic']) {
    f.mode(mode); assertDesktopOrder(f);
  }
});

test('ready and paused overlays keep action IDs inside a decorative-only compact card', () => {
  const f = fixture(), {$} = f, overlay = $('#pause-overlay'), card = $('.pause-card');
  assert(card, 'compact pause/start card exists');
  assert.equal(card.parentElement, overlay, 'card is nested in the existing overlay');
  assert.equal(overlay.parentElement, $('#board-card'), 'overlay stays over the board');
  assert.equal(overlay.getAttribute('aria-labelledby'), 'pause-title');
  assert(overlay.hidden, 'source overlay remains controlled by the game render lifecycle');
  for (const id of ['pause-title', 'pause-description', 'start-btn', 'resume-btn']) {
    assert(card.contains($('#' + id)), 'existing lifecycle entry is inside the compact card: ' + id);
  }
  assert($('#resume-btn').hidden, 'ready and resume controls preserve their original distinct states');
  assert(!overlay.contains($('#board')), 'live puzzle data is never copied into the pause card');
  assert(!overlay.querySelector('.cell') && !overlay.querySelector('.value') && !overlay.querySelector('.notes'),
    'decorative scaffold contains no puzzle cells, values or notes');
  assert(!source.includes('cloneNode'), 'layout controller never clones a live board or its controls');
  f.resize(390, 844); f.assertRestored();
  f.resize(1440, 900); f.assertIdentity();
});

test('desktop CSS encodes a square adaptive rail with a compact five-action row and bottom-aligned footer', () => {
  function rule(selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = desktopCss.match(new RegExp(escaped + '\\s*\\{([^}]+)\\}'));
    assert(match, 'CSS rule exists: ' + selector); return match[1];
  }
  const tokens = rule('body[data-workspace=unified][data-desktop=on]');
  assert(/--desktop-tools-width:clamp\(288px,24vw,320px\)/.test(tokens) && /--desktop-gap:24px/.test(tokens), 'primary input rail grows within bounds and preserves the board gutter');
  assert(/min\(620px,/.test(tokens), 'board has a bounded responsive 620px maximum');
  const rail = rule('.desktop-tools');
  assert(/padding-left:18px/.test(rail) && /border-left:1px/.test(rail), 'one slim divider groups the input rail');
  assert(/min-height:var\(--desktop-board\)/.test(rail) && /align-self:stretch/.test(rail), 'rail spans the board and can expand for intrinsic content');
  assert(!/(?:^|;)\s*(?:height|max-height|overflow(?:-y)?)\s*:/.test(rail), 'rail is never constrained or internally scrolled');
  assert(/flex-shrink:0/.test(rule('.desktop-tools>*')),'controls cannot shrink below their intrinsic content');
  assert(/margin:\s*auto 0 0/.test(rule('.desktop-tools>.board-bottomline')),'progress anchors the real footer below available space');
  assert(/#play-controls>#hint-panel\{[^}]*grid-column:1\/-1;grid-row:4;align-self:end;height:44px;min-height:44px/.test(desktopCss),'hint reuses the bounded New Game row inside the rail');
  assert(!desktopCss.includes('.desktop-help'),'no detached overflow row remains');
  const leftRail = rule('body[data-workspace=unified][data-desktop=on][data-handedness=left] .desktop-tools');
  assert(/padding-left:0/.test(leftRail) && /padding-right:18px/.test(leftRail) &&
    /border-left:0/.test(leftRail) && /border-right:1px/.test(leftRail), 'left-handed input rail mirrors its divider and inset');
  const leftHeading = rule('body[data-workspace=unified][data-desktop=on][data-handedness=left] .desktop-heading');
  assert(/padding-left:0/.test(leftHeading) && /padding-right:19px/.test(leftHeading), 'left-handed difficulty heading aligns to the inset controls');
  assert(/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/.test(rule('#play-controls')));
  const actions = rule('#play-controls>:is(#undo-btn,#redo-btn,#erase-btn,#notes-btn,#hint-btn)');
  assert(/grid-row:1/.test(actions) && /grid-column:span 1/.test(actions), 'all five routine actions share the first row');
  const heading = rule('.pad-heading');
  assert(/grid-row:2/.test(heading) && /position:static/.test(heading) && /clip-path:none/.test(heading), 'number/mode heading is visible above the pad');
  assert(/grid-row:3/.test(rule('.number-pad')), '3x3 digits come after the visible heading');
  const newGame = rule('#play-controls>.new-game-btn'), more = rule('#play-controls>#more-tools-toggle');
  assert(/grid-row:4/.test(newGame) && /grid-column:1\/-1/.test(newGame), 'New Game has its own full-width row');
  assert(/grid-row:5/.test(more) && /grid-column:1\/-1/.test(more), 'More Tools follows on its own quiet row');
  const normalTitle = rule('body[data-workspace=unified][data-desktop=on] .mode-picker-open>strong');
  const largeTitle = rule('body[data-workspace=unified][data-desktop=on][data-text-size=large] .mode-picker-open>strong');
  const titleSize = declarations => Number(declarations.match(/font-size:([\d.]+)px/)?.[1]);
  assert.equal(titleSize(normalTitle), 17, 'normal mode title uses the refined hierarchy');
  assert.equal(titleSize(largeTitle), 19, 'large-text title grows instead of inheriting the old smaller size');
  assert(titleSize(largeTitle) > titleSize(normalTitle), 'large text never shrinks the mode title');
  const zenRules = [...desktopCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(match => match[1].includes('[data-zen=on]') && /display\s*:\s*none/.test(match[2]));
  for (const selector of ['.desktop-tools>.board-bottomline', '.desktop-tools>.stats']) {
    assert(zenRules.some(match => match[1].includes(selector)), 'Zen hides relocated rail summary: ' + selector);
  }
});

test('pause scaffold is static decoration and hides the entire real board including note overlays', () => {
  const rules = [...desktopCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(match => ({selector:match[1], declarations:match[2]}));
  for (const state of ['ready', 'paused']) {
    assert(rules.some(rule => rule.selector.includes('[data-game-state=' + state + '] #board-grid-shell') && /visibility\s*:\s*hidden/.test(rule.declarations)),
      'entire live board and its SVG overlays are hidden in ' + state + ' state');
  }
  const scaffold = rules.find(rule => rule.selector.trim().endsWith('.pause-overlay::before'));
  assert(scaffold, 'decorative grid is a CSS pseudo-element, not copied puzzle DOM');
  assert(/content\s*:\s*""/.test(scaffold.declarations), 'decorative grid contains no visible text');
  assert(/linear-gradient/.test(scaffold.declarations) && /background-size/.test(scaffold.declarations), 'scaffold uses static grid lines');
  const backgroundSize = scaffold.declarations.match(/background-size:([^;]+)/)?.[1] || '';
  const spacings = [...backgroundSize.matchAll(/([\d.]+)%/g)].map(match => Number(match[1])).filter(value => value !== 100);
  assert(spacings.length === 4 && spacings.every((value, index) => Math.abs(value - 100 / (index < 2 ? 3 : 9)) < 0.00001),
    'static grid spacing represents nine cells and three regions without game values');
  const overlay = rules.find(rule => rule.selector.includes('[data-desktop=on]') && rule.selector.trim().endsWith(' .pause-overlay'));
  assert(overlay && /background:var\(--board-bg\)/.test(overlay.declarations) && /backdrop-filter:none/.test(overlay.declarations),
    'privacy cover uses an opaque themed surface rather than revealing live content through blur');
  assert(!/(?:attr|url|var)\([^)]*(?:answer|solution|value|note|selected)/i.test(scaffold.declarations), 'scaffold does not reference puzzle-derived content');
  assert(/pointer-events\s*:\s*none/.test(scaffold.declarations), 'decorative lines cannot intercept pause/start input');
});

test('repeated desktop/mobile/short/variant/multigrid transitions restore exact parents and child order', () => {
  const f = fixture();
  const transitions = [() => f.resize(390, 844), () => f.resize(1440, 900),
    () => f.mode('diagonal'), () => f.mode('classic'), () => f.mode('classic', true),
    () => f.mode('classic'), () => f.mode('killer'), () => f.mode('twin', true),
    () => f.mode('classic'), () => f.resize(1280, 559), () => f.resize(980, 560),
    () => f.resize(979, 900), () => f.resize(1920, 1080), () => f.resize(360, 740)];
  for (let cycle = 0; cycle < 3; cycle++) for (const change of transitions) {
    change(); f.assertIdentity(); assertLabels(f); assertNoNewDrawers(f);
    if (f.body.dataset.desktop === 'off') {
      f.assertRestored();
      assert(f.$('.stats').parentElement === f.$('.normal-status'), 'stats returned inside normal status');
      for (const className of regionClasses) assert(f.$('.' + className).hidden, className + ' hidden off desktop');
    } else {
      assertDesktopOrder(f);
      assert(f.$('#candidate-lens').parentElement === f.$('.more-tools-content'), 'filter never moves on desktop transitions');
      assert(f.$('#batch-panel').parentElement === f.$('.more-tools-content'), 'batch stays in fixed optional region');
    }
  }
  // Programmatic listener identity checks include preserved dormant code; no UI reachability claim.
  for (const id of entryIds.filter(id => id !== 'pause-btn')) {
    f.$('#' + id).click(); assert.equal(f.listenerCalls.get(id), 1, id + ' preexisting listener remains attached once');
  }
  assert.equal(f.body.style.getPropertyValue('--desktop-alert-height'), '0px');
});

test('starting narrow or short restores original content in every mode', () => {
  for (const options of [{width:390, height:844}, {width:1440, height:559}, {width:390, height:844, mode:'jigsaw'}, {width:1440, height:559, mode:'twin', multi:true}]) {
    const f = fixture(options); assert.equal(f.body.dataset.desktop, 'off'); f.assertRestored();
    f.resize(1440, 900); f.mode('classic'); assert.equal(f.body.dataset.desktop, 'on');
    assertDesktopOrder(f); f.resize(390, 844); f.assertRestored();
  }
});

test('reparenting preserves focused original controls and pause without stealing scroll', () => {
  for (const selector of ['#undo-btn', '#notes-btn', '#pause-btn', '#new-game', '#difficulty']) {
    const f = fixture({width:390, height:844, focus:selector}), target = f.$(selector);
    f.resize(1440, 900); assert(f.doc.activeElement === target && f.visible(target));
    assert.equal(target.lastFocusOptions.preventScroll, true);
    f.mode('killer'); assert(f.doc.activeElement === target && f.visible(target)); assertDesktopOrder(f);
    f.mode('classic'); assert(f.doc.activeElement === target && f.visible(target)); assertDesktopOrder(f);
    f.resize(390, 844); assert(f.doc.activeElement === target && f.visible(target)); f.assertRestored();
    assert.equal(f.scrolls.length, 0, 'composition itself does not scroll');
  }
});

for (const tool of ['hint']) {
  test('desktop to narrow or short classic preserves input focus with active ' + tool, () => {
    for (const [width, height] of [[390, 844], [1024, 559]]) for (const sourceControl of ['number', 'notes']) {
      const f = fixture(), hint = f.$('#hint-panel'), lens = f.$('#candidate-lens');
      if (tool === 'hint') hint.hidden = false;
      else lens.open = true;
      f.flush();
      const original = sourceControl === 'number' ? f.$('#number-pad').children[0] : f.$('#notes-btn');
      original.focus(); assert(f.doc.activeElement === original, 'input remains focusable in the desktop fixture');
      const target = tool === 'hint' ? f.$('#hint-title') : lens.querySelector('summary');
      // CSS is not evaluated here. This asserts the controller's explicit routing
      // policy for the narrow presentation, not native browser rendering.
      f.resize(width, height);
      assert.equal(f.body.dataset.desktop, 'off'); assert.equal(f.body.dataset.workspaceTool, tool);
      assert(f.doc.activeElement === original, 'compact result leaves the input controls available');
      assert(f.visible(original)); assert.equal(original.lastFocusOptions.preventScroll, true);
      f.assertRestored();
      f.resize(1440, 900); assert(f.doc.activeElement === original, 'returning desktop does not steal input focus');
      assertDesktopOrder(f); f.assertIdentity();
      assert.equal(f.scrolls.length, 0, 'focus transfer itself does not scroll');
    }
  });
}

test('draft priority preserves input focus while optional filter state is retained', () => {
  for (const [width, height] of [[390, 844], [1024, 559]]) {
    const f = fixture(), original = f.$('#number-pad').children[3];
    f.$('#lens-rules').setAttribute('aria-pressed', 'true');
    f.$('#draft-toggle').setAttribute('aria-expanded', 'true'); f.flush();
    assert.equal(f.body.dataset.workspaceTool, 'draft'); original.focus();
    f.resize(width, height);
    assert.equal(f.body.dataset.desktop, 'off'); assert.equal(f.body.dataset.workspaceTool, 'draft');
    assert(f.doc.activeElement === original, 'draft leaves input visible, so original focus must be retained');
    assert.equal(original.lastFocusOptions.preventScroll, true);
    assert.equal(f.$('#lens-rules').getAttribute('aria-pressed'), 'true', 'preserve the background filter source'); f.assertRestored();
    f.resize(1440, 900); assert(f.doc.activeElement === original); assertDesktopOrder(f);
    // A visible hint takes precedence over both draft and lens.
    f.$('#hint-panel').hidden = false; f.flush(); original.focus(); f.resize(width, height);
    assert.equal(f.body.dataset.workspaceTool, 'hint');
    assert(f.doc.activeElement === original, 'compact hint retains input focus even with draft open');
    f.assertRestored();
  }
});

test('contextual resize routing never redirects unrelated controls across variants', () => {
  for (const tool of ['hint']) {
    const f = fixture(), pause = f.$('#pause-btn');
    if (tool === 'hint') f.$('#hint-panel').hidden = false;
    else f.$('#lens-rules').setAttribute('aria-pressed', 'true');
    f.flush(); pause.focus(); f.resize(390, 844);
    assert(f.doc.activeElement === pause, 'pause is outside the hidden input region'); f.assertRestored();
    f.resize(1440, 900); const input = f.$('#notes-btn'); input.focus(); f.mode('killer');
    assert.equal(f.body.dataset.workspace, 'unified'); assert.equal(f.body.dataset.workspaceTool, 'hint');
    assert(f.doc.activeElement === input, 'variant changes never steal input focus');
    assertDesktopOrder(f);
  }
});

test('single-result markup has a full-width label, one output and separate close column', () => {
  const f=fixture(), panel=f.$('#hint-panel');
  assert.equal(panel.getAttribute('aria-describedby'),'hint-text');
  const icon=f.$('.hint-symbol');assert.equal(icon.parentElement,panel);assert.equal(icon.getAttribute('aria-hidden'),'true');
  assert.equal(icon.querySelector('use').getAttribute('href'),'#i-hint','hint identity uses the original noninteractive hint icon');
  for(const id of ['hint-title','hint-value','hint-text'])assert.equal(f.$('#'+id).parentElement,panel,id+' is a direct grid child');
  assert.equal(f.$('#hint-close').parentElement,f.$('.hint-topline'));
  assert.equal(f.$('.hint-topline').children.length,1,'close column never contains the result label');
  assert(panel.children.indexOf(f.$('.hint-topline'))>panel.children.indexOf(f.$('#hint-title')),'Tab from result title reaches close before later controls');
  assert.equal(f.$('#hint-close').getAttribute('aria-keyshortcuts'),'Escape');
  for(const id of ['hint-next','hint-apply','hint-stage'])assert.equal(f.$('#'+id),null,'removed staged control '+id);
});

test('hint lifecycle keeps trigger ARIA state and returns focus after dismissal', () => {
  const f = fixture(), trigger = f.$('#hint-btn'), hint = f.$('#hint-panel'), title = f.$('#hint-title');
  assert.equal(trigger.getAttribute('aria-controls'), 'hint-panel');
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  trigger.focus(); hint.hidden = false; f.flush();
  assert.equal(f.body.dataset.workspaceTool, 'hint'); assert(f.doc.activeElement === title);
  assert.equal(title.tabIndex, -1); assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  f.api.revealHint(); assert(f.scrolls.at(-1).node === hint);
  assert.equal(f.scrolls.at(-1).options.block, 'nearest');
  f.$('#hint-close').focus(); hint.hidden = true; f.flush();
  assert(f.doc.activeElement === trigger); assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(f.body.dataset.workspaceTool, ''); f.assertIdentity();
});

test('hint Escape dismisses exactly once, preserves input identities and restores focus in every layout', () => {
  for (const options of releasedModes) for (const hand of ['left','right']) for (const large of ['normal','large']) {
    const f=fixture(options), hint=f.$('#hint-panel'), trigger=f.$('#hint-btn');
    f.body.dataset.handedness=hand; f.body.dataset.textSize=large;
    let closes=0;
    // Production app close binding is exercised separately by direct-hint.test;
    // this facade supplies that handler so the presentation Escape path can run.
    f.$('#hint-close').addEventListener('click',()=>{closes++;hint.hidden=true;});
    for(const [width,height] of [[1440,900],[980,560],[979,900],[1280,559],[320,740]]) {
      f.resize(width,height); trigger.focus();hint.hidden=false;f.flush();
      const panel=hint.parentElement;
      if(f.body.dataset.desktop==='on')assert.equal(panel,f.$('#play-controls'));
      const ignored=f.key(f.$('#hint-title'),'ArrowRight');assert(!ignored.defaultPrevented);assert(!hint.hidden);
      const count=closes,escape=f.key(f.$('#hint-title'),'Escape');
      assert(escape.defaultPrevented&&escape.stopped,'Escape stays inside the result');
      assert.equal(closes,count+1);assert(hint.hidden);assert.equal(f.doc.activeElement,trigger);
      assert.equal(trigger.getAttribute('aria-expanded'),'false');
      assert(f.visible(f.$('#new-game')),'New Game is restored after dismissal');
      assert(f.visible(f.$('#number-pad'))&&f.visible(f.$('#notes-btn')),'input never becomes hidden');
      f.assertIdentity();
    }
  }
});

for (const background of ['draft', 'filter']) {
  test('hint dismissal restores focus when ' + background + ' remains active', () => {
    for (const focusLocation of ['#hint-close', 'body']) {
      const f = fixture(), trigger = f.$('#hint-btn'), hint = f.$('#hint-panel');
      if (background === 'draft') f.$('#draft-toggle').setAttribute('aria-expanded', 'true');
      else f.$('#lens-rules').setAttribute('aria-pressed', 'true');
      f.flush(); trigger.focus(); hint.hidden = false; f.flush();
      assert.equal(f.body.dataset.workspaceTool, 'hint');
      if (focusLocation === 'body') f.doc.activeElement = f.body;
      else f.$(focusLocation).focus();
      hint.hidden = true; f.flush();
      assert.equal(f.body.dataset.workspaceTool, background === 'draft' ? 'draft' : '', 'filter never takes over input controls');
      assert(f.doc.activeElement === trigger, 'focus returns even though another tool remains active');
      assert(f.visible(trigger)); assert.equal(trigger.getAttribute('aria-expanded'), 'false');
      if (background === 'draft') assert.equal(f.$('#draft-toggle').getAttribute('aria-expanded'), 'true');
      else assert.equal(f.$('#lens-rules').getAttribute('aria-pressed'), 'true');
      f.assertIdentity();
    }
  });
}

test('hint observation does not steal focus from an unrelated control', () => {
  const f = fixture(), hint = f.$('#hint-panel'), unrelated = f.$('#pause-btn');
  unrelated.focus(); hint.hidden = false; f.flush(); assert(f.doc.activeElement === unrelated);
  hint.hidden = true; f.flush(); assert(f.doc.activeElement === unrelated);
  f.$('#hint-btn').focus(); hint.hidden = false; f.flush();
  unrelated.focus(); hint.hidden = true; f.flush(); assert(f.doc.activeElement === unrelated);
});

test('dormant advanced-tool fixture: open optional filter preserves source and input focus through desktop/mobile restoration', () => {
  const f = legacyFixture(), source = f.$('#lens-rules'), input = f.$('#number-pad').children[4];
  f.$('#more-tools-toggle').click(); f.flush();
  source.setAttribute('aria-pressed', 'true'); input.focus();
  for (let i = 0; i < 3; i++) {
    f.api.sync(); f.flush(); assert.equal(f.body.dataset.workspaceTool, '');
    f.resize(390, 844); f.assertRestored();
    assert(f.doc.activeElement === input, 'filter does not replace or hide the input keypad');
    assert(f.visible(source)); assert.equal(source.getAttribute('aria-pressed'), 'true');
    f.resize(1440, 900); assert(f.doc.activeElement === input);
    assert.equal(f.body.dataset.workspaceTool, ''); assert(f.visible(source));
  }
  assertNoNewDrawers(f); f.assertIdentity();
});

test('dormant advanced-tool fixture: left/right layouts preserve filter identity, state, focus and separate batch state', () => {
  const f = legacyFixture(), filter = f.$('#candidate-lens'), source = f.$('#lens-rules'), batch = f.$('#batch-panel');
  const keypad = f.$('#number-pad'), keys = keypad.children.slice();
  f.$('#more-tools-toggle').click(); f.flush();
  const initialScrolls = f.scrolls.length;
  source.setAttribute('aria-pressed', 'true');
  for (const side of ['left', 'right', 'left', 'right']) {
    f.body.dataset.handedness = side;
    for (const selected of [true, false]) {
      batch.hidden = !selected;
      f.$('#batch-toggle').setAttribute('aria-pressed', String(selected));
      source.focus(); f.api.sync(); f.flush();
      assert(filter.parentElement === f.$('.more-tools-content'));
      assert(batch.parentElement === f.$('.more-tools-content'));
      assert.equal(batch.hidden, !selected, 'layout does not change batch visibility');
      assert(f.doc.activeElement === source, 'side preference does not steal filter focus');
      f.resize(390, 844); f.assertRestored();
      assert(filter.parentElement === f.$('.more-tools-content'));
      assert(f.doc.activeElement === source);
      f.resize(1440, 900); assert(filter.parentElement === f.$('.more-tools-content'));
      f.mode('diagonal'); assertDesktopOrder(f);
      f.mode('classic'); assert(filter.parentElement === f.$('.more-tools-content'));
      assert(f.doc.activeElement === source);
      assert.equal(source.getAttribute('aria-pressed'), 'true');
      assert.equal(f.$('#batch-toggle').getAttribute('aria-pressed'), String(selected));
      assert.equal(batch.hidden, !selected);
      assert.equal(f.body.dataset.workspaceTool, '', 'filter and batch do not replace input');
      assert(keypad.children.length === keys.length && keypad.children.every((key, i) => key === keys[i]), 'original main keys remain unchanged');
      assertDesktopOrder(f); f.assertIdentity();
    }
  }
  assert.equal(f.scrolls.length, initialScrolls, 'layout changes never scroll to the fixed filter');
});

function assertMoreState(f, open) {
  const trigger = f.$('#more-tools-toggle'), panel = f.$('#more-tools-panel');
  assert.equal(panel.hidden, !open, 'panel hidden state');
  assert.equal(trigger.getAttribute('aria-expanded'), String(open), 'trigger state mirrors panel');
  assert.equal(trigger.getAttribute('aria-controls'), panel.id);
  assert(f.visible(trigger), 'trigger remains visible');
  assert.equal(f.visible(f.$('#lens-notes')), open, 'hidden optional actions leave synthetic focus visibility');
  assert(panel.parentElement === f.$('.game-layout'), 'region never moves into the keypad or board');
  f.assertIdentity();
}

test('dormant advanced-tool fixture: repeated open, toggle close and explicit close preserve native nodes and focus', () => {
  const f = legacyFixture(), trigger = f.$('#more-tools-toggle'), close = f.$('#more-tools-close');
  const panel = f.$('#more-tools-panel'), originalParent = panel.parentNode;
  for (let i = 0; i < 6; i++) {
    assertMoreState(f, false); trigger.focus(); trigger.click(); f.flush(); assertMoreState(f, true);
    assert(f.doc.activeElement === close, 'explicit opening sends keyboard focus into the newly revealed tools');
    assert.equal(close.lastFocusOptions.preventScroll, true);
    assert(f.scrolls.at(-1).node === panel); assert.equal(f.scrolls.at(-1).options.block, 'nearest');
    f.$('#lens-rules').focus(); assert(f.doc.activeElement === f.$('#lens-rules'));
    if (i % 2) close.click(); else trigger.click();
    f.flush(); assertMoreState(f, false);
    assert(f.doc.activeElement === trigger, 'both dismissal controls return focus to the trigger');
    assert.equal(trigger.lastFocusOptions.preventScroll, false, 'dismissal allows browser to reveal the returned focus target');
    assert(panel.parentNode === originalParent);
    f.$('#lens-notes').focus(); assert(f.doc.activeElement === trigger, 'hidden child cannot receive synthetic focus');
    assert.equal(f.state.batchCancels, 0, 'closing an inactive panel does not cancel unrelated state');
    assertDesktopOrder(f);
  }
  assert.equal(f.scrolls.length, 6, 'only explicit opening scrolls to the revealed panel, never dismissal');
});

test('dormant advanced-tool fixture: Escape dismisses only from the tools region and stops the board shortcut', () => {
  const f = legacyFixture(), trigger = f.$('#more-tools-toggle');
  f.api.showMoreTools(); f.flush(); assertMoreState(f, true);
  f.boardCell.focus(); let outside = f.key(f.boardCell, 'Escape');
  assertMoreState(f, true); assert(!outside.defaultPrevented, 'unrelated board Escape remains available to app');
  const inside = f.$('#lens-rules'); inside.focus();
  let ordinary = f.key(inside, 'ArrowRight'); assertMoreState(f, true); assert(!ordinary.defaultPrevented);
  inside.dispatchEvent(event('keydown', {key:'Escape', bubbles:true, defaultPrevented:true})); f.flush();
  assertMoreState(f, true); assert(f.doc.activeElement === inside, 'a nested widget can consume Escape first');
  const escape = f.key(inside, 'Escape'); assertMoreState(f, false);
  assert(escape.defaultPrevented && escape.stopped, 'handled Escape cannot also run board selection shortcuts');
  assert(f.doc.activeElement === trigger);
  f.key(trigger, 'Escape'); assertMoreState(f, false); f.assertIdentity();
});

test('dormant advanced-tool fixture: open or closed tools preserve optional state across sizes, modes and handedness', () => {
  const f = legacyFixture(), source = f.$('#lens-rules'), draft = f.$('#draft-toggle'), panel = f.$('#more-tools-panel');
  source.setAttribute('aria-pressed', 'true'); f.$('#candidate-lens').dataset.activeDigit = '7';
  draft.setAttribute('aria-expanded', 'true'); f.flush();
  const parent = panel.parentNode;
  for (const open of [false, true, false, true]) {
    if (open !== !panel.hidden) f.$('#more-tools-toggle').click(); f.flush();
    const focus = open ? source : f.$('#notes-btn'); focus.focus();
    for (const change of [() => f.resize(390, 844), () => f.resize(980, 560), () => f.resize(1280, 559),
      () => f.resize(1440, 900), () => f.mode('diagonal'), () => f.mode('classic', true),
      () => f.mode('classic'), () => { f.body.dataset.handedness = 'left'; f.api.sync(); },
      () => { f.body.dataset.handedness = 'right'; f.api.sync(); }]) {
      change(); f.flush(); assertMoreState(f, open); assert(panel.parentNode === parent);
      assert(f.doc.activeElement === focus && f.visible(focus), 'focus survives composition without entering a hidden tools region');
      assert.equal(source.getAttribute('aria-pressed'), 'true');
      assert.equal(f.$('#candidate-lens').dataset.activeDigit, '7');
      assert.equal(draft.getAttribute('aria-expanded'), 'true', 'more tools never dismisses the draft');
      if (f.body.dataset.desktop === 'off') f.assertRestored(); else assertDesktopOrder(f);
    }
  }
});

test('dormant advanced-tool fixture: automatic batch reveal preserves board focus; close cancels selection and keeps filter', () => {
  for (const [count, selecting] of [[0, true], [2, false], [2, true]]) {
    const f = legacyFixture(), trigger = f.$('#more-tools-toggle'), panel = f.$('#more-tools-panel');
    f.$('#candidate-lens').dataset.activeDigit = '4'; f.$('#lens-rules').setAttribute('aria-pressed', 'true');
    f.flush();
    f.boardCell.focus(); const attempts = f.focusAttempts.length;
    f.setBatch(count, selecting); f.flush(); assertMoreState(f, true);
    assert(f.doc.activeElement === f.boardCell, 'new selection reveals actions without stealing board focus');
    assert.equal(f.focusAttempts.length, attempts, 'reveal makes no focus request');
    for (let i = 0; i < 4; i++) { f.api.refreshTools(); f.flush(); }
    assert(f.doc.activeElement === f.boardCell); assert.equal(f.state.batchCancels, 0);
    assert(!f.$('#batch-panel').hidden);
    f.$('#more-tools-close').click(); f.flush(); assertMoreState(f, false);
    assert.equal(f.state.batchCancels, 1, 'dismissal invokes the existing cancellation listener exactly once');
    assert.equal(f.state.batchCount, 0); assert.equal(f.state.batchSelecting, false);
    assert(f.$('#batch-panel').hidden); assert(f.doc.activeElement === trigger);
    assert.equal(f.$('#candidate-lens').dataset.activeDigit, '4');
    assert.equal(f.$('#lens-rules').getAttribute('aria-pressed'), 'true');
    assert.match(trigger.getAttribute('aria-label') || f.name(trigger), /候选筛选已开启/, 'collapsed trigger exposes the retained active filter');
    assert.equal(trigger.dataset.activeFilter, 'true');
    for (let i = 0; i < 4; i++) { f.api.refreshTools(); f.api.sync(); f.flush(); assert(panel.hidden, 'stale state never reopens a cancelled selection'); }
    assert.equal(f.scrolls.length, 0, 'automatic reveal/cancellation never scrolls');
    f.$('#more-tools-toggle').click(); f.flush(); assertMoreState(f, true);
    assert(f.$('#batch-panel').hidden, 'reopening does not restore cancelled selection');
    assert.equal(f.scrolls.length, 1, 'explicit reopening scrolls to the panel once');
  }
});

test('dormant advanced-tool fixture: closing tools safely dismisses an open draft without focusing its hidden trigger', () => {
  for (const method of ['close', 'toggle', 'Escape']) {
    const f = legacyFixture(), trigger = f.$('#more-tools-toggle'), draft = f.$('#draft-panel');
    f.api.showMoreTools(); f.state.draftOpen = true;
    f.$('#draft-dock').hidden = false; draft.hidden = false;
    f.$('#draft-toggle').setAttribute('aria-expanded', 'true');
    draft.dataset.syntheticNotes = 'retained note contents'; f.flush();
    const target = f.$('#lens-rules'); target.focus(); const firstAttempt = f.focusAttempts.length;
    if (method === 'Escape') f.key(target, method);
    else f.$(method === 'toggle' ? '#more-tools-toggle' : '#more-tools-close').click();
    f.flush(); assertMoreState(f, false);
    assert.deepEqual(f.state.draftCloses, [false], 'draft closes through its existing API without returning to the hidden trigger');
    assert(!f.state.draftOpen && draft.hidden); assert.equal(f.$('#draft-toggle').getAttribute('aria-expanded'), 'false');
    assert.equal(draft.dataset.syntheticNotes, 'retained note contents', 'closing does not clear draft content');
    assert(f.doc.activeElement === trigger); assert.equal(f.body.dataset.workspaceTool, '');
    assert(f.focusAttempts.slice(firstAttempt).every(attempt => attempt.node !== f.$('#draft-toggle')), 'no attempted focus into optional content during dismissal');
    f.api.refreshTools(); f.flush(); assertMoreState(f, false);
    f.api.showMoreTools(); f.flush(); assertMoreState(f, true);
    assert(!f.state.draftOpen, 'reopening tools does not unexpectedly reopen the draft');
    assert.equal(draft.dataset.syntheticNotes, 'retained note contents');
  }
});

test('dormant advanced-tool fixture: tools dismissal routes focus to visible hint title on every narrow mode', () => {
  for (const options of [{width:390,height:844}, {width:1024,height:559}, {}, {width:390,height:844,mode:'killer'}]) {
    const f = legacyFixture(options), hint = f.$('#hint-panel');
    f.api.showMoreTools(); hint.hidden = false; f.flush(); f.$('#lens-rules').focus();
    f.$('#more-tools-close').click(); f.flush();
    const narrow = f.body.dataset.desktop === 'off';
    const expected = f.$(narrow ? '#hint-title' : '#more-tools-toggle');
    assert(f.$('#more-tools-panel').hidden); assert.equal(f.$('#more-tools-toggle').getAttribute('aria-expanded'), 'false');
    assert(f.doc.activeElement === expected && f.visible(expected));
    assert.equal(expected.lastFocusOptions.preventScroll, false, 'returned focus must be allowed back into view');
    if (narrow) assert.equal(expected.tabIndex, -1);
    assert.equal(f.scrolls.length, 0);
  }
});

test('dormant advanced-tool fixture: programmatic tools reveal is idempotent and never changes primary input or focus', () => {
  const f = legacyFixture(), keys = f.$('#number-pad').children.slice(), input = keys[4];
  input.focus(); const attempts = f.focusAttempts.length;
  for (let i = 0; i < 5; i++) {
    f.api.showMoreTools(); f.api.refreshTools(); f.flush(); assertMoreState(f, true);
    assert(f.doc.activeElement === input); assert.equal(f.focusAttempts.length, attempts);
    assert.equal(f.body.dataset.workspaceTool, '', 'optional tools do not replace the keypad');
    assert.deepEqual(f.$('#number-pad').children, keys); assertDesktopOrder(f);
  }
  assert.equal(f.state.batchCancels, 0); assert.equal(f.scrolls.length, 0);
});

test('removed tools cannot reopen or steal focus through APIs, batch state or composition', () => {
  for (const options of [{}, {width:390,height:844}, {width:1024,height:559}, {mode:'killer'}]) {
    const f = fixture(options), panel=f.$('#more-tools-panel'), trigger=f.$('#more-tools-toggle');
    const keys=f.$('#number-pad').children.slice(), filter=f.$('#candidate-lens'), input=keys[3];
    filter.dataset.activeDigit='7'; f.$('#lens-rules').setAttribute('aria-pressed','true');
    input.focus(); const attempts=f.focusAttempts.length, scrolls=f.scrolls.length;
    for (const [count, selecting] of [[0,true],[2,false],[2,true]]) {
      f.setBatch(count,selecting); f.api.showMoreTools(true); trigger.click();
      f.api.refreshTools(); f.api.sync(); f.flush();
      assert(panel.hidden && trigger.hidden && trigger.disabled, 'stale optional state never reveals removed controls');
      assert.equal(trigger.getAttribute('aria-expanded'),'false');
      assert.equal(f.doc.activeElement,input); assert.equal(f.focusAttempts.length,attempts);
      assert.equal(f.scrolls.length,scrolls); assert(!f.visible(f.$('#lens-notes')));
      assert.deepEqual(f.$('#number-pad').children,keys); assert.equal(filter.dataset.activeDigit,'7','presentation guard does not erase preserved data');
      f.assertIdentity();
    }
    for (const change of [()=>f.resize(390,844),()=>f.resize(1440,900),()=>f.mode('killer'),()=>f.mode('classic')]) {
      change(); assert(panel.hidden && trigger.hidden && trigger.disabled); assert.equal(f.doc.activeElement,input);
    }
  }
});

test('composition is idempotent, closes selects, repositions open draft and reserves alert height', () => {
  const f = fixture({draftOpen:true}), closeCount = f.state.selectCloses, positions = f.state.draftPositions;
  const snapshot = f.all(f.body).map(node => [node, node.parentNode, node.childNodes.slice()]);
  f.api.sync(); f.api.sync(); f.flush();
  assert.equal(f.state.selectCloses, closeCount); assert.equal(f.state.draftPositions, positions);
  for (const [node, parent, children] of snapshot) {
    assert(node.parentNode === parent); assert(node.childNodes.length === children.length);
    assert(node.childNodes.every((child, index) => child === children[index]), 'idempotent composition keeps anchors and order');
  }
  f.state.alertHeight = 37.2; f.resizeObservers[0].callback();
  assert.equal(f.body.style.getPropertyValue('--desktop-alert-height'), '54px');
  f.resize(390, 844); assert.equal(f.state.selectCloses, closeCount + 1);
  assert.equal(f.state.draftPositions, positions + 1);
  assert.equal(f.body.style.getPropertyValue('--desktop-alert-height'), '0px');
  f.resize(1440, 900); assert.equal(f.state.selectCloses, closeCount + 2);
  assert.equal(f.state.draftPositions, positions + 2); assertDesktopOrder(f); f.assertIdentity();
});

test('Zen suspends desktop composition and restores the same nodes across all modes and resizes', () => {
  const f = fixture();
  for (const mode of releasedModes) {
    f.resize(1440, 900); f.mode(mode.mode, mode.multi, 'overview', mode.outsideClues);
    assertDesktopOrder(f);
    f.body.dataset.zen = 'on'; f.flush();
    assert.equal(f.body.dataset.desktop, 'off'); f.assertRestored();
    f.resize(1920, 1080); assert.equal(f.body.dataset.desktop, 'off'); f.assertRestored();
    f.resize(390, 844); assert.equal(f.body.dataset.desktop, 'off'); f.assertRestored();
    f.body.dataset.zen = 'off'; f.flush(); f.assertRestored();
    f.resize(1440, 900); assertDesktopOrder(f); f.assertIdentity();
  }
});

console.log((process.exitCode ? 'PARTIAL' : 'PASS') + ' reference workspace synthetic controller: ' + checks.length +
  ' groups. Simulated DOM only; no browser layout, pixels, native Tab/accessibility tree, pointer targets, 3D or app integration verification.');

