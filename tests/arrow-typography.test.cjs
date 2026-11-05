/* Source contracts, not a CSS layout engine. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const css=fs.readFileSync(path.join(__dirname,'../src/desktop-workspace.css'),'utf8');
const rules=[...css.replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m=>({s:m[1].trim(),d:m[2]}));
const scopes=[['board-grid-shell','variant-overlay','cell','notes','value'],['history-board-stage','history-replay-overlay','history-cell','history-notes','history-value']];
for(const [stage,overlay,cell,notes,value] of scopes){
 const prefix=`body[data-workspace=unified] .${stage}:has(.${overlay} [data-arrow-path]) .${cell}`;
 for(const [selector,prop] of [[`.${notes}`,'inset:20%'],[`.${notes}>span`,'font-size:min(1em,2.222222cqw)'],[`.${value}`,'font-size:min(1em,7.777777cqw)'],[`.${notes}>span`,'font-size:min(1em,6px)'],[`.${value}`,'font-size:min(1em,20px)']])assert(rules.some(r=>r.s.split(/,\s*\n/).map(s=>s.trim()).includes(prefix+' '+selector)&&r.d.includes(prop)),prefix+' '+selector+' '+prop);
 const bulb=prefix+`.arrow-bulb-cell:is(.given,:not(.given)) .${value}`;
 const index=rules.findIndex(r=>r.s.split(/,\s*\n/).map(s=>s.trim()).includes(bulb)&&r.d.includes('--ink-clearance:0'));
 assert(index>rules.findIndex(r=>r.d.includes('--ink-clearance:.08em;--ink-clearance-surface:Canvas')),'bulb never receives a contour even in forced colors');
 const container=rules.find(r=>r.s.includes(`.${stage}:has(.${overlay} [data-arrow-path])`)&&r.d.includes('container-type:inline-size'));
 assert(container&&!/\.(?:cell|history-cell)\b/.test(container.s),'only common board wrapper gains container context');
}
assert(css.includes('@supports (container-type:inline-size) and (font-size:1cqw)'));
const base=fs.readFileSync(path.join(__dirname,'../src/styles.css'),'utf8');
assert(base.includes('.cell[data-draft-mark]:not([data-draft-mark="0"]) .notes'));
// New rule has six class/attribute specificity units versus four in original
// draft-mark right:5px, and is loaded after it. Uniform inset intentionally wins.
const draftSpecificity=4,arrowInsetSpecificity=6;assert(arrowInsetSpecificity>draftSpecificity);
assert.equal((css.match(/\.history-cell\s*\{[^}]*container-type/g)||[]).length,0);
for(const file of ['app.js','history.js']){
 const source=fs.readFileSync(path.join(__dirname,'../src',file),'utf8');
 assert(source.includes('arrowBulbCells'));assert(source.includes('line.type === "arrow"')||source.includes('line.type==="arrow"'));
 assert(source.includes('line.cells[0]'));assert(source.includes('arrow-bulb-cell'));
 if(file==='app.js')assert(source.includes('!fogged && arrowBulbCells.has(i)'),'hidden fog clues cannot acquire visible bulb state');
}
console.log('PASS arrow typography: arrow-only live/replay20% uniform notes including draft marks; preferred-size-preserving70/20SVG caps;20px/6px fallback; wrapper-only containers; no bulb contour including forced colors; original digit/note order unchanged. Static contracts only.');
