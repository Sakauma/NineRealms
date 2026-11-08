/* Static declarations and arithmetic, not browser geometry or native targets. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const css=read('src/zen.css').replace(/\/\*[\s\S]*?\*\//g,''),html=read('src/index.html');
const scope='body[data-workspace=unified][data-zen=on]';
for(const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
 if(rule[1].trim().startsWith('@')) continue;
 assert(rule[1].includes(scope),'all Zen CSS is scoped away from normal play');
}
assert(html.indexOf('./zen.css')>html.indexOf('./desktop-workspace.css'),'Zen overrides load last');
assert(read('scripts/build.py').includes('"zen.css"'),'offline bundle includes the same styles');
assert(css.includes(scope+' #number-pad .number-key{'),'Zen key geometry uses the shared ID-level selector');
const keyRule=css.split(scope+' #number-pad .number-key{')[1].split('}')[0];
assert(/aspect-ratio:1\/1/.test(keyRule),'Zen digits are square');
assert(!/(?:background|box-shadow|backdrop-filter)\s*:/.test(keyRule),'Zen inherits original theme-linked frosted key material');
const shared=read('src/desktop-workspace.css');
for(const token of ['--key-glass-face','--key-glass-hover','--key-glass-pressed','--key-glass-disabled']) assert(shared.includes(token),'retained glass state '+token);
assert(css.includes('display:none!important'),'hidden feature entrances stay absent at every breakpoint');
for(const selector of ['#hint-btn','#hint-panel','#redo-btn','#new-game','#puzzle-settings','#appearance-settings','.stats','.scene-drawer','#draft-overlay']) assert(css.includes(selector));
assert(!/--board-dimension\s*:/.test(css),'never replace native 9/15/21 geometry');
assert(!/\.board-card\{[^}]*padding\s*:/.test(css),'never erase outside-clue or multigrid padding');
assert(css.includes('#multigrid-tools label'),'linked-board chooser remains');
assert(css.includes('#notes-btn[aria-pressed=true]'),'manual note mode has visible state');
assert(css.includes(':focus-visible'),'keyboard focus stays visible');
assert(css.includes('[data-text-size=large] #number-pad .key-value{font-size:31px}'),'large text retains enlarged keypad digits');
assert(css.includes('@media(forced-colors:active)'),'forced-color fallback');
let cases=0;
for(let width=320;width<=3840;width++){
 const dock=Math.min(560,width-32),columns=width<=479?5:9,gap=columns===5?8:6;
 const key=(dock-(columns-1)*gap)/columns;
 assert(key>=44,'44px target in supported viewport '+width);
 assert(columns*key+(columns-1)*gap<=dock+.001,'keys stay inside dock');
 const lastRow=columns===5?4:9;
 assert(lastRow*key+(lastRow-1)*gap<=dock+.001,'centered last row fits');
 cases++;
}
console.log('PASS pure Zen CSS contracts and '+cases+' viewport arithmetic cases: isolated styles, inherited frosted key states, unchanged native clue gutters, responsive 44px targets and necessary navigation. Not browser rendering.');
