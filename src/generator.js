/* Offline seeded clue carving. Supported tiers require a complete logical path. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./engine.js"), require("./hints.js"), require("./diversity-source.js"), require("./diversity-clues.js"), require("./puzzle-diversity.js"), require("./daily-generator-v1.js"), require("./rule-path-grading.js"), require("./rule-quality.js"), require("./recovery-reserve.js"));
  else root.NineRealmsGenerator = factory(root.SudokuEngine, root.SudokuHints, root.NineRealmsDiversitySource, root.NineRealmsDiversityClues, root.NineRealmsDiversity, root.NineRealmsDailyGeneratorV1, root.NineRealmsRulePathGrading, root.NineRealmsRuleQuality, root.NineRealmsRecoveryReserve);
})(typeof globalThis !== "undefined" ? globalThis : this, function createGenerator(Engine, Hints, Sources, ClueBuilder, Diversity, FrozenDaily, RulePath, Quality, RecoveryReserve) {
  "use strict";
  var VERSION = 2;
  function hashWords(text) {
    // Four independently updated words; this is a non-cryptographic content key, not a security hash.
    var a = 1779033703, b = 3144134277, c = 1013904242, d = 2773480762;
    for (var i = 0; i < text.length; i++) {
      var n = text.charCodeAt(i);
      a = b ^ Math.imul(a ^ n, 597399067); b = c ^ Math.imul(b ^ n, 2869860233);
      c = d ^ Math.imul(c ^ n, 951274213); d = a ^ Math.imul(d ^ n, 2716044179);
    }
    a = Math.imul(c ^ a >>> 18, 597399067); b = Math.imul(d ^ b >>> 22, 2869860233);
    c = Math.imul(a ^ c >>> 17, 951274213); d = Math.imul(b ^ d >>> 19, 2716044179);
    var words = [(a ^ b ^ c ^ d) >>> 0, (b ^ a) >>> 0, (c ^ a) >>> 0, (d ^ a) >>> 0], index = 0;
    return function () { return words[index++ % 4]; };
  }
  function rng(seed) {
    var hash = hashWords(String(seed)), a = hash(), b = hash(), c = hash(), d = hash();
    return function () { a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0; var t = (a + b | 0) + d | 0; d = d + 1 | 0; a = b ^ b >>> 9; b = c + (c << 3) | 0; c = (c << 21 | c >>> 11) + t | 0; return (t >>> 0) / 4294967296; };
  }
  function fingerprint(puzzle) {
    var h = hashWords(puzzle.mode + "|" + puzzle.givens.join("") + "|" + JSON.stringify(puzzle.clues));
    return [h(), h(), h(), h()].map(function (n) { return n.toString(16).padStart(8, "0"); }).join("");
  }
  function seed() {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      return Array.from(crypto.getRandomValues(new Uint32Array(4))).map(function (n) { return n.toString(16).padStart(8, "0"); }).join("");
    }
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2) + "-" + Math.random().toString(36).slice(2);
  }
  function fail(code) { var error = new Error(code); error.code = code; throw error; }
  function carve(request, attempt, constructed, recoveryStrategy) {
    request = request || {};
    var mode = request.mode || "classic", difficulty = request.difficulty || "easy";
    if (["easy", "medium", "hard"].indexOf(difficulty) < 0) fail("CURATED_DIFFICULTY");
    if (typeof request.seed !== "string" || !request.seed.length || request.seed.length > 256) fail("INVALID_SEED");
    var attemptSeed = request.seed + (attempt ? ":logic-" + attempt : "");
    var random = rng("carve-v" + VERSION + ":" + attemptSeed);
    var source = constructed || Engine.getPuzzle(difficulty, attemptSeed, mode, request.sourceId ? { sourceId: request.sourceId } : {});
    var context = { mode: mode, clues: source.clues };
    if (!Engine.validateComplete(source.solution, context)) fail("INVALID_TEMPLATE");
    var board = source.solution.slice(), order = board.map(function (_, i) { return i; });
    for (var i = order.length - 1; i > 0; i--) { var j = Math.floor(random() * (i + 1)), old = order[i]; order[i] = order[j]; order[j] = old; }
    var base = (supportsDifficulty(mode) ? { easy: 44, medium: 27, hard: 25 } : { easy: 44, medium: 36, hard: 28 })[difficulty];
    var depthGraded=Boolean(constructed&&!supportsDifficulty(mode)),depthAccepted=false;
    var qualityGraded=Boolean(constructed&&ClueBuilder.supportedModes().indexOf(mode)>=0);
    var techniqueGuarded=Boolean(recoveryStrategy!=="legacy-source"&&constructed&&difficulty==="hard"&&(mode==="classic"||mode==="king"));
    if(constructed&&supportsDifficulty(mode)&&difficulty!=="easy") {
      var floors=difficulty==="hard"?{classic:22,diagonal:20,hyper:18,knight:16,king:20,disjoint:20,jigsaw:20}:{classic:24,diagonal:22,hyper:20,knight:18,king:22,disjoint:22,jigsaw:22};
      base=floors[mode]||base;
    }
    if(depthGraded)base={easy:34,medium:24,hard:16}[difficulty];
    var target = Math.round(board.length * (base + Math.floor(random() * 5) - 2) / 81);
    var depthMax=Math.round(board.length*({easy:46,medium:40,hard:34}[difficulty])/81);
    var givenCount = board.length, checks = 0, nodes = 0, rejectedByBudget = 0;
    // Uniqueness checks use reproducible node budgets; logic calibration has a separate safety budget.
    var maxNodes = 12000;
    for (var n = 0; n < order.length && givenCount > target; n++) {
      var cell = order[n], value = board[cell]; board[cell] = 0;
      var result = Engine.analyzeSolutions(board, context, { limit: 2, maxNodes: maxNodes });
      checks++; nodes += result.nodes;
      if (result.count === 1 && !result.exhausted) {
        givenCount--;
        if(depthGraded&&givenCount<=depthMax){
          var depthProof=RulePath.analyze(board,context),depthTier=RulePath.tier(depthProof,mode);
          if(depthTier===difficulty&&(!qualityGraded||Quality.accepts(Quality.analyze(board,context),difficulty))){depthAccepted=true;target=givenCount;break;}
          if(!depthProof.solved || ["easy","medium","hard"].indexOf(depthTier)>["easy","medium","hard"].indexOf(difficulty)){board[cell]=value;givenCount++;}
        }
        // Stop as soon as this logical tier is reached; clue count is only a search bound.
        if (supportsDifficulty(mode) && difficulty !== "easy" && givenCount <= 44) {
          if(techniqueGuarded){
            // A unique puzzle can already be beyond our supported techniques.
            // Keep the last fully proven state and try a different removal,
            // rather than permanently degrading that source and discarding it.
            var logical=mode==="classic"?Hints.rateClassic(board,context,{maxSteps:200,timeLimitMs:200}):Hints.ratePuzzle(board,context,{maxSteps:200,timeLimitMs:200});
            var logicalTier=ratingTier(logical);
            if(logicalTier===difficulty){target=givenCount;break;}
            if(!logicalTier){board[cell]=value;givenCount++;}
          }else if(matchesDifficulty(board,difficulty,context)){target=givenCount;break;}
        }
      }
      else { board[cell] = value; if (result.exhausted) rejectedByBudget++; }
    }
    if(depthGraded&&!depthAccepted)fail("RULE_DEPTH_NOT_REACHED");
    if (givenCount > target) fail("DENSITY_NOT_REACHED");
    if (board.every(function (v, k) { return Boolean(v) === Boolean(source.givens[k]); })) fail("UNCHANGED_MASK");
    var puzzle = { id: "G" + VERSION + "-" + mode + "-" + request.seed, sourceId: source.sourceId, mode: mode, difficulty: difficulty,
      givens: board, solution: source.solution.slice(), clues: source.clues, rating: "generated-density-" + difficulty };
    var key = fingerprint(puzzle);
    if (Array.isArray(request.avoidFingerprints) && request.avoidFingerprints.indexOf(key) >= 0) fail("RECENT_DUPLICATE");
    puzzle.generation = { version: VERSION, seed: request.seed, kind: "carved", difficultyBasis: "clue-density", givenCount: givenCount,
      target: target, fingerprint: key, unique: true, checks: checks, nodes: nodes, rejectedByBudget: rejectedByBudget };
    return puzzle;
  }
  function ratingTier(result) {
    if (!result || !result.solved || result.status !== "rated" || !result.steps) return null;
    // Several techniques share a rating level. The first technique at that
    // level is not evidence that it was the only one used in the full proof.
    var used = result.techniques, tiers = { "naked-single": 1, "hidden-single": 2,
      "locked-candidate": 3, "naked-pair": 3, "hidden-pair": 3 };
    if (!used || typeof used !== "object" || Array.isArray(used)) return null;
    var names = Object.keys(used), tier = 0, steps = 0;
    if (!names.length || names.some(function (name) {
      if (!Object.prototype.hasOwnProperty.call(tiers, name) || !Number.isInteger(used[name]) || used[name] <= 0) return true;
      tier = Math.max(tier, tiers[name]); steps += used[name]; return false;
    }) || steps !== result.steps) return null;
    return [null, "easy", "medium", "hard"][tier];
  }
  function supportsDifficulty(mode) { return Boolean(Hints && Hints.ratingModes.indexOf(mode) >= 0); }
  function matchesDifficulty(givens, difficulty, context) {
    context = context || "classic";
    var mode = typeof context === "string" ? context : context.mode;
    if (!supportsDifficulty(mode)) return false;
    var options = { maxSteps: 200, timeLimitMs: 200 };
    var result = mode === "classic" ? Hints.rateClassic(givens, context, options) : Hints.ratePuzzle(givens, context, options);
    return ratingTier(result) === difficulty;
  }
  function generate(request) {
    request = request || {};
    if (request.fresh === true) return generateFresh(request);
    var mode = request.mode || "classic";
    if (!supportsDifficulty(mode)) return carve(request, 0);
    for (var attempt = 0; attempt < (mode === "classic" ? 16 : 8); attempt++) {
      var puzzle;
      try { puzzle = carve(request, attempt); }
      catch (error) {
        if (["DENSITY_NOT_REACHED", "UNCHANGED_MASK"].indexOf(error.code) < 0) throw error;
        continue;
      }
      if (matchesDifficulty(puzzle.givens, request.difficulty || "easy", {mode:mode,clues:puzzle.clues})) {
        puzzle.generation.difficultyBasis = "supported-logic";
        puzzle.rating = "generated-logic-" + puzzle.difficulty;
        return puzzle;
      }
    }
    fail(mode === "classic" ? "CLASSIC_DIFFICULTY_NOT_REACHED" : "VARIANT_DIFFICULTY_NOT_REACHED");
  }
  function freshModes() { return Sources.supportedModes().concat(ClueBuilder.supportedModes()); }
  function supportsFresh(mode) { return freshModes().indexOf(mode) >= 0; }
  function keyFor(text) { var h=hashWords(text);return [h(),h(),h(),h()].map(function(n){return n.toString(16).padStart(8,"0");}).join(""); }
  // No answer is read by this proof. Repairs below add honest givens, then rerun it.
  function basicProof(givens, context) {
    var b=givens.slice(),steps=0,units=Engine.getUnits(context).filter(function(u){return u.cells.length===9;});
    while(b.indexOf(0)>=0){
      var masks=b.map(function(n,i){return n?[]:Engine.candidates(b,i,context);}), move=null;
      for(var i=0;i<b.length;i++)if(!b[i]&&masks[i].length===1){move=[i,masks[i][0]];break;}
      if(!move)for(var u=0;u<units.length&&!move;u++)for(var d=1;d<=9&&!move;d++){
        var places=units[u].cells.filter(function(i){return !b[i]&&masks[i].indexOf(d)>=0;});if(places.length===1)move=[places[0],d];
      }
      if(!move)return {solved:false,board:b,steps:steps};
      b[move[0]]=move[1];steps++;
    }
    return {solved:Engine.validateComplete(b,context),board:b,steps:steps};
  }
  function baseSignature(puzzle) {
    if(puzzle.solution.length===81)return Diversity.solutionSignature(puzzle.solution);
    var layout=Engine.getLayout({mode:puzzle.mode,clues:puzzle.clues});
    return "joint-subgrid-spectrum-v1:"+puzzle.mode+":"+layout.boards.map(function(b){return Diversity.solutionSignature(b.cells.map(function(i){return puzzle.solution[i];}));}).sort().join("|");
  }
  function generateFresh(request,recoveryStrategy) {
    var mode=request.mode||"classic",difficulty=request.difficulty||"easy";
    if(!supportsFresh(mode))fail("FRESH_MODE_UNSUPPORTED");
    if(["easy","medium","hard"].indexOf(difficulty)<0)fail("CURATED_DIFFICULTY");
    if(typeof request.seed!=="string"||!request.seed.length||request.seed.length>256)fail("INVALID_SEED");
    var recent=Array.isArray(request.avoidFingerprints)?request.avoidFingerprints:[],marked=ClueBuilder.supportedModes().indexOf(mode)>=0,last="FRESH_BUDGET";
    // These two strict-technique modes try two bounded removal orders on each
    // new base. The total carving budget remains twelve, not twelve per branch.
    // A reused base is never presented as another independent puzzle: the same
    // canonical recent-base exclusion applies before either carving branch.
    var pairedBranches=recoveryStrategy!=="legacy-source"&&difficulty==="hard"&&(mode==="classic"||mode==="king"),cachedSource=null,cachedAttempt=-1;
    for(var attempt=0;attempt<(supportsDifficulty(mode)?12:4);attempt++){
      try {
        var sourceAttempt=pairedBranches?Math.floor(attempt/2):attempt;
        var seed=keyFor(request.seed+":fresh-v1:"+mode+":"+sourceAttempt);
        var source;
        if(pairedBranches&&cachedAttempt===sourceAttempt)source=cachedSource;
        else{source=Sources.generate({mode:marked?"classic":mode,seed:seed});if(pairedBranches){cachedSource=source;cachedAttempt=sourceAttempt;}}
        source.mode=mode;
        if(marked)source.clues=ClueBuilder.build({mode:mode,solution:source.solution,seed:seed+":clues"});
        var baseKey=keyFor("base-v1:"+baseSignature(source));
        var layoutKey=(marked||mode==="jigsaw")?keyFor(Diversity.layoutSignature(mode,source.clues)):null;
        if(recent.indexOf(baseKey)>=0||layoutKey&&recent.indexOf(layoutKey)>=0){last="RECENT_STRUCTURE_DUPLICATE";continue;}
        // Preserve the original source/mask pairing in the first branch;
        // the second explores the adjacent order instead of skipping it.
        var carveAttempt=pairedBranches?sourceAttempt+(attempt%2):attempt;
        var puzzle=carve(request,carveAttempt,source,recoveryStrategy),context={mode:mode,clues:puzzle.clues},repairs=0,depthProof=null;
        if(supportsDifficulty(mode)) { if(!matchesDifficulty(puzzle.givens,difficulty,context)){last="FRESH_DIFFICULTY_NOT_REACHED";continue;} }
        else {
          depthProof=RulePath.analyze(puzzle.givens,context);
          if(RulePath.tier(depthProof,mode)!==difficulty){last="RULE_DEPTH_NOT_REACHED";continue;}
        }
        var contribution=0;
        if(marked){puzzle.givens.forEach(function(n,i){if(!n&&Engine.candidates(puzzle.givens,i,context).length<Engine.candidates(puzzle.givens,i,"classic").length)contribution++;});if(!contribution){last="FRESH_RULE_NOT_USED";continue;}}
        puzzle.id="FRESH1-"+mode+"-"+request.seed;puzzle.sourceId=null;
        puzzle.generation.version=5;puzzle.generation.kind="constructed";
        puzzle.generation.difficultyBasis=supportsDifficulty(mode)?"supported-logic":"rule-depth";
        if(depthProof){puzzle.generation.logicRounds=depthProof.rounds;puzzle.generation.logicGrade=difficulty;}
        if(marked){var quality=Quality.analyze(puzzle.givens,context);if(!Quality.accepts(quality,difficulty))fail("RULE_QUALITY_NOT_REACHED");puzzle.generation.ruleQuality=Quality.summary(quality);}
        puzzle.generation.givenCount=puzzle.givens.filter(Boolean).length;puzzle.generation.target=puzzle.generation.givenCount;
        puzzle.generation.fingerprint=fingerprint(puzzle);puzzle.generation.baseFingerprint=baseKey;
        if(layoutKey)puzzle.generation.layoutFingerprint=layoutKey;
        puzzle.generation.logicVerified=true;puzzle.generation.logicRepairs=repairs;puzzle.generation.ruleReductions=contribution;
        if(recent.indexOf(puzzle.generation.fingerprint)>=0){last="RECENT_DUPLICATE";continue;}
        puzzle.rating=supportsDifficulty(mode)?"generated-logic-"+difficulty:"constructed-rule-path-"+difficulty;
        return puzzle;
      }catch(error){if(["DIVERSITY_BUDGET","DIVERSITY_REGIONS_UNAVAILABLE","DIVERSITY_LAYOUT_UNAVAILABLE","DENSITY_NOT_REACHED","RULE_DEPTH_NOT_REACHED","RULE_QUALITY_NOT_REACHED","UNCHANGED_MASK","RECENT_DUPLICATE"].indexOf(error.code)<0)throw error;last=error.code;}
    }
    fail(last);
  }
  // Independent, explicitly bounded recovery stages. Ordinary generation and
  // frozen daily policy do not invoke or change behavior through this API.
  function recoveryKeys(puzzle){
    var keys=[fingerprint(puzzle),keyFor("base-v1:"+baseSignature(puzzle))];
    if(ClueBuilder.supportedModes().indexOf(puzzle.mode)>=0||puzzle.mode==="jigsaw")keys.push(keyFor(Diversity.layoutSignature(puzzle.mode,puzzle.clues)));
    return keys;
  }
  function recoveryValid(puzzle,request){
    try{
    if(!puzzle||puzzle.mode!==request.mode||puzzle.difficulty!==request.difficulty||!Array.isArray(puzzle.givens)||!Array.isArray(puzzle.solution))return false;
    var context={mode:puzzle.mode,clues:puzzle.clues},layout=Engine.getLayout(context);
    if(puzzle.givens.length!==layout.cellCount||puzzle.solution.length!==layout.cellCount||!puzzle.givens.every(function(n,i){return Number.isInteger(n)&&n>=0&&n<=9&&(!n||n===puzzle.solution[i]);})||!Engine.validateComplete(puzzle.solution,context))return false;
    var recent=Array.isArray(request.avoidFingerprints)?request.avoidFingerprints:[],keys=recoveryKeys(puzzle),metadata=puzzle.generation;
    if(metadata){
      if(metadata.version!==5||metadata.kind!=="constructed"||puzzle.sourceId!==null||typeof metadata.seed!=="string"||metadata.fingerprint!==keys[0]||metadata.baseFingerprint!==keys[1]||metadata.givenCount!==puzzle.givens.filter(Boolean).length||metadata.logicVerified!==true)return false;
      if(keys.length>2&&metadata.layoutFingerprint!==keys[2])return false;
      if(supportsDifficulty(puzzle.mode)){if(metadata.difficultyBasis!=="supported-logic")return false;}
      else{var depth=RulePath.analyze(puzzle.givens,context);if(metadata.difficultyBasis!=="rule-depth"||metadata.logicRounds!==depth.rounds||metadata.logicGrade!==request.difficulty)return false;}
      if(Quality.supported(puzzle.mode)&&!Quality.sameSummary(metadata.ruleQuality,Quality.summary(Quality.analyze(puzzle.givens,context))))return false;
    }
    if(keys.some(function(k){return recent.indexOf(k)>=0;}))return false;
    var unique=Engine.analyzeSolutions(puzzle.givens,context,{limit:2,maxNodes:12000});
    if(unique.exhausted||unique.count!==1||!unique.solution||unique.solution.some(function(n,i){return n!==puzzle.solution[i];}))return false;
    if(supportsDifficulty(puzzle.mode))return matchesDifficulty(puzzle.givens,request.difficulty,context);
    if(RulePath.tier(RulePath.analyze(puzzle.givens,context),puzzle.mode)!==request.difficulty)return false;
    return !Quality.supported(puzzle.mode)||Quality.accepts(Quality.analyze(puzzle.givens,context),request.difficulty);
    }catch(error){return false;}
  }
  function recoverySeed(request,stage){return keyFor("recovery-v1:"+stage+":"+(request.mode||"classic")+":"+(request.difficulty||"easy")+":"+request.seed);}
  function recover(request,options){
    request=request||{};options=options||{};
    var mode=request.mode||"classic",difficulty=request.difficulty||"easy",stage=options.stage;
    if(!supportsFresh(mode)&&mode!=="miracle")fail("RECOVERY_MODE_UNSUPPORTED");
    if(["easy","medium","hard"].indexOf(difficulty)<0)fail("CURATED_DIFFICULTY");
    if(typeof request.seed!=="string"||!request.seed.length||request.seed.length>256)fail("INVALID_SEED");
    if(["fresh-retry","verified-catalog"].indexOf(stage)<0)fail("INVALID_RECOVERY_STAGE");
    var retrySeed=recoverySeed(request,stage);
    var normalized=Object.assign({},request,{mode:mode,difficulty:difficulty}),puzzle;
    function result(p){return {puzzle:p,recovery:{version:1,kind:stage,requestSeed:request.seed,seed:retrySeed,sourceId:p.sourceId||null}};}
    if(stage==="fresh-retry"){
      if(!supportsFresh(mode))fail("RECOVERY_SEARCH_UNSUPPORTED");
      puzzle=generateFresh(Object.assign({},normalized,{seed:retrySeed,fresh:true}),mode==="classic"||mode==="king"?"legacy-source":undefined);
      if(!recoveryValid(puzzle,normalized))fail("RECOVERY_VERIFICATION_FAILED");
      return result(puzzle);
    }
    // Density labels are never promoted to a logical grade. Only modes with a
    // complete strict Hints grader can use this finite catalogue alternative.
    var catalog=(supportsDifficulty(mode)||mode==="miracle"?Engine.getPuzzleCatalog(mode,difficulty):[]).filter(function(p){return p.mode===mode&&p.difficulty===difficulty&&typeof p.id==="string";});
    var random=rng(retrySeed);
    for(var i=catalog.length-1;i>0;i--){var j=Math.floor(random()*(i+1)),old=catalog[i];catalog[i]=catalog[j];catalog[j]=old;}
    for(var n=0;n<Math.min(24,catalog.length);n++){
      try{puzzle=Engine.getPuzzle(difficulty,retrySeed,mode,{sourceId:catalog[n].id});
        if(puzzle.generation||puzzle.sourceId!==catalog[n].id||!recoveryValid(puzzle,normalized))continue;
      }catch(error){if(error instanceof TypeError||error instanceof RangeError)continue;throw error;}
      puzzle.rating=(supportsDifficulty(mode)?"verified-catalog-logic-":"verified-catalog-rule-depth-")+difficulty;
      return result(puzzle);
    }
    // These fixed, previously generated puzzles keep their original verified
    // metadata. They are a finite reserve, not newly generated on this request.
    var reserve=RecoveryReserve.candidates(mode,difficulty);
    for(var r=reserve.length-1;r>0;r--){var k=Math.floor(random()*(r+1)),saved=reserve[r];reserve[r]=reserve[k];reserve[k]=saved;}
    for(var c=0;c<Math.min(24,reserve.length);c++){
      var entry=reserve[c];
      if(!entry||typeof entry.reserveId!=="string"||!entry.puzzle||!entry.puzzle.generation||entry.puzzle.generation.version!==5||entry.puzzle.generation.kind!=="constructed")continue;
      if(!recoveryValid(entry.puzzle,normalized))continue;
      return {puzzle:entry.puzzle,recovery:{version:1,kind:"verified-reserve",requestSeed:request.seed,seed:entry.puzzle.generation.seed,sourceId:entry.puzzle.sourceId||null,reserveId:entry.reserveId}};
    }
    fail("CATALOG_EXHAUSTED");
  }
  function createClient() {
    var active = null;
    function cancel() { if (active) active.cancel(); }
    function run(request, options) {
      cancel(); options=options||{};
      return new Promise(function (resolve, reject) {
        if (typeof Worker === "undefined" || typeof Blob === "undefined" || !Engine.workerSource) { reject(new Error("WORKER_UNAVAILABLE")); return; }
        var worker, url, timer, settled = false, serial=0, stageIndex=0;
        var stages=options.recovery ? ["primary","fresh-retry"].concat(options.allowCatalog===false?[]:["verified-catalog"]) : ["primary"];
        function clean() {
          clearTimeout(timer); timer=null;
          if(worker)worker.terminate();worker=null;
          if(url)URL.revokeObjectURL(url);url=null;
        }
        function finish(error, result) {
          if (settled) return; settled = true; serial++; clean();
          active = null; if (error) reject(error); else resolve(result);
        }
        active = { cancel: function () { var e = new Error("GENERATION_CANCELLED"); e.name = "AbortError"; finish(e); } };
        function start() {
          if(settled)return;
          var stage=stages[stageIndex], token=++serial, budget=stage==="verified-catalog"?4000:8000;
          function failed(error) {
            if(settled||token!==serial)return;
            clean(); serial++;
            if(stageIndex+1<stages.length){stageIndex++;start();}
            else {error.recoveryExhausted=options.recovery===true;finish(error);}
          }
          try {
            if(typeof options.onStage==="function")options.onStage({stage:stage,budgetMs:budget,index:stageIndex+1,total:stages.length});
            if(settled||token!==serial)return;
            var source = Engine.workerSource() + Hints.workerSource() + Sources.workerSource() + ClueBuilder.workerSource() + Diversity.workerSource() + FrozenDaily.workerSource() + RulePath.workerSource() + Quality.workerSource() + RecoveryReserve.workerSource() + "var generator=(" + createGenerator.toString() + ")(SudokuEngine,SudokuHints,NineRealmsDiversitySource,NineRealmsDiversityClues,NineRealmsDiversity,NineRealmsDailyGeneratorV1,NineRealmsRulePathGrading,NineRealmsRuleQuality,NineRealmsRecoveryReserve);\n" +
              "self.onmessage=function(event){try{var data=event.data;self.postMessage(data.recoveryStage?generator.recover(data.request,{stage:data.recoveryStage}):{puzzle:generator.generate(data)});}catch(error){self.postMessage({error:error.code||error.message});}};";
            url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
            worker = new Worker(url);
            worker.onmessage = function (event) {
              if(settled||token!==serial)return;
              var data=event.data;
              if(!data||data.error||!data.puzzle){failed(new Error(data&&data.error||"GENERATION_INVALID_RESULT"));return;}
              if(stage!=="primary") {
                if(!data.recovery||(data.recovery.kind!==stage&&!(stage==="verified-catalog"&&data.recovery.kind==="verified-reserve"))){failed(new Error("GENERATION_INVALID_RECOVERY"));return;}
                data.puzzle.deliveryRecovery=data.recovery;
              }
              finish(null,data.puzzle);
            };
            worker.onerror = function () { failed(new Error("WORKER_FAILED")); };
            timer = setTimeout(function () { failed(new Error("GENERATION_TIMEOUT")); }, budget);
            worker.postMessage(stage==="primary"?request:{request:request,recoveryStage:stage});
          } catch(error) { failed(error); }
        }
        start();
      });
    }
    return { run: run, cancel: cancel };
  }
  return { generate: generate, recover: recover, recoverySeed: recoverySeed, recoveryValid: recoveryValid, recoveryKeys: recoveryKeys, recentKeys: recoveryKeys, createClient: createClient, fingerprint: fingerprint, seed: seed, version: VERSION,
    generateDailyV1: function(options){return FrozenDaily.generate(options);}, baseSignature: baseSignature, supportsFresh: supportsFresh, freshModes: freshModes, basicProof: basicProof, matchesDifficulty: matchesDifficulty, supportsDifficulty: supportsDifficulty, ratingTier: ratingTier };
});
