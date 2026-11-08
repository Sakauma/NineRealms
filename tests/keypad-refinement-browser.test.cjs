'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {launch,fixture,delay}=require('./browser-helper.cjs');
const out=process.env.NINE_REALMS_KEYPAD_REFINEMENT_EVIDENCE||path.resolve(__dirname,'../evidence/keypad-refinement');fs.mkdirSync(out,{recursive:true});const KEY='nine-realms.sudoku.v1';
const report={viewports:[],states:[],screenshots:[],runtimeErrors:[],source:path.resolve(__dirname,'..'),scope:'Real browser regression of square frosted input keys using isolated synthetic sessions.'};
function snapshot(theme,zen,large=false){const s=fixture('keypad-material-audit');s.preferences={...s.preferences,theme,fx:true,intensity:'soft',zen,zenMotion:false,sound:false,textSize:large?'large':'normal'};return s;}
function measure(){
 const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}};
 const pad=document.getElementById('number-pad'),panel=document.querySelector('.control-panel');
 return{width:innerWidth,height:innerHeight,scrollY,documentHeight:document.documentElement.scrollHeight,overflow:document.documentElement.scrollWidth-innerWidth,desktop:document.body.dataset.desktop,zen:document.body.dataset.zen,theme:document.body.dataset.theme,large:document.body.dataset.textSize,coarse:matchMedia('(pointer:coarse)').matches,fineHover:matchMedia('(hover:hover) and (pointer:fine)').matches,reducedMotion:matchMedia('(prefers-reduced-motion:reduce)').matches,pad:rect(pad),panel:{rect:rect(panel),background:getComputedStyle(panel).background,backdrop:getComputedStyle(panel).backdropFilter},keys:[...pad.querySelectorAll('button')].map(e=>{const c=getComputedStyle(e),v=e.querySelector('.key-value'),s=getComputedStyle(v),r=rect(e),n=rect(v),remaining=e.querySelector('.remaining');return{digit:e.dataset.value,rect:r,valueRect:n,valueOffsetX:n.x+n.width/2-r.x-r.width/2,valueOffsetY:n.y+n.height/2-r.y-r.height/2,font:s.fontSize,weight:s.fontWeight,lineHeight:s.lineHeight,fontFamily:s.fontFamily,color:c.color,background:c.background,backgroundImage:c.backgroundImage,shadow:c.boxShadow,border:c.border,radius:c.borderRadius,blur:c.backdropFilter,transform:c.transform,transition:c.transition,active:e.matches(':active'),pressed:e.classList.contains('is-pressed'),focusVisible:e.matches(':focus-visible'),remaining:{display:getComputedStyle(remaining).display,visibility:getComputedStyle(remaining).visibility,rect:rect(remaining)},disabled:e.disabled}})};
}
function assertGeometry(m){
 assert(m.overflow<=0,'no horizontal overflow');assert.equal(m.keys.length,9);
 const widths=m.keys.map(k=>k.rect.width);assert(Math.max(...widths)-Math.min(...widths)<.04,'all nine keys equal within CSS pixel rounding');
 for(const k of m.keys){assert(Math.abs(k.rect.width-k.rect.height)<.04,'strict square key '+JSON.stringify(k.rect));assert(k.rect.width>=44&&k.rect.height>=44);assert(Math.abs(k.valueOffsetX)<.03&&Math.abs(k.valueOffsetY)<.03,'numeral centered');assert.equal(k.remaining.display,'none');assert.equal(k.backgroundImage,'none','matte key has no reflective gradient');assert.equal(k.transform,'none');if(m.large==='large')assert(parseFloat(k.font)>=(m.desktop==='on'?40:31),'large text applies');}
}
(async()=>{
 for(const mobile of [false,true]){
  const b=await launch({finePointer:!mobile}),ev=s=>b.evaluate(s);
  async function capture(name,crop=false){await delay(200);let params={format:'png',captureBeyondViewport:true};if(crop){const r=await ev(`(()=>{const r=document.getElementById('number-pad').getBoundingClientRect();return{x:Math.max(0,r.x-12),y:Math.max(0,r.y+scrollY-12),width:Math.min(innerWidth-Math.max(0,r.x-12),r.width+24),height:r.height+24,scale:1}})()`);params.clip=r;}const r=await b.send('Page.captureScreenshot',params),file=path.join(out,name+'.png');fs.writeFileSync(file,Buffer.from(r.data,'base64'));report.screenshots.push(file);}
  async function load(width,height,theme,zen,large=false){assert.deepEqual(b.events.filter(e=>e.method==='Runtime.exceptionThrown'),[]);await b.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});await b.send('Emulation.setTouchEmulationEnabled',{enabled:mobile,maxTouchPoints:1});await b.load(snapshot(theme,zen,large),'/dist/index.html');await ev('document.getElementById("resume-btn").click();scrollTo(0,0)');await b.waitFor('!document.getElementById("number-pad").querySelector("button").disabled');await delay(80);}
  try{
   for(const theme of ['nebula','ivory'])for(const zen of [false,true])for(const large of [false,true])for(const width of mobile?[320,390,480,768]:[980,1440]){
    await load(width,mobile?844:1000,theme,zen,large);let m=await ev('('+measure.toString()+')()');assertGeometry(m);report.viewports.push(m);fs.writeFileSync(path.join(out,"measurements.json"),JSON.stringify(report,null,2));
    if(width===(mobile?390:1440)&&!large){
     await capture((zen?'zen':'ordinary')+'-'+(mobile?'mobile':'desktop')+'-'+theme+'-full');await capture((zen?'zen':'ordinary')+'-'+(mobile?'mobile':'desktop')+'-'+theme+'-keypad',true);
    }
   }
   // Native pointer hold, focus and physical-digit keyboard cases in the real app.
   for(const zen of [false,true]){
    await load(mobile?390:1440,mobile?844:1000,'nebula',zen);await ev('document.getElementById("number-pad").scrollIntoView({block:"center"})');
    if(!mobile)await b.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
    const pos=await ev('(()=>{const r=document.querySelectorAll("#number-pad button")[4].getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()');
    const rest=await ev('('+measure.toString()+')()');
    if(mobile)await b.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:pos.x,y:pos.y,radiusX:8,radiusY:8}]});
    else {await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',...pos});await delay(200);report.states.push({device:'mouse',state:'hover',zen,metrics:await ev('('+measure.toString()+')()')});await b.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...pos});}
    await delay(220);const pressed=await ev('('+measure.toString()+')()');assert(pressed.keys[4].pressed,'pointer/touch immediately presses the actual key');assertGeometry(pressed);assert.deepEqual(pressed.keys.map(k=>k.rect),rest.keys.map(k=>k.rect),'press does not move or resize keys');report.states.push({device:mobile?'touch':'mouse',state:'rest',zen,metrics:rest},{device:mobile?'touch':'mouse',state:'held',zen,metrics:pressed});await capture((zen?'zen':'ordinary')+'-'+(mobile?'mobile':'desktop')+'-held',true);
    if(mobile)await b.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...pos});
    await b.waitFor('!document.querySelector("#number-pad .is-pressed")');await ev('document.querySelector("#board .cell[aria-selected=true]").focus()');await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:'2',code:'Digit2',windowsVirtualKeyCode:50});
    const keyboard=await ev('('+measure.toString()+')()');assert(keyboard.keys[1].pressed,'physical digit key has the same pressed state');assertGeometry(keyboard);report.states.push({device:'physical keyboard',state:'digit-held',zen,metrics:keyboard,saved:await ev(`(()=>{const g=JSON.parse(localStorage.getItem('${KEY}')).game;return{selected:g.selected,value:g.board[g.selected]}})()`)});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'2',code:'Digit2',windowsVirtualKeyCode:50});
    if(!mobile){await ev('document.querySelector("#number-pad button").focus()');await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab'});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab'});report.states.push({device:'keyboard focus',state:'tab',zen,metrics:await ev('('+measure.toString()+')()')});}
    await b.waitFor('!document.querySelector("#number-pad .is-pressed")');
    await ev('document.getElementById("number-pad").scrollIntoView({block:"center"})');const cancelPos=await ev('(()=>{const r=document.querySelectorAll("#number-pad button")[4].getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()');
    const oldBoard=await ev(`JSON.parse(localStorage.getItem('${KEY}')).game.board`);
    if(mobile){await b.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cancelPos.x,y:cancelPos.y,id:7}]});await b.waitFor('document.querySelectorAll("#number-pad button")[4].classList.contains("is-pressed")');await b.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});}
    else{await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',...cancelPos});await b.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...cancelPos});await b.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:0,y:0,buttons:1});await b.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,x:0,y:0});}
    await b.waitFor('!document.querySelector("#number-pad .is-pressed")');assert.deepEqual(await ev(`JSON.parse(localStorage.getItem('${KEY}')).game.board`),oldBoard,'cancelled pointer never enters a digit');
    await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:'2',code:'Digit2'});await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:'3',code:'Digit3'});assert(await ev('document.querySelectorAll("#number-pad .is-pressed").length===2'));await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'2',code:'Digit2'});await delay(120);assert(await ev('document.querySelectorAll("#number-pad .is-pressed").length===1'));await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'3',code:'Digit3'});
    await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:'2',code:'Digit2'});await ev('document.getElementById("rules-open").click()');assert(await ev('!document.querySelector("#number-pad .is-pressed")'));await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'2',code:'Digit2'});await ev('document.getElementById("rules-close").click()');
    await ev('document.getElementById("erase-btn").click();document.getElementById("notes-btn").click()');
    assert(await ev('Array.from(document.querySelectorAll("#number-pad button")).every(e=>e.getAttribute("aria-label").startsWith("切换候选 "))'),'note mode announces candidate actions');const ax=(await b.send('Accessibility.getFullAXTree')).nodes;assert(ax.some(n=>n.role?.value==='button'&&n.name?.value==='切换候选 3'),'real accessibility tree has the candidate action');
    await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:'3',code:'Digit3'});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'3',code:'Digit3'});
    assert(await ev(`(()=>{const g=JSON.parse(localStorage.getItem('${KEY}')).game;return g.board[g.selected]===0&&Boolean(g.notes[g.selected]&4)})()`),'candidate action retains actual note semantics');
    await ev('document.getElementById("notes-btn").click()');assert(await ev('Array.from(document.querySelectorAll("#number-pad button")).every(e=>e.getAttribute("aria-label").startsWith("填入 "))'));
    const current=(await b.send('Target.getTargetInfo')).targetInfo.targetId,other=(await b.send('Target.createTarget',{url:'about:blank'})).targetId;await b.send('Target.activateTarget',{targetId:other});await b.waitFor('document.hidden');await b.send('Target.closeTarget',{targetId:other});await b.send('Target.activateTarget',{targetId:current});await b.waitFor('!document.hidden');
    await delay(180);const paused=await ev('('+measure.toString()+')()');assert(paused.keys.every(k=>k.disabled&&!k.pressed));assert.notEqual(paused.keys[0].color,rest.keys[0].color,'disabled digits are discernible in normal and Zen');assert.equal(await ev(`JSON.parse(localStorage.getItem('${KEY}')).game.paused`),true);report.states.push({device:mobile?'touch layout':'desktop layout',state:'paused',zen,metrics:paused});
   }
   for(const zen of [false,true])for(const feature of ['prefers-reduced-motion','prefers-reduced-transparency','forced-colors']){
    await b.send('Emulation.setEmulatedMedia',{features:[{name:feature,value:feature==='forced-colors'?'active':'reduce'}]});await load(mobile?390:1440,mobile?844:1000,'nebula',zen);
    const before=await ev('('+measure.toString()+')()');assertGeometry(before);
    await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:'2',code:'Digit2'});
    const style=await ev(`(()=>{const e=document.querySelectorAll('#number-pad button')[1],s=getComputedStyle(e);return{pressed:e.classList.contains('is-pressed'),transition:s.transitionDuration,background:s.backgroundImage,shadow:s.boxShadow,blur:s.backdropFilter,color:s.color}})()`);assert(style.pressed);
    if(feature==='prefers-reduced-motion')assert.equal(style.transition,'0s');
    if(feature==='prefers-reduced-transparency')assert.equal(style.blur,'none');
    if(feature==='forced-colors'){assert.equal(style.background,'none');assert.equal(style.shadow,'none');}
    await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'2',code:'Digit2'});report.states.push({device:mobile?'touch layout':'desktop layout',state:feature,zen,style});
    await b.send('Emulation.setEmulatedMedia',{features:[]});
   }
   report.runtimeErrors.push(...b.events.filter(e=>e.method==='Runtime.exceptionThrown'));
  }finally{await b.close();}
 }
 fs.writeFileSync(path.join(out,'measurements.json'),JSON.stringify(report,null,2));assert.equal(report.runtimeErrors.length,0);console.log('PASS square glass keypad browser: '+JSON.stringify({viewports:report.viewports.length,states:report.states.length,screenshots:report.screenshots.length,runtimeErrors:report.runtimeErrors.length}));
})().catch(e=>{console.error(e);process.exitCode=1;});
