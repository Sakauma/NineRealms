/* Standalone review launcher. The embedded game uses isolated in-memory test data. */
'use strict';
const fs=require('node:fs'),path=require('node:path');
const E=require('../src/engine.js'),V=require('../src/voyage.js'),B=require('../src/backup.js');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'dist/index.html'),'utf8');
const chapters=V.chapters().map(c=>c.id);
function sample(ids){
 let progress={__journey:{version:1,granted:[]}};
 ids.forEach(id=>{progress=V.award(progress,id,{elapsedMs:600000,mistakes:0,hints:0});});
 const p=E.getPuzzle('easy','voyage-review-launcher','classic');
 const snapshot={version:8,preferences:{theme:'nebula',fx:false,intensity:'soft',sound:false,soundVolume:0.65},game:{sessionId:'voyage-review',createdAt:1,puzzleId:p.id,sourceId:p.sourceId,mode:p.mode,difficulty:p.difficulty,clues:p.clues,givens:p.givens,solution:p.solution,board:p.givens.slice(),notes:Array(81).fill(0),selected:p.givens.findIndex(v=>!v),started:false,paused:false,completed:false,mistakes:0,hints:0,errorCheckIncomplete:false,elapsedMs:0,history:[],branch:null}};
 const entries={[B.keys[0]]:JSON.stringify(snapshot),[B.keys[4]]:JSON.stringify(progress)};
 B.create({getItem:k=>entries[k]??null});return entries;
}
const fixtures=[sample([]),sample(chapters.slice(0,9)),sample(chapters)];
const output=path.resolve(process.argv[2]||path.join(root,'evidence/voyage-preview/NineRealms-voyage-preview.html'));
const page=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>九境 · 主线与声音审阅</title><style>
*{box-sizing:border-box}body{margin:0;background:#101526;color:#eef1ff;font:14px/1.6 system-ui,sans-serif}header{display:flex;flex-wrap:wrap;align-items:center;gap:12px 24px;padding:12px 20px;border-bottom:1px solid #b7adfa33;background:linear-gradient(120deg,#242a43,#171c30)}header strong{font-weight:600}header p{margin:0;font-size:12px;color:#b7c0d9}nav{display:flex;gap:8px;flex-wrap:wrap;margin-left:auto}button{min-height:44px;padding:8px 14px;border:1px solid #b7adfa44;border-radius:10px;background:transparent;color:inherit;font:inherit;cursor:pointer}button[aria-pressed=true]{background:#b7adfa;color:#201a3a}button:focus-visible{outline:2px solid #f1ecff;outline-offset:3px}iframe{display:block;width:100%;height:calc(100dvh - var(--header-height,94px));border:0;background:#101526}@media(max-width:600px){header{padding:10px 14px;gap:8px}nav{margin-left:0;width:100%}nav button{flex:1;padding:8px;font-size:12px}}
</style></head><body><header><div><strong>九境 · 主线样稿</strong><p id="review-note">演示进度 · 不读取或保存正式存档。声音与 BGM 默认关闭，可在游戏外观设置内分别开启后试听。</p></div><nav aria-label="选择演示进度"><button type="button" data-case="0" aria-pressed="true">初次启程</button><button type="button" data-case="1" aria-pressed="false">两路开放</button><button type="button" data-case="2" aria-pressed="false">归航完成</button></nav></header><iframe id="game" title="九境主线可运行样稿，使用演示进度" sandbox="allow-scripts allow-downloads" allow="autoplay"></iframe><script>
const encoded=${JSON.stringify(Buffer.from(html,'utf8').toString('base64'))};
const fixtures=${JSON.stringify(fixtures)};
const original=new TextDecoder().decode(Uint8Array.from(atob(encoded),c=>c.charCodeAt(0)));
function bootstrap(seed){
  // Opaque sandbox origin is the first boundary; this adapter supplies only test data.
  const values=new Map(Object.entries(seed));
  const api={getItem(key){key=String(key);return values.has(key)?values.get(key):null;},setItem(key,value){values.set(String(key),String(value));},removeItem(key){values.delete(String(key));},clear(){values.clear();},key(index){return Array.from(values.keys())[index]??null;},get length(){return values.size;}};
  const storage=new Proxy(api,{get(target,key,receiver){return key in target?Reflect.get(target,key,receiver):values.get(String(key));},set(target,key,value){values.set(String(key),String(value));return true;},ownKeys(){return Array.from(values.keys());},getOwnPropertyDescriptor(target,key){return values.has(key)?{configurable:true,enumerable:true,writable:true,value:values.get(key)}:undefined;}});
  Object.defineProperty(window,'localStorage',{value:storage,configurable:false});
  window.__nineRealmsReview=true;
  let attempts=0;const timer=setInterval(()=>{if(document.querySelectorAll('#number-pad button').length===9&&document.querySelectorAll('#board .cell').length){clearInterval(timer);document.getElementById('voyage-btn').click();}else if(++attempts>100)clearInterval(timer);},50);
}
function select(index){document.querySelectorAll('[data-case]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.case)===index)));const init='<script>('+bootstrap.toString()+')('+JSON.stringify(fixtures[index])+');<'+ '/script>';document.getElementById('game').srcdoc=original.replace('<head>','<head>'+init);}
document.querySelector('nav').addEventListener('click',event=>{const button=event.target.closest('[data-case]');if(button)select(Number(button.dataset.case));});
new ResizeObserver(entries=>{document.documentElement.style.setProperty('--header-height',entries[0].target.getBoundingClientRect().height+'px');}).observe(document.querySelector('header'));
select(0);
</script></body></html>`;
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,page);console.log(JSON.stringify({output,bytes:Buffer.byteLength(page),testProgressOnly:true,persistentStorage:false}));
