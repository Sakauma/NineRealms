'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const code=fs.readFileSync(require.resolve('../src/atmosphere.js'),'utf8');
function fixture(){
 const contexts=[],players=[];let failRender=false;
 function param(){return{value:1,setValueAtTime(v){this.value=v;},setTargetAtTime(v){this.value=v;},cancelScheduledValues(){}};}
 class Audio{
  constructor(){this.currentTime=0;this.state='running';this.listeners=[];contexts.push(this);}
  createGain(){return{gain:param(),connect(){},disconnect(){}};}
  addEventListener(type,fn){if(type==='statechange')this.listeners.push(fn);}
  emit(state){this.state=state;this.listeners.forEach(fn=>fn());}
  resume(){this.emit('running');return Promise.resolve();}
  close(){this.emit('closed');return Promise.resolve();}
 }
 const root={document:{hidden:false,getElementById(){return null;}},AudioContext:Audio,OfflineAudioContext:function(){},NineRealmsSound:{score(){return[{offset:0,duration:1}];},voice(){return{oscillator:{disconnect(){},stop(){}},gain:{disconnect(){}}};}},NineRealmsMusic:{createPlayer(ctx,options){const player={state:'idle',playing:false,update(){this.state=failRender?'error':'playing';this.playing=!failRender;return Promise.resolve(this.playing);},stop(){this.state='idle';this.playing=false;},release(){this.state='released';this.playing=false;},duck(){},status(){return{state:this.state,playing:this.playing,sources:Number(this.playing)};}};players.push(player);return player;}}};
 vm.runInNewContext(code,{window:root,Set,Map,Promise});const a=root.NineRealmsAtmosphere;a.configure({sound:true,soundVolume:.65});a.setMusic({enabled:true,active:true,volume:.35,phase:'coordinates'});
 return{a,root,contexts,players,failRender(value){failRender=value;}};
}
(async()=>{
 const f=fixture();assert.equal(f.a.musicStatus().audioState,'uninitialized');assert(await f.a.unlock());assert.equal(f.a.musicStatus().audioState,'running');assert(f.a.musicStatus().playing);
 f.contexts[0].emit('suspended');f.contexts[0].resume=()=>Promise.reject(Error('blocked'));assert.equal(await f.a.unlock(),false);assert.equal(f.a.musicStatus().audioError,'blocked');assert.equal(f.a.musicStatus().audioState,'suspended');assert(!f.a.musicStatus().playing);
 f.contexts[0].resume=function(){this.emit('running');return Promise.resolve();};assert(await f.a.unlock());assert.equal(f.a.musicStatus().audioError,null);assert(f.a.musicStatus().playing);
 f.failRender(true);f.a.stopSound();await f.a.unlock();assert.equal(f.a.musicStatus().state,'error');f.failRender(false);const count=f.players.length;assert(await f.a.unlock({retryMusic:true}));assert.equal(f.players.length,count+1);assert.equal(f.players[count-1].state,'released');assert(f.a.musicStatus().playing);
 // Every sound timestamp belongs to one AudioContext; a new clock starts at zero.
 f.contexts[0].currentTime=90;assert(f.a.play('voyage-home'));await f.contexts[0].close();assert(await f.a.unlock());assert.equal(f.contexts.length,2);assert(f.a.play('place'),'new context cannot inherit the old 90-second throttle/duck guard');
 // A rejected resume from an already released context must not overwrite new state.
 let reject;f.contexts[1].emit('suspended');f.contexts[1].resume=()=>new Promise((resolve,r)=>{reject=r;});const pending=f.a.unlock();f.a.releaseAudio();assert(await f.a.unlock());reject(Error('old denied'));assert.equal(await pending,false);assert.equal(f.a.musicStatus().audioError,null);assert.equal(f.a.musicStatus().audioState,'running');
 f.root.document.hidden=true;f.a.configure({sound:true});assert.equal(await f.a.unlock(),false);assert(!f.a.musicStatus().playing);f.root.document.hidden=false;f.a.configure({zen:true});assert.equal(await f.a.unlock(),false);f.a.configure({zen:false,sound:false});assert.equal(await f.a.unlock(),false);f.a.releaseAudio();assert(f.contexts.every(c=>c.state==='closed'));
 const absent=fixture();absent.root.AudioContext=undefined;assert.equal(await absent.a.unlock(),false);assert.equal(absent.a.musicStatus().audioState,'unavailable');
 const broken=fixture();broken.root.AudioContext=function(){throw Error('device unavailable');};assert.equal(await broken.a.unlock(),false);assert.equal(broken.a.musicStatus().audioError,'initialization');broken.a.releaseAudio();
 console.log('PASS audio unlock: suspended/denied retry, explicit failed-renderer retry, unavailable/device errors, fresh context clock, stale async rejection, mute/Zen/background guards and complete release. Unit state checks; actual PCM verified separately in Chromium.');
})().catch(e=>{console.error(e);process.exitCode=1});
