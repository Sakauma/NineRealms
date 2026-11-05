/* Optional numerical audit of a renderer proposal. No browser is executed. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const F=require('./variant-renderer-fixture.cjs'),G=require('./numeral-glyph-metrics.cjs'),M=require('./svg-path-metrics.cjs'),Engine=require('../src/engine.js');
const source=path.resolve(process.argv[2]||path.join(__dirname,'../src/variant-view.js'));
const output=process.argv[3],candidateStep=Number(process.argv[4]||28),seedFilter=process.argv[5];
if(!Number.isFinite(candidateStep)||candidateStep<=0)throw Error('invalid candidate center step');
const env={SudokuEngine:Engine,document:{createElementNS:(_,tag)=>new F.SvgNode(tag)}};
vm.runInNewContext(fs.readFileSync(source,'utf8'),env);const renderer=env.SudokuVariantView,svg=new F.SvgNode('svg');
const heads=[];
const puzzles=F.semanticSeeds().filter(p=>p.mode==='arrow'&&(!seedFilter||p.id===seedFilter));
if(process.argv[7]==='transforms'){
 const originals=puzzles.filter(p=>p.id.startsWith('V-arrow-easy-'));
 for(const puzzle of originals)for(let rotation=0;rotation<4;rotation++)for(const reflected of [false,true]){
  if(!rotation&&!reflected)continue;
  const copy=F.clone(puzzle);copy.id+='/'+rotation+'/'+reflected;
  const transform=cell=>{let x=cell%9,y=Math.floor(cell/9);if(reflected)x=8-x;for(let n=0;n<rotation;n++){const t=x;x=8-y;y=t;}return y*9+x;};
  copy.clues.lines=copy.clues.lines.map(l=>({...l,cells:l.cells.map(transform)}));puzzles.push(copy);
 }
}
for(const puzzle of puzzles){
 renderer.render(svg,puzzle);
 for(const node of F.descendants(svg).filter(n=>n.attrs['data-arrow-head']!==undefined)){
  const shape=M.samplePath(node.attrs.d).commands.map(c=>({x:c.values[0],y:c.values[1]}));
  heads.push({puzzle:puzzle.id,arrow:+node.attrs['data-arrow-head'],cell:+node.attrs['data-endpoint-cell'],shape,bounds:G.bounds(shape),stroke:+node.attrs['stroke-width']});
 }
}
const cases=[];
const configurations=process.argv[6]?JSON.parse(fs.readFileSync(process.argv[6],'utf8')):['main','notes'].flatMap(kind=>(kind==='main'?[46,57,62,80,90]:[17,30,31,37]).flatMap(size=>[.36,.388].map(baselineEm=>({kind,size,baselineEm}))));
const memo=new Map();
for(const config of configurations){
 const key=JSON.stringify(Object.fromEntries(Object.entries(config).filter(([k])=>!['name','fallback'].includes(k)).sort(([a],[b])=>a.localeCompare(b))));
 if(memo.has(key)){cases.push({...memo.get(key),...config});continue;}
 const {kind,size,baselineEm}=config;
 const step=config.candidateStep??candidateStep;
 const glyphs=Array.from({length:9},(_,i)=>G.placedGlyph(i+1,{size,baselineEm,weight:config.weight||'400'}));
 let count=0,target=0,neighbor=0,inkPairs=0,minClearance=Infinity;const examples=[];
 for(const head of heads){
  let collided=false,atTarget=false,atNeighbor=false;
  const fromX=Math.max(0,Math.floor((head.bounds.left-size)/100)),toX=Math.min(8,Math.floor((head.bounds.right+size)/100));
  const fromY=Math.max(0,Math.floor((head.bounds.top-size)/100)),toY=Math.min(8,Math.floor((head.bounds.bottom+size)/100));
  for(let row=fromY;row<=toY;row++)for(let col=fromX;col<=toX;col++)for(let digit=1;digit<=9;digit++){
   const cell=row*9+col,g=glyphs[digit-1];
   let cx=col*100+50,cy=row*100+50,sx=step,sy=step;
   if(config.cellPixels){
    const cp=config.cellPixels,scale=config.overlayScale||100/cp;
    const bx=config.replay?(col%3===2?1.5:1):config.strong?(col%3===2?3:1.5):(col===8?0:col%3===2?2:1);
    const by=config.replay?(row%3===2?1.5:1):config.strong?(row===2||row===5?3:1.5):(row===8?0:row===2||row===5?2:1);
    const bl=config.replay&&col%3===0?1.5:0,bt=config.replay&&row%3===0?1.5:0;
    cx=config.overlayScale?((config.boardBorder||0)+(col+.5)*cp)*scale:cx;
    cy=config.overlayScale?((config.boardBorder||0)+(row+.5)*cp)*scale:cy;
    cx+=(bl-bx)/2*scale;cy+=(bt-by)/2*scale;
    if(kind==='main'&&!config.replay)cx+=size*.0125;
    else {const insetX=config.noteInsetRatio!=null?(cp-bx-bl)*config.noteInsetRatio:config.noteInset,insetY=config.noteInsetRatio!=null?(cp-by-bt)*config.noteInsetRatio:config.noteInset;sx=(cp-bx-bl-2*insetX)/3*scale;sy=(cp-by-bt-2*insetY)/3*scale;}
   }
   const x=cx+(kind==='notes'?((digit-1)%3-1)*sx:0),y=cy+(kind==='notes'?(Math.floor((digit-1)/3)-1)*sy:0);
   const box={left:g.bounds.left+x,right:g.bounds.right+x,top:g.bounds.top+y,bottom:g.bounds.bottom+y},h=head.bounds,r=head.stroke/2;
   const lowerBound=Math.hypot(Math.max(box.left-h.right,h.left-box.right,0),Math.max(box.top-h.bottom,h.top-box.bottom,0))-r;
   if(lowerBound-(config.glyphHaloEm||0)*size>Math.max(0,minClearance))continue;
   const gap=G.strokeGlyphClearance(head.shape.map(p=>({x:p.x-x,y:p.y-y})),head.stroke,g)-(config.glyphHaloEm||0)*size;
   minClearance=Math.min(minClearance,gap);
   if(gap<0){collided=true;if(cell===head.cell)atTarget=true;else atNeighbor=true;inkPairs++;
    if(examples.length<12)examples.push({puzzle:head.puzzle,arrow:head.arrow,targetCell:head.cell,hitCell:cell,digit,clearance:gap});
   }
  }
  count+=collided;target+=atTarget;neighbor+=atNeighbor;
 }
 const result={...config,kind,size,baselineEm,heads:heads.length,collidingHeads:count,targetCellHeads:target,neighborCellHeads:neighbor,inkPairs,minClearance:Number.isFinite(minClearance)?minClearance:null,examples};memo.set(key,result);cases.push(result);
}
const outside=heads.filter(h=>{const c=M.center(h.cell);return h.shape.some(p=>Math.abs(p.x-c.x)+h.stroke/2>50||Math.abs(p.y-c.y)+h.stroke/2>50);});
const report={renderer:source,candidateStep,description:'Actual bundled400/600 outlines at explicit modeled placements with configured contour allowance. Main tests all9 possible values per nearby cell independently; notes tests all9 simultaneously. Not browser/native geometry.',heads:heads.length,headsStraddlingFinalCell:outside.length,straddlingExamples:outside.slice(0,10),cases};
if(output)fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({renderer:source,heads:heads.length,headsStraddlingFinalCell:outside.length,cases:cases.map(({examples,...c})=>c)},null,2));
