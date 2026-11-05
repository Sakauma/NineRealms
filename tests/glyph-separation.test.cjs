/* Production text painting on a tiny DOM facade plus static CSS contracts.
 * Not browser rendering, native screenshots, or measured visual contrast. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,'../src',name),'utf8');
const app=read('app.js'),history=read('history.js');
function between(source,start,end){
 const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
 assert(a>=0 && b>a,'production paint boundaries exist');return source.slice(a,b);
}
const livePaint=between(app,'button.querySelector(".value").textContent =','      button.setAttribute("aria-label", cellLocation(i)');
const replayPaint=between(history,'var value=f.board[i],mask=f.notes[i];','     cell.classList.toggle("replay-changed"');
function cell(){
 const value={textContent:''},notes=Array.from({length:9},()=>({textContent:''}));
 return {value,notes,querySelector(selector){assert(/value/.test(selector));return value;},querySelectorAll(selector){assert(/notes span/.test(selector));return notes;}};
}
let paintCases=0;
for(const mode of ['live','replay']){
 const node=cell(),context=vm.createContext({i:0,button:null,cell:null,game:{notes:[0]},f:{board:[0],notes:[0]}});
 context.button=node;context.cell=node;
 const paint=new vm.Script(mode==='live'?livePaint:replayPaint);
 // Reuse nodes across filled, candidate and empty transitions. All 512 masks
 // exercise each candidate independently, including all-nine notes.
 for(const value of [0,1,5,9,0])for(let mask=0;mask<512;mask++){
  const fogCases=mode==='live'?[false,true]:[false];
  for(const fogged of fogCases){
   context.value=value;context.fogged=fogged;context.game.notes[0]=mask;context.f.notes[0]=mask;context.f.board[0]=value;
   paint.runInContext(context);
   assert.equal(node.value.textContent,!fogged&&value?String(value):'',mode+': filled glyph or empty/fogged');
   assert.deepEqual(node.notes.map(n=>n.textContent),Array.from({length:9},(_,d)=>!fogged&&!value&&(mask&(1<<d))?String(d+1):''),mode+': separate candidate glyphs, no stale/fogged notes');
   paintCases++;
  }
 }
}
assert.match(app,/for \(var n = 1; n <= 9; n\+\+\) notes\.appendChild\(document\.createElement\("span"\)\)/,'live notes have nine independent glyph elements');
assert.match(history,/for\(var d=1;d<=9;d\+\+\)notes\.appendChild\(el\("span"\)\)/,'replay notes have nine independent glyph elements');
const styles=read('styles.css').replace(/\/\*[\s\S]*?\*\//g,''),desktop=read('desktop-workspace.css').replace(/\/\*[\s\S]*?\*\//g,''),historyCss=read('history.css');
assert(styles.includes('.cell.fogged .value,.cell.fogged .notes{visibility:hidden}'));
assert(desktop.includes('body[data-game-state=ready] #board-grid-shell,body[data-game-state=paused] #board-grid-shell{visibility:hidden}'));
assert(!/visibility\s*:\s*visible/.test(desktop),'a halo must never reveal a paused/fogged glyph');
// These original semantic ink declarations must survive separation styling.
for(const rule of ['.cell.given{color:var(--text);font-weight:500}', '.cell.conflict{color:var(--error);background-color:var(--error-bg)}', '.cell.branch-cell:not(.conflict) .value,.cell.branch-cell:not(.conflict) .notes{color:var(--branch)}'])assert(styles.includes(rule),'preserves '+rule);
assert.match(styles,/\.cell \.notes \.lens-digit\{[^}]*color:var\(--accent\)/,'candidate lens accent remains meaningful');
assert.match(historyCss,/\.history-cell\.given\{color:var\(--text\)\}/);
// Quiet-clue styling must not sneak a blanket badge, halo or plate onto digits
// or the candidate grid. Ink/state and font-size rules remain separate.
assert(!desktop.includes('--glyph-halo'),'quiet materials replace the rejected blanket numeral halo');
for(const match of desktop.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
 if(!/\.(?:value|notes|history-value|history-notes)(?![\w-])/.test(match[1]))continue;
 assert(!/(?:^|;)\s*(?:background(?:-[\w-]+)?|box-shadow|filter|padding)\s*:/.test(match[2]),'no glyph/candidate plates, glow filters or padded badges');
 const shadow=match[2].match(/(?:^|;)\s*text-shadow\s*:\s*([^;]+)/);
 assert(!shadow||shadow[1].trim()==='none','no blanket glowing numerals');
}
const clearanceRules=[...desktop.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(m=>/(?:^|;)\s*-webkit-text-stroke:/.test(m[2]));
assert.equal(clearanceRules.length,4,'original three scopes plus exactly one arrow-only main-value scope receive clearance');
const liveScope='.board-grid-shell:has(.variant-overlay [data-line-cells]) ',replayScope='.history-board-stage:has(.history-replay-overlay [data-line-cells]) ';
const expected=[
 {selectors:[liveScope+'.cell:not(.given) .value',replayScope+'.history-cell:not(.given) .history-value'],width:'.04em'},
 {selectors:[liveScope+'.cell .notes>span',replayScope+'.history-cell .history-notes>span'],width:'.12em'},
 {selectors:['body[data-line-contrast=strong] '+liveScope+'.cell.given .value','body[data-line-contrast=strong] '+replayScope+'.history-cell.given .history-value'],width:'.04em'},
 {selectors:['body[data-workspace=unified] .board-grid-shell:has(.variant-overlay [data-arrow-path]) .cell:is(.given,:not(.given)) .value','body[data-workspace=unified] .history-board-stage:has(.history-replay-overlay [data-arrow-path]) .history-cell:is(.given,:not(.given)) .history-value'],width:'var(--arrow-value-clearance,.08em)',surface:'var(--numeral-value-surface,var(--numeral-surface,var(--cell-bg)))'}
];
for(const [index,rule] of clearanceRules.entries()){
 const contract=expected[index];assert.deepEqual(rule[1].split(',\n').map(s=>s.trim()),contract.selectors,'clearance scope excludes ordinary givens and boards without line clues');
 assert(rule[2].includes('--ink-clearance:'+contract.width));
 assert(rule[2].includes('--ink-clearance-surface:'+(contract.surface||'var(--cell-bg)')));
 assert(rule[2].includes('-webkit-text-stroke:var(--ink-clearance) var(--ink-clearance-surface);paint-order:stroke fill;'),'text fill paints after a small font-relative clearance');
 assert(!/(?:^|;)\s*(?:color|-webkit-text-fill-color|font(?:-[\w-]+)?|visibility|opacity|position|inset|width|height)\s*:/.test(rule[2]),'clearance leaves ink state, privacy and typography unchanged');
}
assert(desktop.includes('@supports (-webkit-text-stroke:1px black) and (paint-order:stroke fill)'),'progressively enhance only with both stroke and paint order support');
const systemClearance=[...desktop.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(m=>m[2].trim()==='--ink-clearance-surface:Canvas');assert(systemClearance,'forced colors use system canvas');
assert.deepEqual(systemClearance[1].split(',').map(s=>s.trim()).sort(),expected.slice(0,3).flatMap(r=>r.selectors).sort(),'original system fallback changes only the original three scoped glyph rules');
assert(styles.includes('body[data-multi=true] .variant-overlay{display:none}'),'multi-grid remains on its own renderer');
const arrowForced=[...desktop.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(m=>m[2].trim()==='--ink-clearance:.08em;--ink-clearance-surface:Canvas');
assert(arrowForced,'arrow-only new clearance retains explicit system-color treatment');
assert.deepEqual(arrowForced[1].split(',\n').map(s=>s.trim()),expected[3].selectors,'arrow forced-color treatment uses the same arrow main-value scope');
assert(desktop.includes('.cell{transition:color .15s}'),'arrow flat surface and contour switch together, preserving ink transition');
const html=read('index.html');
assert(html.indexOf('./desktop-workspace.css')>html.indexOf('./history.css')&&html.indexOf('./desktop-workspace.css')>html.indexOf('./workspace.css'),'final rules load after live/replay base styles');
console.log('PASS glyph separation: '+paintCases+' actual live/replay paint cases, separate candidate spans, quiet clues, limited line-board clearance/no plates/glow, empty/fogged privacy and semantic state ink. Static CSS/DOM-facade checks only; no browser pixels or measured contrast.');
