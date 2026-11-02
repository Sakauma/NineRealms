/* Nine Realms — small discoveries, separate from every puzzle and its save. */
(function (root) {
  "use strict";
  var STORAGE_KEY = "nine-realms.secrets.v1";
  var Archives = root.NineRealmsSecretArchives;
  var IDS = ["gate", "visitor", "lotus", "constellation", "gravity", "rain", "crane"].concat(Archives.ids);
  var CODE = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
  var DETAILS = {
    gate: {
      title: "第十境", locked: "未知星门",
      hint: "九，是这里的钥匙。试着轻叩左上角的九境标记。",
      description: "九个数字，开出一扇额外的门。这里是一小片留给好奇心的星海。"
    },
    visitor: {
      title: "像素来客", locked: "神秘访客",
      hint: "还记得那串老游戏秘籍吗？下方的旧手柄也许能收到讯号。",
      description: "一串熟悉的方向，让一位八位访客迷路到了九境。它决定留下来，陪数字们发一会儿呆。"
    },
    lotus: {
      title: "一花一境", locked: "静庭来信",
      hint: "进入禅模式，在九境标记上停留一会儿。也可以在这里静待一朵花。",
      description: "不急着填满每一格。留一点时间，看一朵花慢慢开。"
    },
    constellation: {
      title: "九星成桥", locked: "散落的星图",
      hint: "从 1 到 9，依次点亮下方的九颗星。星光连起来，会通往哪里？",
      description: "你用九个小小的光点，在夜空里搭起一座桥。每条连线，都为下一步留了方向。"
    },
    gravity: {
      title: "引力回响", locked: "偏航的轨道",
      hint: "轻转下方的三条轨道，让它们都停在刻度 III。对齐的瞬间，会有回响。",
      description: "三重轨道终于同频。光绕着深处的秘密旋转，连时间也愿意在这里多停一会儿。"
    },
    rain: {
      title: "圆周密雨", locked: "未解的讯号",
      hint: "圆没有尽头，讯号却只要开头六位。输入圆周率前六个数字，不含小数点。",
      description: "3.14159… 无尽的数字落下一场绿色的雨。属于九境的频率，已经接通。"
    },
    crane: {
      title: "纸鹤来信", locked: "未折的信纸",
      hint: "下方有一张来自远方的信纸。沿折痕折三次，让它带着心事飞起来。",
      description: "一张纸，三次折叠，一封没有字的信。愿每一个停顿，都有风替你捎去远方。"
    }
  };
  Object.assign(DETAILS, {
    fragment:{title:"残页星盘",locked:"残页星盘",hint:"一张只有 1–4 的教学纸片。补齐行、列与 2×2 宫，让残页恢复完整。",description:"观测笔记：不是把数字放满就算完成。行、列、宫与给定必须同时成立；本页经穷举只有一个解。"},
    twins:{title:"双生星图",locked:"双生星图",hint:"档案里已有一份合法答案。你能为同一题面找到不同的第二份吗？",description:"观测笔记：两个不同答案都满足全部条件，就足以反证唯一性。这不是玩家犯错，而是给定不足；本纸片穷举共有四解。"},
    observatory:{title:"零号观测站",locked:"零号观测站",hint:"四个独立节点，两条规则。切换规则并比较真实可行数量，再提交联合结论。",description:"观测笔记：设四格为 a<b<c<d，数字至少为 1。于是 c≥3、d≥4；又 c+d=7，所以 c=3、d=4，前两格只能是 1、2。单条规则都不足，交集才唯一。"},
    "homecoming-notes":{title:"返航者手记",locked:"返航者手记",hint:"假设定位九星已修复，自由规划七处后续航点。可以先走任一分支，但汇合必须有前置。",description:"观测笔记：顺序不必唯一，依赖却不能倒置。循线三站和求和前两站可以交错；群星合奏等待两路，归航合鸣等待所有先行节点。这份模拟不改真实旅程。"}
  });
  var initialized = false, persistenceSuspended = false;
  var exportSecrets = function () { return { version: 1, found: [] }; };

  function init(callbacks) {
    if (initialized) return;
    callbacks = callbacks || {};
    var byId = function (id) { return document.getElementById(id); };
    var dialog = byId("secrets-dialog");
    var scene = byId("secret-scene");
    var brand = document.querySelector(".brand");
    var opener = byId("secrets-open");
    if (!dialog || !scene || !brand || !opener || typeof callbacks.openDialog !== "function") return;
    initialized = true;

    var found = [], archiveState = null, collectionBlocked = false, selected = null, warnedStorage = false;
    function collectionValue(){var value={version:1,found:found.slice()};if(archiveState)value.archives=archiveState;return Archives.validateEnvelope(value);}
    exportSecrets = function () { if(collectionBlocked)throw new Error("彩蛋收藏格式较新或已损坏，完整备份已暂停，原数据未改变。");return collectionValue(); };
    var brandClicks = 0, lastBrandClick = 0;
    var suppressPointerClick = false;
    var keyHistory = [], lastCodeKey = 0;
    var hold = null, holdTimer = null, calmTimer = null, spaceConsumed = false;
    var calmButton = byId("secret-calm-trigger");
    var calmText = calmButton && (calmButton.querySelector("span") || calmButton);
    var calmLabel = calmText ? calmText.textContent : "静待一朵花";
    var cards = Array.prototype.slice.call(dialog.querySelectorAll("[data-secret-card]"));
    var observer;
    var starProgress = 0, orbitSteps = [0, 1, 2], foldProgress = 0;
    var motionQuery = root.matchMedia("(prefers-reduced-motion: reduce)");

    function tell(message) {
      if (typeof callbacks.toast === "function") callbacks.toast(message);
    }

    function storageWarning() {
      if (warnedStorage) return;
      warnedStorage = true;
      tell("这一刻仍然属于你。浏览器暂时无法保存彩蛋收藏。");
    }

    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw !== null) {
        var saved = Archives.validateEnvelope(JSON.parse(raw));
        found = saved.found.slice();archiveState=saved.archives||null;
      }
    } catch (error) { collectionBlocked=true; }
    if (found.length) selected = found[0];

    function saveCollection() {
      try {
        if(persistenceSuspended||collectionBlocked)return false;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(collectionValue()));return true;
      } catch (error) { storageWarning();return false; }
    }

    function otherDialogOpen() {
      return Array.prototype.some.call(document.querySelectorAll("dialog[open]"), function (element) {
        return element !== dialog;
      });
    }

    function zenEnabled() { return document.body.dataset.zen === "on"; }
    function brandAvailable() { return !document.hidden && !dialog.open && !otherDialogOpen(); }
    function motionEnabled() {
      return document.body.dataset.fx === "on" &&
        document.body.dataset.pageHidden !== "true" &&
        !motionQuery.matches && !document.hidden;
    }

    function updateMotion() {
      var enabled = motionEnabled();
      scene.dataset.motion = enabled ? "on" : "off";
      scene.classList.toggle("is-replaying", Boolean(
        enabled && dialog.open && selected && found.indexOf(selected) !== -1
      ));
    }

    function replay() {
      updateMotion();
      scene.classList.remove("is-replaying");
      if (motionEnabled() && dialog.open && selected && found.indexOf(selected) !== -1) {
        // A single synchronous restart avoids an animation loop or cleanup
        // timer, including when the user disables animation during playback.
        void scene.offsetWidth;
        scene.classList.add("is-replaying");
      }
    }

    function render(message) {
      var unlocked = selected && found.indexOf(selected) !== -1;
      scene.dataset.secret = unlocked ? selected : "locked";
      var title = byId("secret-title"), description = byId("secret-description");
      if (title) title.textContent = selected ? (unlocked ? DETAILS[selected].title : DETAILS[selected].locked) : "九境之外，还有一些小秘密";
      if (description) description.textContent = selected ? (unlocked ? DETAILS[selected].description : DETAILS[selected].hint) :
        "从上方选一枚线索，试试它的小机关。找到以后，风景会一直留在这里。";
      var discovery = byId("secret-discovery");
      if (discovery) discovery.textContent = message || (unlocked ? "已收入旅途拾遗" : "留一点好奇心，慢慢找");
      var count = byId("secrets-count"), collectionCount = byId("secret-collection-count");
      if (count) count.textContent = found.length + "/" + IDS.length;
      if (collectionCount) collectionCount.textContent = "已发现 " + found.length + " / " + IDS.length;
      opener.setAttribute("aria-label", "打开旅途拾遗，已发现 " + found.length + " 个彩蛋，共 " + IDS.length + " 个");
      var replayButton = byId("secret-replay");
      if (replayButton) replayButton.hidden = !unlocked || Archives.ids.indexOf(selected)>=0;
      cards.forEach(function (card) {
        var id = card.dataset.secretCard;
        if (IDS.indexOf(id) === -1) return;
        var known = found.indexOf(id) !== -1;
        var name = card.querySelector("[data-secret-name]");
        var state = card.querySelector("[data-secret-state]");
        if (name) name.textContent = known ? DETAILS[id].title : DETAILS[id].locked;
        if (state) state.textContent = known ? "已发现 · 可以重看" : Archives.ids.indexOf(id)>=0 ? "互动档案 · 开始探索" : "未发现 · 查看线索";
        card.dataset.found = known ? "true" : "false";
        card.setAttribute("aria-pressed", String(selected === id));
        card.setAttribute("aria-label", (known ? DETAILS[id].title : DETAILS[id].locked) + (known ? "，已发现，点击重看" : "，未发现，点击查看线索"));
      });
      renderMiniGames();
      renderArchive();
      if(collectionBlocked&&discovery)discovery.textContent="收藏数据暂不可读取；已进入只读，原内容不会覆盖。";
      updateMotion();
    }

    function openCollection() {
      if (otherDialogOpen() || document.hidden) return false;
      render();
      if (!dialog.open) callbacks.openDialog(dialog);
      return dialog.open;
    }

    function miniAvailable(id) {
      return dialog.open && selected === id && !document.hidden && !otherDialogOpen();
    }

    function miniStatus(id, message) {
      var output = byId("secret-" + id + "-status");
      if (output) output.textContent = message;
    }

    function renderMiniGames() {
      Array.prototype.forEach.call(dialog.querySelectorAll("[data-secret-task]"), function (task) {
        task.hidden = task.dataset.secretTask !== selected;
      });
      Array.prototype.forEach.call(dialog.querySelectorAll("[data-secret-star]"), function (button) {
        var lit = Number(button.dataset.secretStar) <= starProgress;
        button.dataset.lit = String(lit);
        button.setAttribute("aria-pressed", String(lit));
      });
      var trail = byId("secret-star-trail");
      if (trail) trail.style.setProperty("--star-progress", String(Math.max(0, starProgress - 1) / 8));
      Array.prototype.forEach.call(dialog.querySelectorAll("[data-secret-orbit]"), function (button) {
        var index = Number(button.dataset.secretOrbit), value = orbitSteps[index];
        button.style.setProperty("--orbit-angle", (value * 90) + "deg");
        button.dataset.aligned = String(value === 3);
        button.setAttribute("aria-label", "轨道 " + (index + 1) + "，当前刻度 " + ["0", "I", "II", "III"][value] + "，点击转动");
        button.querySelector("strong").textContent = ["0", "I", "II", "III"][value];
      });
      var paper = byId("secret-fold-paper");
      if (paper) paper.dataset.fold = String(foldProgress);
      var foldButton = byId("secret-fold");
      if (foldButton) foldButton.textContent = foldProgress === 3 ? "再折一只" : ["对折信纸", "折出双翼", "展开，让它飞"][foldProgress];
    }

    var archiveHints = {};
    function archiveAvailable(){return !collectionBlocked&&!persistenceSuspended&&dialog.open&&Archives.ids.indexOf(selected)>=0&&!document.hidden&&!otherDialogOpen();}
    function archiveSave(){if(!archiveAvailable())return;saveCollection();}
    function renderArchive(){
      var panel=byId('secret-archive-panel'),active=Archives.ids.indexOf(selected)>=0;
      if(!panel)return;panel.hidden=!active;scene.hidden=active;if(!active)return;
      if(!archiveState)archiveState=Archives.defaults();
      panel.replaceChildren();panel.dataset.archive=selected;
      function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
      function button(text,fn){var b=el('button','secondary-btn',text);b.type='button';b.disabled=collectionBlocked;b.addEventListener('click',function(){if(archiveAvailable())fn();});return b;}
      var intro=el('p','archive-instructions'),area=el('div','archive-workspace'),status=el('p','secret-task-status');status.id='secret-archive-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
      var hints=el('p','archive-hint');hints.id='secret-archive-hint';hints.setAttribute('aria-live','polite');
      function numericInput(value,max,label,onChange,readOnly,readOnlyKind){
        var input=el('input','archive-digit');input.type='text';input.inputMode='numeric';input.maxLength=1;input.autocomplete='off';input.spellcheck=false;input.value=value?String(value):'';input.readOnly=Boolean(readOnly);input.disabled=collectionBlocked;input.setAttribute('aria-label',label+(readOnly?'，'+(readOnlyKind||'给定'):''));input.setAttribute('aria-describedby','secret-archive-status');
        input.addEventListener('input',function(){if(!archiveAvailable()||input.readOnly){input.value=value?String(value):'';return;}if(!new RegExp('^[1-'+max+']?$').test(input.value)){input.value=value?String(value):'';status.textContent='请输入 1–'+max+'，或清空这一格。';return;}value=input.value?Number(input.value):0;onChange(value);archiveSave();});return input;
      }
      function grid(board,givens,readOnly,label){var g=el('div','archive-mini-grid');g.setAttribute('role','group');g.setAttribute('aria-label',label);board.forEach(function(value,index){var input=numericInput(value,4,'第 '+(Math.floor(index/4)+1)+' 行第 '+(index%4+1)+' 列',function(n){board[index]=n;},readOnly||givens[index],givens[index]?'给定':'参考答案');input.dataset.archiveCell=String(index);g.appendChild(input);});return g;}
      if(selected==='fragment'||selected==='twins'){
        var paper=Archives.mini(selected);intro.textContent='独立教学纸片：4×4，每行、每列和每个 2×2 宫各填 1–4；不影响当前 9×9 棋局。'+(selected==='twins'?'为同一给定找出不同于展示的首份解的另一份合法完整答案。':'补齐空格后提交规则检验；本纸片已验证唯一解。');
        if(selected==='twins'){var witness=el('div','archive-grid-group');witness.append(el('h4','','档案已有的首份合法解'),grid(paper.firstSolution,paper.givens,true,'首份合法解，只读'));area.appendChild(witness);}
        var player=el('div','archive-grid-group');player.append(el('h4','',selected==='twins'?'你的第二份答案':'你的补全'),grid(archiveState.drafts[selected],paper.givens,false,'可填写的教学纸片'));area.appendChild(player);
      }else if(selected==='observatory'){
        intro.textContent='独立四节点示意，不是数独的一行：每格可取 1–9，未预设互异，也没有行列宫约束。可单独开关规则，比较整个取值空间的精确数量；提交时必须同时满足两条规则。';
        var settings=el('div','archive-rule-switches'),observation=el('p','archive-observation'),d=archiveState.drafts.observatory,values=el('div','archive-four-grid');observation.setAttribute('aria-live','polite');
        function updateObservation(){var result=Archives.observe(d.thermo,d.sum);observation.textContent='当前规则可行组合：'+result.count+'。各格候选：'+result.candidates.map(function(a,i){return 'ABCD'[i]+'={'+a.join(',')+'}';}).join('；')+'。这是穷举全部 9⁴ 个取值组合，不依据你的试填计数。';}
        [['thermo','A < B < C < D（温度计）'],['sum','C + D = 7（求和）']].forEach(function(pair){var label=el('label'),input=el('input');input.type='checkbox';input.checked=d[pair[0]];input.disabled=collectionBlocked;input.dataset.archiveRule=pair[0];input.addEventListener('change',function(){if(!archiveAvailable())return;d[pair[0]]=input.checked;archiveSave();updateObservation();});label.append(input,document.createTextNode(pair[1]));settings.appendChild(label);});
        d.values.forEach(function(n,i){var label=el('label','','ABCD'[i]);var input=numericInput(n,9,'观测节点 '+'ABCD'[i],function(value){d.values[i]=value;},false);input.dataset.archiveCell=String(i);label.appendChild(input);values.appendChild(label);});area.append(settings,observation,values);updateObservation();
      }else{
        intro.textContent='独立航线规划：假设九颗定位星已经修复。把下面七个真实后续航点排成完整顺序，再提交检查；允许先走任一分支或交错，系统不会替你禁止错误选择。此模拟不改变真实主线进度、星级或解锁。';
        var choices=el('div','archive-route-choices'),order=el('ol','archive-route-order'),nodes=Archives.routeNodes(),route=archiveState.drafts.route;
        var clues=el('details','archive-route-clues'),clueList=el('ul');clues.appendChild(el('summary','','查看航线前置关系（可随时查阅）'));nodes.forEach(function(node){clueList.appendChild(el('li','',node.title+'：'+(node.requires.length?'须先完成 '+node.requires.map(function(id){return nodes.find(function(n){return n.id===id;}).title;}).join('、'):'定位九星已修复，可作为第一站')));});clues.appendChild(clueList);area.appendChild(clues);
        nodes.forEach(function(node){var b=button(node.title,function(){route.push(node.id);archiveSave();renderArchive();byId('secret-archive-panel').querySelector('.archive-route-choices button:not(:disabled),#secret-archive-check').focus();});b.dataset.archiveNode=node.id;b.disabled=collectionBlocked||route.indexOf(node.id)>=0;b.title=node.requires.length?'前置：'+node.requires.map(function(id){return nodes.find(function(n){return n.id===id;}).title;}).join('、'):'前置定位九星已作为模拟背景完成';choices.appendChild(b);});
        route.forEach(function(id){order.appendChild(el('li','',nodes.find(function(n){return n.id===id;}).title));});var undo=button('撤回最后一站',function(){route.pop();archiveSave();renderArchive();byId('secret-archive-panel').querySelector('.archive-route-choices button:not(:disabled)').focus();});undo.disabled=collectionBlocked||!route.length;area.append(choices,order,undo);
      }
      var actions=el('div','archive-actions'),checkButton=button('验证并收入档案',function(){var result=Archives.submit(collectionValue(),selected);if(!result.ok){status.textContent='还未成立：'+result.message;return;}found=result.value.found;archiveState=result.value.archives;var saved=saveCollection();render('完成档案 · '+DETAILS[selected].title);byId('secret-archive-status').textContent=(saved?'已验证并保存观测笔记。':'本次已验证，但尚未保存到本机；请导出完整备份保留。')+DETAILS[selected].description;byId('secret-archive-check').focus();});checkButton.id='secret-archive-check';
      var hintButton=button('查看下一条线索',function(){var all={fragment:['从第一行开始：已有 1、2、4，缺少哪个数字？','给定不能更改。每填一格，都同时检查行、列与 2×2 宫；没有计时或失误惩罚。'],twins:['观察给定只出现了 3 和 4；1 与 2 的位置是否被题面区分？','可以尝试把首份解中的全部 1 与 2 互换，再逐行、逐列、逐宫检查；必须完整提交另一份合法解。'],observatory:['先只开一条规则，再打开另一条，观察可行组合数和候选的交集。','严格递增使 C 至少为 3、D 至少为 4；它们之和恰好是 7。再向前推导 A 与 B。'],'homecoming-notes':['循线三站有先后；求和前两站也有先后。你可以把这两条分支交错排列。','群星合奏等待循线三站和求和前两站全部完成；归航合鸣必须在其余六站之后。重玩可以尝试先走另一条分支。']}[selected];var index=archiveHints[selected]||0;hints.textContent=all[Math.min(index,all.length-1)];archiveHints[selected]=index+1;});
      var reset=button('重玩此档案',function(){var fresh=Archives.defaults();if(selected==='homecoming-notes')archiveState.drafts.route=[];else archiveState.drafts[selected]=fresh.drafts[selected];archiveHints[selected]=0;archiveSave();renderArchive();var first=byId('secret-archive-panel').querySelector('input:not([readonly]):not(:disabled),button:not(:disabled)');if(first)first.focus();});
      actions.append(checkButton,hintButton,reset);panel.append(intro,area,actions,hints,status);if(collectionBlocked)status.textContent='只读：收藏格式未知或损坏，原始内容已保留。请使用匹配版本恢复。';else if(found.indexOf(selected)>=0)status.textContent='已收入档案；重玩只修改练习草稿，不抹去已验证的观测笔记。';
      panel.onkeydown=function(event){event.stopPropagation();};
    }

    function resetMiniGames() {
      starProgress = 0;
      orbitSteps = [0, 1, 2];
      foldProgress = 0;
      miniStatus("constellation", "从第 1 颗星开始 · 0 / 9");
      miniStatus("gravity", "目标：三条轨道都停在 III");
      miniStatus("rain", "六位数字，等待接通。");
      miniStatus("crane", "一张纸，等待第一道折痕。");
      var input = byId("secret-rain-code");
      if (input) { input.value = ""; input.removeAttribute("aria-invalid"); }
      renderMiniGames();
    }

    Array.prototype.forEach.call(dialog.querySelectorAll("[data-secret-star]"), function (button) {
      button.addEventListener("click", function () {
        if (!miniAvailable("constellation")) return;
        var value = Number(button.dataset.secretStar);
        if (starProgress === 9 && value === 1) starProgress = 0;
        if (value !== starProgress + 1) {
          miniStatus("constellation", starProgress === 9 ? "星桥已点亮。点第 1 颗星，可以再连一次。" : "下一颗是 " + (starProgress + 1) + "，沿星光继续。");
          return;
        }
        starProgress++;
        renderMiniGames();
        miniStatus("constellation", starProgress === 9 ? "九星成桥 · 再点第 1 颗星可重新连线" : "已点亮 " + starProgress + " / 9 · 下一颗是 " + (starProgress + 1));
        if (starProgress === 9) discover("constellation");
      });
    });
    Array.prototype.forEach.call(dialog.querySelectorAll("[data-secret-orbit]"), function (button) {
      button.addEventListener("click", function () {
        if (!miniAvailable("gravity")) return;
        var index = Number(button.dataset.secretOrbit);
        orbitSteps[index] = (orbitSteps[index] + 1) % 4;
        renderMiniGames();
        var aligned = orbitSteps.filter(function (value) { return value === 3; }).length;
        miniStatus("gravity", aligned === 3 ? "三重轨道已同频。再转一圈，也会回到这里。" : "已经对齐 " + aligned + " / 3 条轨道");
        if (aligned === 3) discover("gravity");
      });
    });
    var rainForm = byId("secret-rain-form");
    if (rainForm) rainForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!miniAvailable("rain")) return;
      var input = byId("secret-rain-code");
      if (input.value.trim() !== "314159") {
        input.setAttribute("aria-invalid", "true");
        miniStatus("rain", "讯号还没连上。提示：3.14159… 去掉小数点。");
        return;
      }
      input.removeAttribute("aria-invalid");
      miniStatus("rain", "频率 314159 · 已接通");
      discover("rain");
    });
    var foldButton = byId("secret-fold");
    if (foldButton) foldButton.addEventListener("click", function () {
      if (!miniAvailable("crane")) return;
      foldProgress = foldProgress === 3 ? 0 : foldProgress + 1;
      renderMiniGames();
      miniStatus("crane", ["一张纸，等待第一道折痕。", "第一折 · 把心事轻轻收好。", "第二折 · 让双翼有了形状。", "第三折 · 风会替你送达。"][foldProgress]);
      if (foldProgress === 3) discover("crane");
    });

    function resetCode(message) {
      keyHistory = [];
      lastCodeKey = 0;
      var status = byId("secret-code-status");
      if (status) status.textContent = message || "等待一串来自旧日的讯号";
    }

    function cancelHold() {
      if (holdTimer !== null) clearTimeout(holdTimer);
      holdTimer = null;
      hold = null;
      brand.classList.remove("secret-holding");
    }

    function abortHold() {
      if (!hold) return;
      // Cancelling a pointer hold does not necessarily cancel its native
      // click. Consume that press's click, even if release happens much later.
      if (hold.kind === "pointer") suppressPointerClick = true;
      brandClicks = 0;
      lastBrandClick = 0;
      cancelHold();
    }

    function cancelCalm() {
      if (calmTimer !== null) clearTimeout(calmTimer);
      calmTimer = null;
      if (calmButton) {
        calmButton.disabled = false;
        calmButton.setAttribute("aria-busy", "false");
        calmText.textContent = calmLabel;
      }
    }

    function discover(id) {
      if (collectionBlocked || persistenceSuspended || IDS.indexOf(id) === -1 || Archives.ids.indexOf(id)>=0 || otherDialogOpen() || document.hidden) return false;
      var isNew = found.indexOf(id) === -1;
      if (isNew) {
        found.push(id);
        saveCollection();
      }
      selected = id;
      brandClicks = 0;
      lastBrandClick = 0;
      cancelHold();
      cancelCalm();
      resetCode();
      if (!openCollection()) return false;
      render(isNew ? "发现彩蛋 · " + DETAILS[id].title : "好久不见，" + DETAILS[id].title);
      replay();
      return true;
    }

    function feedKey(key) {
      if (CODE.indexOf(key) === -1) { resetCode(); return; }
      var now = performance.now();
      if (lastCodeKey && now - lastCodeKey > 5000) keyHistory = [];
      lastCodeKey = now;
      keyHistory.push(key);
      if (keyHistory.length > CODE.length) keyHistory.shift();
      var matched = 0;
      for (var length = Math.min(keyHistory.length, CODE.length); length > 0; length--) {
        if (keyHistory.slice(-length).every(function (value, index) { return value === CODE[index]; })) {
          matched = length;
          break;
        }
      }
      keyHistory = keyHistory.slice(-matched);
      if (!matched) keyHistory = [];
      if (matched === CODE.length) {
        discover("visitor");
        resetCode("旧日的讯号，收到了。");
      } else {
        var status = byId("secret-code-status");
        if (status) status.textContent = matched ? "讯号连上了 " + matched + " / " + CODE.length + " 个按键" : "讯号断开了，再试一次";
      }
    }

    function startHold(kind, event) {
      cancelHold();
      if (!zenEnabled() || !brandAvailable()) return;
      hold = {
        kind: kind, pointerId: event.pointerId,
        x: event.clientX || 0, y: event.clientY || 0
      };
      brand.classList.add("secret-holding");
      holdTimer = setTimeout(function () {
        if (!hold || !zenEnabled() || !brandAvailable()) { abortHold(); return; }
        // Only the successful physical press needs its trailing click
        // swallowed. Space already consumes keyup; do not block new clicks
        // after the collection closes with an unrelated time window.
        if (hold.kind === "pointer") suppressPointerClick = true;
        discover("lotus");
      }, 2200);
    }

    function closeCollection() {
      if (typeof dialog.close === "function") dialog.close();
      else {
        dialog.removeAttribute("open");
        dialog.dispatchEvent(new Event("close"));
      }
    }

    opener.addEventListener("click", function () {
      abortHold();
      resetCode();
      if (openCollection()) replay();
    });
    if (byId("secrets-close")) byId("secrets-close").addEventListener("click", closeCollection);
    dialog.addEventListener("close", function () {
      cancelHold();
      cancelCalm();
      resetCode();
      brandClicks = 0;
      lastBrandClick = 0;
      scene.classList.remove("is-replaying");
      resetMiniGames();
      if (typeof callbacks.afterClose === "function") callbacks.afterClose();
    });
    dialog.addEventListener("cancel", function () {
      abortHold();
      cancelCalm();
    });

    cards.forEach(function (card) {
      card.addEventListener("click", function () {
        var id = card.dataset.secretCard;
        if (IDS.indexOf(id) === -1) return;
        cancelCalm();
        selected = id;
        render();
        replay();
      });
    });
    if (byId("secret-replay")) byId("secret-replay").addEventListener("click", replay);
    Array.prototype.forEach.call(dialog.querySelectorAll("[data-secret-key]"), function (button) {
      button.addEventListener("click", function () {
        if (dialog.open && !otherDialogOpen() && !document.hidden) feedKey(button.dataset.secretKey);
      });
    });
    if (calmButton) calmButton.addEventListener("click", function () {
      cancelCalm();
      if (!zenEnabled()) {
        tell("先回到游戏，进入禅模式，再来静待一朵花。");
        return;
      }
      if (!dialog.open || document.hidden || otherDialogOpen()) return;
      calmButton.disabled = true;
      calmButton.setAttribute("aria-busy", "true");
      calmText.textContent = "正在等花开…";
      calmTimer = setTimeout(function () {
        calmTimer = null;
        if (dialog.open && zenEnabled() && !document.hidden && !otherDialogOpen()) discover("lotus");
        else cancelCalm();
      }, 2200);
    });

    brand.addEventListener("click", function (event) {
      event.preventDefault();
      if (suppressPointerClick && event.detail > 0) {
        suppressPointerClick = false;
        return;
      }
      if (event.detail === 0) suppressPointerClick = false;
      if (!brandAvailable()) return;
      var now = performance.now();
      brandClicks = now - lastBrandClick <= 1400 ? brandClicks + 1 : 1;
      lastBrandClick = now;
      if (brandClicks === 5) tell("九境之外，也许还有一境。");
      if (brandClicks >= 9) discover("gate");
    });
    brand.addEventListener("pointerdown", function (event) {
      if (event.isPrimary === false || event.button !== 0) return;
      // A new physical press can never be the click from an older cancellation.
      suppressPointerClick = false;
      startHold("pointer", event);
    });
    brand.addEventListener("pointerleave", function () {
      if (hold && hold.kind === "pointer") abortHold();
    });
    brand.addEventListener("focusout", function (event) {
      if (hold && hold.kind === "keyboard" && !brand.contains(event.relatedTarget)) abortHold();
    });
    brand.addEventListener("contextmenu", function (event) {
      if (zenEnabled()) event.preventDefault();
    });
    document.addEventListener("pointermove", function (event) {
      if (!hold || hold.kind !== "pointer" || event.pointerId !== hold.pointerId) return;
      if (Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > 14) abortHold();
    });
    document.addEventListener("pointerup", function (event) {
      if (hold && hold.kind === "pointer" && event.pointerId === hold.pointerId) cancelHold();
    });
    document.addEventListener("pointercancel", function (event) {
      if (hold && hold.kind === "pointer" && event.pointerId === hold.pointerId) abortHold();
    });

    function isEditable(target) {
      return target && (target.isContentEditable ||
        (typeof target.closest === "function" && target.closest("input,textarea,select,[contenteditable]:not([contenteditable=false])")));
    }

    document.addEventListener("keydown", function (event) {
      if(event.target&&event.target.closest&&event.target.closest("#secret-archive-panel"))return;
      var onBrand = event.target === brand || brand.contains(event.target);
      if ((event.key === " " || event.key === "Spacebar") && onBrand && zenEnabled() && brandAvailable() &&
          !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        event.stopPropagation();
        spaceConsumed = true;
        if (!event.repeat) startHold("keyboard", event);
        return;
      }
      if (event.key === "Escape") { abortHold(); cancelCalm(); resetCode(); return; }
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || isEditable(event.target)) return;
      var state = document.body.dataset.gameState;
      var canCode = dialog.open || ["ready", "paused", "completed"].indexOf(state) !== -1;
      if (!canCode || otherDialogOpen() || document.hidden) { resetCode(); return; }
      var key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (CODE.indexOf(key) === -1) { resetCode(); return; }
      var consumes = keyHistory.length > 0 || key === CODE[0];
      if (consumes) {
        event.preventDefault();
        event.stopPropagation();
      }
      feedKey(key);
    }, true);
    document.addEventListener("keyup", function (event) {
      if ((event.key === " " || event.key === "Spacebar") && spaceConsumed) {
        event.preventDefault();
        event.stopPropagation();
        spaceConsumed = false;
        if (hold && hold.kind === "keyboard") cancelHold();
      }
    }, true);

    function abandonGesture() {
      abortHold();
      cancelCalm();
      resetCode();
      spaceConsumed = false;
      brandClicks = 0;
      lastBrandClick = 0;
    }
    root.addEventListener("blur", abandonGesture);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) abandonGesture();
      updateMotion();
    });
    observer = new MutationObserver(function (changes) {
      if (!zenEnabled() || document.hidden) { abortHold(); cancelCalm(); }
      if (changes.some(function (change) { return change.attributeName === "data-game-state"; })) resetCode();
      updateMotion();
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ["data-zen", "data-fx", "data-page-hidden", "data-game-state"] });
    if (typeof motionQuery.addEventListener === "function") motionQuery.addEventListener("change", updateMotion);
    else if (typeof motionQuery.addListener === "function") motionQuery.addListener(updateMotion);
    render();
    resetCode();
    resetMiniGames();
  }

  root.NineRealmsEasterEggs = { init: init, suspendPersistence: function(value){persistenceSuspended=Boolean(value);}, exportData: function () { return exportSecrets(); } };
})(window);
