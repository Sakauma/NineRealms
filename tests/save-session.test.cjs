'use strict';
const assert=require('node:assert/strict'),R=require('../src/save-recovery.js');
function memory(){const values=new Map([[R.key,'initial'],['history','original']]);return {values,getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};}
function manager(){let held=false;return {request(name,options,callback){if(held)return Promise.resolve(callback(null));held=true;return Promise.resolve(callback({name})).finally(()=>{held=false;});}};}
(async()=>{
 const source=memory(),locks=manager();let conflicts=0;
 const a=R.createSession({storage:source,locks,onConflict(){conflicts++;}}),b=R.createSession({storage:source,locks});
 assert(await a.start());assert.equal(await b.start(),false);
 for(const k of [R.key,'history',R.archiveKey])assert.throws(()=>b.storage.setItem(k,'stale'),e=>e.code==='SAVE_CONFLICT');
 a.storage.setItem(R.key,'latest');a.storage.setItem('history','latest history');assert.equal(source.getItem(R.key),'latest');
 b.temporary();assert.throws(()=>b.storage.removeItem(R.key),e=>e.code==='TEMPORARY_SESSION');assert.equal(source.getItem(R.key),'latest');
 a.release();await Promise.resolve();await Promise.resolve();
 assert(await b.start());b.storage.setItem(R.key,'fresh after explicit acquisition');
 source.setItem(R.key,'external legacy writer');b.changed({key:R.key});
 assert.throws(()=>b.storage.setItem('history','stale'),e=>e.code==='SAVE_CONFLICT');assert.equal(source.getItem('history'),'latest history');
 b.release();await Promise.resolve();await Promise.resolve();
 const fallback=R.createSession({storage:source,onConflict(){conflicts++;}});assert(await fallback.start());
 source.setItem(R.key,'changed without a storage event');assert.throws(()=>fallback.storage.setItem(R.key,'stale'),e=>e.code==='SAVE_CONFLICT');
 assert.equal(source.getItem(R.key),'changed without a storage event');assert.equal(conflicts,1);fallback.changed({key:R.key});assert.equal(conflicts,1);
 const auxiliary=R.createSession({storage:source});await auxiliary.start();auxiliary.storage.getItem('history');source.setItem('history','newer external history');assert.throws(()=>auxiliary.storage.setItem('history','old history'),e=>e.code==='SAVE_CONFLICT');assert.equal(source.getItem('history'),'newer external history');
 const rejected=R.createSession({storage:source,locks:{request(){return Promise.reject(new Error('API unavailable'));}}});assert(await rejected.start());rejected.storage.setItem(R.key,'fallback saved');
 const quota=R.createSession({storage:{getItem:k=>source.getItem(k),setItem(){throw new Error('quota');}}});await quota.start();assert.throws(()=>quota.storage.setItem(R.key,'not written'),/quota/);assert.equal(source.getItem(R.key),'fallback saved');
 console.log('PASS save sessions: exclusive ownership, blocked writes for all keys, temporary sessions, safe handoff, stale-write detection with and without events, lock-API fallback and quota errors.');
})().catch(error=>{console.error(error);process.exitCode=1;});
