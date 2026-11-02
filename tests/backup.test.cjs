'use strict';
const assert=require('node:assert/strict'),E=require('../src/engine.js'),B=require('../src/backup.js'),H=require('../src/history.js');
function storage(initial={}){const map=new Map(Object.entries(initial));return {map,quota:Infinity,hook:null,getItem(k){return map.has(k)?map.get(k):null},setItem(k,v){v=String(v);if(this.hook)this.hook(k,v);const size=Array.from(map).reduce((n,[key,value])=>n+(key===k?0:key.length+value.length),0)+k.length+v.length;if(size>this.quota)throw Error('QuotaExceededError');map.set(k,v)},removeItem(k){map.delete(k)}}}
function snapshot(mode='classic',seed='backup'){const p=E.getPuzzle('easy',seed,mode);return {version:8,preferences:{theme:'nebula',fx:true,intensity:'balanced'},game:{sessionId:'session-'+mode,createdAt:1,puzzleId:p.id,sourceId:p.sourceId,mode,difficulty:'easy',clues:p.clues,givens:p.givens,solution:p.solution,board:p.givens.slice(),notes:p.givens.map(()=>0),selected:0,mistakes:0,hints:0,elapsedMs:0,started:false,paused:false,completed:false,history:[],branch:null}}}
function base(mode='classic'){return storage({[B.keys[0]]:JSON.stringify(snapshot(mode)),[B.keys[2]]:JSON.stringify({version:1,found:['gate']}),[B.keys[3]]:JSON.stringify({}),[B.keys[4]]:JSON.stringify({}),[B.keys[5]]:JSON.stringify({version:1,seen:{}}),[B.keys[6]]:JSON.stringify([]),'unrelated.app':'keep'})}
const stringify=s=>JSON.stringify(Array.from(s.map).sort());
(async()=>{
 for(const mode of E.getModes()){
  const source=base(mode.id),backup=await B.createAsync(source,{appVersion:'3.1.0'});assert.equal(backup.appVersion,'3.1.0');assert.equal(B.preview(backup).currentGame.total,E.getLayout(mode.id).cellCount);
  const target=storage({'unrelated.app':'keep'});assert(B.replace(target,backup).replaced);assert.equal(target.getItem(B.keys[0]),source.getItem(B.keys[0]));assert.equal(target.getItem('unrelated.app'),'keep');assert.equal(target.getItem(B.journalKey),null);
 }
 const s=base(),b=B.create(s),copy=()=>JSON.parse(JSON.stringify(b));assert(Object.isFrozen(b.entries[B.keys[0]].game.board));
 let bad=copy();bad.schemaVersion=2;assert.throws(()=>B.validate(bad));bad=copy();bad.entries.foreign={};assert.throws(()=>B.validate(bad));bad=copy();delete bad.entries[B.keys[2]];assert.throws(()=>B.validate(bad));
 bad=copy();bad.entries[B.keys[0]].version=9;assert.throws(()=>B.validate(bad));bad=copy();bad.entries[B.keys[0]].game.givens.fill(0);bad.entries[B.keys[0]].game.board.fill(0);assert.throws(()=>B.validate(bad),/唯一解/);
 bad=copy();bad.entries[B.keys[0]].game.solution[0]=0;assert.throws(()=>B.validate(bad));assert.throws(()=>B.validate('{"__proto__":{}}'));assert.throws(()=>B.validate('x'.repeat(B.limits.maxChars+1)));
 const histStore=H.createStore({Engine:E,storage:s});const snap=snapshot();histStore.capture(snap,{origin:'new'});const i=snap.game.givens.indexOf(0);snap.game.board[i]=snap.game.solution[i];snap.game.started=true;snap.game.elapsedMs=1000;histStore.capture(snap,{action:'填数'});histStore.flush();s.setItem(B.keys[0],JSON.stringify(snap));
 const withHistory=B.create(s);assert.equal(B.preview(withHistory).historySteps,1);bad=JSON.parse(JSON.stringify(withHistory));bad.entries[B.keys[1]].records[0].steps[0].changes[0][1]=0;assert.throws(()=>B.validate(bad),/回放终点/);
 const replacement=JSON.parse(JSON.stringify(b));replacement.entries[B.keys[2]].found.push('lotus');const validated=await B.validateAsync(replacement);
 const quota=base();const original=stringify(quota);quota.quota=1;assert.throws(()=>B.replace(quota,validated),{code:'BACKUP_STAGING_FAILED'});assert.equal(stringify(quota),original);
 const once=base();const old=stringify(once);let thrown=false;once.hook=(k)=>{if(k===B.keys[3]&&!thrown){thrown=true;throw Error('injected')}};assert.throws(()=>B.replace(once,validated),{code:'IMPORT_ROLLED_BACK'});assert.equal(stringify(once),old);
 const persistent=base(),previous=B.keys.reduce((x,k)=>(x[k]=persistent.getItem(k),x),{});let after=false;persistent.hook=(k)=>{if(k===B.keys[3])after=true;if(after&&k!==B.journalKey)throw Error('permission revoked')};
 assert.throws(()=>B.replace(persistent,validated),e=>e.recoveryRequired&&typeof e.previousBackup==='string');assert(persistent.getItem(B.journalKey));persistent.hook=null;assert(B.recover(persistent).recovered);B.keys.forEach(k=>assert.equal(persistent.getItem(k),previous[k]));assert.equal(persistent.getItem('unrelated.app'),'keep');
 const interrupted=base();const journal=JSON.stringify({format:'nine-realms-rollback',version:1,previous});interrupted.setItem(B.journalKey,journal);interrupted.removeItem(B.keys[0]);assert(B.recover(interrupted).recovered);assert.equal(interrupted.getItem(B.keys[0]),previous[B.keys[0]]);
 const F=require('../src/favorites.js'),favStorage=base(),favorites=F.createStore(favStorage);
 for(const mode of E.getModes())favorites.add(E.getPuzzle('easy','favorite-backup',mode.id),{later:true,sessionId:'fav-session-'+mode.id});
 let yielded=false;setTimeout(()=>{yielded=true},0);const withFavorites=await B.createAsync(favStorage);assert(yielded);assert.equal(B.preview(withFavorites).favoritesCount,E.getModes().length);
 const favTarget=storage();B.replace(favTarget,withFavorites);assert.equal(F.createStore(favTarget).list().length,E.getModes().length);
 const invalidFavorite=JSON.parse(JSON.stringify(withFavorites));invalidFavorite.entries[F.key].records[0].puzzle.givens.fill(0);await assert.rejects(B.validateAsync(invalidFavorite));
 const proof=E.analyzeSolutions;E.analyzeSolutions=()=>{throw Error('Must not re-prove trusted token')};B.preview(b);B.replace(base(),b);E.analyzeSolutions=proof;
 console.log('PASS backup: '+E.getModes().length+'-mode roundtrip, strict schemas/uniqueness/history replay, product-version independence, frozen validation token, quota protection, rollback/recovery, unrelated keys preserved.');
})().catch(e=>{console.error(e);process.exitCode=1});
