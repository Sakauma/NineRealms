'use strict';
// A legal near-capacity replay must survive the exact download serialization.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const E=require('../src/engine.js'),B=require('../src/backup.js'),H=require('../src/history.js');
const p=E.getPuzzle('easy','capacity-roundtrip','classic');
const game={mode:'classic',difficulty:'easy',clues:p.clues,solution:p.solution,givens:p.givens,sessionId:'capacity-session',createdAt:1,board:p.givens.slice(),notes:Array(81).fill(0),selected:0,mistakes:0,hints:0,elapsedMs:0,started:false,paused:false,completed:false,history:[],branch:null};
const frame={board:game.board,notes:game.notes,selected:0,noteMode:false,branch:false,elapsedMs:0,mistakes:0,hints:0,completed:false};
const step={action:'候选速记',changes:Array.from({length:40},(_,i)=>[i,game.board[i],0]),selected:0,noteMode:false,branch:false,elapsedMs:0,mistakes:0,hints:0,completed:false};
const history={version:1,currentId:game.sessionId,removedRecords:0,records:[{sessionId:game.sessionId,createdAt:1,updatedAt:1,origin:'new',snapshot:{version:8,game},base:frame,steps:Array(3000).fill(step),droppedSteps:0}]};
const historyText=JSON.stringify(history);
assert(historyText.length*2<H.limits.bytes);
assert(historyText.length*2>H.limits.bytes*0.9);
const source={getItem:key=>key===H.KEY?historyText:null};
const app=fs.readFileSync(require.resolve('../src/app.js'),'utf8');
assert.match(app,/typeof value === "string" \? value : JSON\.stringify\(value\);/,'Download must preserve compact JSON to keep export/import limits aligned');
(async()=>{
 const backup=await B.createAsync(source);
 assert(JSON.stringify(backup,null,2).length>B.limits.maxChars,'Fixture must reproduce the old pretty-print expansion bug');
 const downloaded=JSON.stringify(backup);
 assert(Buffer.byteLength(downloaded)<B.limits.maxBytes);
 const validated=await B.validateAsync(downloaded);
 const map=new Map();
 const target={getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};
 B.replace(target,validated);
 assert.equal(target.getItem(H.KEY),historyText);
 assert.equal(B.preview(validated).historySteps,3000);
 console.log('PASS backup capacity: legal >90%-full history exports compactly, imports and restores all 3000 replay steps unchanged.');
})().catch(error=>{console.error(error);process.exitCode=1;});
