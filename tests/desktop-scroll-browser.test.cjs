/* Removed advanced tools are explicitly re-enabled only for dormant regression fixtures. */
/* Real-browser regression for the reported status-over-board overlap.
 * Static controller tests cannot establish this geometry. This suite records
 * actual rectangles and screenshots at top/middle/bottom scroll positions. */
'use strict';
const {enableDormantTools}=require('./dormant-tools-fixture.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {launch, fixture, delay} = require('./browser-helper.cjs');
(async () => {
  const b = await launch(), {evaluate:run, send} = b;
  const out = process.env.NINE_REALMS_SCROLL_EVIDENCE_DIR || path.join(b.root, 'evidence', 'desktop-scroll');
  fs.mkdirSync(out, {recursive:true});
  const records = [];
  async function click(selector) {
  if(await run(`!!document.querySelector(${JSON.stringify(selector)})?.closest('#more-tools-panel[hidden]')`)) { await enableDormantTools(run); await click('#more-tools-toggle'); }

    const point = await run(`(() => {
      const e = document.querySelector(${JSON.stringify(selector)});
      e.scrollIntoView({block:'nearest'});
      const r = e.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      return {x,y,reachable:!!hit && (hit === e || e.contains(hit)),disabled:!!e.disabled};
    })()`);
    assert(point.reachable && !point.disabled, 'reachable pointer target ' + selector);
    await send('Input.dispatchMouseEvent', {type:'mousePressed',x:point.x,y:point.y,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent', {type:'mouseReleased',x:point.x,y:point.y,button:'left',clickCount:1});
    await delay(80);
  }
  const readGame = () => run('JSON.parse(localStorage.getItem("nine-realms.sudoku.v1")).game');
  const stable = game => ({board:game.board,notes:game.notes,history:game.history,redo:game.redo,
    selected:game.selected,draft:game.draft,branch:game.branch,branches:game.branches});
  async function load(config) {
    await send('Emulation.setDeviceMetricsOverride', {width:config.w,height:config.h,
      deviceScaleFactor:config.scale || 1,mobile:false});
    const state = fixture('ui-audit-classic');
    Object.assign(state.preferences, {theme:config.theme || 'nebula',fx:false,sound:false,
      handedness:config.hand || 'right',textSize:config.large ? 'large' : 'normal'});
    await b.load(state, '/dist/index.html');
    await click('#resume-btn');
    await run('document.fonts.ready');
  }
  async function checkScroll(label, fractions = [0, 0.5, 1]) {
    const saved = stable(await readGame());
    for (const fraction of fractions) {
      await run(`scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * ${fraction})`);
      await send('Input.dispatchMouseEvent', {type:'mouseMoved',x:0,y:0});
      await delay(120);
      const record = await run(`(() => {
        const r = s => document.querySelector(s).getBoundingClientRect().toJSON();
        return {scrollY,viewport:[innerWidth,innerHeight],scrollHeight:document.documentElement.scrollHeight,
          board:r('#board-card'),status:r('.desktop-status'),hud:r('#energy-hud'),
          normal:r('.normal-status'),message:r('.status-box'),extras:r('#explore-settings'),tools:r('.desktop-tools'),controls:r('.control-panel'),
          nestedScroll:[...document.querySelectorAll('.desktop-tools,.control-panel,#play-controls')].some(e=>{const s=getComputedStyle(e);return /^(auto|scroll)$/.test(s.overflowY)&&e.scrollHeight>e.clientHeight+1;}),
          wrapperPosition:getComputedStyle(document.querySelector('.desktop-board-area')).position,
          horizontalOverflow:document.documentElement.scrollWidth > innerWidth};
      })()`);
      record.label = label; record.fraction = fraction; records.push(record);
      assert.equal(record.wrapperPosition, 'static', label + ': wrapper follows page flow');
      assert(record.status.top >= record.board.bottom + 12,
        label + ': status must stay below board at scroll ' + fraction + ' ' + JSON.stringify(record));
      assert(record.hud.top >= record.board.bottom + 12, label + ': energy row cannot paint over last Sudoku row');
      assert(record.extras.top >= record.status.bottom, label + ': lower content follows status');
      assert(!record.horizontalOverflow, label + ': no horizontal overflow');
      assert(!record.nestedScroll, label + ': tall rail uses the document scroll instead of an inner scroller');
      assert.deepEqual(stable(await readGame()), saved, label + ': scrolling cannot mutate puzzle state');
      const shot = await send('Page.captureScreenshot', {format:'png',captureBeyondViewport:false});
      fs.writeFileSync(path.join(out, label + '-scroll-' + fraction + '.png'), Buffer.from(shot.data,'base64'));
    }
  }
  try {
    const configs = [
      ...[[1280,720],[1440,900],[1920,1080]].flatMap(([w,h])=>['right','left'].map(hand=>({w,h,hand}))),
      {w:1152,h:720,scale:1.25,large:true}, {w:1024,h:576,scale:1.25,large:true},
      {w:1280,h:720,scale:1.5,large:true}
    ];
    for (const config of configs) {
      await load(config);
      await checkScroll(`${config.w}x${config.h}-${config.scale || 1}-${config.hand || 'right'}`);
    }
    await load({w:1440,h:900});
    await click('#lens-digits [data-digit="4"]');
    await checkScroll('filter-active');
    await click('#hint-btn');
    assert(await run('!document.querySelector("#hint-panel").hidden'), 'hint really opens');
    await checkScroll('hint-open');
    await click('#hint-close');
    await checkScroll('hint-dismissed-filter-retained');
    await click('#lens-digits [data-digit="4"]');
    await click('#explore-settings > summary');
    await click('#branch-btn');
    assert(await run('!document.querySelector("#branch-banner").hidden'), 'branch alert really opens');
    await checkScroll('branch-alert');
    await click('#branch-rollback');
    await checkScroll('branch-dismissed');
    const errors = b.events.filter(event => event.method === 'Runtime.exceptionThrown');
    assert.deepEqual(errors, [], 'no unhandled runtime exceptions');
    fs.writeFileSync(path.join(out, 'measurements.json'), JSON.stringify(records, null, 2));
    console.log('PASS desktop scroll browser: ' + records.length + ' measured states; screenshots: ' + out);
  } finally { await b.close(); }
})().catch(error => {console.error(error); process.exitCode = 1;});
