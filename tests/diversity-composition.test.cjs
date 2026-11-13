/* Geometry and rule audit only. No claims about rendered pixels or minimum solving difficulty. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const E=require('../src/engine'),S=require('../src/diversity-source'),C=require('../src/diversity-clues'),D=require('../src/puzzle-diversity');
const modes=['thermo','arrow','renban','whispers','thermo-killer'];
const adjacent=(a,b)=>Math.abs(Math.floor(a/9)-Math.floor(b/9))+Math.abs(a%9-b%9)===1;
const box=i=>Math.floor(i/27)*3+Math.floor(i%9/3);
const solutions=Array.from({length:100},(_,i)=>S.generate({mode:'classic',seed:'composition-'+i}).solution),rows=[];
for(const mode of modes){
 const classes=new Set(),lengthSets=new Set(),counts={},lengthHistogram={},boxHistogram={};let mixed=0,cross=0,long=0,maxMs=0,totalMs=0,declines=0;
 for(let i=0;i<100;i++){
  const solution=solutions[i],seed='composition-'+i,t=performance.now();let clues;
  try{clues=C.build({mode,solution,seed});}catch(error){assert.equal(error.code,'DIVERSITY_LAYOUT_UNAVAILABLE');declines++;continue;}
  const ms=performance.now()-t;totalMs+=ms;maxMs=Math.max(maxMs,ms);
  assert.deepEqual(E.normalizeClues(mode,clues),clues);assert(E.validateComplete(solution,{mode,clues}));
  assert.deepEqual(C.build({mode,solution,seed}),clues);
  const lines=clues.lines;assert(lines.length>=2&&lines.length<=4);assert(lines.reduce((n,l)=>n+l.cells.length,0)<=18);
  const cells=lines.flatMap(l=>l.cells);assert.equal(new Set(cells).size,cells.length);
  lines.forEach((line,j)=>{
   assert(line.cells.length>=3&&line.cells.length<=(mode==='arrow'?5:6));
   line.cells.forEach((cell,k)=>{
    if(k)assert(adjacent(cell,line.cells[k-1]));
    for(let p=0;p<k-1;p++)assert(!adjacent(cell,line.cells[p]),'no self-touching loop');
    for(let other=j+1;other<lines.length;other++)assert(lines[other].cells.every(c=>!adjacent(cell,c)),'one-cell separation between distinct routes');
   });
  });
  const description=C.describeLayout(clues),lengths=lines.map(l=>l.cells.length),boxes=new Set(cells.map(box)),crossCount=lines.filter(l=>new Set(l.cells.map(box)).size>1).length;
  assert.equal(description.lineCount,lines.length);assert.deepEqual(description.lineLengths,lengths);assert.equal(description.markedCells,cells.length);assert.equal(description.coveredBoxes,boxes.size);assert.equal(description.crossBoxLines,crossCount);assert.equal(description.mixedLengths,new Set(lengths).size>1);
  if(description.mixedLengths)mixed++;if(crossCount)cross++;if(lengths.some(n=>n>=5))long++;
  counts[lines.length]=(counts[lines.length]||0)+1;lengths.forEach(n=>lengthHistogram[n]=(lengthHistogram[n]||0)+1);boxHistogram[boxes.size]=(boxHistogram[boxes.size]||0)+1;
  lengthSets.add(lengths.slice().sort().join(','));classes.add(D.layoutSignature(mode,clues,{includeValues:false}));
 }
 assert(classes.size>=90);assert(lengthSets.size>=5,mode+' must have multiple achieved length compositions');assert(mixed>=20);assert(cross>=60);assert(long>=5);assert(Object.keys(counts).length>=2);
 rows.push({mode,requests:100,successes:100-declines,qualityDeclines:declines,distinctD4Geometry:classes.size,distinctLengthCompositions:lengthSets.size,lineCountHistogram:counts,lineLengthHistogram:lengthHistogram,coveredBoxHistogram:boxHistogram,mixedLengthPuzzles:mixed,puzzlesWithCrossBoxLines:cross,puzzlesWithLengthAtLeast5:long,meanBuildMs:Math.round(totalMs/(100-declines)*100)/100,maxBuildMs:Math.round(maxMs)});
}
const context=vm.createContext({SudokuEngine:E});vm.runInContext(C.workerSource(),context);
for(const mode of modes){const input={mode,solution:solutions[0],seed:'worker-composition'},clues=C.build(input);assert.deepEqual(JSON.parse(JSON.stringify(context.NineRealmsDiversityClues.build(input))),clues);assert.deepEqual(JSON.parse(JSON.stringify(context.NineRealmsDiversityClues.describeLayout(clues))),C.describeLayout(clues));}
const report={version:1,method:'100 truly new solved boards per mode; achieved geometry not intended profile; D4 geometry canonicalization; generation time excludes solution construction',rows};
fs.mkdirSync('evidence/diversity',{recursive:true});fs.writeFileSync('evidence/diversity/composition-audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
console.log('PASS readable composition: exact rules, measured length/space diversity, separated orthogonal routes, bounded coverage, deterministic seeds and worker parity. Not a screenshot audit.');
