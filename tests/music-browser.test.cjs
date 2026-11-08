/* Native Web Audio loops, actual UI lifecycle and retained preference compatibility. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {launch,fixture,delay}=require('./browser-helper.cjs');
const V=require('../src/voyage.js');
const KEY='nine-realms.sudoku.v1',VK='nine-realms.voyage.v1';
const out=process.env.NINE_REALMS_BGM_EVIDENCE;
const instrumentation=`window.__audioContexts=[];window.__musicSources=[];window.__audioGains=[];
window.AudioContext=new Proxy(window.AudioContext,{construct(Target,args){const ctx=Reflect.construct(Target,args);__audioContexts.push(ctx);
 const make=ctx.createBufferSource.bind(ctx);ctx.createBufferSource=function(){const s=make(),connect=s.connect.bind(s),disconnect=s.disconnect.bind(s);s.__connected=false;s.connect=(...a)=>{s.__connected=true;return connect(...a);};s.disconnect=(...a)=>{s.__connected=false;return disconnect(...a);};__musicSources.push(s);return s;};
 const gain=ctx.createGain.bind(ctx);ctx.createGain=function(){const g=gain();__audioGains.push(g);return g;};return ctx;}});`;
function snapshot(id,prefs={}){
 const s=fixture('bgm-integration');s.preferences={...s.preferences,theme:'nebula',...prefs};s.game.started=false;s.game.errorCheckIncomplete=false;
 if(id){const p=V.getPuzzle(id);Object.assign(s.game,{puzzleId:p.id,sourceId:p.sourceId,mode:p.mode,difficulty:p.difficulty,clues:p.clues,givens:p.givens,solution:p.solution,board:p.givens.slice(),notes:Array(81).fill(0),selected:p.givens.findIndex(v=>!v),voyageId:id});}
 return s;
}
function progress(count){let p={__journey:{version:1,granted:[]}};for(const c of V.chapters().slice(0,count))p=V.award(p,c.id,{elapsedMs:600000,mistakes:0,hints:0});return p;}
(async()=>{
 const b=await launch({finePointer:true}),report={loops:{},flows:[],layouts:[],screenshots:[]};
 const ev=s=>b.evaluate(s),click=id=>ev(`document.getElementById(${JSON.stringify(id)}).click()`),status=()=>ev('NineRealmsAtmosphere.musicStatus()');
 const read=()=>ev(`JSON.parse(localStorage.getItem('${KEY}'))`);
 async function load(id=null,prefs={},completed=0,route='/src/index.html',started=false){const s=snapshot(id,prefs);s.game.started=started;await b.loadStorage({[KEY]:JSON.stringify(s),[VK]:JSON.stringify(progress(completed))},route,instrumentation);}
 async function playing(phase){await b.waitFor(`NineRealmsAtmosphere.musicStatus().playing && NineRealmsAtmosphere.musicStatus().phase===${JSON.stringify(phase)}`);assert((await status()).sources<=2);}
 async function stopped(){await b.waitFor('!NineRealmsAtmosphere.musicStatus().playing');assert.equal((await status()).sources,0);assert(await ev('__musicSources.every(s=>!s.__connected)'));}
 async function volume(id,value){await ev(`document.getElementById('${id}').value='${value}';document.getElementById('${id}').dispatchEvent(new Event('input',{bubbles:true}))`);}
 async function shot(name){if(!out)return;await delay(400);const r=await b.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});const file=path.join(out,name+'.png');fs.writeFileSync(file,Buffer.from(r.data,'base64'));report.screenshots.push(file);}
 function noErrors(){assert.deepEqual(b.events.filter(e=>e.method==='Runtime.exceptionThrown'),[]);}
 try{
  if(out)fs.mkdirSync(out,{recursive:true});
  await load();assert.equal(await ev('__audioContexts.length'),0);assert.equal((await read()).preferences.musicEnabled,false);assert.equal((await read()).preferences.musicVolume,0.35);
  await click('voyage-btn');await stopped();assert.equal(await ev('__audioContexts.length'),0);await click('voyage-close');
  await click('sound-toggle');await click('music-toggle');await stopped();await click('voyage-btn');await playing('coordinates');
  assert.equal((await read()).preferences.sound,true);assert.equal((await read()).preferences.musicEnabled,true);
  await ev(`document.querySelector('[data-world-id="fusion-homecoming-v1"]').closest('details').open=true;document.querySelector('[data-world-id="fusion-homecoming-v1"]').click()`);await playing('coordinates');
  assert(await ev('document.getElementById("voyage-start").disabled'));report.flows.push('old preferences default music off; master opt-in; prepared board silent; locked destination does not reveal a music phase');
  await ev(`document.querySelector('[data-music-preview="home"]').closest('details').open=true;document.querySelector('[data-music-preview="home"]').click()`);await playing('home');
  await ev(`document.querySelector('[data-music-preview="routes"]').click();document.querySelector('[data-music-preview="coordinates"]').click();document.querySelector('[data-music-preview="home"]').click()`);await playing('home');assert((await status()).cached<=2);await b.waitFor('NineRealmsAtmosphere.musicStatus().sources===1');assert.equal((await status()).sources,1);assert(await ev('__musicSources.filter(s=>s.__connected).length===1'));
  report.flows.push('actual offline preparation, fast phase changes, native crossfade, at most two sources and two cached loops');
  assert.equal(await ev('NineRealmsAtmosphere.play("voyage-home")'),true);await delay(100);assert(await ev('__audioGains.some(g=>g.gain.value>0.41&&g.gain.value<0.43)'));assert.equal((await status()).playing,true);report.flows.push('major cue ducks music bus to 42% while the loop continues');
  await click('sound-toggle');await stopped();assert.match(await ev('document.getElementById("voyage-music-status").textContent'),/总开关/);await click('sound-toggle');await playing('home');
  await volume('music-volume',0);await stopped();assert.equal((await read()).preferences.musicVolume,0);await volume('music-volume',35);await playing('home');
  await volume('sound-volume',0);await stopped();await volume('sound-volume',65);await playing('home');
  await click('music-toggle');await stopped();assert.equal((await status()).cached,0);await click('music-toggle');await playing('home');report.flows.push('master mute, either zero volume and BGM off stop/disconnect all sources; BGM off frees loop cache');
  await click('voyage-next-stop');await click('voyage-start');await stopped();await click('start-btn');await playing('coordinates');await delay(250);
  const offset=(await status()).offset;await click('pause-btn');await stopped();assert.match(await ev('document.getElementById("music-status").textContent'),/暂停/);await delay(150);await click('resume-btn');await playing('coordinates');assert((await status()).offset>=offset-0.1);
  await click('error-toggle');const sourceCount=await ev('__musicSources.length');await ev(`(()=>{const g=JSON.parse(localStorage.getItem('${KEY}')).game,empty=g.givens.map((v,i)=>v?-1:i).filter(i=>i>=0);for(const [n,i] of empty.slice(0,2).entries()){document.querySelectorAll('#board .cell')[i].click();document.dispatchEvent(new KeyboardEvent('keydown',{key:String(n?g.solution[i]:g.solution[i]%9+1),bubbles:true}));}})()`);assert.equal(await ev('__musicSources.length'),sourceCount);assert.equal((await status()).phase,'coordinates');assert.equal((await read()).game.mistakes,0);report.flows.push('unchecked correct and incorrect digits leave the music phase and sources unchanged');
  await click('zen-toggle');await stopped();assert.equal((await read()).preferences.musicEnabled,true);await click('zen-toggle');await playing('coordinates');
  await click('rules-open');await stopped();await click('rules-close');await playing('coordinates');report.flows.push('prepared board silent; active mainline plays; pause resumes its position; Zen and rules dialog stay quiet');
  const current=(await b.send('Target.getTargetInfo')).targetInfo.targetId,other=(await b.send('Target.createTarget',{url:'about:blank'})).targetId;
  try{await b.send('Target.activateTarget',{targetId:other});await b.waitFor('document.hidden');await stopped();assert.equal(await ev('NineRealmsAtmosphere.play("voyage-home")'),false);}finally{await b.send('Target.closeTarget',{targetId:other});await b.send('Target.activateTarget',{targetId:current});await b.waitFor('!document.hidden');}
  await stopped();assert((await read()).game.paused);await click('resume-btn');await playing('coordinates');report.flows.push('real background tab stops all audio and pauses game; return remains paused until continue');
  await ev('__audioContexts.at(-1).suspend()');await stopped();await ev('NineRealmsAtmosphere.unlock()');await playing('coordinates');
  await ev('window.dispatchEvent(new PageTransitionEvent("pagehide"))');await stopped();await delay(80);assert(await ev('__audioContexts.every(c=>c.state==="closed")'));assert.equal((await status()).cached,0);report.flows.push('suspended context requires unlock; page exit closes context and releases sources/cache');
  await load('dawn',{sound:true,musicEnabled:true,musicVolume:0.35},0,'/dist/index.html',true);assert((await read()).game.paused);assert.equal(await ev('__audioContexts.length'),0);await stopped();await click('resume-btn');await playing('coordinates');report.flows.push('restored enabled music creates no context or autoplay before a resume gesture, standalone bundle included');
  for(const [count,phase] of [[9,'routes'],[16,'home']]){await load(null,{sound:true,musicEnabled:true,musicVolume:0.35},count);await click('voyage-btn');await playing(phase);await click('voyage-close');await stopped();}report.flows.push('actual progress maps entry, branch and homecoming states to distinct tracks');
  await load(null,{sound:true,musicEnabled:true});await ev('window.__Offline=window.OfflineAudioContext;window.OfflineAudioContext=undefined;window.webkitOfflineAudioContext=undefined');await click('voyage-btn');await b.waitFor('NineRealmsAtmosphere.musicStatus().state==="error"');await stopped();assert.match(await ev('document.getElementById("voyage-music-status").textContent'),/无法合成/);assert.equal(await ev('NineRealmsAtmosphere.play("voyage-home")'),true);await click('music-toggle');await ev('window.OfflineAudioContext=window.__Offline');await click('music-toggle');await playing('coordinates');report.flows.push('unsupported offline synthesis reports a recoverable error and leaves event sound/game usable');
  await ev('window.dispatchEvent(new StorageEvent("storage",{key:NineRealmsBackup.journalKey,newValue:"another-window-restoring"}))');await stopped();assert(await ev('document.body.inert'));report.flows.push('cross-window restore transition immediately stops music');
  for(const width of [320,390,768,1440])for(const large of [false,true]){
   await b.send('Emulation.setDeviceMetricsOverride',{width,height:width<500?844:1000,deviceScaleFactor:1,mobile:width<500});
   await load(null,{sound:true,musicEnabled:true,musicVolume:0.35,textSize:large?'large':'normal',theme:large?'ivory':'nebula'},9);
   await ev('document.getElementById("appearance-settings").open=true;document.getElementById("music-toggle").scrollIntoView({block:"center"})');
   const layout=await ev(`(()=>{const p=document.querySelector('.appearance-panel'),m=document.querySelector('.music-settings');return{width:innerWidth,large:${large},overflow:p.scrollWidth-p.clientWidth,documentOverflow:document.documentElement.scrollWidth-innerWidth,targets:Array.from(m.querySelectorAll('button,input')).map(e=>({id:e.id,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})),toggle:document.getElementById('music-toggle').getAttribute('aria-pressed')}})()`);
   assert.equal(layout.overflow,0);assert(layout.documentOverflow<=0);assert(layout.targets.every(t=>t.height>=44));assert.equal(layout.toggle,'true');report.layouts.push(layout);
   if(!large&&(width===390||width===1440))await shot('bgm-settings-'+width);
   await ev('document.getElementById("appearance-settings").open=false');await click('voyage-btn');await playing('routes');await ev(`document.querySelector('[data-music-preview]').closest('details').open=true;document.querySelector('.voyage-sound-preview').scrollIntoView({block:'end'})`);
   assert(await ev('document.getElementById("voyage-dialog").scrollWidth===document.getElementById("voyage-dialog").clientWidth'));assert(await ev('Array.from(document.querySelectorAll("[data-music-preview]")).every(b=>b.getBoundingClientRect().height>=44)'));
   if(!large&&(width===390||width===1440))await shot('bgm-voyage-'+width);noErrors();
  }
  const ax=(await b.send('Accessibility.getFullAXTree')).nodes;assert(ax.some(n=>n.role?.value==='button'&&n.name?.value==='双路星航'&&n.properties?.some(p=>p.name==='pressed'&&String(p.value?.value)==='true')));
  // Render review audio with the exact loop buffers and default runtime bus gain.
  for(const id of ['coordinates','routes','home']){
   const r=await ev(`(async()=>{
    const rate=NineRealmsMusic.sampleRate,buffer=await NineRealmsMusic.render(OfflineAudioContext,${JSON.stringify(id)}),length=buffer.length;
    let peak=0,sum=0,maxStep=0,wrap=0,minWindow=1;for(let c=0;c<2;c++){const x=buffer.getChannelData(c);wrap=Math.max(wrap,Math.abs(x[0]-x[length-1]));for(let i=0;i<length;i++){peak=Math.max(peak,Math.abs(x[i]));sum+=x[i]*x[i];if(i)maxStep=Math.max(maxStep,Math.abs(x[i]-x[i-1]));}for(let start=0;start<length;start+=rate/4){let energy=0;for(let i=start;i<Math.min(start+rate/4,length);i++)energy+=x[i]*x[i];minWindow=Math.min(minWindow,Math.sqrt(energy/Math.min(rate/4,length-start)));}}
    const join=new OfflineAudioContext(2,64*rate,rate),source=join.createBufferSource(),gain=join.createGain();source.buffer=buffer;source.loop=true;source.connect(gain);gain.connect(join.destination);gain.gain.setValueAtTime(0,0);gain.gain.linearRampToValueAtTime(.9*.65*.35,1.2);gain.gain.setValueAtTime(.9*.65*.35,62.8);gain.gain.linearRampToValueAtTime(0,64);source.start(0);const rendered=await join.startRendering();source.disconnect();gain.disconnect();
    let mixPeak=0,mixSum=0;const left=rendered.getChannelData(0),right=rendered.getChannelData(1);for(let i=0;i<left.length;i++){mixPeak=Math.max(mixPeak,Math.abs(left[i]),Math.abs(right[i]));mixSum+=left[i]*left[i]+right[i]*right[i];}
    let result={duration:rendered.duration,cycle:buffer.duration,sampleRate:rate,channels:2,peak,rms:Math.sqrt(sum/(length*2)),maxAdjacentDelta:maxStep,wrapDelta:wrap,minQuarterSecondRms:minWindow,samplePeak:mixPeak,sampleRms:Math.sqrt(mixSum/(left.length*2))};
    if(${Boolean(out)}){const bytes=left.length*4,a=new ArrayBuffer(44+bytes),v=new DataView(a),str=(p,s)=>{for(let i=0;i<s.length;i++)v.setUint8(p+i,s.charCodeAt(i));};str(0,'RIFF');v.setUint32(4,36+bytes,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,rate,true);v.setUint32(28,rate*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,bytes,true);for(let i=0;i<left.length;i++){v.setInt16(44+i*4,Math.round(left[i]*32767),true);v.setInt16(46+i*4,Math.round(right[i]*32767),true);}const u=new Uint8Array(a);let text='';for(let i=0;i<u.length;i+=8192)text+=String.fromCharCode(...u.subarray(i,i+8192));result.wav=btoa(text);}return result;
   })()`);
   assert.equal(r.cycle,32);assert.equal(r.duration,64);assert(r.wrapDelta<=r.maxAdjacentDelta*1.05+1e-6,'seam has no extra sample discontinuity');assert(r.minQuarterSecondRms>0.001,'no silent loop gap');assert(r.peak<0.5&&r.samplePeak>0.005&&r.samplePeak<0.25);
   if(out){const file=path.join(out,'NineRealms-bgm-'+id+'.wav');fs.writeFileSync(file,Buffer.from(r.wav,'base64'));delete r.wav;r.file=file;}report.loops[id]=r;
  }
  const mix=await ev(`(async()=>{const rate=24000,buffer=await NineRealmsMusic.render(OfflineAudioContext,'home'),c=new OfflineAudioContext(2,36*rate,rate),s=c.createBufferSource(),g=c.createGain();s.buffer=buffer;s.loop=true;g.gain.value=.9;s.connect(g);g.connect(c.destination);s.start(0);NineRealmsSound.score('voyage-home').forEach(n=>NineRealmsSound.voice(c,g,n,31));const b=await c.startRendering();let peak=0;for(let ch=0;ch<2;ch++){const x=b.getChannelData(ch);for(let i=0;i<x.length;i++)peak=Math.max(peak,Math.abs(x[i]));}s.disconnect();g.disconnect();return{peak,fullVolume:true,ducking:false};})()`);assert(mix.peak<0.9);report.fullVolumeMix=mix;
  noErrors();if(out)fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify(report,null,2));console.log('PASS BGM real browser: '+JSON.stringify(report));
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
