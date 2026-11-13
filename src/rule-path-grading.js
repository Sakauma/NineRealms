/* Deterministic parallel-rule proof depth, not clue density or minimum human difficulty. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./engine.js'));
  else root.NineRealmsRulePathGrading=factory(root.SudokuEngine);
})(typeof globalThis!=='undefined'?globalThis:this,function createRulePathGrading(Engine){
  'use strict';
  var VERSION=1;
  function thresholds(mode){ return ['killer','thermo-killer','nonconsecutive'].indexOf(mode)>=0?{easyMax:2,mediumMax:3}:{easyMax:3,mediumMax:5}; }
  function tier(result,mode){
    if(!result||result.version!==VERSION||!result.solved||result.status!=='rated'||result.rounds<1||mode&&result.mode!==mode)return null;
    var limits=thresholds(mode||result.mode);
    return result.rounds<=limits.easyMax?'easy':result.rounds<=limits.mediumMax?'medium':'hard';
  }
  function analyze(givens,context,options){
    options=options||{};
    var mode=typeof context==='string'?context:context&&context.mode||'classic';
    var result={version:VERSION,method:'parallel-rule-singles-v1',mode:mode,status:'invalid',solved:false,rounds:0,placements:0,
      nakedSingles:0,hiddenSingles:0,initialChoices:0,minChoices:null,initialChoiceRatio:0,ruleReductionPlacements:null,
      givenCount:0,remaining:0,level:null,reason:'题面或规则无效'};
    if(options.trace===true)result.trace=[];
    var cfg,layout,units,board;
    try{
      cfg={mode:mode,clues:Engine.normalizeClues(mode,typeof context==='object'?context.clues:undefined)};
      layout=Engine.getLayout(cfg);
      if(!Array.isArray(givens)||givens.length!==layout.cellCount||!givens.every(function(n){return Number.isInteger(n)&&n>=0&&n<=9;}))return result;
      board=givens.slice();result.givenCount=board.filter(Boolean).length;result.remaining=board.length-result.givenCount;
      if(Engine.getConflicts(board,cfg).length)return result;
      units=Engine.getUnits(cfg).filter(function(u){return Array.isArray(u.cells)&&u.cells.length===9;});
    }catch(error){return result;}
    if(options.maxRounds!==undefined&&(!Number.isInteger(options.maxRounds)||options.maxRounds<0||options.maxRounds>369)){result.reason='推演轮数预算无效';return result;}
    var max=options.maxRounds===undefined?layout.cellCount:options.maxRounds;
    var compareClassic=board.length===81&&mode!=='jigsaw';
    result.ruleReductionPlacements=compareClassic?0:null;
    var originalEmpty=result.remaining;
    while(result.remaining){
      if(result.rounds>=max){result.status='budget';result.reason='达到确定性推演轮数上限';return result;}
      var available=board.map(function(n,i){return n?[]:Engine.candidates(board,i,cfg);});
      if(available.some(function(a,i){return !board[i]&&!a.length;})){result.reason='出现无候选空格';return result;}
      var moves=new Map(),contradiction=false;
      function add(index,digit,kind,unit){
        var old=moves.get(index);
        if(old&&old.digit!==digit){contradiction=true;return;}
        if(!old)moves.set(index,{index:index,digit:digit,kind:kind,unit:unit===undefined?null:unit});
      }
      available.forEach(function(a,i){if(!board[i]&&a.length===1)add(i,a[0],'naked-single');});
      units.forEach(function(unit,u){
        for(var d=1;d<=9;d++){
          if(unit.cells.some(function(i){return board[i]===d;}))continue;
          var cells=unit.cells.filter(function(i){return !board[i]&&available[i].indexOf(d)>=0;});
          if(!cells.length)contradiction=true;
          else if(cells.length===1)add(cells[0],d,'hidden-single',u);
        }
      });
      if(contradiction){result.reason='区域或单值推导互相矛盾';return result;}
      var wave=Array.from(moves.values()).sort(function(a,b){return a.index-b.index;});
      if(!wave.length){result.status='beyond-supported';result.reason='基础规则推演无法继续，未读答案或使用猜测';return result;}
      if(!result.rounds){result.initialChoices=wave.length;result.initialChoiceRatio=wave.length/originalEmpty;}
      result.minChoices=result.minChoices===null?wave.length:Math.min(result.minChoices,wave.length);
      if(compareClassic)wave.forEach(function(move){if(Engine.candidates(board,move.index,'classic').length>available[move.index].length)result.ruleReductionPlacements++;});
      if(result.trace)result.trace.push(wave.map(function(m){return {index:m.index,digit:m.digit,kind:m.kind,unit:m.unit};}));
      wave.forEach(function(move){board[move.index]=move.digit;result[move.kind==='naked-single'?'nakedSingles':'hiddenSingles']++;});
      result.rounds++;result.placements+=wave.length;result.remaining-=wave.length;
      if(Engine.getConflicts(board,cfg).length){result.reason='同步推导结果违反规则';return result;}
    }
    result.solved=Engine.validateComplete(board,cfg);
    result.status=result.solved?'rated':'invalid';
    result.level=tier(result,mode);
    result.reason=result.solved?(result.rounds?'基础规则完整推演已完成；层级仅表示同步依赖深度':'完整题面无需推理，不分层'):'完整盘不符合规则';
    return result;
  }
  return {version:VERSION,analyze:analyze,tier:tier,thresholds:thresholds,
    workerSource:function(){return 'var NineRealmsRulePathGrading=('+createRulePathGrading.toString()+')(SudokuEngine);';}};
});
