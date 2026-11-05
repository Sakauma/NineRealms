'use strict';
const assert=require('node:assert/strict'),create=require('../src/desktop-bridge.js');
(async()=>{
 const webCalls=[],web=create({navigator:{clipboard:{writeText:async text=>webCalls.push(text)}}});assert.equal(web.isTauri(),false);await web.copyText('NR2-测试');assert.deepEqual(webCalls,['NR2-测试']);await assert.rejects(web.saveJSON('{}','Nine-Realms-backup.json'),/unavailable/);
 const markerOnly=create({__TAURI__:{core:{invoke:()=>{throw Error('not a Tauri window');}}}});assert(!markerOnly.isTauri());await assert.rejects(markerOnly.copyText('x'),/unavailable/);
 const calls=[],root={__TAURI_INTERNALS__:{},__TAURI__:{core:{invoke:async(cmd,payload)=>{calls.push({cmd,payload});return cmd==='save_json'?true:undefined;}}},navigator:{clipboard:{writeText:()=>{throw Error('native copy must not call web clipboard');}}}};
 const native=create(root);assert(native.isTauri());await native.copyText('1'.repeat(81));assert.equal(await native.saveJSON('{"entries":{}}','Nine-Realms-backup.json'),true);
 assert.deepEqual(calls,[{cmd:'copy_text',payload:{text:'1'.repeat(81)}},{cmd:'save_json',payload:{contents:'{"entries":{}}',filename:'Nine-Realms-backup.json'}}]);assert(!JSON.stringify(calls).includes('destination'));
 root.__TAURI__.core.invoke=async()=>false;assert.equal(await native.saveJSON('{}','Nine-Realms-backup.json'),false);
 root.__TAURI__.core.invoke=async()=>undefined;await assert.rejects(native.saveJSON('{}','Nine-Realms-backup.json'),/response/);
 root.__TAURI__.core.invoke=async()=>{throw Error('native permission error');};await assert.rejects(native.copyText('x'),/native permission/);await assert.rejects(native.saveJSON('{}','Nine-Realms-backup.json'),/native permission/);
 await assert.rejects(native.copyText(1),TypeError);await assert.rejects(native.saveJSON({},'x'),TypeError);assert(Object.isFrozen(native));
 console.log('PASS desktop bridge transport: browser compatibility, explicit Tauri detection, narrow IPC payloads, native clipboard, save/cancel/failure handling. IPC is mocked; no native execution claimed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
