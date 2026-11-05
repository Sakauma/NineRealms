/* Real Chromium checks. Syntax checks alone do not establish layout or input behavior. */
'use strict';
const {enableDormantTools}=require('./dormant-tools-fixture.cjs');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const {launch, fixture, delay} = require('./browser-helper.cjs');
const {keypadMetrics} = require('./tactile-keypad-metrics.cjs');
(async () => {
  const b = await launch(), {evaluate:run, send} = b;
  const out = path.join(b.root, 'evidence', 'more-tools'), records = [];
  fs.mkdirSync(out, {recursive:true});
  const saved = () => run('JSON.parse(localStorage.getItem("nine-realms.sudoku.v1")).game');
  const stable = g => ({board:g.board,notes:g.notes,selected:g.selected,history:g.history,redo:g.redo,draft:g.draft,branch:g.branch});
  const hidden = () => run('document.querySelector("#more-tools-panel").hidden');
  async function click(selector, modifiers = 0) {
    const p = await run(`(() => {
      const e = document.querySelector(${JSON.stringify(selector)});
      e.scrollIntoView({block:'nearest',inline:'nearest'});
      const r = e.getBoundingClientRect(), x = r.x+r.width/2, y = r.y+r.height/2;
      const h = document.elementFromPoint(x,y);
      return {x,y,scrollY,ok:r.width>0&&r.height>0&&!!h&&(h===e||e.contains(h))&&!e.disabled};
    })()`);
    assert(p.ok, 'visible pointer target ' + selector);
    for (const type of ['mousePressed','mouseReleased'])
      await send('Input.dispatchMouseEvent', {type,x:p.x,y:p.y,button:'left',clickCount:1,modifiers});
    await delay(60);
    return p;
  }
  async function key(value, code, modifiers = 0) {
    const virtual = {Tab:9,Enter:13,Escape:27,Space:32,ArrowRight:39}[code];
    for (const type of ['keyDown','keyUp'])
      await send('Input.dispatchKeyEvent', {type,key:value,code,modifiers,
        ...(virtual ? {windowsVirtualKeyCode:virtual,nativeVirtualKeyCode:virtual} : {}),
        ...(type==='keyDown'&&(code==='Enter'||code==='Space') ? {text:code==='Enter'?'\r':' '} : {})});
    await delay(50);
  }
  async function measure(label) {
    const m = await run(`(() => {
      const rect = e => {const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,documentY:r.y+scrollY,width:r.width,height:r.height};};
      const r = s => rect(document.querySelector(s)), drawer = document.querySelector('#more-tools-panel');
      const filter = document.querySelector('#candidate-lens'), batch = document.querySelector('#batch-panel');
      const scrollable = e => {const s=getComputedStyle(e);return /^(auto|scroll)$/.test(s.overflowY)&&e.scrollHeight>e.clientHeight+1;};
      return {viewportWidth:innerWidth,viewportHeight:innerHeight,desktop:document.body.dataset.desktop,layout:r('.game-layout'),
        board:r('#board-card'),drawer:r('#more-tools-panel'),filter:r('#candidate-lens'),batch:r('#batch-panel'),
        tools:r('.desktop-tools'),controls:r('.control-panel'),pad:r('#number-pad'),
        keys:[...document.querySelectorAll('#number-pad button')].map(rect),
        primary:[...document.querySelectorAll('#play-controls .tool-btn')].map(e=>e.id),
        actions:[...document.querySelectorAll('#more-tools-actions>button')].map(e=>e.id),
        digits:[...document.querySelectorAll('#lens-digits button')].map(rect),
        drawerHidden:drawer.hidden,expanded:document.querySelector('#more-tools-toggle').getAttribute('aria-expanded'),
        batchHidden:batch.hidden,sourceVisible:[...document.querySelectorAll('.lens-sources button')].every(e=>e.getClientRects().length>0),
        hiddenActions:[...drawer.querySelectorAll('button')].every(e=>e.getClientRects().length===0),
        contained:drawer.parentElement.matches('.game-layout')&&drawer.contains(filter)&&drawer.contains(batch),
        nestedScroll:[drawer,drawer.querySelector('.more-tools-content'),filter,batch].some(scrollable),
        overflow:document.documentElement.scrollWidth>innerWidth||(!drawer.hidden&&drawer.scrollWidth>drawer.clientWidth+1),
        unique:[...document.querySelectorAll('[id]')].map(e=>e.id).filter((id,i,a)=>a.indexOf(id)!==i),
        toggleTag:document.querySelector('#more-tools-toggle').tagName,
        toggleControls:document.querySelector('#more-tools-toggle').getAttribute('aria-controls')};
    })()`);
    m.label = label; records.push(m);
    assert.deepEqual(m.unique, [], 'original nodes, no duplicate IDs');
    assert.equal(m.toggleTag, 'BUTTON');
    assert.equal(m.toggleControls, 'more-tools-panel');
    assert.deepEqual(m.primary, ['undo-btn','redo-btn','erase-btn','notes-btn','hint-btn','more-tools-toggle'], 'six everyday actions');
    assert.deepEqual(m.actions, ['draft-toggle','check-btn','error-toggle','auto-notes-btn'], 'optional actions retained');
    assert(m.contained && !m.overflow, 'one shared drawer without horizontal overflow');
    assert.equal(m.expanded, String(!m.drawerHidden));
    assert.equal(m.keys.length, 9);
    assert.equal(m.digits.length, 9);
    if (m.drawerHidden) {
      assert(m.hiddenActions && m.batchHidden, 'collapsed drawer is absent from layout and has no active batch mode');
    } else {
      assert(m.drawer.y>=Math.max(m.board.bottom,m.controls.bottom)-1, 'drawer follows the whole playing workspace');
      assert(Math.abs(m.drawer.x-m.layout.x)<1&&Math.abs(m.drawer.right-m.layout.right)<1, 'drawer spans workspace, not input column');
      assert(m.filter.x>=m.drawer.x&&m.filter.right<=m.drawer.right+1, 'filter contained in shared drawer');
      assert(m.sourceVisible&&!m.nestedScroll, 'optional tools have no nested vertical scroll area');
      assert(m.digits.every(d=>Math.abs(d.y-m.digits[0].y)<1&&d.width>=24&&d.height>=32), 'single usable digit row');
      if (!m.batchHidden) {
        if (m.viewportWidth>=980) {
          assert(Math.abs(m.filter.y-m.batch.y)<1&&m.filter.right<=m.batch.x-8, 'wide filter and batch use adjacent columns');
        } else assert(m.batch.y>=m.filter.bottom+8, 'narrow batch follows filter');
        assert(m.batch.right<=m.drawer.right+1, 'batch remains in drawer');
      }
    }
    if (m.desktop==='on') {const expected=keypadMetrics(m.viewportWidth,m.viewportHeight);assert(m.keys.every(k=>Math.abs(k.width-expected.keyWidth)<.1&&Math.abs(k.height-expected.keyHeight)<.1), 'drawer retains large adaptive desktop keys');}
    const shot = await send('Page.captureScreenshot', {format:'png',captureBeyondViewport:false});
    fs.writeFileSync(path.join(out,label+'.png'), Buffer.from(shot.data,'base64'));
    return m;
  }
  function padEqual(a,b) {
    for (const name of ['pad','board']) for (const k of ['x','documentY','width','height'])
      assert(Math.abs(a[name][k]-b[name][k])<1, 'stable '+name+' '+k);
    for (let i=0;i<a.keys.length;i++) for (const k of ['x','documentY','width','height'])
      assert(Math.abs(a.keys[i][k]-b.keys[i][k])<1, 'stable key '+i+' '+k);
  }
  async function closedWithFocus() {
    assert(await hidden(), 'drawer closes');
    assert.equal(await run('document.activeElement.id'), 'more-tools-toggle', 'close restores trigger focus');
    assert.equal(await run('document.querySelector("#more-tools-toggle").getAttribute("aria-expanded")'), 'false');
  }
  try {
    const cases = [{w:1280,h:720},{w:1440,h:900},{w:1920,h:1080},{w:1024,h:576,scale:1.25,large:true},
      {w:1440,h:900,hand:'left',large:true},{w:390,h:844},{w:360,h:740,large:true}];
    for (const c of cases) {
      await send('Emulation.setDeviceMetricsOverride', {width:c.w,height:c.h,deviceScaleFactor:c.scale||1,mobile:c.w<768});
      const s = fixture('ui-audit-classic');
      Object.assign(s.preferences, {theme:'nebula',fx:false,sound:false,handedness:c.hand||'right',textSize:c.large?'large':'normal'});
      await b.load(s, '/dist/index.html'); await click('#resume-btn'); await run('document.fonts.ready'); await run('scrollTo(0,0)');
      const shipped=await saved(), blank=shipped.board.findIndex(v=>!v);
      assert(await run('document.body.dataset.advancedTools==="off"&&document.getElementById("more-tools-toggle").hidden&&document.getElementById("more-tools-toggle").disabled&&document.getElementById("more-tools-panel").inert'),'shipped tools have no visible or interactive entry');
      await run('NineRealmsWorkspace.showMoreTools(true);NineRealmsWorkspace.refreshTools()');assert(await hidden(),'public reveal cannot reopen removed UI');
      await click('#board [data-index="'+blank+'"]',2);await key('ArrowRight','ArrowRight',8);
      assert(await hidden());assert(await run('document.getElementById("batch-panel").hidden&&document.querySelector("#board").getAttribute("aria-multiselectable")==="false"'),'Ctrl/Shift selection cannot create hidden batch mode');
      const selected=await saved();for(const field of ['board','notes','draft','history','redo'])assert.deepEqual(selected[field],shipped[field]);
      await run('document.getElementById("new-game").focus()');await key('Tab','Tab');assert.notEqual(await run('document.activeElement.id'),'more-tools-toggle','removed entry never enters Tab order');
      // Preserve deep old code coverage only inside an explicitly altered test fixture.
      await enableDormantTools(run);await run('scrollTo(0,0)');
      const label=c.w+'x'+c.h+'-'+(c.hand||'right'), before=await measure(label+'-dormant-default'), g0=stable(await saved());
      assert(before.drawerHidden, 'dormant fixture starts collapsed');

      // Tab reaches the native disclosure. Enter and Space both activate it.
      await run('document.querySelector('+JSON.stringify(before.desktop==='on'?'#new-game':'#hint-btn')+').focus()'); await key('Tab','Tab');
      assert.equal(await run('document.activeElement.id'), 'more-tools-toggle');
      await key('Enter','Enter'); assert(!(await hidden()));
      assert.equal(await run('document.activeElement.id'), 'more-tools-close', 'explicit opening enters the drawer');
      await key('Tab','Tab'); assert.equal(await run('document.activeElement.id'), 'draft-toggle');
      await key('Escape','Escape'); await closedWithFocus();
      for (let repeat=0;repeat<3;repeat++) {
        await key(' ','Space'); assert(!(await hidden()));
        assert.equal(await run('document.activeElement.id'), 'more-tools-close');
        padEqual(before, await measure(label+'-keyboard-open-'+repeat));
        await key('Enter','Enter'); await closedWithFocus();
      }
      assert.deepEqual(stable(await saved()),g0, 'disclosure keyboard navigation never changes the puzzle');

      await click('#more-tools-toggle');
      const errorCheck=await run('document.querySelector("#error-toggle").getAttribute("aria-pressed")');
      await click('#error-toggle'); assert.notEqual(await run('document.querySelector("#error-toggle").getAttribute("aria-pressed")'), errorCheck);
      await click('#error-toggle'); assert.equal(await run('document.querySelector("#error-toggle").getAttribute("aria-pressed")'), errorCheck);
      await click('#lens-rules');
      assert.match(await run('document.querySelector("#lens-status").textContent'), /局部可能，未证明可解/);
      await click('#lens-digits [data-digit="4"]');
      assert.equal(await run('document.querySelector("#candidate-lens").dataset.activeDigit'), '4');
      padEqual(before, await measure(label+'-filter-active'));
      await click('#more-tools-close'); await closedWithFocus();
      assert.equal(await run('document.querySelector("#candidate-lens").dataset.activeDigit'), '4', 'close preserves filter digit');
      assert.equal(await run('document.querySelector("#lens-rules").getAttribute("aria-pressed")'), 'true', 'close preserves filter source');
      assert.equal(await run('document.querySelector("#more-tools-toggle").dataset.activeFilter'), 'true', 'collapsed trigger indicates active filter');
      padEqual(before, await measure(label+'-active-collapsed'));
      await click('#more-tools-toggle'); await click('#lens-digits [data-digit="4"]');
      assert.equal(await run('document.querySelector("#candidate-lens").dataset.activeDigit'), '0');
      assert.equal(await run('document.querySelectorAll(".cell.lens-note,.cell.lens-rule").length'), 0);
      await click('#lens-notes'); assert.deepEqual(stable(await saved()),g0, 'filter never edits game');

      await click('#batch-toggle'); padEqual(before, await measure(label+'-batch-open'));
      const g=await saved(), i=g.board.findIndex(x=>!x);
      await click('#board [data-index="'+i+'"]');
      await click('.glass-select[data-select-id="batch-digit"] .glass-select-trigger');
      await key('Home','Home'); await key('ArrowDown','ArrowDown'); await key('ArrowDown','ArrowDown'); await key('Enter','Enter');
      assert.equal(await run('document.querySelector("#batch-digit").value'), '3');
      await click('#batch-add'); assert.equal((await saved()).notes[i],4);
      await key('z','KeyZ',2); assert.equal((await saved()).notes[i],0);
      await key('y','KeyY',2); assert.equal((await saved()).notes[i],4);
      await run('document.querySelector("#board .selected").focus({preventScroll:true})'); await key('Escape','Escape');
      assert(await run('document.querySelector("#batch-panel").hidden')); assert(!(await hidden()), 'board Escape only cancels multi-selection');
      await click('#more-tools-close');

      // Modifier selection reveals optional actions without stealing board focus or scrolling.
      const ctrl=await click('#board [data-index="'+i+'"]',2);
      assert(!(await hidden())&&await run('!document.querySelector("#batch-panel").hidden'));
      assert.equal(await run('document.activeElement.dataset.index'), String(i), 'Ctrl selection retains cell focus');
      assert.equal(await run('scrollY'), ctrl.scrollY, 'implicit reveal does not scroll');
      padEqual(before, await measure(label+'-ctrl-revealed'));
      await click('#more-tools-close'); await closedWithFocus();
      assert(await run('document.querySelector("#batch-panel").hidden&&document.querySelector("#board").getAttribute("aria-multiselectable")==="false"'), 'closing cancels hidden multi-selection');
      await click('#board [data-index="'+i+'"]'); const scrollBefore=await run('scrollY');
      await key('ArrowRight','ArrowRight',8);
      assert(!(await hidden())&&await run('!document.querySelector("#batch-panel").hidden'));
      assert(await run('document.activeElement.matches("#board .cell")'), 'Shift selection retains board focus');
      assert.equal(await run('scrollY'), scrollBefore, 'Shift reveal does not scroll');
      await click('#batch-selection-clear'); assert(await run('document.querySelector("#batch-panel").hidden'));
      padEqual(before, await measure(label+'-batch-dismissed'));

      // The select consumes its first Escape; a subsequent Escape closes the drawer.
      await click('#batch-toggle'); await click('.glass-select[data-select-id="batch-digit"] .glass-select-trigger');
      await key('Escape','Escape'); assert(!(await hidden()), 'select Escape does not dismiss containing tools');
      await key('Escape','Escape'); await closedWithFocus();
      assert(await run('document.querySelector("#batch-panel").hidden'));
      await click('#more-tools-toggle'); const draftBefore=(await saved()).draft;
      await click('#draft-toggle'); assert(await run('!document.querySelector("#draft-panel").hidden'));
      await click('#more-tools-close'); await closedWithFocus();
      assert(await run('document.querySelector("#draft-panel").hidden'), 'closing More Tools also closes floating draft');
      assert.deepEqual((await saved()).draft,draftBefore, 'closing keeps draft data');
      padEqual(before, await measure(label+'-all-closed'));

      await click('#more-tools-toggle'); await click('#pause-btn'); await click('#lens-digits [data-digit="2"]');
      assert.equal(await run('document.querySelectorAll(".cell.lens-rule,.cell.lens-note").length'),0);
      await click('#resume-btn'); await click('#more-tools-close');
    }
    assert.deepEqual(b.events.filter(e=>e.method==='Runtime.exceptionThrown'), []);
    fs.writeFileSync(path.join(out,'measurements.json'), JSON.stringify(records,null,2));
    console.log('PASS shipped removed-tools guards plus explicitly enabled dormant-tools Chromium regression: '+records.length+' measured states; full-workspace drawer, stable board/keypad, keyboard disclosure/focus, persistent filter, contextual batch/undo/redo/modifier selection and draft cleanup. '+out);
  } finally { await b.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
