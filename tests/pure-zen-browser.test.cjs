/* Real Chromium/CDP coverage. Run after building dist; no DOM-facade geometry. */
'use strict';
const assert = require('node:assert/strict');
const {launch, fixture, delay} = require('./browser-helper.cjs');
const Engine = require('../src/engine.js');
const route = process.env.NINE_REALMS_ZEN_ROUTE || '/dist/index.html';
const close = (a, b, why) => assert(Math.abs(a - b) < 1, `${why}: ${a} vs ${b}`);
const gameFields = ['sessionId','puzzleId','sourceId','mode','difficulty','clues','givens','solution',
  'board','notes','draft','selected','history','redo','branch','fog','fogSeen','logicMode',
  'hints','mistakes','energy','noteMode','started','paused','completed','practice','voyageId','dailyDate'];
function state(mode = 'classic') {
  const s = fixture('pure-zen-' + mode);
  const p = Engine.getPuzzle('easy', 'pure-zen-' + mode, mode);
  Object.assign(s.game, {mode, puzzleId:p.id, sourceId:p.sourceId, clues:p.clues,
    givens:p.givens, solution:p.solution, board:p.givens.slice(),
    notes:p.givens.map(() => 0), selected:p.givens.findIndex(n => !n)});
  Object.assign(s.preferences, {sound:false, theme:'ivory', zen:false});
  return s;
}
(async () => {
  const browser = await launch();
  const {evaluate:run, send, waitFor} = browser;
  const saved = () => run('JSON.parse(localStorage.getItem("nine-realms.sudoku.v1"))');
  const stable = s => Object.fromEntries(gameFields.map(k => [k, s.game[k]]));
  const gameplay = s => Object.fromEntries(Object.entries(stable(s)).filter(([k]) => k !== 'selected'));
  const settings = s => Object.fromEntries(Object.entries(s.preferences).filter(([k]) => k !== 'zen'));
  const visible = selector => run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});return !!e&&e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&e.getBoundingClientRect().width>0})()`);
  async function click(selector) {
    assert(await visible(selector), 'click target is visible: ' + selector);
    const p = await run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    for (const type of ['mousePressed','mouseReleased']) await send('Input.dispatchMouseEvent', {type,...p,button:'left',clickCount:1});
    await delay(30);
  }
  async function escape() {
    for (const type of ['keyDown','keyUp']) await send('Input.dispatchKeyEvent', {type,key:'Escape',code:'Escape'});
    await delay(30);
  }
  async function load(s, width = 1440, height = 900, resume = true) {
    await send('Emulation.setDeviceMetricsOverride', {width,height,deviceScaleFactor:1,mobile:width<768});
    await send('Emulation.setTouchEmulationEnabled', {enabled:width<768});
    await browser.load(s, route);
    if (resume && await visible('#resume-btn')) await click('#resume-btn');
    await run('document.fonts.ready');
  }
  async function inspectZen(width) {
    assert.equal(await run('document.body.dataset.zen'), 'on');
    assert.equal(await run('document.body.dataset.desktop'), 'off', 'Zen uses the simple board-first shell');
    assert(await run('document.documentElement.scrollWidth<=innerWidth'), 'no horizontal overflow');
    for (const id of ['hint-btn','hint-panel','redo-btn','new-game','more-tools-toggle',
      'personal-open','history-open','pause-btn','zen-pause','appearance-settings','branch-banner']) {
      assert(!await visible('#' + id), id + ' is absent from the Zen surface');
    }
    const controls = await run(`(()=>{const visible=e=>e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&e.getBoundingClientRect().width>0;return [...document.querySelectorAll('button,a,summary,input,select')].filter(visible).filter(e=>!e.closest('#board')).map(e=>({id:e.id,value:e.dataset.value,grid:!!e.closest('.glass-select[data-select-id="grid-view"]'),rect:e.getBoundingClientRect().toJSON()}))})()`);
    for (const c of controls) {
      assert(c.value || c.grid || ['zen-toggle','undo-btn','erase-btn','notes-btn','start-btn','resume-btn'].includes(c.id), 'unexpected visible control: ' + JSON.stringify(c));
      assert(c.rect.width >= 43.9 && c.rect.height >= 43.9, '44px tap target: ' + (c.id || c.value));
    }
    for (const id of ['zen-toggle','undo-btn','erase-btn','notes-btn']) assert(await visible('#'+id), id + ' remains visible');
    const keys = controls.filter(c => c.value).sort((a,b) => Number(a.value)-Number(b.value));
    assert.equal(keys.length, 9, 'nine visible digits');
    if (width >= 480) keys.forEach(k => close(k.rect.top, keys[0].rect.top, 'wide keypad is a single row'));
    else {
      keys.slice(0,5).forEach(k => close(k.rect.top, keys[0].rect.top, 'first row has five digits'));
      keys.slice(5).forEach(k => close(k.rect.top, keys[5].rect.top, 'second row has four digits'));
      assert(keys[5].rect.top >= keys[0].rect.bottom, 'rows do not overlap');
      close((keys[0].rect.left+keys[4].rect.right)/2, (keys[5].rect.left+keys[8].rect.right)/2, 'short row is centered');
    }
  }
  try {
    const modes = Engine.getModes().map(m => m.id);
    assert.equal(modes.length, 33, 'cover the entire released catalog');
    for (const width of [390,1440]) for (const mode of modes) {
      await load(state(mode), width, width===390?844:900);
      const before = await saved();
      await run('window.__zenNodes=[document.querySelector("#board"),...document.querySelectorAll("#board .cell"),...document.querySelectorAll("#number-pad button")]');
      await click('#zen-toggle');
      await inspectZen(width);
      assert.deepEqual(stable(await saved()), stable(before), mode + ': entering Zen preserves game');
      assert.deepEqual(settings(await saved()), settings(before), mode + ': other preferences preserved');
      if (await run('document.body.dataset.multi==="true"')) {
        const trigger = '.glass-select[data-select-id="grid-view"] .glass-select-trigger';
        assert(await visible(trigger), mode + ': multi-grid chooser remains usable');
        await click(trigger);
        await click('.glass-select-list:not([hidden]) [data-index="1"]');
        assert.equal(await run('document.body.dataset.multiView'), 'detail');
        assert.deepEqual(gameplay(await saved()), gameplay(before), 'changing grid view only changes the selected cell when needed');
      }
      const afterView = await saved();
      await escape();
      await waitFor('document.body.dataset.zen==="off"');
      assert.deepEqual(stable(await saved()), stable(afterView), mode + ': leaving Zen preserves game and current selection');
      assert.deepEqual(settings(await saved()), settings(before));
      assert.equal(await run('document.body.dataset.desktop'), width>=980?'on':'off');
      assert(await visible('#hint-btn'), 'ordinary hint action restored');
      assert(await run('window.__zenNodes.every(e=>e.isConnected)&&window.__zenNodes[0]===document.querySelector("#board")'), 'transitions retain live board and input nodes');
    }
    for (const width of [320,360,479,480,980,1920]) {
      const s = state(); s.preferences.handedness = 'left'; s.preferences.textSize = 'large';
      await load(s, width, 740); await click('#zen-toggle'); await inspectZen(width);
    }
    for (const phase of ['ready','paused','completed']) {
      const s = state();
      if (phase === 'ready') s.game.started = false;
      if (phase === 'completed') {s.game.board=s.game.solution.slice();s.game.completed=true;}
      await load(s, 390, 844, false);
      const before = await saved();
      await click('#zen-toggle');
      if (phase === 'ready') assert(await visible('#start-btn'));
      if (phase === 'paused') assert(await visible('#resume-btn'));
      if (phase === 'completed') assert.match(await run('document.querySelector("#zen-context").textContent'), /圆满/);
      await escape();
      assert.equal(await run('document.body.dataset.zen'), 'off', phase + ': Escape exits before input guards');
      assert.deepEqual(stable(await saved()), stable(before), phase + ': transition preserves state');
    }
    // The three retained tools work through real pointer input on the live game.
    await load(state(), 390, 844); await click('#zen-toggle');
    const editable = (await saved()).game.selected;
    const value = (await saved()).game.solution[editable];
    const digit = '#number-pad [data-value="'+value+'"]';
    await click('#notes-btn'); await click(digit);
    assert.equal((await saved()).game.notes[editable], 1 << (value-1), 'manual note entry');
    assert.equal((await saved()).game.board[editable], 0, 'notes do not fill the cell');
    const noted = await saved();
    await escape(); await click('#zen-toggle');
    assert.deepEqual(stable(await saved()), stable(noted), 'existing notes and edit history survive transitions');
    await click('#erase-btn'); assert.equal((await saved()).game.notes[editable], 0, 'erase notes');
    await click('#undo-btn'); assert.equal((await saved()).game.notes[editable], 1 << (value-1), 'undo restores notes');
    await click('#notes-btn'); await click(digit);
    assert.equal((await saved()).game.board[editable], value, 'normal digit entry');
    await click('#erase-btn'); assert.equal((await saved()).game.board[editable], 0, 'erase digit');
    await click('#undo-btn'); assert.equal((await saved()).game.board[editable], value, 'undo restores digit');
    // An active assumption must never silently look like the main board.
    await load(state());
    // Open the actual gameplay drawer before creating an assumption.
    await click('#explore-settings > summary'); await click('#branch-btn');
    const branch = await saved(); assert(branch.game.branch, 'real assumption created');
    await click('#zen-toggle');
    assert(await visible('#zen-context'));
    assert.match(await run('document.querySelector("#zen-context").textContent'), /假设/);
    assert.deepEqual(stable(await saved()), stable(branch));
    await escape(); assert(await visible('#branch-banner'));
    assert.deepEqual(stable(await saved()), stable(branch));
    // Finish through actual input, not merely a restored completed snapshot.
    const almost = state(), i = almost.game.selected;
    almost.game.board=almost.game.solution.slice(); almost.game.board[i]=0;
    await load(almost); await click('#zen-toggle');
    await click('#number-pad [data-value="'+almost.game.solution[i]+'"]');
    await waitFor('JSON.parse(localStorage.getItem("nine-realms.sudoku.v1")).game.completed');
    assert(!await run('document.querySelector("#completion-dialog").open'), 'quiet completion does not open a dialog');
    assert(await visible('#zen-context'));
    await escape(); assert.equal(await run('document.body.dataset.zen'), 'off');
    console.log('PASS pure Zen Chromium: 33 modes × mobile/wide transitions, preserved game/settings/nodes, minimal controls, responsive targets, multi-grid view, assumption safety and ready/paused/completed Escape.');
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
