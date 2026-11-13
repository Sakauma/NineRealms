'use strict';
const E=require('../src/engine.js');
const modes=['odd-even','palindrome','greater','kropki','xv','renban','whispers','between','lockout','entropic','modular','region-sum','sandwich','skyscraper','xsum','littlekiller','clone','quadruple'];
const fields={'odd-even':'parity',palindrome:'lines',greater:'edges',kropki:'edges',xv:'edges',renban:'lines',whispers:'lines',between:'lines',lockout:'lines',entropic:'lines',modular:'lines','region-sum':'lines',sandwich:'outside',skyscraper:'outside',xsum:'outside',littlekiller:'outside',clone:'clones',quadruple:'quadruples'};
function classic(b){return Array.isArray(b)&&b.length===81&&b.every(n=>Number.isInteger(n)&&n>=1&&n<=9)&&Array.from({length:27},(_,i)=>Array.from({length:9},(_,j)=>i<9?i*9+j:i<18?j*9+i-9:(Math.floor((i-18)/3)*3+Math.floor(j/3))*9+(i-18)%3*3+j%3)).every(u=>new Set(u.map(i=>b[i])).size===9);}
const sum=a=>a.reduce((s,n)=>s+n,0);
// Separate mathematical oracle, independent of engine constraint predicates.
function valid(b,clues){
 if(!classic(b))return false;
 for(const p of clues.parity||[])if((b[p.cell]%2===1)!==(p.parity==='odd'))return false;
 for(const e of clues.edges||[]){const [a,c]=e.cells.map(i=>b[i]);if(e.type==='greater'?!(a>c):e.type==='xv'?a+c!==e.value:e.type==='kropki-white'?Math.abs(a-c)!==1:e.type==='kropki-black'?a!==2*c&&c!==2*a:true)return false;}
 for(const line of clues.lines||[]){const v=line.cells.map(i=>b[i]),n=v.length,t=line.type;
  if(t==='palindrome'&&!v.every((x,i)=>x===v[n-1-i]))return false;
  if(t==='renban'&&(new Set(v).size!==n||Math.max(...v)-Math.min(...v)!==n-1))return false;
  if(t==='whispers'&&!v.slice(1).every((x,i)=>Math.abs(x-v[i])>=5))return false;
  if(t==='between'||t==='lockout'){const low=Math.min(v[0],v[n-1]),high=Math.max(v[0],v[n-1]);if(t==='between'?high-low<2||!v.slice(1,-1).every(x=>x>low&&x<high):high-low<4||!v.slice(1,-1).every(x=>x<low||x>high))return false;}
  if(t==='entropic'||t==='modular')for(let i=0;i<n-2;i++)if(new Set(v.slice(i,i+3).map(x=>t==='entropic'?Math.floor((x-1)/3):(x-1)%3)).size!==3)return false;
  if(t==='region-sum'){const parts=[];let previous=-1;line.cells.forEach((cell,i)=>{const r=Math.floor(cell/27)*3+Math.floor(cell%9/3);if(r!==previous){parts.push([]);previous=r;}parts.at(-1).push(v[i]);});if(new Set(parts.map(sum)).size!==1)return false;}
 }
 for(const o of clues.outside||[]){const v=o.cells.map(i=>b[i]);if(o.type==='littlekiller'&&sum(v)!==o.value)return false;if(o.type==='xsum'&&sum(v.slice(0,v[0]))!==o.value)return false;
  if(o.type==='sandwich'&&sum(v.slice(Math.min(v.indexOf(1),v.indexOf(9))+1,Math.max(v.indexOf(1),v.indexOf(9))))!==o.value)return false;
  if(o.type==='skyscraper'){let high=0,seen=0;for(const n of v)if(n>high){high=n;seen++;}if(seen!==o.value)return false;}
 }
 for(const c of clues.clones||[])if(!c.a.every((a,i)=>b[a]===b[c.b[i]]))return false;
 for(const q of clues.quadruples||[]){const values=q.cells.map(i=>b[i]);for(const n of q.values){const i=values.indexOf(n);if(i<0)return false;values.splice(i,1);}}
 return true;
}
function alternatives(board){const out=[];
 for(let a=1;a<9;a++)for(let b=a+1;b<=9;b++)out.push(board.map(n=>n===a?b:n===b?a:n));
 for(const axis of ['row','col'])for(let band=0;band<3;band++)for(let a=0;a<2;a++)for(let b=a+1;b<3;b++)out.push(board.map((_,i)=>{let r=Math.floor(i/9),c=i%9;if(axis==='row'){if(r===band*3+a)r=band*3+b;else if(r===band*3+b)r=band*3+a;}else{if(c===band*3+a)c=band*3+b;else if(c===band*3+b)c=band*3+a;}return board[r*9+c];}));
 return out;
}
function openPuzzle(mode){const p=E.getPuzzle('easy','full-rule-'+mode,mode),field=fields[mode],all=alternatives(p.solution);if(!field)throw Error('not an extension mode');
 for(const clue of p.clues[field]){const clues=E.normalizeClues(mode,{version:1,[field]:[clue]}),good=all.find(b=>valid(b,clues)),bad=all.find(b=>!valid(b,clues));if(!good||!bad)continue;
  const cells=clue.cell!==undefined?[clue.cell]:clue.cells||clue.a.concat(clue.b),partial=Array(81).fill(0);cells.forEach(i=>partial[i]=bad[i]);
  return {mode,difficulty:'easy',id:'rule-open-'+mode,sourceId:null,givens:Array(81).fill(0),solution:p.solution.slice(),other:good,bad,partial,clues};
 }
 throw Error('Need an independent alternative/violation witness for '+mode);
}
module.exports={modes,valid,classic,openPuzzle};
