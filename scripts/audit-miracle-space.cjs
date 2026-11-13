#!/usr/bin/env node
'use strict';
/* Read-only exhaustive audit; product modules and banks are never modified. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const Engine=require('../src/engine'),Diversity=require('../src/puzzle-diversity'),Generator=require('../src/generator');
const maxNodes=Number(process.env.MIRACLE_AUDIT_MAX_NODES||10000000);
if(!Number.isInteger(maxNodes)||maxNodes<1||maxNodes>100000000)throw new RangeError('Invalid deterministic node budget.');
const adjacent=Array.from({length:81},(_,i)=>[i%9?i-1:-1,i%9<8?i+1:-1,i>=9?i-9:-1,i<72?i+9:-1].filter(x=>x>=0));
function bits(n){let total=0;while(n){n&=n-1;total++;}return total;}
function enumerate({omit=null,givens=[],limit=Infinity}={}){
 const peerMode=omit==='king'?'knight':omit==='knight'?'king':'miracle',nonconsecutive=omit!=='nonconsecutive';
 const peers=Array.from({length:81},(_,i)=>Engine.getPeers(i,peerMode)),units=Engine.getUnits(peerMode).map(u=>u.cells);
 const board=Array(81).fill(0),domains=Array(81).fill(511),solutions=[];let nodes=0,exhausted=false;
 for(const [i,digit] of givens){assert(Number.isInteger(i)&&i>=0&&i<81&&Number.isInteger(digit)&&digit>=1&&digit<=9&&!board[i]);board[i]=digit;}
 function valid(){return !peers.some((ps,i)=>board[i]&&ps.some(j=>board[j]===board[i]))&&(!nonconsecutive||!adjacent.some((ps,i)=>board[i]&&ps.some(j=>board[j]&&Math.abs(board[i]-board[j])===1)));}
 assert(valid(),'givens satisfy the selected constraints');
 for(const [i,digit] of givens){const bit=1<<(digit-1);for(const j of peers[i])domains[j]&=~bit;if(nonconsecutive)for(const j of adjacent[i])domains[j]&=~((bit<<1)|(bit>>>1));}
 function visit(left){
  if(solutions.length>=limit||exhausted)return;
  if(nodes>=maxNodes){exhausted=true;return;}nodes++;
  if(!left){assert(valid());if(!omit)assert(Engine.validateComplete(board,'miracle'));solutions.push(board.slice());return;}
  let best=-1,size=10,degree=-1;
  for(let i=0;i<81;i++){if(board[i])continue;const count=bits(domains[i]);if(!count)return;if(count<size||count===size&&peers[i].length>degree){best=i;size=count;degree=peers[i].length;}if(count===1)break;}
  let available=domains[best];
  // Each unit has nine distinct values: missing-digit support and hidden singles
  // are valid forward checks, not pruning based on any known completed board.
  if(size>1)for(const unit of units){let used=0,union=0,multiple=0;for(const c of unit){if(board[c])used|=1<<(board[c]-1);else{multiple|=union&domains[c];union|=domains[c];}}const missing=511&~used;if(missing&~union)return;const forced=missing&union&~multiple;if(forced){const bit=forced&-forced;best=unit.find(c=>!board[c]&&(domains[c]&bit));available=bit;break;}}
  for(let digit=1;digit<=9&&!exhausted&&solutions.length<limit;digit++){
   const bit=1<<(digit-1);if(!(available&bit))continue;board[best]=digit;const trail=[];let ok=true;
   function remove(cell,mask){if(board[cell])return;const old=domains[cell],next=old&~mask;if(next!==old){trail.push([cell,old]);domains[cell]=next;if(!next)ok=false;}}
   for(const peer of peers[best])remove(peer,bit);if(nonconsecutive)for(const cell of adjacent[best])remove(cell,(bit<<1)|(bit>>>1));
   if(ok)visit(left-1);for(let t=trail.length-1;t>=0;t--)domains[trail[t][0]]=trail[t][1];board[best]=0;
  }
 }
 visit(81-givens.length);
 return {omit,givens,limit:Number.isFinite(limit)?limit:null,nodes,maxNodes,exhausted,complete:!exhausted&&solutions.length<limit,solutionCount:solutions.length,solutions:solutions.map(s=>s.join(''))};
}
function dihedral(s){const out=[];for(let mirror=0;mirror<2;mirror++)for(let turn=0;turn<4;turn++)out.push(Array.from({length:81},(_,i)=>{let x=i%9,y=Math.floor(i/9);if(mirror)x=8-x;for(let r=0;r<turn;r++)[x,y]=[8-y,x];return s[y*9+x];}).join(''));return out;}
const start=performance.now(),full=enumerate(),givens=[[0,8],[13,5]],necessity=[null,'king','knight','nonconsecutive'].map(omit=>enumerate({omit,givens,limit:2}));
const boards=full.solutions.map(s=>s.split('').map(Number));
const classes={classicGroup:new Set(boards.map(s=>Diversity.solutionSignature(s))).size,dihedral:new Set(full.solutions.map(s=>dihedral(s).sort()[0])).size,dihedralAndDigitInversion:new Set(full.solutions.map(s=>dihedral(s).concat(dihedral(s.split('').map(n=>10-Number(n)).join(''))).sort()[0])).size};
const testBoard=Array(81).fill(0);for(const [i,d]of givens)testBoard[i]=d;const logic=Generator.basicProof(testBoard,{mode:'miracle',clues:Engine.normalizeClues('miracle',{})});
const report={version:1,method:'Exhaustive empty-board DFS, no symmetry quotient or known solution seeds; all-different peers, orthogonal nonconsecutive forward checking and sound unit support checks; deterministic node budget, never wall-time truncation.',sources:['https://ethmcc.github.io/miracle-sudoku/','https://akaritakai.net/blog/solving-miracle-sudokus/','https://aperiodical.com/2020/06/the-big-lock-down-math-off-match-26/'],elapsedMs:Math.round(performance.now()-start),full,classes,ruleNecessity:necessity,basicLogicOnNecessityExample:{solved:logic.solved,steps:logic.steps,remaining:logic.board.filter(n=>!n).length},scopeNote:'Classical equivalence is broader than Miracle-preserving equivalence. No claim that arbitrary classical digit/row/column permutations preserve Miracle rules. Unique and rule-essential does not imply a human-solvable difficulty grade.'};
const output=path.join(__dirname,'../evidence/diversity/miracle-space.json');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2));
console.log(JSON.stringify({output,fullCount:full.solutionCount,complete:full.complete,nodes:full.nodes,maxNodes,classes,necessity:necessity.map(x=>({omit:x.omit,count:x.solutionCount,exhausted:x.exhausted})),basicLogic:report.basicLogicOnNecessityExample,elapsedMs:report.elapsedMs},null,2));
if(full.exhausted||necessity.some(x=>x.exhausted)){process.exitCode=1;}else{
 assert(full.complete);assert.equal(full.solutionCount,72);assert.equal(classes.classicGroup,1);assert.equal(classes.dihedral,9);assert.equal(classes.dihedralAndDigitInversion,5);
 assert.equal(necessity[0].solutionCount,1);assert(necessity[0].complete);assert(necessity.slice(1).every(x=>x.solutionCount===2));
}
