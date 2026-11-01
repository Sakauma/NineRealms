/* Nine Realms — progressive, evidence-based hints. No board mutations. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./engine.js"));
  else root.SudokuHints = factory(root.SudokuEngine);
})(typeof globalThis !== "undefined" ? globalThis : this, function (Engine) {
  "use strict";

  function isBoard(value, complete, length) {
    return Array.isArray(value) && value.length === length && value.every(function (n) {
      return Number.isInteger(n) && n >= (complete ? 1 : 0) && n <= 9;
    });
  }

  function ruleNames(mode) {
    if (mode === "diagonal") return "行、列、宫和所在对角线";
    if (mode === "hyper") return "行、列、宫和所在额外窗口";
    if (mode === "knight") return "行、列、宫及马步相隔格";
    return "行、列和宫";
  }

  var TECHNIQUES = { 'naked-single': '单格唯一候选', 'hidden-single': '区域唯一位置', 'locked-candidate': '锁定候选', 'naked-pair': '显性数对', 'hidden-pair': '隐性数对' };
  var LEVELS = { 'naked-single': 1, 'hidden-single': 1, 'locked-candidate': 2, 'naked-pair': 3, 'hidden-pair': 3 };
  function digits(mask) { var out=[];for(var n=1;n<=9;n++)if(mask&(1<<(n-1)))out.push(n);return out; }
  function cellName(i) { return '第 '+(Math.floor(i/9)+1)+' 行第 '+(i%9+1)+' 列'; }
  function classicMasks(board) { return board.map(function(v,i){return v?0:Engine.candidates(board,i,'classic').reduce(function(m,n){return m|(1<<(n-1));},0);}); }
  function plainClassic(context) {
    if(typeof context==='string')return context==='classic';
    if(!context||context.mode!=='classic')return false;
    var clues=context.clues;
    return !clues||typeof clues==='object'&&!Array.isArray(clues)&&Object.keys(clues).every(function(k){return k==='version'?clues[k]===1:['regions','cages','lines','edges','parity','outside','clones','quadruples'].indexOf(k)>=0&&Array.isArray(clues[k])&&clues[k].length===0;});
  }
  function nextClassic(board,masks) {
    var units=Engine.getUnits('classic');
    function placement(kind,index,value,focus,explanation) {
      return {kind:kind,technique:kind,index:index,value:value,focusCells:focus,title:TECHNIQUES[kind],observe:'检查高亮格及区域内的候选关系。',explanation:explanation,answer:cellName(index)+'应填入 '+value+'。点击“填入这一格”后才会修改棋盘。'};
    }
    function removal(kind,focus,changes,explanation) {
      if(!changes.length)return null;
      var after=masks.slice();changes.forEach(function(c){c.values.forEach(function(n){after[c.index]&=~(1<<(n-1));});});
      return {kind:'elimination',technique:kind,index:changes[0].index,value:0,focusCells:Array.from(new Set(focus.concat(changes.map(function(c){return c.index;})))),title:TECHNIQUES[kind],observe:'观察高亮区域中候选数字的位置关系；这一步只排除候选，不填数字。',explanation:explanation+' 可排除：'+changes.map(function(c){return cellName(c.index)+'的 '+c.values.join('、');}).join('；')+'。',answer:'应用后会以棋盘和已证明的推理替换全盘手写笔记，生成逻辑候选并完成本次排除；不会直接填入答案，可撤销以恢复原笔记。',eliminations:changes,candidateMasks:after};
    }
    for(var i=0;i<81;i++)if(!board[i]&&digits(masks[i]).length===1)return placement('naked-single',i,digits(masks[i])[0],[i].concat(Engine.getPeers(i,'classic')),cellName(i)+'依据行、列、宫和已证明的候选排除，只剩数字 '+digits(masks[i])[0]+'。');
    for(var u=0;u<units.length;u++)for(var n=1;n<=9;n++){
      var places=units[u].cells.filter(function(i){return !board[i]&&(masks[i]&(1<<(n-1)));});
      if(places.length===1)return placement('hidden-single',places[0],n,units[u].cells,units[u].label+'必须包含数字 '+n+'，而它只在'+cellName(places[0])+'的逻辑候选中出现。');
    }
    for(var a=0;a<units.length;a++)for(var digit=1;digit<=9;digit++){
      var positions=units[a].cells.filter(function(i){return masks[i]&(1<<(digit-1));});
      if(positions.length<2)continue;
      for(var b=0;b<units.length;b++){
        if(a===b||!positions.every(function(i){return units[b].cells.indexOf(i)>=0;}))continue;
        var changes=units[b].cells.filter(function(i){return units[a].cells.indexOf(i)<0&&(masks[i]&(1<<(digit-1)));}).map(function(i){return {index:i,values:[digit]};});
        var action=removal('locked-candidate',units[a].cells.concat(units[b].cells),changes,units[a].label+'中数字 '+digit+' 的所有候选位置（'+positions.map(cellName).join('、')+'）都在'+units[b].label+'，因此'+units[b].label+'在该交集之外不能再放 '+digit+'。');
        if(action)return action;
      }
    }
    for(var p=0;p<units.length;p++){
      var cells=units[p].cells;
      for(var x=0;x<cells.length;x++){
        var first=cells[x],pair=digits(masks[first]);if(pair.length!==2)continue;
        var twins=cells.filter(function(i){return masks[i]===masks[first];});if(twins.length!==2||first!==twins[0])continue;
        var removals=cells.filter(function(i){return twins.indexOf(i)<0&&(masks[i]&masks[first]);}).map(function(i){return {index:i,values:digits(masks[i]&masks[first])};});
        var pairAction=removal('naked-pair',cells,removals,units[p].label+'的'+twins.map(cellName).join('和')+'都只剩 '+pair.join('、')+'，两格必定占用这两个数字（次序尚未确定），其他格不能再用它们。');if(pairAction)return pairAction;
      }
      for(var d=1;d<=8;d++)for(var e=d+1;e<=9;e++){
        var left=cells.filter(function(i){return masks[i]&(1<<(d-1));}),right=cells.filter(function(i){return masks[i]&(1<<(e-1));});
        if(left.length!==2||right.length!==2||left[0]!==right[0]||left[1]!==right[1])continue;
        var keep=(1<<(d-1))|(1<<(e-1));
        var hidden=left.filter(function(i){return masks[i]&~keep;}).map(function(i){return {index:i,values:digits(masks[i]&~keep)};});
        var hiddenAction=removal('hidden-pair',cells,hidden,units[p].label+'的数字 '+d+' 和 '+e+' 都只能出现在'+left.map(cellName).join('和')+'，因此这两格必须留给它们，可删除两格中的其他候选。');if(hiddenAction)return hiddenAction;
      }
    }
    return null;
  }
  function classicHint(board,notes) {
    var masks=classicMasks(board),actions=[],matched=-1;
    // Replay a proof from the board; arbitrary player notes never become premises.
    for(var k=0;k<730;k++){
      var action=nextClassic(board,masks);if(!action)break;
      actions.push(action);if(action.kind!=='elimination')break;
      masks=action.candidateMasks;
      if(Array.isArray(notes)&&notes.length===81&&notes.every(function(n,i){return n===masks[i];}))matched=actions.length-1;
    }
    return actions[matched+1]||null;
  }
  function rateClassic(givens,context,options) {
    context=context||'classic';options=options||{};
    var started=Date.now(),timeLimit=Number.isFinite(options.timeLimitMs)?Math.max(1,Math.min(1000,options.timeLimitMs)):200;
    var result={scope:'classic',solved:false,status:'invalid',label:'无法评级',highestTechnique:null,steps:0,placements:0,eliminations:0,techniques:{},methodVersion:1,reason:'题面矛盾或无有效候选'};
    if(!plainClassic(context)){result.status='unsupported';result.reason='仅支持无附加线索的经典九宫';return result;}
    if(!isBoard(givens,false,81)){result.reason='题面格式无效';return result;}
    var board=givens.slice(),units=Engine.getUnits('classic');
    if(units.some(function(u){var filled=u.cells.map(function(i){return board[i];}).filter(Boolean);return new Set(filled).size!==filled.length;}))return result;
    var masks=classicMasks(board),limit=Number.isInteger(options.maxSteps)?Math.max(0,Math.min(1000,options.maxSteps)):1000,highest=0;
    var timedOut=false;
    for(var step=0;step<limit;step++){
      if(Date.now()-started>=timeLimit){timedOut=true;break;}
      if(board.every(Boolean)){result.solved=Engine.validateComplete(board,'classic');break;}
      if(masks.some(function(m,i){return !board[i]&&!m;}))return result;
      var action=nextClassic(board,masks);if(!action)break;
      result.steps++;result.techniques[action.technique]=(result.techniques[action.technique]||0)+1;
      if(LEVELS[action.technique]>highest){highest=LEVELS[action.technique];result.highestTechnique=action.technique;}
      if(action.kind==='elimination'){masks=action.candidateMasks;result.eliminations+=action.eliminations.reduce(function(n,c){return n+c.values.length;},0);}
      else {board[action.index]=action.value;masks[action.index]=0;result.placements++;Engine.getPeers(action.index,'classic').forEach(function(i){masks[i]&=~(1<<(action.value-1));});}
    }
    result.solved=board.every(Boolean)&&Engine.validateComplete(board,'classic');
    result.status=result.solved?'rated':result.steps>=limit||timedOut?'budget':'beyond-supported';
    result.label=result.solved?(result.steps===0?'完整题面 · 无需推理':highest<=1?'基础逻辑 · 唯一候选':highest===2?'进阶逻辑 · 锁定候选':'组合逻辑 · 数对'):'超出当前技巧 · 未评级';
    result.reason=result.solved?'已用支持的逻辑技巧完成全盘':result.status==='budget'?'超过评级计算预算':'当前技巧无法继续，未使用猜测或答案';
    result.remaining=board.filter(function(v){return !v;}).length;
    result.explanation='仅按经典九宫的确定性逻辑路径评级：单格唯一、区域唯一、锁定候选及显性/隐性数对；不是给定数密度，也不代表所有人类解法的最低难度。';
    return result;
  }

  function getStep(board, givens, solution, mode, notes) {
    var context = mode || "classic";
    mode = typeof context === "string" ? context : context.mode;
    var count;
    try { count = Engine && Engine.getLayout ? Engine.getLayout(context).cellCount : 81; }
    catch (error) { return null; }
    function coordinate(index) {
      return Engine.getCellLabel ? Engine.getCellLabel(index, context) :
        "第 " + (Math.floor(index / 9) + 1) + " 行第 " + (index % 9 + 1) + " 列";
    }
    function step(kind, index, value, focusCells, title, observe, explanation) {
    return {
      kind: kind, index: index, value: value,
      focusCells: Array.from(new Set(focusCells)),
      title: title, observe: observe, explanation: explanation,
      answer: coordinate(index) + "应填入 " + value + "。点击“填入这一格”后才会修改棋盘。"
    };
  }


    if (!Engine || !Engine.getModes().some(function (item) { return item.id === mode; }) ||
        !isBoard(board, false, count) || !isBoard(givens, false, count) || !isBoard(solution, true, count) ||
        !Engine.validateComplete(solution, context)) return null;
    for (var i = 0; i < count; i++) {
      if (givens[i] && (board[i] !== givens[i] || solution[i] !== givens[i])) return null;
    }

    // Incorrect entries must be handled first: reasoning from a bad premise is misleading.
    for (var wrong = 0; wrong < count; wrong++) {
      if (!givens[wrong] && board[wrong] && board[wrong] !== solution[wrong]) {
        return step("correction", wrong, solution[wrong], [wrong], "核对一处已填数字",
          "先检查高亮格，看看这个已填数字是否需要重新考虑。",
          "系统对照本题唯一解，发现" + coordinate(wrong) + "的已填数字不一致。这是答案核对；你可以先擦除并自行推理，也可以继续查看正确数字。");
      }
    }

    if (plainClassic(context)) {
      var logical = classicHint(board, notes);
      if (logical) return logical;
    }

    var available = new Array(count), emptyCells = [];
    for (var cell = 0; cell < count; cell++) {
      if (board[cell]) continue;
      available[cell] = Engine.candidates(board, cell, context);
      emptyCells.push(cell);
      if (available[cell].length === 1) {
        var peers = Engine.getPeers(cell, context);
        var filled = peers.filter(function (peer) { return board[peer] !== 0; });
        var excluded = Array.from(new Set(filled.map(function (peer) { return board[peer]; }))).sort();
        if (["classic", "diagonal", "hyper", "knight"].indexOf(mode) < 0) {
          var related = typeof Engine.getRelatedCells === "function" ? Engine.getRelatedCells(cell, context) : peers;
          return step("rule-single", cell, available[cell][0], [cell].concat(related),
            "观察规则候选",
            "观察高亮格及相关线索，结合本题的附加规则筛选可填数字。",
            "按照本题全部规则检查候选后，" + coordinate(cell) + "只剩数字 " + available[cell][0] +
            "。这是规则候选的汇总结果，此提示不逐条展开每项约束的排除过程。");
        }
        return step("naked-single", cell, available[cell][0], [cell].concat(filled),
          "寻找单格唯一候选",
          "观察高亮空格，以及与它互相约束的已填格。逐一排除已出现的数字。",
          coordinate(cell) + "受" + ruleNames(mode) + "约束，排除已出现的 " + excluded.join("、") +
          " 后，候选只剩 " + available[cell][0] + "。");
      }
    }

    // Only real nine-cell units contain each digit once; knight links are peers, not units.
    var units = Engine.getUnits(context);
    for (var u = 0; u < units.length; u++) {
      var unit = units[u];
      if (!unit || !Array.isArray(unit.cells) || unit.cells.length !== 9) continue;
      for (var digit = 1; digit <= 9; digit++) {
        var places = unit.cells.filter(function (index) {
          return available[index] && available[index].indexOf(digit) >= 0;
        });
        if (places.length === 1) {
          return step("hidden-single", places[0], digit, unit.cells, "寻找区域唯一位置",
            "观察高亮区域：其中有一个数字，只能落在一个空格。检查每个空格受到的约束。",
            unit.label + "是一个必须包含数字 1～9 的九格区域。结合本题全部规则检查各空格后，数字 " +
            digit + " 只在" + coordinate(places[0]) + "的候选中出现，因此可以确定这一格。");
        }
      }
    }

    if (!emptyCells.length) return null;
    var best = emptyCells.reduce(function (selected, index) {
      return available[index].length < available[selected].length ? index : selected;
    }, emptyCells[0]);
    return step("solution", best, solution[best], [best], "需要更深入的推理",
      "可以从高亮格的候选关系继续探索；当前没有找到基础逻辑步骤。",
      (plainClassic(context) ? "当前已尝试唯一候选、锁定候选和数对，仍需要其他技巧。" : "当前没有找到单格唯一候选或区域唯一位置。") + "这里可能需要更深入的候选排除或分支推理；下一步会直接展示本题答案，作为求解辅助。");
  }

  return { getStep: getStep, rateClassic: rateClassic };
});
