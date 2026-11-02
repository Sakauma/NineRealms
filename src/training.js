/* Nine Realms — fixed, evidence-checked classical technique practice. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory(require('./engine.js'),require('./hints.js'));
 else root.NineRealmsTraining=factory(root.SudokuEngine,root.SudokuHints);
})(typeof globalThis!=='undefined'?globalThis:this,function(Engine,Hints){
 'use strict';
 var NAMES={'locked-candidate':'锁定候选','naked-pair':'显性数对','hidden-pair':'隐性数对'};
 var FIXTURES=[{"id":"locked-candidate-1","technique":"locked-candidate","sourceId":"SE-H-0213C7DF27E6","givens":"600010200009402001000000000050209070400105800002060003920050680000000000004090007","solution":"675913248839472561241586739358249176467135892192867453923751684786324915514698327","board":"600010200009402061200000000050249176400135892192060003920050684000024010004090027","priorCount":0},{"id":"locked-candidate-2","technique":"locked-candidate","sourceId":"SE-H-00C2DD1BFBEF","givens":"000000000064000020000430050008010005030000610921000800010600700000793008000020043","solution":"359267481164589327287431956678914235435872619921356874813645792542793168796128543","board":"309000480064000320080430950608010205030000619921000804813600792000793168796020543","priorCount":0},{"id":"naked-pair-1","technique":"naked-pair","sourceId":"SE-H-01F849D30892","givens":"060400010800900400900500700600005004000007800074000002400008007032000001000003900","solution":"367482519825971463941536728698325174253147896174869352419658237532794681786213945","board":"060482019820971400941536728600005074200047890074809002400008237032094081000003940","priorCount":0},{"id":"hidden-pair-1","technique":"hidden-pair","sourceId":"SE-H-01F849D30892","givens":"060400010800900400900500700600005004000007800074000002400008007032000001000003900","solution":"367482519825971463941536728698325174253147896174869352419658237532794681786213945","board":"067482019820971400941536728600005074200047890074809002400008237032094081000003940","priorCount":1},{"id":"locked-candidate-3","technique":"locked-candidate","sourceId":"SE-H-00C2DD1BFBEF","givens":"000000000064000020000430050008010005030000610921000800010600700000793008000020043","solution":"359267481164589327287431956678914235435872619921356874813645792542793168796128543","board":"309000480064000320080430950608010205030000619921000804813600792000793168796020543","priorCount":1},{"id":"hidden-pair-2","technique":"hidden-pair","sourceId":"SE-H-00DE887010EA","givens":"400560007095020000070000040810790360000600005009040000060000010000300052007810400","solution":"483561927195427683276938541812795364734682195659143278368254719941376852527819436","board":"400560007095427080276038540812795364700680005659043070060050710000370052527810400","priorCount":1},{"id":"naked-pair-2","technique":"naked-pair","sourceId":"SE-H-01F966CE5714","givens":"602030001070064029080500300050000000409300100708000000000007060060020005000650403","solution":"642839571573164829981572346356741298429386157718295634835417962164923785297658413","board":"602030501070164829080502306056000000429306150708005600000007060060023705207650403","priorCount":2},{"id":"hidden-pair-3","technique":"hidden-pair","sourceId":"SE-H-01790B31522C","givens":"000860000090104700308000006800600504900300607006007002030501400000940000405000009","solution":"547869321692134785318725946873612594924358617156497832239571468781946253465283179","board":"000860000692104780308000006873612594924300617006497832039501468000940000405000009","priorCount":1},{"id":"naked-pair-3","technique":"naked-pair","sourceId":"SE-H-024405E280EC","givens":"600230040300600278102900060004000192005420003000000000000070416000000000703040800","solution":"687235941359614278142987365864753192975421683231869754598372416426198537713546829","board":"687235941359614278142987365804750192905420083200000054508370416400000537703540829","priorCount":1}];
 var cache=Object.create(null);
 function copy(value){return JSON.parse(JSON.stringify(value));}
 function digits(mask){var out=[];for(var n=1;n<=9;n++)if(mask&(1<<(n-1)))out.push(n);return out;}
 function name(index){return '第 '+(Math.floor(index/9)+1)+' 行第 '+(index%9+1)+' 列';}
 function numbers(text){return text.split('').map(Number);}
 function requireFixture(id){if(typeof id!=='string')throw new TypeError('练习编号无效。');var f=FIXTURES.find(function(x){return x.id===id;});if(!f)throw new RangeError('没有这道练习。');return f;}
 function masksFor(board){return board.map(function(v,i){return v?0:Engine.candidates(board,i,'classic').reduce(function(m,n){return m|(1<<(n-1));},0);});}
 // This rule enumerator is separate from the hint engine: every accepted move has
 // an explicit current-candidate antecedent, not just a different solution digit.
 function deductions(board,masks,technique){
  var units=Engine.getUnits('classic'),out=[];
  function emit(index,digit,focus,text,kind,unit){
   if(board[index]||!(masks[index]&(1<<(digit-1))))return;
   out.push({index:index,digit:digit,technique:technique,kind:kind,unit:unit,focusCells:Array.from(new Set(focus.concat([index]))),explanation:text+' 因此可从'+name(index)+'排除 '+digit+'。'});
  }
  units.forEach(function(unit){var cells=unit.cells;
   if(technique==='locked-candidate'){
    for(var digit=1;digit<=9;digit++){
     var positions=cells.filter(function(i){return masks[i]&(1<<(digit-1));});if(positions.length<2)continue;
     units.forEach(function(other){
      if(other===unit||!positions.every(function(i){return other.cells.indexOf(i)>=0;}))return;
      var kind=/宫/.test(unit.label)?'pointing':'claiming';
      other.cells.forEach(function(i){if(cells.indexOf(i)<0)emit(i,digit,cells.concat(other.cells),unit.label+'里 '+digit+' 的全部候选位置都在'+other.label+'（'+positions.map(name).join('、')+'），所以该交集以外不能再出现它',kind,unit.label);});
     });
    }
   }else if(technique==='naked-pair'){
    var seen=Object.create(null);
    cells.forEach(function(i){var mask=masks[i];if(digits(mask).length!==2||seen[mask])return;seen[mask]=true;
     var pair=cells.filter(function(j){return masks[j]===mask;});if(pair.length!==2)return;
     cells.forEach(function(j){if(pair.indexOf(j)>=0)return;digits(mask).forEach(function(d){emit(j,d,pair,unit.label+'的'+pair.map(name).join('和')+'都恰好只含候选 '+digits(mask).join('、')+'，这两个数字由这两格占用','naked-pair',unit.label);});});
    });
   }else if(technique==='hidden-pair'){
    for(var a=1;a<9;a++)for(var b=a+1;b<=9;b++){
     var p=cells.filter(function(i){return masks[i]&(1<<(a-1));}),q=cells.filter(function(i){return masks[i]&(1<<(b-1));});
     if(p.length!==2||q.length!==2||p[0]!==q[0]||p[1]!==q[1])continue;
     p.forEach(function(i){digits(masks[i]).forEach(function(d){if(d!==a&&d!==b)emit(i,d,cells,unit.label+'的 '+a+' 和 '+b+' 都仅能落在'+p.map(name).join('和')+'，这两格必须留给这两个数字','hidden-pair',unit.label);});});
    }
   }
  });return out;
 }
 function trusted(id){
  var fixture=requireFixture(id);if(cache[id])return cache[id];
  var board=numbers(fixture.board),givens=numbers(fixture.givens),solution=numbers(fixture.solution),masks=masksFor(board),notes=Array(81).fill(0),prior=[];
  if(!Engine.validateComplete(solution,'classic')||board.some(function(v,i){return v&&v!==solution[i]||givens[i]&&v!==givens[i];}))throw new Error('练习题面资源无效。');
  for(var count=0;count<=fixture.priorCount;count++){
   var step=Hints.getStep(board,givens,solution,'classic',notes);
   if(!step||step.kind!=='elimination')throw new Error('练习证明路径不可用，请更新练习资源。');
   var evidence=deductions(board,masks,step.technique);
   if(!step.eliminations.every(function(change){return change.values.every(function(d){return evidence.some(function(e){return e.index===change.index&&e.digit===d;});});}))throw new Error('练习候选证明未通过。');
   var expected=masks.slice();step.eliminations.forEach(function(c){c.values.forEach(function(d){expected[c.index]&=~(1<<(d-1));});});
   if(!Array.isArray(step.candidateMasks)||step.candidateMasks.length!==81||expected.some(function(mask,i){return mask!==step.candidateMasks[i];}))throw new Error('练习候选变化不符合证明。');
   if(count===fixture.priorCount){
    if(step.technique!==fixture.technique)throw new Error('练习技巧与题面不匹配。');
    var accepted=deductions(board,masks,fixture.technique);if(!accepted.length)throw new Error('练习没有可验证的动作。');
    cache[id]={fixture:fixture,board:board,givens:givens,masks:masks,step:step,prior:prior,evidence:accepted};return cache[id];
   }
   prior.push({technique:step.technique,title:step.title,explanation:step.explanation,eliminations:copy(step.eliminations)});
   masks=step.candidateMasks.slice();notes=masks.slice();
  }
 }
 function stations(){return [
  {id:'locked-candidate',title:'交点观察站',technique:'锁定候选',route:'lines',after:'home',description:'先看某个数字的所有位置是否被限制在行、列与宫的交集；为循线前的关系检查热身。'},
  {id:'naked-pair',title:'双星占位站',technique:'显性数对',route:'sums',after:'sums-sparks-v1',description:'两格只剩同两个候选，就把这两个位置视作一组；练习后可用草稿颜色记录自己的组合假设。'},
  {id:'hidden-pair',title:'隐光寻位站',technique:'隐性数对',route:'fusion',after:'lines-spectrum-v1',description:'从数字的落点反查：两个数字只共用两处位置时，删去这两格中的其他候选。'}
 ].map(function(s){s.exerciseIds=FIXTURES.filter(function(f){return f.technique===s.id;}).map(function(f){return f.id;});return s;});}
 function exercises(technique){if(technique!==undefined&&!Object.prototype.hasOwnProperty.call(NAMES,technique))throw new RangeError('练习技巧无效。');return FIXTURES.filter(function(f){return !technique||f.technique===technique;}).map(function(f){return {id:f.id,technique:f.technique,title:NAMES[f.technique]+' · '+f.id.slice(-1),sourceId:f.sourceId};});}
 function exercise(id){var t=trusted(id),f=t.fixture;return copy({id:id,stationId:f.technique,technique:f.technique,title:NAMES[f.technique]+' · '+id.slice(-1),sourceId:f.sourceId,givens:t.givens,board:t.board,masks:t.masks,candidateMasks:t.masks,focusCells:t.step.focusCells,prior:t.prior,observe:t.step.observe,task:'选择一个空格，再选择一个可由'+NAMES[f.technique]+'删除的候选数字。只需证明一处正确删除即可完成本练习。',scope:'经典局部练习，不修改正在玩的棋局、提示次数或星级。',candidateNote:t.prior.length?'本局面的候选已包含下方列出的前置证明；不是玩家随意删过的笔记。':'候选由行、列、宫的已填数字直接计算。'});}
 function check(id,index,digit){
  var t=trusted(id);
  if(!Number.isInteger(index)||index<0||index>=81||!Number.isInteger(digit)||digit<1||digit>9)return {ok:false,correct:false,code:'invalid-input',message:'请选择 81 格内的空格和 1–9 候选。'};
  if(t.board[index])return {ok:false,correct:false,code:'filled-cell',message:'这格已经填有数字；请寻找空格中的候选。'};
  if(!(t.masks[index]&(1<<(digit-1))))return {ok:false,correct:false,code:'not-candidate',message:'这个数字本来就不在该格候选中，不算一次新的推理排除。'};
  // Re-enumerate the logical witnesses, rather than accepting a memorized answer.
  var evidence=deductions(t.board,t.masks,t.fixture.technique).find(function(e){return e.index===index&&e.digit===digit;});
  if(!evidence)return {ok:false,correct:false,code:'unproved-by-technique',message:'当前'+NAMES[t.fixture.technique]+'证据还不能支持这个删除。它即使不是最终答案，也不能靠猜测排除。'};
  return {ok:true,correct:true,code:'proved',message:'证明成立：'+evidence.explanation,proof:copy(evidence)};
 }
 function explain(id,stage){
  var t=trusted(id);if(!Number.isInteger(stage)||stage<0||stage>2)throw new RangeError('讲解阶段无效。');
  if(stage===0)return {stage:0,title:'观察',text:t.step.observe+' '+exercise(id).candidateNote};
  if(stage===1)return {stage:1,title:'推理',text:t.step.explanation.split(' 可排除：')[0],prior:copy(t.prior)};
  return {stage:2,title:'核对删除',text:'下列删除都有完整的'+NAMES[t.fixture.technique]+'证据。查看讲解不算完成；可以回到棋盘亲自选出一处。',eliminations:copy(t.step.eliminations),proofs:copy(t.evidence)};
 }
 function validateProgress(value){
  if(value===undefined||value===null)return {version:1,completed:[]};
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||!Object.prototype.hasOwnProperty.call(value,'version')||!Object.prototype.hasOwnProperty.call(value,'completed')||Object.keys(value).some(function(k){return k!=='version'&&k!=='completed';})||value.version!==1||!Array.isArray(value.completed)||value.completed.length>FIXTURES.length||new Set(value.completed).size!==value.completed.length)throw new TypeError('练习进度格式无效。');
  value.completed.forEach(requireFixture);return {version:1,completed:FIXTURES.filter(function(f){return value.completed.indexOf(f.id)>=0;}).map(function(f){return f.id;})};
 }
 function recordSuccess(progress,id,index,digit){var next=validateProgress(progress);if(!check(id,index,digit).correct)throw new Error('需完成一处有证据的候选删除，才能记录练习完成。');if(next.completed.indexOf(id)<0)next.completed.push(id);return validateProgress(next);}
 return {stations:stations,exercises:exercises,exercise:exercise,check:check,explain:explain,validateProgress:validateProgress,recordSuccess:recordSuccess};
});
