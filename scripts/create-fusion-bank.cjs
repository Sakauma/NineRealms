/* Deterministic offline authoring; no human-difficulty claims or runtime generation. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),E=require('../src/engine.js');
let state=1;const random=()=>((state=Math.imul(state,1664525)+1013904223>>>0)/4294967296),pick=a=>a[Math.floor(random()*a.length)];
function shuffle(a){a=a.slice();for(let i=a.length-1;i;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
const neighbors=(i,diagonal=false)=>Array.from({length:81},(_,j)=>j).filter(j=>j!==i&&(diagonal?Math.max(Math.abs(Math.floor(i/9)-Math.floor(j/9)),Math.abs(i%9-j%9))===1:Math.abs(Math.floor(i/9)-Math.floor(j/9))+Math.abs(i%9-j%9)===1));
function cagesFor(solution){const left=new Set(Array.from({length:81},(_,i)=>i)),cages=[];
 while(left.size){let cells=[Math.min(...left)],values=new Set([solution[cells[0]]]);left.delete(cells[0]);const size=pick([2,3,3,4]);
  while(cells.length<size){const frontier=[...new Set(cells.flatMap(i=>neighbors(i)))].filter(i=>left.has(i)&&!values.has(solution[i]));if(!frontier.length)break;const i=pick(frontier);cells.push(i);left.delete(i);values.add(solution[i]);}
  if(cells.length===1){const c=cages.find(c=>c.cells.length<5&&!c.cells.some(i=>solution[i]===solution[cells[0]])&&c.cells.some(i=>neighbors(i).includes(cells[0])));if(c){c.cells.push(cells[0]);c.sum+=solution[cells[0]];continue;}}
  cages.push({cells:cells.sort((a,b)=>a-b),sum:cells.reduce((s,i)=>s+solution[i],0),unique:true});
 }return cages;
}
function linesFor(solution){const lines=[],used=new Set(),counts=Array(81).fill(0);
 for(let attempt=0;attempt<120&&lines.length<6;attempt++){
  let cells=[pick(Array.from({length:81},(_,i)=>i).filter(i=>solution[i]<5&&counts[i]<2))],wanted=pick([3,3,4,4,5]);
  while(cells.length<wanted){const candidates=neighbors(cells.at(-1),true).filter(i=>!cells.includes(i)&&solution[i]>solution[cells.at(-1)]&&counts[i]<2);if(!candidates.length)break;cells.push(pick(candidates));}
  if(cells.length<3||used.has(cells.join(',')))continue;used.add(cells.join(','));cells.forEach(i=>counts[i]++);lines.push({type:'thermo',cells});
 }return lines;
}
function signature(b){const forms=[];for(let reflect=0;reflect<2;reflect++)for(let rotation=0;rotation<4;rotation++){const grid=b.map((_,i)=>{let r=Math.floor(i/9),c=i%9;if(reflect)c=8-c;for(let k=0;k<rotation;k++)[r,c]=[c,8-r];return b[r*9+c];}),map=new Map();forms.push(grid.map(n=>{if(!map.has(n))map.set(n,map.size+1);return map.get(n);}).join(''));}return forms.sort()[0];}
const old=require('../src/variant-bank.js').filter(p=>p.mode==='thermo-killer'),seen=new Set(old.map(p=>signature(p.solution))),bank=[],reports=[];
for(const [difficulty,target] of [['easy',28],['medium',22],['hard',14]])for(let sample=0;sample<2;sample++){
 let accepted=false;
 for(let attempt=0;attempt<160&&!accepted;attempt++){
  state=1009+sample*811+attempt*331+target*100003;
  const p=E.getPuzzle('hard','fusion-structure-'+difficulty+'-'+sample+'-'+attempt,'classic'),solution=p.solution.slice();if(seen.has(signature(solution)))continue;
  const cages=cagesFor(solution),lines=linesFor(solution);if(lines.length<5||cages.filter(c=>c.cells.length===1).length>2)continue;
  const clues=E.normalizeClues('thermo-killer',{version:1,cages,lines}),context={mode:'thermo-killer',clues},givens=solution.slice();let count=81;
  for(const i of shuffle(Array.from({length:81},(_,i)=>i))){if(count<=target)break;const n=givens[i];givens[i]=0;const proof=E.analyzeSolutions(givens,context,{limit:2,maxNodes:12000});if(proof.count===1&&!proof.exhausted)count--;else givens[i]=n;}
  if(count!==target)continue;
  const reduced=[['killer',{version:1,cages}],['thermo',{version:1,lines}]].map(([mode,clues])=>E.analyzeSolutions(givens,{mode,clues},{limit:2,maxNodes:100000,timeLimitMs:1000}));if(reduced.some(r=>r.count!==2||r.exhausted))continue;
  const board=givens.slice();let placements=0,joint=0;
  while(!board.every(Boolean)){const singles=board.map((v,i)=>v?null:{i,values:E.candidates(board,i,context)}).filter(c=>c&&c.values.length===1);if(!singles.length)break;
   const c=singles[0],e=E.getFusionCandidateEvidence(board,c.i,context);if(e.cage.length>1&&e.thermo.length>1)joint++;board[c.i]=c.values[0];placements++;
  }
  if(!joint)continue;
  const id='F-thermo-killer-'+difficulty+'-v2-'+(sample+1),proof=E.analyzeSolutions(givens,context,{limit:2,maxNodes:250000,timeLimitMs:1000});if(proof.count!==1||proof.exhausted)continue;
  bank.push({id,mode:'thermo-killer',difficulty,text:givens.join(''),solution,clues,variantEssential:true,givenCount:count});seen.add(signature(solution));
  reports.push({id,template:p.sourceId,attempt,sourceSignature:signature(solution),givenCount:count,cages:cages.length,thermometers:lines.length,fullUniqueNodes:proof.nodes,withoutCages:reduced[1].count,withoutThermometers:reduced[0].count,singlePlacements:placements,jointOnlySingles:joint,completeBySingles:board.every(Boolean),solutionHash:crypto.createHash('sha256').update(JSON.stringify(solution)).digest('hex')});accepted=true;console.log(JSON.stringify(reports.at(-1)));
 }
 if(!accepted)throw Error('No verified new structure for '+difficulty+'/'+sample);
}
if(process.argv.includes('--write')){fs.writeFileSync(path.join(__dirname,'../src/fusion-bank.js'),'/* Six original clue layouts on distinct valid grids; density tiers, not human ratings. */\n(function(root,factory){if(typeof module==="object"&&module.exports)module.exports=factory();else root.SudokuFusionBank=factory();})(typeof globalThis!=="undefined"?globalThis:this,function(){return '+JSON.stringify(bank)+';});\n');fs.mkdirSync(path.join(__dirname,'../evidence/fusion'),{recursive:true});fs.writeFileSync(path.join(__dirname,'../evidence/fusion/authoring.json'),JSON.stringify(reports,null,2)+'\n');}

if(process.argv.includes('--check'))require('node:assert/strict').deepEqual(require('../src/fusion-bank.js'),bank);
