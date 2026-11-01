// Offline, deterministic data-only import. Run against the current pre-import engine.
'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),cp=require('node:child_process');
const E=require('../src/engine.js');
const root='.build-cache/sudoku-exchange',perTier=3000;
const exact=new Set(),symmetry=new Set();
function canonical(text){
 const keys=[];
 for(let mirror=0;mirror<2;mirror++)for(let rotation=0;rotation<4;rotation++){
  const digits=new Map();let next=1,key='';
  for(let r=0;r<9;r++)for(let c=0;c<9;c++){
   let rr=r,cc=mirror?8-c:c;for(let k=0;k<rotation;k++){let old=rr;rr=cc;cc=8-old}
   const v=text[rr*9+cc];if(v==='0')key+='0';else{if(!digits.has(v))digits.set(v,next++);key+=digits.get(v)}
  }keys.push(key);
 }return keys.sort()[0];
}
for(const p of E.getSeedPuzzles().filter(p=>p.mode==='classic'&&!p.id.startsWith('SE-'))){const s=p.givens.join('');exact.add(s);symmetry.add(canonical(s))}
const additions=[],answers=[],report={source:'https://github.com/grantm/sudoku-exchange-puzzle-bank',commit:cp.execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),license:'Unlicense / public domain',perTier,files:{},tiers:{},deduplication:'exact plus digit-renaming / 8 square symmetries, against existing classic and all imported puzzles; not full band/stack isomorphism'};
for(const tier of ['easy','medium','hard','diabolical']){
 const path=root+'/'+tier+'.txt',bytes=fs.readFileSync(path),lines=bytes.toString().trimEnd().split('\n');
 report.files[tier]={bytes:bytes.length,records:lines.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
 if(tier==='diabolical')continue;
 const stat=report.tiers[tier]={scanned:0,accepted:0,duplicate:0,invalid:0,budgetExceeded:0};
 for(const line of lines){
  stat.scanned++;const [hash,text,score]=line.trim().split(/\s+/);
  if(!/^[0-9]{81}$/.test(text)||crypto.createHash('sha1').update(text).digest('hex').slice(0,12)!==hash||!Number.isFinite(Number(score)))throw Error('Invalid upstream record');
  const key=canonical(text);if(exact.has(text)||symmetry.has(key)){stat.duplicate++;continue}
  const board=Array.from(text,Number),a=E.analyzeSolutions(board,'classic',{limit:2,maxNodes:1000000});
  if(a.exhausted){stat.budgetExceeded++;continue}
  if(a.count!==1||!E.validateComplete(a.solution,'classic')||!board.every((v,i)=>!v||v===a.solution[i])){stat.invalid++;continue}
  const id='SE-'+tier[0].toUpperCase()+'-'+hash.toUpperCase();
  additions.push({id,mode:'classic',difficulty:tier,text,rating:'SE '+score});answers.push({id,solution:a.solution.join('')});
  exact.add(text);symmetry.add(key);stat.accepted++;if(stat.accepted===perTier)break;
 }
 if(stat.accepted!==perTier)throw Error('Insufficient validated data for '+tier);
}
report.imported=additions.length;report.upstreamTotal=Object.values(report.files).reduce((s,f)=>s+f.records,0);
fs.mkdirSync('evidence/exchange',{recursive:true});
fs.writeFileSync('.build-cache/exchange-validated-bank.json',JSON.stringify(additions));
fs.writeFileSync('evidence/exchange/answers.json',JSON.stringify(answers));
fs.writeFileSync('data/sudoku-exchange/import-report.json',JSON.stringify(report,null,2)+'\n');console.log(report);
