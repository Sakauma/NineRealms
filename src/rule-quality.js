/* Reproducible rule-ablation evidence. Not a human difficulty or necessity proof. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory(require('./engine.js'),require('./rule-path-grading.js'));
 else root.NineRealmsRuleQuality=factory(root.SudokuEngine,root.NineRealmsRulePathGrading);
})(typeof globalThis!=='undefined'?globalThis:this,function createRuleQuality(Engine,RulePath){
 'use strict';
 var MODES=['thermo','killer','arrow','thermo-killer','renban','whispers','odd-even','greater','kropki','xv','quadruple','sandwich','skyscraper','xsum','littlekiller','palindrome','between','lockout','entropic','modular','region-sum','clone'];
 function supported(mode){return MODES.indexOf(mode)>=0;}
 function classicMoves(board){
  var candidates=board.map(function(n,i){return n?[]:Engine.candidates(board,i,'classic');}),moves=new Map();
  candidates.forEach(function(a,i){if(!board[i]&&a.length===1)moves.set(i,a[0]);});
  Engine.getUnits('classic').filter(function(u){return u.cells.length===9;}).forEach(function(u){for(var d=1;d<=9;d++){
   if(u.cells.some(function(i){return board[i]===d;}))continue;
   var places=u.cells.filter(function(i){return !board[i]&&candidates[i].indexOf(d)>=0;});if(places.length===1)moves.set(places[0],d);
  }});return {moves:moves,candidates:candidates};
 }
 function analyze(givens,context,options){
  options=options||{};var mode=typeof context==='string'?context:context&&context.mode;
  var out={version:1,method:'classic-ablation-parallel-singles-v1',mode:mode,status:'unsupported',fullSolved:false,classicSolved:false,classicRemaining:0,classicPlacements:0,classicSolutionCount:0,classicSearchPerformed:false,classicSearchExhausted:false,classicSearchNodes:0,rounds:0,initialChoices:0,initialChoiceRatio:0,minChoices:null,breakthroughCells:0,breakthroughWaves:0,affectedCells:0,affectedWaves:0,breakthroughRows:0,breakthroughColumns:0,breakthroughBoxes:0,unlockedClassicCells:0,unlockedClassicWaves:0,unlockedClassicBoxes:0,breakthroughWaveIndices:[]};
  if(!supported(mode))return out;
  // Recompute proofs internally: caller-provided evidence must not manufacture a grade.
  var full=RulePath.analyze(givens,context,{trace:true});
  out.fullSolved=full.solved;out.rounds=full.rounds;out.initialChoices=full.initialChoices;out.initialChoiceRatio=full.initialChoiceRatio;out.minChoices=full.minChoices;
  if(!full.solved||!full.rounds){out.status='unproven';return out;}
  var classic=RulePath.analyze(givens,'classic',{trace:true});out.classicSolved=classic.solved;out.classicRemaining=classic.remaining;out.classicPlacements=classic.placements;
  if(classic.status!=='rated'&&classic.status!=='beyond-supported'){out.status='invalid';return out;}
  if(classic.solved)out.classicSolutionCount=1;
  else{
   var search=Engine.analyzeSolutions(givens,'classic',{limit:2,maxNodes:12000});
   out.classicSearchPerformed=true;out.classicSolutionCount=search.count;out.classicSearchExhausted=search.exhausted;out.classicSearchNodes=search.nodes;
  }
  var stalled=givens.slice();classic.trace.forEach(function(wave){wave.forEach(function(m){stalled[m.index]=m.digit;});});
  var board=givens.slice(),rows=new Set(),columns=new Set(),boxes=new Set(),unlockedBoxes=new Set();
  full.trace.forEach(function(wave,w){
   var baseline=classicMoves(board),affected=0,breakthrough=0,unlocked=0;
   wave.forEach(function(move){
    var i=move.index,actual=Engine.candidates(board,i,context);
    if(actual.length<baseline.candidates[i].length){affected++;out.affectedCells++;}
    if(baseline.moves.get(i)!==move.digit){
     breakthrough++;out.breakthroughCells++;rows.add(Math.floor(i/9));columns.add(i%9);boxes.add(Math.floor(i/27)*3+Math.floor(i%9/3));
    }
    else if(!stalled[i]){unlocked++;out.unlockedClassicCells++;unlockedBoxes.add(Math.floor(i/27)*3+Math.floor(i%9/3));}
   });
   if(unlocked)out.unlockedClassicWaves++;
   if(affected)out.affectedWaves++;if(breakthrough){out.breakthroughWaves++;out.breakthroughWaveIndices.push(w+1);}
   wave.forEach(function(move){board[move.index]=move.digit;});
  });
  out.unlockedClassicBoxes=unlockedBoxes.size;out.breakthroughRows=rows.size;out.breakthroughColumns=columns.size;out.breakthroughBoxes=boxes.size;out.status='verified';return out;
 }
 function summary(evidence){
  if(!evidence||evidence.version!==1||evidence.status!=='verified')return null;
  var result={};['version','method','mode','status','fullSolved','classicSolved','classicRemaining','classicPlacements','classicSolutionCount','classicSearchPerformed','classicSearchExhausted','classicSearchNodes','rounds','initialChoices','minChoices','breakthroughCells','breakthroughWaves','affectedCells','affectedWaves','breakthroughRows','breakthroughColumns','breakthroughBoxes','unlockedClassicCells','unlockedClassicWaves','unlockedClassicBoxes'].forEach(function(k){result[k]=evidence[k];});
  return result;
 }
 function sameSummary(left,right){
  var a=summary(left),b=summary(right);if(!a||!b)return false;
  var keys=Object.keys(a);return Object.keys(left).length===keys.length&&Object.keys(right).length===keys.length&&keys.every(function(k){return a[k]===b[k];});
 }
 function validate(givens,context,record){return sameSummary(record,summary(analyze(givens,context)));}
 function accepts(evidence,difficulty){
  if(!evidence||evidence.version!==1||evidence.status!=='verified'||!evidence.fullSolved)return false;
  if(difficulty==='easy')return evidence.affectedCells>0;
  if(evidence.classicSolved||evidence.classicRemaining<1||!evidence.classicSearchPerformed||evidence.classicSolutionCount!==2||evidence.classicSearchExhausted)return false;
  if(difficulty==='medium')return evidence.breakthroughCells>=2&&evidence.breakthroughWaves>=1;
  if(difficulty==='hard')return evidence.breakthroughCells>=3&&evidence.breakthroughWaves>=2&&evidence.breakthroughBoxes>=2;
  return false;
 }
 return {version:1,supported:supported,supportedModes:function(){return MODES.slice();},analyze:analyze,accepts:accepts,summary:summary,sameSummary:sameSummary,validate:validate,workerSource:function(){return 'var NineRealmsRuleQuality=('+createRuleQuality.toString()+')(SudokuEngine,NineRealmsRulePathGrading);';}};
});
