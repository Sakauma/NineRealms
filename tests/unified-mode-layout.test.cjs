/* CSS/source contracts and expected arithmetic only. No browser is launched,
 * and passing this test does not certify pixels, clipping or physical targets. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Engine = require('../src/engine.js');
const {keypadMetrics} = require('./tactile-keypad-metrics.cjs');
const read = name => fs.readFileSync(path.join(__dirname, '../src/', name), 'utf8');
const workspace = read('workspace.js');
const narrow = read('workspace.css').replace(/\/\*[\s\S]*?\*\//g, '');
const desktop = read('desktop-workspace.css').replace(/\/\*[\s\S]*?\*\//g, '');
const scope = 'body[data-workspace=unified]', full = scope + '[data-desktop=on]';
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function rule(css, selector) {
  const match = css.match(new RegExp('(?:^|[{}])\\s*' + escape(selector) + '\\s*\\{([^{}]*)\\}'));
  assert(match, 'explicit geometry guard exists: ' + selector);
  return match[1];
}
assert(workspace.includes("set('workspace', 'unified')"));
assert(workspace.includes("compose(wide.matches && body.dataset.zen !== 'on')"));
assert(!/dataset\.mode\s*===\s*['"]classic['"]/.test(workspace), 'no classic-only eligibility gate');
assert(!/data-workspace=classic/.test(narrow + desktop), 'no forgotten classic-only visual selectors');
assert(workspace.includes("['#multigrid-tools', alerts]"), 'multi chooser has a retained restoration anchor');
assert(read('floating-draft.js').includes("dataset.workspace==='unified'"), 'floating draft uses the shared marker');
for (const attribute of ['data-mode', 'data-multi', 'data-multi-view', 'data-outside-clues']) {
  assert(workspace.includes("'" + attribute + "'"), 'controller observes ' + attribute);
}
for (const pixels of [32,24,21]) assert(narrow.includes('--outside-clue-gutter:' + pixels + 'px'), 'outside-clue gutter tier ' + pixels);
assert(narrow.includes('@media(max-width:480px){' + scope + '[data-outside-clues=true]{--outside-clue-gutter:24px}}'), '24px gutter ends before wider compact boards need more label room');
assert(narrow.includes('@media(max-width:400px){' + scope + '[data-outside-clues=true]{--outside-clue-gutter:21px}}'), 'small-phone gutter retains its explicit 400px boundary');
assert.match(rule(narrow, scope + '[data-outside-clues=true] .board-card'), /padding:var\(--outside-clue-gutter\)/);
assert.match(rule(desktop, full + '[data-outside-clues=true] .board-card'), /padding:var\(--outside-clue-gutter\)/);
const compactClues = scope + '[data-outside-clues=true]:not([data-desktop=on])';
assert.match(rule(narrow, compactClues + ' .board-grid-shell'), /container-type:inline-size/);
assert.match(rule(desktop, compactClues + ' .board'), /var\(--outside-clue-gutter\).*var\(--board-dimension\)/);
assert.match(rule(desktop, compactClues + ' .board .cell .notes'), /inset:1px;font-size:min\(var\(--clue-note-max\),calc\(\(var\(--clue-cell-size\) - var\(--reading-strong-width,2px\) - 2px\) \/ 3 \* var\(--clue-note-scale\)\)\)/);
assert(desktop.includes('--clue-cell-size:calc((100cqi - 2px) / var(--board-dimension))'), 'outside notes use actual inner cell width');
assert.match(rule(narrow, scope + '[data-multi=true] .board'), /border:0;border-radius:0;background:transparent;overflow:visible/);
assert.match(rule(narrow, scope + '[data-multi=true] .control-panel'), /position:static;top:auto/);
assert.match(rule(desktop, full + '[data-multi=true] .board-card'), /padding:var\(--multi-board-padding\)/);
assert(!/(?:^|[;{])\s*--board-dimension\s*:/.test(narrow + desktop), 'CSS never replaces engine 9/15/21 dimensions');
const overview = full + '[data-multi=true][data-multi-view=overview]';
assert.match(rule(desktop, overview), /--desktop-column:min\(760px,calc\(100vw - 88px - var\(--desktop-tools-width\)\)\)/);
assert.match(rule(desktop, overview + '[data-draft-rail=on]'), /100vw - 112px - var\(--desktop-tools-width\) - var\(--draft-rail-width\)/);
assert(!/\[data-multi-view=detail\][^{}]*\{[^{}]*--desktop-column/.test(desktop), 'focused view retains the standard shared cap');
const native = scope + '[data-multi=true][data-multi-view=overview]';
assert.match(rule(desktop, native + ' .board'), /var\(--board-dimension\)/);
assert.match(rule(desktop, native + ' .board'), /--multi-digit-scale:\.64;--multi-note-scale:\.23;--multi-digit-max:30px;--multi-note-max:11px/);
assert.match(rule(desktop, native + '[data-text-size=large] .board'), /--multi-digit-scale:\.72;--multi-note-scale:\.25;--multi-digit-max:33px;--multi-note-max:12px/);
assert.match(rule(desktop, native + ' .board .cell'), /font-size:clamp\(8px,calc\(var\(--multi-cell-size\) \* var\(--multi-digit-scale\)\),var\(--multi-digit-max\)\)/);
assert.match(rule(desktop, native + ' .board .cell .notes'), /inset:0;font-size:clamp\(3px,calc\(var\(--multi-cell-size\) \* var\(--multi-note-scale\)\),var\(--multi-note-max\)\)/);
assert(desktop.includes('--multi-cell-size:calc(100cqi / var(--board-dimension))'), 'supported containers size by actual inner board width');
assert.match(rule(desktop, full + ' .desktop-board-alerts>#multigrid-tools'), /width:100%;margin:0/);
const alertRules = [...desktop.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(match => match[1].includes(':has(') && match[1].includes('.desktop-board-alerts'));
assert(alertRules.length >= 4, 'alert presence controls each following layout row');
for (const match of alertRules) assert(match[1].includes('#multigrid-tools'), 'multi chooser participates in every alert-row placement selector');
const decorative = rule(desktop, scope + ':is([data-multi=true],[data-mode=jigsaw]) .pause-overlay::before');
assert.match(decorative, /radial-gradient/); assert.match(decorative, /background-size:18px 18px/);
assert(!/linear-gradient/.test(decorative), 'irregular and linked boards never show a false classic grid');
assert.match(decorative, /pointer-events:none/);

const catalog = Engine.getModes().map(({id:mode}) => {
  const puzzle = Engine.getPuzzle('easy', 'unified-layout-contract-' + mode, mode), layout = Engine.getLayout(puzzle);
  return {mode, multi:layout.cellCount > 81, dimension:layout.columns, outside:!!puzzle.clues?.outside?.length};
});
assert.equal(catalog.length, 33);
const close = (a,b,message) => assert(Math.abs(a-b)<1e-8,message);
let cases = 0;
for (const mode of catalog) for (const multiView of mode.multi ? ['overview','detail'] : ['overview']) {
  for (const width of [980,981,1000,1024,1152,1200,1280,1333,1334,1440,1600,1920,2560,3840]) {
    for (const height of [560,576,650,720,900,1080]) for (const hand of ['left','right']) for (const large of [false,true]) {
      const options = {...mode,multiView}, m = keypadMetrics(width,height,options);
      assert(m.board>=604&&m.board<=(mode.multi&&multiView==='overview'?760:620));
      assert(m.board+m.rail+24<=width-64, 'mode-specific board and shared rail fit available horizontal room');
      close(m.board,keypadMetrics(width,height+800,options).board,'short windows never shrink boards');
      close(m.keyWidth,m.keyHeight,'all modes retain square number keys');
      assert(m.keyWidth>=83&&m.keyWidth<=94);
      assert((m.content-24)/5>=44,'all modes retain five usable action widths');
      const shell=m.board+m.rail+24, left=(width-shell)/2;
      const boardX=hand==='left'?left+m.rail+24:left, railX=hand==='left'?left:left+m.board+24;
      close(hand==='left'?boardX-(railX+m.rail):railX-(boardX+m.board),24,'handedness never overlaps columns');
      if (mode.multi&&multiView==='overview') {
        const cell=(m.board-26)/mode.dimension;
        const digit=Math.min(large?33:30,Math.max(8,cell*(large?.72:.64)));
        const note=Math.min(large?12:11,Math.max(3,cell*(large?.25:.23)));
        assert(digit<=cell*.72+1e-8,'overview digits follow actual native cell width');
        assert(note*3<=cell*.75+1e-8,'three note rows leave space inside each native cell');
      }
      if(mode.outside) {
        // A conservative two-digit half-width allowance, not measured glyphs.
        const grid=m.board-66, outsideExtent=(25+29*.7+2.5)*grid/900;
        assert(outsideExtent<32,'retained desktop gutter contains expected SVG label extent');
      }
      cases++;
    }
  }
}
let compactCases = 0;
for (const mode of catalog.filter(mode=>mode.outside || mode.multi)) {
  for (const [width,height] of [[320,740],[350,740],[360,740],[390,844],[400,844],[401,844],[480,844],[481,844],[560,900],[561,900],[600,900],[760,900],[761,559],[979,900],[980,559],[1280,559]]) {
    for (const large of [false,true]) for (const stroke of [2,3]) {
      const requested = width <= 760 ? width-24 : Math.min(560,height-(large?336:326),width-48);
      const board = Math.min(Math.max(300,requested),600,width-24);
      if (mode.outside) {
        const gutter=width<=400?21:width<=480?24:32, cell=(board-2*gutter-4)/9;
        const short=width>=761&&height<=800, cap=width<=760||short?(large?11.5:10.5):(large?12:11);
        const notes=Math.min(cap,(cell-stroke-2)/3*(large?1:.9));
        assert(notes>0&&notes*3+stroke+2<=cell+1e-8,'compact outside notes fit three rows after gutters and strong borders');
        assert((25+29*.7+2.5)*(board-2*gutter-4)/900<gutter,'conservative two-digit outside label extent fits each narrow gutter tier');
      } else {
        const padding=width<=760?8:12, cell=(board-2*padding-2)/mode.dimension;
        const digit=Math.min(large?33:30,Math.max(8,cell*(large?.72:.64)));
        const notes=Math.min(large?12:11,Math.max(3,cell*(large?.25:.23)));
        assert(digit<cell&&notes*3<cell,'narrow multi overview keeps native dimension and bounded digits/notes');
      }
      compactCases++;
    }
  }
}
console.log('PASS unified mode layout contracts: all 33 modes, ' + cases + ' desktop and ' + compactCases + ' compact arithmetic cases, outside gutters/notes, native multi geometry/typography, full-width navigation and nonclassic privacy scaffold. Static/model coverage only; not browser rendering.');
