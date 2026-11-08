/* Real Chromium/CDP checks without an npm/browser-driver dependency. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {spawn}=require('node:child_process');
const {createHash}=require('node:crypto');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function launch(options={}){
  const root=path.resolve(__dirname,'..'),profile=fs.mkdtempSync(path.join(os.tmpdir(),'nine-realms-browser-'));
  const server=http.createServer((req,res)=>{
    let file;try{file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));}catch{res.writeHead(400);res.end();return;}
    if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[path.extname(file)]||'application/octet-stream');
      if(options.csp&&path.extname(file)==='.html'){
        const html=data.toString(),hashes=tag=>[...html.matchAll(new RegExp('<'+tag+'\\b[^>]*>([\\s\\S]*?)</'+tag+'>','gi'))].map(m=>"'sha256-"+createHash('sha256').update(m[1]).digest('base64')+"'").join(' ');
        // Exercise the proposed CSP in Chromium with bundled hashes. This is not Tauri codegen.
        res.setHeader('Content-Security-Policy',options.csp.replace("script-src 'self'","script-src 'self' "+hashes('script')).replace("style-src 'self' 'unsafe-inline'","style-src 'self' 'unsafe-inline' "+hashes('style')));
      }
      res.end(data);});
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  let stderr='';
  // Headless workers may expose no pointer; hover tests opt into explicit fine-pointer media.
  const chrome=spawn(process.env.CHROMIUM_PATH||'/usr/bin/chromium',['--headless','--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--disable-component-update','--no-first-run','--no-default-browser-check','--force-prefers-reduced-motion',...(options.finePointer?['--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4']:[]),'--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});
  const chromeClosed=new Promise(resolve=>chrome.once('close',resolve));
  chrome.stderr.on('data',b=>{stderr+=b.toString();});
  chrome.on('error',e=>{stderr+=e.message;});
  async function close(){
    chrome.kill('SIGTERM');server.close();
    let timer;
    const stopped=await Promise.race([chromeClosed.then(()=>true),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),5000);})]);
    clearTimeout(timer);
    if(!stopped)chrome.kill('SIGKILL');
    for(let attempt=0;;attempt++){
      try{await fs.promises.rm(profile,{recursive:true,force:true});return;}
      catch(error){
        if(!['ENOTEMPTY','EBUSY','EPERM','EACCES'].includes(error.code)||attempt>=14)throw error;
        await delay(Math.min(1000,100*(attempt+1)));
      }
    }
  }
  try{
    // Cold CI runners can take longer to start Chromium.
    for(let n=0;n<300&&!fs.existsSync(path.join(profile,'DevToolsActivePort'));n++){if(chrome.exitCode!==null)throw Error('Chromium exited: '+stderr.slice(-1500));await delay(100);}
    if(!fs.existsSync(path.join(profile,'DevToolsActivePort')))throw Error('Chromium CDP startup timed out: '+stderr.slice(-1500));
    const port=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);
    const target=await(await fetch('http://127.0.0.1:'+port+'/json/new?about:blank',{method:'PUT'})).json();
    const ws=new WebSocket(target.webSocketDebuggerUrl),pending=new Map(),events=[];let seq=0;
    await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
    ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result||{});}}else events.push(m);});
    function send(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},20000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});}
    async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;}
    await send('Page.enable');await send('Runtime.enable');
    const url='http://127.0.0.1:'+server.address().port;
    async function waitFor(expression){for(let n=0;n<100;n++){try{if(await evaluate(expression))return;}catch(error){if(!/Execution context was destroyed|Cannot find context|Inspected target navigated or closed/.test(error.message))throw error;}await delay(50);}throw Error('Browser wait failed: '+expression);}
    let navigationSequence=0;
    async function loadStorage(entries,route='/src/index.html',before=''){
      const marker='nine-realms-navigation-'+(++navigationSequence);
      await evaluate('window.__nineRealmsPreviousDocument='+JSON.stringify(marker));
      const script=await send('Page.addScriptToEvaluateOnNewDocument',{source:'localStorage.clear();Object.entries('+JSON.stringify(entries)+').forEach(([key,value])=>{if(value!==null)localStorage.setItem(key,value);});'+before});
      events.length=0;
      try {
        const navigation=await send('Page.navigate',{url:route.startsWith('file:')?route:url+route});
        if(navigation.errorText)throw Error('Navigation failed: '+navigation.errorText);
        await waitFor('window.__nineRealmsPreviousDocument!=='+JSON.stringify(marker)+" && document.readyState==='complete' && document.querySelectorAll('#board .cell').length>0 && document.querySelectorAll('#number-pad button').length===9");
      }finally{await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:script.identifier});}
    }
    async function load(snapshot,route='/src/index.html'){return loadStorage({'nine-realms.sudoku.v1':JSON.stringify(snapshot)},route);}
    return {send,evaluate,waitFor,load,loadStorage,url,events,root,close:async()=>{ws.close();await close();}};
  }catch(error){await close();throw error;}
}
function fixture(seed='browser-features'){
 const E=require('../src/engine.js'),p=E.getPuzzle('easy',seed,'classic');
 return {version:8,preferences:{theme:'ivory',fx:false,zenMotion:false,intensity:'soft'},game:{sessionId:'browser-features-session',createdAt:1,puzzleId:p.id,sourceId:p.sourceId,mode:'classic',difficulty:'easy',clues:p.clues,givens:p.givens,solution:p.solution,board:p.givens.slice(),notes:Array(81).fill(0),selected:p.givens.findIndex(v=>!v),mistakes:0,hints:0,elapsedMs:0,started:true,paused:false,completed:false,history:[],branch:null}};
}
module.exports={launch,fixture,delay};
