/* Inspect the real sandboxed review launcher, including its cross-process frame. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {launch,delay}=require('./browser-helper.cjs'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=process.env.NINE_REALMS_VOYAGE_EVIDENCE;
const generated=spawnSync(process.execPath,[path.join(root,'scripts/preview-voyage.cjs'),path.join(root,'evidence/voyage-preview/NineRealms-voyage-preview.html')],{encoding:'utf8'});
assert.equal(generated.status,0,generated.stderr);
(async()=>{const b=await launch(),results=[];let childId=null,sessionId=null;
 async function childEval(expression){const r=await b.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true},sessionId);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
 async function inspect(){
  const target=(await b.send('Target.getTargets')).targetInfos.filter(t=>t.type==='iframe'&&t.url==='about:srcdoc').at(-1);if(!target)return null;
  if(target.targetId!==childId){childId=target.targetId;sessionId=(await b.send('Target.attachToTarget',{targetId:childId,flatten:true})).sessionId;await b.send('Runtime.enable',{},sessionId);}
  return childEval(`(()=>{const d=document.getElementById('voyage-dialog');return d?.open?{title:document.getElementById('voyage-selected-title').textContent,nodes:document.querySelectorAll('[data-world-id]').length,phases:Array.from(document.querySelectorAll('.voyage-phase[open]')).map(e=>e.dataset.phase)}:null})()`);
 }
 try{
  await b.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  const inject=await b.send('Page.addScriptToEvaluateOnNewDocument',{source:`if(window===window.top){localStorage.clear();localStorage.setItem('review-parent-sentinel','keep');}`});
  await b.send('Page.navigate',{url:b.url+'/evidence/voyage-preview/NineRealms-voyage-preview.html'});
  await b.waitFor('document.readyState==="complete" && !!document.getElementById("game")');await b.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:inject.identifier});
  let boardInput=false,sound=false,music=false;
  for(let i=0;i<3;i++){
   if(i)await b.evaluate(`document.querySelector('[data-case="${i}"]').click()`);
   let result;
   for(let n=0;n<100;n++){try{result=await inspect();}catch(e){if(!/context|frame|navigat|session|target/i.test(e.message))throw e;childId=null;}if(result&&result.title.startsWith(['01','10','16'][i]))break;await delay(50);}
   assert(result?.title.startsWith(['01','10','16'][i]),JSON.stringify(result));assert.equal(result.nodes,16);results.push(result);
   if(i===0){
    const played=await childEval(`(()=>{document.getElementById('voyage-start').click();document.getElementById('start-btn').click();document.dispatchEvent(new KeyboardEvent('keydown',{key:'1',bubbles:true}));const g=JSON.parse(localStorage.getItem('nine-realms.sudoku.v1')).game;return{voyageId:g.voyageId,started:g.started,edited:g.board.some((v,i)=>v!==g.givens[i])}})()`);
    assert.equal(played.voyageId,'dawn');assert(played.started&&played.edited);boardInput=true;
    sound=await childEval(`(async()=>{document.getElementById('sound-toggle').click();return await NineRealmsAtmosphere.unlock()&&NineRealmsAtmosphere.play('voyage-enter');})()`);assert.equal(sound,true);
    await childEval('document.getElementById("music-toggle").click()');
    for(let n=0;n<100;n++){music=await childEval('NineRealmsAtmosphere.musicStatus().playing && NineRealmsAtmosphere.musicStatus().phase==="coordinates"');if(music)break;await delay(50);}assert.equal(music,true,'BGM plays in the actual isolated review frame');
   }
   assert.deepEqual(await b.evaluate('Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)]))'),{'review-parent-sentinel':'keep'});
  }
  const errors=b.events.filter(e=>e.method==='Runtime.exceptionThrown');assert.deepEqual(errors,[]);
  const report={results,parentStorageUnchanged:true,realBoardInput:boardInput,soundInSandbox:sound,musicInSandbox:music,sandbox:'opaque origin, scripts and downloads only',runtimeErrors:errors};
  if(out){await delay(400);fs.mkdirSync(out,{recursive:true});const shot=await b.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,'review-launcher.png'),Buffer.from(shot.data,'base64'));fs.writeFileSync(path.join(out,'preview-isolation.json'),JSON.stringify(report,null,2));}
  console.log('PASS isolated voyage review launcher: '+JSON.stringify(report));
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
