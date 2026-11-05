/* Static CSS contracts + arithmetic envelopes, never measured browser geometry. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Engine=require('../src/engine.js'),{keypadMetrics}=require('./tactile-keypad-metrics.cjs');
const read=name=>fs.readFileSync(path.join(__dirname,'../src',name),'utf8');
const css=read('desktop-workspace.css').replace(/\/\*[\s\S]*?\*\//g,''),html=read('index.html'),workspace=read('workspace.js'),app=read('app.js');
function rule(selector){const matches=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(m=>m[1].trim()===selector);assert(matches.length,'rule exists: '+selector);return matches[0][2];}
const full='body[data-workspace=unified][data-desktop=on]';
const panel=rule('body #hint-panel'),desktop=rule(full+' #play-controls>#hint-panel');
assert.match(panel,/display:grid;box-sizing:border-box/);assert.match(panel,/grid-template-columns:minmax\(0,1fr\) auto 44px/);
assert.match(panel,/grid-template-rows:1fr auto/);assert.match(panel,/column-gap:8px;row-gap:0/);
assert.match(panel,/width:100%;max-width:100%;min-width:0;min-height:44px/);assert.match(panel,/padding:0 0 0 10px;border:0/);
assert(!/(?:^|;)(?:height|max-height|overflow|position|top|left|bottom|transform):/.test(panel),'mobile hint stays in ordinary flow without clipping or viewport offsets');
assert.match(desktop,/grid-column:1\/-1;grid-row:4;align-self:end;height:44px;min-height:44px/);
assert.match(rule(full+' #play-controls>.new-game-btn'),/grid-column:1\/-1;grid-row:4;[^}]*height:44px;min-height:44px/);
assert.equal(rule(full+'[data-workspace-tool=hint] #play-controls>#new-game'),'display:none');
assert.match(rule('body #hint-panel #hint-close'),/width:44px;height:44px;min-height:44px/);
assert.match(rule('body #hint-panel #hint-title'),/min-width:0;.*font-size:13px;.*line-height:20px/);
assert.match(rule('body #hint-panel #hint-text'),/padding-left:18px;font-size:12px;line-height:18px/);
assert.match(rule('body #hint-panel #hint-title'),/padding-left:18px/);
assert.match(rule('body #hint-panel .hint-symbol'),/grid-column:1;grid-row:1;justify-self:start;width:14px;height:14px;color:var\(--accent\);pointer-events:none/);
assert.equal(rule('body #hint-panel #hint-text:empty'),'display:none');
assert.match(rule('body #hint-panel #hint-value'),/font-size:32px;font-weight:600;line-height:1/);
for(const [id,size] of [['title',15],['text',14],['value',34]])assert.equal(rule('body[data-text-size=large] #hint-panel #hint-'+id),'font-size:'+size+'px');
assert(!workspace.includes('desktop-help')&&!css.includes('desktop-help'),'no separate after-rail hint region');
assert(!app.includes('答案仅显示在这里，由你决定何时填入。'));assert(!app.includes('已显示选中格的答案，棋盘与笔记保持不变。'));
assert(html.includes('aria-keyshortcuts="Escape"'),'dismissal shortcut is declared');
const modes=Engine.getModes();assert.equal(modes.length,33);
let cases=0,labels=0,maxChars=0;
for(const {id:mode} of modes){
 const puzzle=Engine.getPuzzle('easy','bounded-hint-'+mode,mode),layout=Engine.getLayout(puzzle);
 const compactLabels=layout.cells.map((_,i)=>{const first=Engine.getCellLabel(i,puzzle).split(' / ')[0].replace(/（重叠格）/g,'');return '提示 · '+(/^第/.test(first)?first.replace(/\s+/g,''):first.replace(/第\s*(\d+)\s*行第\s*(\d+)\s*列/g,'$1行$2列'));});
 const characters=Math.max(...compactLabels.map(t=>[...t].length));maxChars=Math.max(maxChars,characters);labels+=compactLabels.length;
 for(const multiView of layout.cellCount>81?['overview','detail']:['overview'])for(const width of [320,360,390,760,979,980,981,1000,1280,1440,1920,3840])for(const height of [559,560,720,1080])for(const hand of ['left','right'])for(const large of [false,true])for(const warning of [false,true]){
  const wide=width>=980&&height>=560,m=keypadMetrics(width,height,{multi:layout.cellCount>81,multiView});
  const panelWidth=wide?m.content:Math.min(600,width-24),labelWidth=panelWidth-10-44-28-16-18;
  // Mixed-script envelope: CJK one em, ASCII digits .6em, space/middle dot .5em.
  // Real fallback-font shaping still requires native rendering; this is explicitly modeled.
  const maxEm=Math.max(...compactLabels.map(t=>[...t].reduce((sum,c)=>sum+(/[0-9]/.test(c)?.6:/[ ·]/.test(c)?.5:1),0)));
  assert(maxEm*(large?15:13)<=labelWidth,'all actual identified hint labels fit the stated mixed-script envelope');
  if(warning)assert('另有已填错误'.length*(large?14:12)<=labelWidth,'meaningful warning fits in same label column');
  const expectedHeight=Math.max(44,large?34:32,20+(warning?18:0));assert.equal(expectedHeight,44);
  if(wide){
   const shell=m.board+m.rail+24,shellLeft=(width-shell)/2,railLeft=hand==='left'?shellLeft:shellLeft+m.board+24;
   const hintLeft=railLeft+(hand==='right'?19:0),hintRight=hintLeft+panelWidth;
   assert(hintLeft>=railLeft&&hintRight<=railLeft+m.rail,'hint is within rail for either hand');
   const beforeRows=[44,20,3*m.keyHeight+20,44],afterRows=[...beforeRows.slice(0,-1),expectedHeight];
   assert.deepEqual(afterRows,beforeRows,'open/close substitutes a row without moving keys or stretching the rail');
  }
  cases++;
 }
}
assert.equal(maxChars,12,'longest identified multi-grid hint label is explicitly covered');
console.log('PASS bounded hint layout: '+cases+' mode/view/viewport/hand/large-text/warning arithmetic envelopes and '+labels+' actual identified coordinate labels; same44px final action row, no detached hint or redundant success prose. CSS/math only, not native geometry or typography.');
