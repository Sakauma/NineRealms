/* Optional DOM simulation only: cached jsdom@26.1.0; not visual/browser QA. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM,VirtualConsole}=require('../.build-cache/dom-test/node_modules/jsdom');
const source=fs.readFileSync('src/glass-select.js','utf8');
const tick=()=>new Promise(r=>setTimeout(r,0));
const select=(id,label)=>`<label for="${id}">${label}</label><select id="${id}"><option value="a">Alpha</option><option value="b">Beta</option><option value="c" disabled>Closed</option><option value="d">Delta</option></select>`;
async function fixture(popover){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(`<body><details id="appearance" open><summary>Appearance</summary>${select('scene-intensity','视觉强度')}</details>${select('difficulty','难度')}${select('grid-view','查看棋盘')}${select('draft-link-type','关系')}<dialog id="personal" open>${select('personal-mode','玩法')}${select('personal-filter','状态')}</dialog><button id="outside">Outside</button></body>`,{runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
 const w=dom.window,d=w.document,$=id=>d.getElementById(id);
 w.HTMLElement.prototype.scrollIntoView=function(){};
 if(popover){w.HTMLElement.prototype.showPopover=function(){this.dataset.open='true';};w.HTMLElement.prototype.hidePopover=function(){delete this.dataset.open;};const matches=w.Element.prototype.matches;w.Element.prototype.matches=function(s){return s===':popover-open'?this.dataset.open==='true':matches.call(this,s);};}
 w.eval(source);w.NineRealmsSelect.syncAll();await tick();
 const trigger=id=>d.querySelector(`[data-select-id="${id}"] .glass-select-trigger`),panel=id=>$(trigger(id).getAttribute('aria-controls'));
 const key=(id,k)=>trigger(id).dispatchEvent(new w.KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true}));
 assert.equal(d.querySelectorAll('.glass-select-trigger').length,6);
 const history=d.createElement('dialog');history.id='history';history.open=true;history.innerHTML=select('history-filter','筛选历史棋局');d.body.appendChild(history);await tick();await tick();
 assert.equal(d.querySelectorAll('.glass-select-trigger').length,7,'dynamic history enhanced');
 for(const id of ['scene-intensity','difficulty','grid-view','personal-mode','personal-filter','history-filter','draft-link-type']){
  const b=trigger(id);assert(b);assert.equal(b.getAttribute('role'),'combobox');assert.equal(panel(id).getAttribute('role'),'listbox');assert.equal($(id).getAttribute('aria-hidden'),'true');assert.equal($(id).tabIndex,-1);assert.match(b.getAttribute('aria-label'),/Alpha/);$(id).focus();assert.equal(d.activeElement,b);
 }
 assert.equal(panel('scene-intensity').closest('details'),$('appearance'));
 assert.equal(panel('personal-mode').closest('dialog'),$('personal'));
 assert.equal(panel('history-filter').closest('dialog'),history);
 let bubbled=0,changes=0,inputs=0;d.addEventListener('keydown',()=>bubbled++);$('difficulty').addEventListener('change',()=>changes++);$('difficulty').addEventListener('input',()=>inputs++);
 trigger('difficulty').click();assert.equal(trigger('difficulty').getAttribute('aria-expanded'),'true');assert.equal(panel('difficulty').querySelector('[aria-selected="true"]').textContent,'Alpha');
 key('difficulty','ArrowDown');key('difficulty','ArrowDown');assert.match(trigger('difficulty').getAttribute('aria-activedescendant'),/-option-3$/,'skip disabled');key('difficulty','Enter');assert.equal($('difficulty').value,'d');assert.equal(changes,1);assert.equal(inputs,1);assert.equal(trigger('difficulty').textContent,'Delta');assert.equal(bubbled,0);
 trigger('difficulty').click();key('difficulty','Home');key('difficulty','Escape');assert.equal($('difficulty').value,'d','Escape does not commit highlight');assert.equal(trigger('difficulty').getAttribute('aria-expanded'),'false');assert.equal(d.activeElement,trigger('difficulty'));
 for(const k of ['1','n','Backspace','ArrowUp','End','Tab'])key('difficulty',k);assert.equal(bubbled,0,'game shortcuts isolated');assert.equal(trigger('difficulty').getAttribute('aria-expanded'),'false');
 trigger('difficulty').click();$('outside').dispatchEvent(new w.Event('pointerdown',{bubbles:true}));assert.equal(trigger('difficulty').getAttribute('aria-expanded'),'false');
 trigger('difficulty').click();trigger('scene-intensity').click();assert.equal(trigger('difficulty').getAttribute('aria-expanded'),'false');assert.equal(trigger('scene-intensity').getAttribute('aria-expanded'),'true');key('scene-intensity','Escape');assert($('appearance').open,'first Escape preserves appearance');
 $('difficulty').value='b';w.NineRealmsSelect.syncAll();assert.equal(trigger('difficulty').textContent,'Beta');
 $('difficulty').replaceChildren(new w.Option('New one','new'),new w.Option('New two','two'));await tick();assert.equal(trigger('difficulty').textContent,'New one');trigger('difficulty').click();assert.equal(panel('difficulty').children.length,2);
 $('difficulty').disabled=true;await tick();assert(trigger('difficulty').disabled);assert.equal(trigger('difficulty').getAttribute('aria-expanded'),'false');$('difficulty').disabled=false;$('difficulty').hidden=true;await tick();assert(trigger('difficulty').parentElement.hidden);$('difficulty').hidden=false;await tick();
 trigger('personal-mode').click();$('personal').dispatchEvent(new w.Event('close'));assert.equal(trigger('personal-mode').getAttribute('aria-expanded'),'false');
 trigger('history-filter').click();w.dispatchEvent(new w.Event('resize'));assert.equal(trigger('history-filter').getAttribute('aria-expanded'),'false');
 assert.deepEqual(errors,[]);dom.window.close();
}
async function fullApp(){
 const Engine=require('../src/engine.js'),puzzle=Engine.getPuzzle('easy','glass-app','twin');
 const initial={version:8,preferences:{theme:'nebula',fx:false,intensity:'soft'},game:{sessionId:'glass-session',createdAt:1,puzzleId:puzzle.id,sourceId:puzzle.sourceId,mode:'twin',difficulty:'easy',clues:puzzle.clues,givens:puzzle.givens,solution:puzzle.solution,board:puzzle.givens.slice(),notes:puzzle.givens.map(()=>0),selected:0,mistakes:0,hints:0,elapsedMs:0,started:false,paused:false,completed:false,history:[],branch:null}};
 const html=fs.readFileSync('src/index.html','utf8').replace(/<script src="\.\/([^"]+)"><\/script>/g,(_,name)=>'<script>'+fs.readFileSync('src/'+name,'utf8')+'</script>').replace(/<link[^>]*href="\.\/[^"]+"[^>]*>/g,'');
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(html,{url:'https://ninerealms.test/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  w.localStorage.setItem('nine-realms.sudoku.v1',JSON.stringify(initial));w.matchMedia=()=>({matches:true,addEventListener(){},addListener(){}});w.requestAnimationFrame=()=>0;w.cancelAnimationFrame=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;
  w.HTMLCanvasElement.prototype.getContext=function(type){if(type!=='2d')return null;return new Proxy({canvas:this},{get:(o,k)=>k in o?o[k]:k==='createLinearGradient'||k==='createRadialGradient'?()=>({addColorStop(){}}):()=>{}})};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 }});
 const w=dom.window,d=w.document,$=id=>d.getElementById(id),trigger=id=>d.querySelector(`[data-select-id="${id}"] .glass-select-trigger`),panel=id=>$(trigger(id).getAttribute('aria-controls'));
 await new Promise(r=>setTimeout(r,30));assert.deepEqual(errors,[]);assert.equal(d.querySelectorAll('.glass-select-trigger').length,d.querySelectorAll('select').length);assert([...d.querySelectorAll('select')].every(select=>select.dataset.glassEnhanced==='true'));
 assert.equal(trigger('scene-intensity').textContent,'轻柔 · 安静背景');assert.equal(trigger('difficulty').textContent,$('difficulty').selectedOptions[0].textContent);
 $('appearance-settings').open=true;trigger('scene-intensity').click();panel('scene-intensity').querySelector('[data-index="1"]').click();assert.equal(d.body.dataset.intensity,'balanced');assert($('appearance-settings').open);assert.equal(trigger('scene-intensity').textContent,'标准 · 均衡层次');
 trigger('scene-intensity').click();trigger('scene-intensity').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert($('appearance-settings').open);$('appearance-settings').open=false;
 assert(!$('multigrid-tools').hidden);trigger('grid-view').click();panel('grid-view').querySelector('[data-index="1"]').click();assert.notEqual($('grid-view').value,'all');assert.equal(trigger('grid-view').textContent,$('grid-view').selectedOptions[0].textContent);
 $('start-btn').click();const editable=puzzle.givens.findIndex(v=>!v);d.querySelectorAll('.cell')[editable].click();$('notes-btn').click();d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'2',bubbles:true}));
 const beforeCancel=JSON.parse(w.localStorage.getItem('nine-realms.sudoku.v1')).game;
 trigger('difficulty').focus();for(const key of ['3','ArrowRight','n','Backspace'])trigger('difficulty').dispatchEvent(new w.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));w.NineRealmsSelect.close();const afterKeys=JSON.parse(w.localStorage.getItem('nine-realms.sudoku.v1')).game;assert.deepEqual(afterKeys.board,beforeCancel.board);assert.deepEqual(afterKeys.notes,beforeCancel.notes);assert.equal(afterKeys.selected,beforeCancel.selected);
 trigger('difficulty').click();panel('difficulty').querySelector('[data-index="1"]').click();assert($('confirm-dialog').open);$('confirm-cancel').click();await tick();assert.equal($('difficulty').value,'easy');assert.equal(trigger('difficulty').textContent,$('difficulty').selectedOptions[0].textContent);const afterCancel=JSON.parse(w.localStorage.getItem('nine-realms.sudoku.v1')).game;assert.equal(afterCancel.sessionId,beforeCancel.sessionId);assert.deepEqual(afterCancel.notes,beforeCancel.notes);
 $('personal-open').click();trigger('personal-filter').click();panel('personal-filter').querySelector('[data-index="3"]').click();assert.equal($('personal-filter').value,'completed');$('favorite-current').click();assert.equal($('personal-list').querySelectorAll('article').length,0);assert.equal(d.activeElement,trigger('personal-filter'),'hidden new favorite falls back to visible filter');$('personal-close').click();
 w.NineRealmsHistory.open();trigger('history-filter').click();panel('history-filter').querySelector('[data-index="2"]').click();assert.equal($('history-filter').value,'completed');w.NineRealmsHistory.close();w.NineRealmsHistory.open('glass-session');assert.equal($('history-filter').value,'all');assert.equal(trigger('history-filter').textContent,'全部棋局');
 assert.deepEqual(errors,[]);dom.window.close();
}
(async()=>{await fixture(false);await fixture(true);await fullApp();console.log('PASS glass selects: every current control including draft relations + dynamic history, state/events/options/disabled, keyboard isolation, dismissals, owner ancestry, labels/focus, fallback + mocked popover, and full-app twin/settings/favorites/history integration. DOM simulation, not visual verification.');})().catch(e=>{console.error(e);process.exitCode=1;});
