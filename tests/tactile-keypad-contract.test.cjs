/* CSS contracts and pure arithmetic, not a browser rendering/contrast pass. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {keypadMetrics}=require('./tactile-keypad-metrics.cjs');
require('./square-rail-geometry.test.cjs');
const css=fs.readFileSync(path.join(__dirname,'../src/desktop-workspace.css'),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
const scope='body[data-workspace=unified][data-desktop=on]';
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function rule(selector,source=css){
 const match=source.match(new RegExp('(?:^|[{}])\\s*'+escape(selector)+'\\s*\\{([^{}]*)\\}'));
 assert(match,'CSS rule exists: '+selector);return match[1];
}
function media(query){
 const chunks=[];let start=0;
 while((start=css.indexOf('@media('+query+')',start))!==-1){
  const open=css.indexOf('{',start);let i=open+1,depth=1;
  for(;i<css.length&&depth;i++)depth+=css[i]==='{'?1:css[i]==='}'?-1:0;
  assert.equal(depth,0,'balanced media rule');chunks.push(css.slice(open+1,i-1));start=i;
 }
 assert(chunks.length,'media rule exists: '+query);return chunks.join('\n');
}
const shared='body #number-pad',tokens=rule(scope),geometry=rule(scope+' .number-key'),key=rule(shared+' .number-key');
const hover=rule(shared+' .number-key:hover:not(:disabled)',media('hover:hover) and (pointer:fine'));
const pressed=rule(shared+' .number-key:active:not(:disabled)'),disabled=rule(shared+' .number-key:disabled');
assert.match(tokens,/--desktop-tools-width:clamp\(288px,24vw,320px\)/);
assert(!css.includes('--desktop-key-height'),'square keys have no viewport-height token');
assert.match(tokens,/--desktop-column:max\(320px,min\(620px,calc\(100vw - 88px - var\(--desktop-tools-width\)\)\)\)/);
assert.match(tokens,/--desktop-board:var\(--desktop-column\)/,'short windows and alerts cannot shrink the board');
assert(!/--desktop-(?:board|column):[^;]*(?:d?vh|alert-height)/.test(tokens),'board size is independent of height and alerts');
assert.match(rule(scope+' #play-controls'),/grid-template-columns:repeat\(5,minmax\(0,1fr\)\);gap:10px 6px/);
assert.match(rule(scope+' .number-pad'),/grid-template-rows:repeat\(3,auto\);gap:10px/);
assert.match(geometry,/height:auto;aspect-ratio:1\/1/);assert.match(geometry,/min-height:0/);assert.match(geometry,/box-sizing:border-box/);
assert.match(rule('.desktop-tools'),/align-self:stretch;min-height:var\(--desktop-board\)/);
assert.match(rule('.desktop-tools>*'),/flex-shrink:0/);
assert.match(rule(scope+' .desktop-tools>.board-bottomline'),/margin:(?:0;)?[^}]*auto|margin-top:auto/,'progress pushes the real footer down');
assert.match(key,/background:var\(--key-glass-face\)/);assert.match(key,/border:1px solid var\(--key-glass-rim\)/);
assert.match(key,/box-shadow:var\(--key-glass-rest-shadow\)/);
assert.match(key,/(?:^|;)backdrop-filter:var\(--key-glass-blur\)/);assert.match(key,/-webkit-backdrop-filter:var\(--key-glass-blur\)/);
assert.match(rule('body'),/--key-glass-blur:none/,'opaque fallback applies before support query');
assert.match(rule('body'),/--key-glass-face:linear-gradient\(155deg,var\(--panel-soft\),var\(--panel\)\)/);
assert(css.includes('@supports ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))) and (background:color-mix(in srgb,white 50%,transparent))'),'transparency requires both supported color mixing and backdrop filtering');
assert.match(css,/--key-glass-blur:blur\(18px\) saturate\(115%\)/);
assert.match(css,/--key-glass-face:[^;}]*color-mix\(in srgb,var\(--panel-soft\) 64%,transparent\)/);
assert.match(css,/--key-glass-face:[^;}]*color-mix\(in srgb,var\(--panel\) 68%,transparent\)/,'light theme receives its own readable translucent tint');
assert(!/--key-base|--key-rest-shadow:0 3px|box-shadow:0 [134]px 0 var\(--key/.test(css),'rejected extruded solid key base is gone');
assert.match(rule(scope+' .key-value'),/font-size:36px;font-weight:600/);
assert.match(rule(scope+'[data-text-size=large] .key-value'),/font-size:40px/);
const touchHover=rule(shared+' .number-key:hover:not(:disabled)');
assert.match(touchHover,/background:var\(--key-glass-face\)/);assert.match(touchHover,/box-shadow:var\(--key-glass-rest-shadow\)/);
assert.match(hover,/background:var\(--key-glass-hover\)/);assert.match(pressed,/background:var\(--key-glass-pressed\)/);
for(const state of [key,touchHover,hover,pressed,disabled])assert.match(state,/(?:^|;)transform:none(?:;|$)/,'glass never lifts or sinks');
assert.match(disabled,/opacity:1/);assert.match(disabled,/color:var\(--muted\)/);assert.match(disabled,/background:var\(--key-glass-disabled\)/);
assert(!/\.number-key:focus(?!-visible)/.test(css),'pointer focus must not acquire old highlighted key face');
assert.match(rule(shared+' .number-key:focus-visible:not(:disabled)'),/outline:2px solid var\(--accent\);outline-offset:4px/);
assert.match(rule(scope+' .remaining'),/display:none/);assert.match(rule(scope+' .remaining::before'),/content:none/);
assert.match(rule(scope+' .number-key.exhausted:not(:disabled)'),/opacity:1/);
assert.match(rule('body:is([data-fx=off],[data-motion=reduced]) #number-pad .number-key'),/transition:none/);
assert.match(media('prefers-reduced-motion:reduce'),/\.number-key\{transition:none\}/);
const transparency=media('prefers-reduced-transparency:reduce');
assert.match(transparency,/background:var\(--panel-soft\);backdrop-filter:none;-webkit-backdrop-filter:none/);
assert.match(transparency,/\.number-key:active:not\(:disabled\)\{background:var\(--selected\)\}/);
const forced=media('forced-colors:active');
assert.match(forced,/background:ButtonFace;color:ButtonText;border-color:ButtonText;box-shadow:none;backdrop-filter:none;-webkit-backdrop-filter:none;transform:none/);
assert.match(forced,/\.number-key:active:not\(:disabled\)\{background:Highlight;color:HighlightText(?:;border-color:Highlight)?\}/);
assert.match(forced,/\.number-key:disabled\{color:GrayText;border-color:GrayText;background:ButtonFace\}/);
assert(!css.includes('body #number-pad .remaining{'),'material edit does not change mobile/variant count-space');
assert(!css.includes('body #number-pad .number-key.exhausted'),'mobile/variant exhausted feedback is preserved');
assert(!/(?:^|;)(?:display|place-items|gap):/.test(key),'shared material never overwrites mobile/variant layout');
assert(!/draft[^{}]*\{[^{}]*--key-glass/.test(css),'main keypad material never targets draft controls');
const workspaceCss=fs.readFileSync(path.join(__dirname,'../src/workspace.css'),'utf8');
assert(!/\[data-workspace-tool=hint\][^{]*\.control-panel\{display:none/.test(workspaceCss),'direct result never replaces main controls');
assert(!/\[data-workspace-tool=hint\][^{]*\{[^}]*--board-size/.test(workspaceCss),'direct result never shrinks the board');
assert.match(rule('body #hint-panel'),/grid-template-columns:minmax\(0,1fr\) auto 44px/);
assert.match(rule('body #hint-panel #hint-close'),/width:44px;height:44px/);
assert.match(rule('body #hint-panel #hint-value'),/font-size:32px;font-weight:600/);
let cases=0;
const close=(a,b,message)=>assert(Math.abs(a-b)<1e-8,message);
for(const width of [...Array.from({length:159},(_,i)=>980+i*10),1200,1280,1333,1334,1920,2560,3840]){
 for(const height of [...Array.from({length:90},(_,i)=>560+i*10),650,720,800,801,900,977,978,1080,2160]){
  const m=keypadMetrics(width,height),actionWidth=(m.content-4*6)/5;
  assert(m.rail>=288&&m.rail<=320);assert(m.keyWidth>=83&&m.keyWidth<=94);close(m.keyHeight,m.keyWidth,'keys remain square at every width and height');
  assert(actionWidth>=44,'all five actions retain minimum 44px targets');
  assert(m.board>=604&&m.board<=620);assert(m.board+m.rail+24<=width-64,'bounded rail and board fit shell');
  close(5*actionWidth+4*6,m.content,'five actions exactly span the keypad content width');
  close(m.board,keypadMetrics(width,height+400).board,'short windows never shrink the board');
  for(const hand of ['left','right']){
   const shell=m.board+m.rail+24,left=(width-shell)/2;
   const boardX=hand==='left'?left+m.rail+24:left,railX=hand==='left'?left:left+m.board+24;
   const contentX=railX+(hand==='right'?19:0),keysRight=contentX+3*m.keyWidth+2*m.gap;
   close(hand==='left'?boardX-(railX+m.rail):railX-(boardX+m.board),24,'board gutter preserved');
   close(keysRight,railX+m.rail-(hand==='left'?19:0),'outer rail edge alignment');
  }
  cases++;
 }
}
console.log('PASS glass keypad static contracts and '+cases+' arithmetic viewport cases: square width-derived size, full-width action row, height-independent board, shared frosted material/states, opaque fallback and compact hint and accessibility media rules. No browser geometry, pixels, contrast, hit testing or native focus certified.');
