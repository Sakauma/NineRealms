'use strict';
const assert=require('node:assert/strict'),R=require('../src/save-recovery.js');
function storage(entries={}){
 const values=new Map(Object.entries(entries)),writes=[];
 return {values,writes,getItem:key=>values.get(key)??null,setItem(key,value){writes.push(key);values.set(key,String(value));}};
}
const missing=storage();assert.equal(R.inspect(missing,8).status,'missing');assert.deepEqual(missing.writes,[]);
for(const raw of ['', 'null', '{broken\n', JSON.stringify({version:0}), JSON.stringify({version:'8'})]){
 const s=storage({[R.key]:raw}),state=R.inspect(s,8);
 assert.equal(state.status,'invalid');assert.equal(state.raw,raw);assert.deepEqual(s.writes,[]);
 R.preserve(s,state);assert.equal(s.getItem(R.key),raw,'preserving never replaces the current raw save');
 assert.equal(JSON.parse(s.getItem(R.archiveKey)).entries[0].raw,raw);
}
const future=JSON.stringify({version:99,privateField:'保留 \u0000 原始字节'}),s=storage({[R.key]:future,unrelated:'keep'});
const state=R.inspect(s,8);assert.equal(state.status,'unsupported');assert.equal(state.version,99);
assert.equal(R.inspect(s,99).status,'candidate','the same data can be retried in a compatible version');
R.preserve(s,state);R.preserve(s,state);assert.equal(JSON.parse(s.getItem(R.archiveKey)).entries.length,1,'duplicate recovery never deletes previous bytes');
s.setItem(R.key,'broken twice');R.preserve(s,R.inspect(s,8));
assert.deepEqual(JSON.parse(s.getItem(R.archiveKey)).entries.map(e=>e.raw),[future,'broken twice']);assert.equal(s.getItem('unrelated'),'keep');
for(let version=1;version<=8;version++)assert.equal(R.inspect(storage({[R.key]:JSON.stringify({version})}),8).status,'candidate');
assert.equal(R.inspect({getItem(){throw Error('SecurityError');}},8).status,'unavailable');
const quota=storage({[R.key]:future});quota.setItem=()=>{throw Error('QuotaExceededError');};assert.throws(()=>R.preserve(quota,R.inspect(quota,8)),/Quota/);assert.equal(quota.getItem(R.key),future);
const corrupt=storage({[R.key]:future,[R.archiveKey]:'old unreadable archive'});assert.throws(()=>R.preserve(corrupt,R.inspect(corrupt,8)));assert.equal(corrupt.getItem(R.archiveKey),'old unreadable archive');assert.equal(corrupt.getItem(R.key),future);
const racing=storage({[R.key]:future});const previous=R.inspect(racing,8);racing.values.set(R.key,'another window');assert.throws(()=>R.preserve(racing,previous),/其他窗口/);assert.equal(racing.getItem(R.archiveKey),null);
const unreliable=storage({[R.key]:future});unreliable.setItem=()=>{};assert.throws(()=>R.preserve(unreliable,R.inspect(unreliable,8)),/未能安全保存/);assert.equal(unreliable.getItem(R.key),future);
assert.throws(()=>R.preserve(missing,R.inspect(missing,8)),/没有可保留/);
console.log('PASS save recovery: missing/corrupt/future/unavailable states, exact original bytes, cumulative copies, quota/readback failures and concurrent-current changes preserve originals.');
