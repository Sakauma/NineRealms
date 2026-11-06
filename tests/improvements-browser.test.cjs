/* Real Chromium integration for save protection, optional examples and worker calibration. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {launch,fixture,delay}=require('./browser-helper.cjs');
const E=require('../src/engine.js'),H=require('../src/hints.js'),R=require('../src/save-recovery.js'),History=require('../src/history.js');
const KEY=R.key,ARCHIVE=R.archiveKey,out=path.resolve('evidence/improvements');fs.mkdirSync(out,{recursive:true});
function snapshot(mode='classic',preferences={}){
 const s=fixture('improvements-'+mode),p=E.getPuzzle('easy','improvements-'+mode,mode);
 s.preferences={...s.preferences,...preferences};s.game={...s.game,...p,puzzleId:p.id,sessionId:'improvements-'+mode,started:false,board:p.givens.slice(),notes:Array(p.givens.length).fill(0),selected:p.givens.indexOf(0)};
 delete s.game.id;delete s.game.rating;return s;
}
function ruleInkSpacing(){
 const gap=(a,b)=>Math.hypot(Math.max(a.left-b.right,b.left-a.right,0),Math.max(a.top-b.bottom,b.top-a.bottom,0));
 return [...document.querySelectorAll('#rule-examples-content svg')].map(svg=>{
  const scale=Math.hypot(svg.getScreenCTM().a,svg.getScreenCTM().b),digits=[...svg.querySelectorAll('text')],rects=digits.map(e=>e.getBoundingClientRect());
  const strokes=[...svg.querySelectorAll('path')].map(e=>{const r=e.getBoundingClientRect(),pad=parseFloat(getComputedStyle(e).strokeWidth)*scale/2;return {left:r.left-pad,right:r.right+pad,top:r.top-pad,bottom:r.bottom+pad};});
  const connectorLengths=[...svg.querySelectorAll('.rule-example-connector')].map(p=>(p.getTotalLength()+parseFloat(getComputedStyle(p).strokeWidth))*scale);
  const circle=svg.querySelector('circle'),head=svg.querySelector('.rule-example-arrowhead');let originGap=null,originLineGap=null;
  if(circle){const cx=circle.cx.baseVal.value,cy=circle.cy.baseVal.value,r=digits[0].getBBox(),inner=circle.r.baseVal.value-parseFloat(getComputedStyle(circle).strokeWidth)/2;
   const outline=circle.getBoundingClientRect(),outlinePad=parseFloat(getComputedStyle(circle).strokeWidth)*scale/2;
   originLineGap=strokes[0].left-outline.right-outlinePad;
   originGap=(inner-Math.max(...[r.x,r.x+r.width].flatMap(x=>[r.y,r.y+r.height].map(y=>Math.hypot(x-cx,y-cy)))))*scale;
  }
  // The diagram reserves a 9-unit digit radius, while system fonts have different glyph widths.
  const minGap=Math.min(...strokes.flatMap(s=>rects.map(r=>gap(s,r))));
  const fontOffset=(Math.max(...digits.slice(1).map(d=>d.getBBox().width))/2-9)*scale;
  return {strokeCount:strokes.length,connectorLengths,connectorLengthSpread:Math.max(...connectorLengths)-Math.min(...connectorLengths),minGap,originGap,originLineGap,fontOffset,circleSpacingMatchesDigits:originLineGap===null||Math.abs(originLineGap-minGap-fontOffset)<=scale,originHollow:!circle||getComputedStyle(circle).fill==='none',arrowBeyondDigits:!head||head.getBoundingClientRect().left>rects[rects.length-1].right};
 });
}
function rulePanelLayout(){
 const d=document.getElementById('rules-dialog'),c=document.getElementById('rule-examples-content'),r=d.getBoundingClientRect(),figures=[...c.querySelectorAll('figure')];
 const rect=e=>e.getBoundingClientRect(),title=document.getElementById('rules-title'),description=document.getElementById('rules-description'),summary=document.querySelector('#rule-examples>summary'),close=document.getElementById('rules-close'),cr=rect(close);
 const titleRange=document.createRange();titleRange.selectNodeContents(title);
 const rows=figures.map(f=>({box:rect(f),label:rect(f.querySelector('figcaption')),diagram:rect(f.querySelector('svg')),explanation:rect(f.querySelector('.rule-example-explanation'))}));
 return {count:figures.length,overflow:d.scrollWidth>d.clientWidth+1,pageOverflow:document.documentElement.scrollWidth>innerWidth+1,labels:figures.map(f=>f.querySelector('strong').textContent),
  bounded:rows.every(a=>a.box.left>=r.left&&a.box.right<=r.right+1&&a.box.height>0),summaryHeight:rect(summary).height,
  columns:getComputedStyle(c.querySelector('.rule-example-pair')).gridTemplateColumns.split(' ').length,
  leftAligned:Math.abs(rect(title).left-rect(description).left)<1&&Math.abs(rect(title).left-rect(summary).left)<1&&getComputedStyle(d).textAlign==='left',
  closeClear:titleRange.getBoundingClientRect().right<cr.left-4&&document.elementFromPoint(cr.x+cr.width/2,cr.y+cr.height/2)?.closest('#rules-close')===close,
  ordered:rows.every(a=>a.label.bottom+7<=a.diagram.top&&a.diagram.bottom+7<=a.explanation.top),
  captionAligned:rows.every(a=>Math.abs(a.label.left-a.explanation.left)<1),
  diagramWidthSpread:Math.max(...rows.map(a=>a.diagram.width))-Math.min(...rows.map(a=>a.diagram.width)),
  cardHeightSpread:Math.max(...rows.map(a=>a.box.height))-Math.min(...rows.map(a=>a.box.height)),
  sideBySideAligned:Math.abs(rows[0].diagram.top-rows[1].diagram.top)<1&&Math.abs(rows[0].explanation.top-rows[1].explanation.top)<1,
  footnoteInGuide:document.querySelector('.rules-footnote').closest('details')?.id==='technique-guide',
  footnoteCollapsed:!document.querySelector('.rules-footnote').checkVisibility()};
}
// Rotate the actual SVGs to check length and clearance in screen coordinates.
// The product examples stay horizontal; these transforms exist only in the test.
function ruleDirectionGeometry(){
 const records=[];
 for(const svg of document.querySelectorAll('#rule-examples-content svg')){
  const oldTransform=svg.style.transform;
  try{for(const angle of [0,45,90]){
   svg.style.transform='rotate('+angle+'deg)';
   const m=svg.getScreenCTM(),scale=Math.hypot(m.a,m.b),axis={x:m.a/scale,y:m.b/scale};
   const point=p=>new DOMPoint(p.x,p.y).matrixTransform(m),project=p=>p.x*axis.x+p.y*axis.y;
   const digits=[...svg.querySelectorAll('text')].map(e=>{const b=e.getBBox(),corners=[b.x,b.x+b.width].flatMap(x=>[b.y,b.y+b.height].map(y=>project(point({x,y}))));return {left:Math.min(...corners),right:Math.max(...corners)};});
   const lines=[...svg.querySelectorAll('.rule-example-connector')].map(p=>{
    const length=p.getTotalLength(),a=point(p.getPointAtLength(0)),b=point(p.getPointAtLength(length)),pad=parseFloat(getComputedStyle(p).strokeWidth)*scale/2;
    return {left:project(a)-pad,right:project(b)+pad,length:Math.hypot(b.x-a.x,b.y-a.y)+2*pad};
   });
   const circle=svg.querySelector('circle');let originLineGap=null;
   if(circle){const center=point({x:circle.cx.baseVal.value,y:circle.cy.baseVal.value}),outer=(circle.r.baseVal.value+parseFloat(getComputedStyle(circle).strokeWidth)/2)*scale;originLineGap=lines[0].left-project(center)-outer;}
   const digitGaps=[digits[1].left-lines[0].right,lines[1].left-digits[1].right,digits[2].left-lines[1].right];
   const offset=d=>(d.right-d.left)/2-9*scale;
   const fontOffsets=[offset(digits[1]),offset(digits[1]),offset(digits[2])];
   if(!circle){digitGaps.push(lines[0].left-digits[0].right);fontOffsets.push(offset(digits[0]));}
   if(lines.length===3){digitGaps.push(lines[2].left-digits[2].right);fontOffsets.push(offset(digits[2]));}
   records.push({angle,scale,lengths:lines.map(l=>l.length),digitGaps,fontOffsets,originLineGap});
  }}finally{svg.style.transform=oldTransform;}
 }
 return records;
}
(async()=>{
 const b=await launch(),report={recoveryCases:0,ruleLayouts:0,ruleSpacing:[],panelLayouts:[],directionChecks:[],workerTiers:[],fallback:false,cancellation:false,runtimeErrors:[]};
 const read=key=>b.evaluate('localStorage.getItem('+JSON.stringify(key)+')');
 const click=id=>b.evaluate('document.getElementById('+JSON.stringify(id)+').click()');
 const errors=()=>{const found=b.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.exception?.description||e.params.exceptionDetails.text);report.runtimeErrors.push(...found);assert.deepEqual(found,[]);};
 async function screenshot(name){const r=await b.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(r.data,'base64'));}
 try{
  await b.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  const previous=fixture('preserved-history'),store=History.createStore({Engine:E});store.capture(previous,{origin:'new'});
  const history=JSON.stringify(store.exportData()),voyage=JSON.stringify({dawn:{stars:3,elapsedMs:123,mistakes:0,hints:0}});
  for(const [index,raw] of ['', '{broken\n保留原文',JSON.stringify({version:8,game:{}}),JSON.stringify({version:99,unknown:'未来存档'})].entries()){
   await b.loadStorage({[KEY]:raw,'nine-realms.voyage.v1':voyage,'nine-realms.history.v1':history,unrelated:'keep'},index%2?'/dist/index.html':'/src/index.html');
   assert.equal(await b.evaluate('document.getElementById("save-recovery-dialog").open'),true);assert.equal(await read(KEY),raw);
   const retainedVoyage=await read('nine-realms.voyage.v1');assert.deepEqual(JSON.parse(retainedVoyage).dawn,JSON.parse(voyage).dawn);
   await b.evaluate('window.dispatchEvent(new Event("pagehide"));window.dispatchEvent(new Event("beforeunload"));');assert.equal(await read(KEY),raw);
   await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});
   assert.equal(await b.evaluate('document.getElementById("save-recovery-dialog").open'),true);
   await b.evaluate('URL.createObjectURL=blob=>{window.__exportBlob=blob;return "blob:test";};HTMLAnchorElement.prototype.click=function(){window.__downloadName=this.download;};');
   await click('save-recovery-export');await b.waitFor('Boolean(window.__exportBlob)');assert.equal(await b.evaluate('window.__exportBlob.text()'),raw);
   if(index===1){
    await screenshot('corrupt-save-mobile');
    await b.evaluate('window.__setItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='+JSON.stringify(ARCHIVE)+')throw new DOMException("空间不足","QuotaExceededError");return window.__setItem.call(this,key,value);};');
    await click('save-recovery-new');assert.equal(await read(KEY),raw);assert.equal(await b.evaluate('document.getElementById("save-recovery-dialog").open'),true);
    assert.match(await b.evaluate('document.getElementById("save-recovery-status").textContent'),/均未改变/);
    await b.evaluate('Storage.prototype.setItem=window.__setItem;');
   }
   await click('save-recovery-new');await b.waitFor('!document.getElementById("save-recovery-dialog").open');
   assert.equal(JSON.parse(await read(ARCHIVE)).entries[0].raw,raw);assert.equal(JSON.parse(await read(KEY)).version,8);
   assert.equal(await read('nine-realms.voyage.v1'),retainedVoyage);assert.equal(await read('unrelated'),'keep');
   assert(JSON.parse(await read('nine-realms.history.v1')).records.some(r=>r.sessionId===previous.game.sessionId));
   assert.equal(await b.evaluate('document.getElementById("save-recovery-open").hidden'),false);
   errors();report.recoveryCases++;
  }
  const retained=await b.evaluate('Object.fromEntries(Object.keys(localStorage).map(key=>[key,localStorage.getItem(key)]))');
  await b.loadStorage(retained,'/dist/index.html');assert.equal(await b.evaluate('document.getElementById("save-recovery-dialog").open'),false);
  await click('save-recovery-open');assert.equal(await b.evaluate('document.getElementById("save-recovery-new").hidden'),true);
  await b.evaluate('URL.createObjectURL=blob=>{window.__exportBlob=blob;return "blob:test";};HTMLAnchorElement.prototype.click=function(){};');
  await click('save-recovery-export');await b.waitFor('Boolean(window.__exportBlob)');assert.equal(await b.evaluate('window.__exportBlob.text()'),retained[ARCHIVE]);await click('save-recovery-close');
  await b.loadStorage({[KEY]:'invalid'});const retry=fixture('retry-preserves-progress');retry.game.hints=3;retry.game.elapsedMs=42100;
  await b.evaluate('localStorage.setItem('+JSON.stringify(KEY)+','+JSON.stringify(JSON.stringify(retry))+');');await click('save-recovery-retry');
  const restored=JSON.parse(await read(KEY));assert.equal(restored.game.hints,3);assert.equal(restored.game.elapsedMs,42100);assert.deepEqual(restored.game.board,retry.game.board);assert.equal(await b.evaluate('document.getElementById("save-recovery-dialog").open'),false);errors();report.recoveryCases++;
  const unavailable='future bytes';
  await b.loadStorage({[KEY]:unavailable,[ARCHIVE]:retained[ARCHIVE]},'/src/index.html','window.__getItem=Storage.prototype.getItem;Storage.prototype.getItem=function(key){if(key==='+JSON.stringify(KEY)+')throw new DOMException("读取被拒绝","SecurityError");return window.__getItem.call(this,key);};');
  assert.equal(await b.evaluate('document.getElementById("save-recovery-export").disabled'),true);await click('save-recovery-new');
  assert.equal(await b.evaluate('window.__getItem.call(localStorage,'+JSON.stringify(KEY)+')'),unavailable);assert.match(await b.evaluate('document.getElementById("save-status").textContent'),/不自动保存/);await click('start-btn');await b.evaluate('window.dispatchEvent(new Event("beforeunload"));');assert.equal(await b.evaluate('window.__getItem.call(localStorage,'+JSON.stringify(KEY)+')'),unavailable);
  await click('save-recovery-open');await b.evaluate('URL.createObjectURL=blob=>{window.__exportBlob=blob;return "blob:test";};HTMLAnchorElement.prototype.click=function(){};');await click('save-recovery-export-archive');await b.waitFor('Boolean(window.__exportBlob)');assert.equal(await b.evaluate('window.__exportBlob.text()'),retained[ARCHIVE]);await click('save-recovery-close');errors();report.recoveryCases++;
  // Missing data starts normally; supported schemas still restore and migrate.
  await b.loadStorage({});assert.equal(await b.evaluate('document.getElementById("save-recovery-dialog").open'),false);assert.equal(JSON.parse(await read(KEY)).version,8);
  for(const version of [1,8]){const s=fixture('legacy-'+version);s.version=version;await b.load(s);assert.deepEqual(JSON.parse(await read(KEY)).game.board,s.game.board);errors();}
  for(const mode of ['thermo','arrow','thermo-killer','renban','whispers','classic'])for(const [width,theme] of [[320,'nebula'],[390,'ivory'],[600,'nebula'],[601,'ivory'],[768,'nebula'],[1440,'ivory']])for(const textSize of ['normal','large']){
   await b.send('Emulation.setDeviceMetricsOverride',{width,height:width<500?844:1000,deviceScaleFactor:1,mobile:width<500});
   const s=snapshot(mode,{theme,textSize});await b.load(s,'/dist/index.html');const before=JSON.parse(await read(KEY));await click('rules-open');
   const visible=await b.evaluate('!document.getElementById("rule-examples").hidden');assert.equal(visible,mode!=='classic');
   if(visible){
    assert.equal(await b.evaluate('document.getElementById("rule-examples").open'),false);await b.evaluate('document.querySelector("#rule-examples>summary").click()');
    const layout=await b.evaluate('('+rulePanelLayout.toString()+')()');
    assert.equal(layout.count,2);assert.deepEqual(layout.labels,['✓ 正确','× 错误']);assert.equal(layout.overflow,false);assert.equal(layout.bounded,true);assert(layout.summaryHeight>=44);assert.equal(layout.pageOverflow,false);assert.equal(layout.columns,width<=600?1:2);assert(layout.leftAligned);assert(layout.closeClear,'close remains reachable: '+JSON.stringify({mode,width,textSize,...layout}));assert(layout.ordered);assert(layout.captionAligned);assert(layout.diagramWidthSpread<1);if(width>600){assert(layout.sideBySideAligned);assert(layout.cardHeightSpread<1);}assert(layout.footnoteInGuide);assert(layout.footnoteCollapsed);report.panelLayouts.push({mode,width,textSize,...layout});
    await b.evaluate('document.getElementById("technique-guide").open=true');
    const expanded=await b.evaluate('(()=>{const d=document.getElementById("rules-dialog"),f=document.querySelector(".rules-footnote");return {visible:f.checkVisibility(),overflow:d.scrollWidth>d.clientWidth+1};})()');
    assert(expanded.visible);assert.equal(expanded.overflow,false);
    await b.evaluate('document.getElementById("technique-guide").open=false');
    const spacing=await b.evaluate('('+ruleInkSpacing.toString()+')()');
    for(const result of spacing){assert(result.strokeCount>=2);assert.equal(result.connectorLengths.length,mode==='arrow'?3:2);assert(result.connectorLengthSpread<0.05,'all connector lengths include caps and match: '+JSON.stringify({mode,width,...result}));assert(result.minGap>=3,'rule ink clears every digit including stroke caps: '+JSON.stringify({mode,width,...result}));assert(result.originHollow);assert(result.originGap===null||result.originGap>=1,'origin outline clears the first digit: '+JSON.stringify({mode,width,...result}));assert(result.originLineGap===null||result.originLineGap>=3,'line cap clears the circle outline: '+JSON.stringify({mode,width,...result}));assert(result.circleSpacingMatchesDigits,'circle and digit clearances match: '+JSON.stringify({mode,width,...result}));assert(result.arrowBeyondDigits,'arrowhead stays outside the digit region');}
    report.ruleSpacing.push({mode,width,textSize,...{minGap:Math.min(...spacing.map(r=>r.minGap)),originGap:spacing[0].originGap,originLineGap:spacing[0].originLineGap,connectorLengths:spacing[0].connectorLengths,connectorLengthSpread:Math.max(...spacing.map(r=>r.connectorLengthSpread))}});
    const directions=await b.evaluate('('+ruleDirectionGeometry.toString()+')()');
    for(const r of directions){
     assert(Math.max(...r.lengths)-Math.min(...r.lengths)<0.05,'equal visible lengths at '+r.angle+' degrees');
     assert(r.digitGaps.every(g=>g>=3),'digit clearance after rotation');
     const normalizedGaps=r.digitGaps.map((gap,i)=>gap+r.fontOffsets[i]);
     assert(Math.max(...normalizedGaps)-Math.min(...normalizedGaps)<r.scale,'consistent digit clearance');
     assert(r.originLineGap===null||r.originLineGap>=3,'circle clearance after rotation');
     if(r.originLineGap!==null)assert(normalizedGaps.every(g=>Math.abs(g-r.originLineGap)<r.scale),'circle and digit gaps match after accounting for font metrics');
    }
    report.directionChecks.push({mode,width,textSize,angles:[0,45,90],diagrams:directions.length,maxLengthSpread:Math.max(...directions.map(r=>Math.max(...r.lengths)-Math.min(...r.lengths)))});
    if(mode==='arrow'&&width===1440||mode==='thermo'&&width===390)await screenshot(mode+'-'+width);
   }
   const after=JSON.parse(await read(KEY));for(const key of ['givens','solution','board','notes','hints','mistakes','elapsedMs'])assert.deepEqual(after.game[key],before.game[key]);
   const closePoint=await b.evaluate('(()=>{const r=document.getElementById("rules-close").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');
   for(const type of ['mousePressed','mouseReleased'])await b.send('Input.dispatchMouseEvent',{type,...closePoint,button:'left',clickCount:1});
   assert.equal(await b.evaluate('document.getElementById("rules-dialog").open'),false,'physical close click');errors();report.ruleLayouts++;
  }
  await b.load(snapshot('classic'),'/dist/index.html');
  for(const difficulty of ['easy','medium','hard']){
   await b.evaluate('window.NineRealmsGenerator.seed=()=>'+JSON.stringify('browser-calibration-'+difficulty)+';');
   if(difficulty==='easy')await click('new-game');else await b.evaluate('document.getElementById("difficulty").value='+JSON.stringify(difficulty)+';document.getElementById("difficulty").dispatchEvent(new Event("change",{bubbles:true}));');
   await b.waitFor('document.getElementById("new-game").getAttribute("aria-busy")!=="true"&&JSON.parse(localStorage.getItem('+JSON.stringify(KEY)+')).game.difficulty==='+JSON.stringify(difficulty));
   const g=JSON.parse(await read(KEY)).game;
   if(g.generation){assert.equal(g.generation.difficultyBasis,'supported-logic');assert.equal(require('../src/generator.js').ratingTier(H.rateClassic(g.givens,'classic',{timeLimitMs:1000})),difficulty);report.workerTiers.push(difficulty);}
   else assert.match(await b.evaluate('document.getElementById("status-message").textContent'),/未能.*技巧校准/);
   errors();
  }
  assert(report.workerTiers.includes('easy'));assert(report.workerTiers.length>=2,'real worker produces multiple calibrated tiers');
  await b.evaluate('window.Worker=class{postMessage(){setTimeout(()=>this.onmessage({data:{error:"CLASSIC_DIFFICULTY_NOT_REACHED"}}),0);}terminate(){}};');await click('new-game');
  await b.waitFor('document.getElementById("new-game").getAttribute("aria-busy")!=="true"');assert.match(await b.evaluate('document.getElementById("status-message").textContent'),/已使用题库原分档/);assert.equal(JSON.parse(await read(KEY)).game.generation,null);report.fallback=true;
  const beforeCancel=JSON.parse(await read(KEY)).game;
  await b.evaluate('window.Worker=class{postMessage(){}terminate(){}};');await click('new-game');await b.waitFor('document.getElementById("new-game").getAttribute("aria-busy")==="true"');await click('new-game');
  assert.deepEqual(JSON.parse(await read(KEY)).game,beforeCancel);assert.match(await b.evaluate('document.getElementById("status-message").textContent'),/已取消/);report.cancellation=true;errors();
  fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({...report,status:'passed'},null,2)+'\n');console.log('PASS improvements Chromium:',JSON.stringify(report));
 }finally{await b.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
