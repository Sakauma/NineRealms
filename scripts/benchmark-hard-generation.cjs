#!/usr/bin/env node
'use strict';
/* Controlled hard-generation A/B; no product writes. Use --run explicitly. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),os=require('node:os');
const candidateRoot=path.resolve(__dirname,'..'),baselineRoot=path.resolve(process.env.HARD_BENCH_BASELINE||path.join(candidateRoot,'../ninerealms_quality_v5_1113'));
const count=Number(process.env.HARD_BENCH_SAMPLES||200),arm=process.env.HARD_BENCH_ARM||'paired',filename=process.env.HARD_BENCH_OUTPUT||'hard-ab-200.json';
if(!Number.isInteger(count)||count<1||count>1000||!['paired','baseline','candidate'].includes(arm)||path.basename(filename)!==filename)throw Error('Invalid benchmark configuration');
const seedNamespace=process.env.HARD_BENCH_SEED_NAMESPACE||'v1',replayPath=process.env.HARD_BENCH_REPLAY_REPORT;
if(!/^[a-zA-Z0-9_-]+$/.test(seedNamespace))throw Error('Invalid seed namespace');
const modes=['classic','king'],arms=arm==='paired'?['baseline','candidate']:[arm],roots={baseline:baselineRoot,candidate:candidateRoot};
const reportPath=path.join(baselineRoot,'docs/diversity-audit/v5-audit-30.json'),old=JSON.parse(fs.readFileSync(reportPath));
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const sourceFiles=['generator.js','engine.js','hints.js','diversity-source.js','diversity-clues.js','puzzle-diversity.js','rule-path-grading.js','rule-quality.js'];
const digests=root=>Object.fromEntries(sourceFiles.map(name=>[name,hash(fs.readFileSync(path.join(root,'src',name)))]));
function addKeys(ledger,record){const g=record.puzzle?.generation||{};for(const key of [record.fingerprint||g.fingerprint,record.baseFingerprint||g.baseFingerprint,record.layoutFingerprint||g.layoutFingerprint])if(typeof key==='string'&&/^[a-f0-9]{32}$/.test(key))ledger=ledger.filter(v=>v!==key).concat(key).slice(-256);return ledger;}
function ledgerBefore(index){let keys=[];for(const r of old.records.slice(0,index))if(r.status==='success')keys=addKeys(keys,r);return keys;}
const ledgerByMode=Object.fromEntries(modes.map(mode=>{const index=old.records.findIndex(r=>r.mode===mode);if(index<0)throw Error('No baseline ledger for '+mode);return [mode,ledgerBefore(index)];}));
const regressions=[['classic','fresh-quality-v4-classic-14'],['king','fresh-quality-v4-king-17']].map(([mode,seed])=>{const index=old.records.findIndex(r=>r.mode===mode&&r.seed===seed);if(index<0||old.records[index].status==='success')throw Error('Missing original failed case '+seed);return {cohort:'legacy-regression',mode,seed,originalRecordIndex:index,originalCode:old.records[index].code,avoidFingerprints:ledgerBefore(index)};});
if(seedNamespace!=='v1')for(const i of [105,168])regressions.push({cohort:'candidate1-regression',mode:'classic',seed:`hard-controlled-v1-classic-${i}`,originalCode:i===168?'CANDIDATE1_DENSITY_NOT_REACHED':'BASELINE_DENSITY_NOT_REACHED',avoidFingerprints:[]});
let cases=[...regressions];for(let i=0;i<count;i++)for(const mode of modes)cases.push({cohort:'independent',mode,index:i,seed:`hard-controlled-${seedNamespace}-${mode}-${i}`,avoidFingerprints:ledgerByMode[mode].slice()});
let replay=null;
if(replayPath){
 if(arm!=='candidate')throw Error('Replay requires HARD_BENCH_ARM=candidate');
 const bytes=fs.readFileSync(path.resolve(replayPath)),report=JSON.parse(bytes);
 if(!report.complete)throw Error('Cannot replay incomplete report');
 cases=report.requestCases.filter(c=>c.cohort==='independent').map(c=>({...c,avoidFingerprints:c.avoidFingerprints.slice()}));
 if(!cases.length||cases.some(c=>!modes.includes(c.mode)||typeof c.seed!=='string'))throw Error('Invalid replay cases');
 replay={report:path.basename(replayPath),sha256:hash(bytes),records:report.records};
}
const plan={seedNamespace:replay?'exact-report-replay':seedNamespace,replay:replay?{report:replay.report,sha256:replay.sha256}:null,baselineDirectory:process.env.HARD_BENCH_BASELINE?'HARD_BENCH_BASELINE (caller-supplied)':'../ninerealms_quality_v5_1113',candidateDirectory:'.',arms,independentSeedsPerMode:replay?null:count,legacyRegressions:(replay?[]:regressions).map(x=>({mode:x.mode,seed:x.seed,originalCode:x.originalCode,ledgerKeys:x.avoidFingerprints.length})),calls:cases.length*arms.length,output:filename};
if(!process.argv.includes('--run')){console.log(JSON.stringify(plan,null,2));process.exit(0);}
const output=path.join(candidateRoot,'evidence/hard-generation',filename);if(fs.existsSync(output))throw Error('Refusing to overwrite existing evidence: '+filename);
const started=Date.now(),sourceHashes=Object.fromEntries(arms.map(a=>[a,digests(roots[a])])),generators=Object.fromEntries(arms.map(a=>[a,require(path.join(roots[a],'src/generator.js'))]));
// A separate VM makes fixed baseline validation independent from both generator
// instances (no arm gets extra engine cache/JIT warming from validation).
const BE=require(path.join(baselineRoot,'src/engine')),BH=require(path.join(baselineRoot,'src/hints')),BD=require(path.join(baselineRoot,'src/puzzle-diversity'));
const context=vm.createContext({});vm.runInContext(BE.workerSource()+BH.workerSource()+BD.workerSource(),context);
const E=context.SudokuEngine,H=context.SudokuHints,D=context.NineRealmsDiversity;
const warmups=[],records=[],duplicateFindings=[],signatureMaps=Object.fromEntries(arms.map(a=>[a,new Map()]));
const declineCodes=new Set(['DENSITY_NOT_REACHED','FRESH_DIFFICULTY_NOT_REACHED','CLASSIC_DIFFICULTY_NOT_REACHED','VARIANT_DIFFICULTY_NOT_REACHED','UNCHANGED_MASK','RECENT_DUPLICATE','RECENT_STRUCTURE_DUPLICATE','FRESH_RULE_NOT_USED','RULE_DEPTH_NOT_REACHED','FRESH_LOGIC_NOT_REACHED','FRESH_BUDGET']);
const budgetCodes=new Set(['DIVERSITY_BUDGET','GENERATION_TIMEOUT','FRESH_TIME_BUDGET','GENERATION_BUDGET']);
function classifyError(e){return budgetCodes.has(e.code)?'generation-budget':declineCodes.has(e.code)?'generation-declined':'generation-error';}
function strictTier(r){if(!r.solved||r.status!=='rated'||!r.steps||!r.techniques)return null;const tier={'naked-single':1,'hidden-single':2,'locked-candidate':3,'naked-pair':3,'hidden-pair':3};let max=0,steps=0;for(const [k,n] of Object.entries(r.techniques)){if(!tier[k]||!Number.isInteger(n)||n<1)return null;max=Math.max(max,tier[k]);steps+=n;}return steps===r.steps?[null,'easy','medium','hard'][max]:null;}
function stats(a){if(!a.length)return null;const s=a.slice().sort((x,y)=>x-y),q=p=>Math.round(s[Math.ceil(s.length*p)-1]);return {count:s.length,p50:q(.5),p95:q(.95),p99:q(.99),min:Math.round(s[0]),max:Math.round(s.at(-1))};}
function frequencies(a){const r={};for(const x of a)r[x]=(r[x]||0)+1;return r;}
function summary(){const rows=[];for(const cohort of ['independent','legacy-regression','candidate1-regression'])for(const mode of modes)for(const a of arms){const r=records.filter(x=>x.cohort===cohort&&x.mode===mode&&x.arm===a);if(!r.length)continue;const ok=r.filter(x=>x.outcome==='verified-hard');rows.push({cohort,mode,arm:a,requests:r.length,verifiedHard:ok.length,outcomes:frequencies(r.map(x=>x.outcome)),failureCodes:frequencies(r.filter(x=>x.code).map(x=>x.code)),independentBaseClasses:new Set(ok.map(x=>x.solutionClass)).size,within8SecondVerifiedGeneratorCompletions:ok.filter(x=>x.generationMs<=8000).length,above8Second:r.filter(x=>x.generationMs>8000).map(x=>({seed:x.seed,outcome:x.outcome,ms:Math.round(x.generationMs)})),generationMs:stats(r.map(x=>x.generationMs)),verifiedGenerationMs:stats(ok.map(x=>x.generationMs)),refusedGenerationMs:stats(r.filter(x=>!x.puzzle).map(x=>x.generationMs)),cpuMs:stats(r.map(x=>x.cpuMs))});}
 const paired=[];if(arms.length===2)for(const mode of modes){const pairs=cases.filter(c=>c.cohort==='independent'&&c.mode===mode).map(c=>arms.map(a=>records.find(r=>r.arm===a&&r.seed===c.seed))).filter(p=>p.every(Boolean));paired.push({mode,pairs:pairs.length,improvedToVerified:pairs.filter(([a,b])=>a.outcome!=='verified-hard'&&b.outcome==='verified-hard').map(p=>p[0].seed),regressedFromVerified:pairs.filter(([a,b])=>a.outcome==='verified-hard'&&b.outcome!=='verified-hard').map(p=>p[0].seed),candidateMinusBaselineMs:stats(pairs.map(([a,b])=>b.generationMs-a.generationMs))});}const replayComparison=replay?records.map(r=>{const prior=replay.records.find(p=>p.arm==='candidate'&&p.seed===r.seed&&p.mode===r.mode);return {mode:r.mode,seed:r.seed,priorOutcome:prior?.outcome,outcome:r.outcome,code:r.code,requestMatches:prior?.requestSha256===r.requestSha256,regressed:prior?.outcome==='verified-hard'&&r.outcome!=='verified-hard',fixed:prior?.outcome!=='verified-hard'&&r.outcome==='verified-hard'};}):null;return {rows,paired,replayComparison};}
function save(complete){const endingHashes=complete?Object.fromEntries(arms.map(a=>[a,digests(roots[a])])):null,changed=complete?arms.filter(a=>JSON.stringify(sourceHashes[a])!==JSON.stringify(endingHashes[a])):[];const result={version:1,complete,plan,sourceHashes,endingHashes,changedSourceArms:changed,originalReport:{path:path.relative(candidateRoot,reportPath),sha256:hash(fs.readFileSync(reportPath))},environment:{platform:process.platform,arch:process.arch,node:process.version,cpuModel:os.cpus()[0]?.model,cpuCount:os.cpus().length},method:'Warm both modules; fixed identical request inputs; alternate AB/BA serially with no parallel generation; independent new seed cohort plus separately reported regression cases with exact original ledgers; replay mode uses the archived independent requests verbatim. Each independent seed uses a fixed original pre-mode ledger, NOT divergent per-arm rolling history. Fixed baseline validator runs in a separate VM.',timingScope:'Synchronous Node generation wall time and process CPU, excluding independent validation. Not a real browser or Windows test. >8000ms never counted as UI delivery; <=8000ms still is not proof of UI delivery. Single timing sample per seed/arm, not statistical performance certification.',startedAt:new Date(started).toISOString(),elapsedMs:Date.now()-started,warmups,requestCases:cases,requests:records.length,...summary(),duplicateFindings,records};fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2));return result;}
function validate(p,record){
 const ctx={mode:record.mode,clues:p.clues};
 if(!p.generation||p.generation.kind!=='constructed'||p.mode!==record.mode||p.difficulty!=='hard'||!E.validateComplete(p.solution,ctx)||!p.givens.every((n,i)=>!n||n===p.solution[i])){record.outcome='invalid';record.code='INVALID_OUTPUT';return;}
 record.solutionClass=D.solutionSignature(p.solution);const previous=signatureMaps[record.arm].get(record.solutionClass);if(previous)duplicateFindings.push({arm:record.arm,current:{mode:record.mode,seed:record.seed,cohort:record.cohort},previous});else signatureMaps[record.arm].set(record.solutionClass,{mode:record.mode,seed:record.seed,cohort:record.cohort});
 const unique=E.analyzeSolutions(p.givens,ctx,{limit:2,maxNodes:500000});record.uniqueProof={count:unique.count,exhausted:unique.exhausted,nodes:unique.nodes};
 if(unique.exhausted){record.outcome='validation-budget';record.code='UNIQUENESS_BUDGET';return;}
 if(unique.count!==1||unique.solution.join('')!==p.solution.join('')){record.outcome='invalid';record.code='NOT_UNIQUE_OR_SOLUTION_MISMATCH';return;}
 const rating=H.ratePuzzle(p.givens,ctx,{maxSteps:200,timeLimitMs:1000,trace:true});record.strictProof={status:rating.status,reason:rating.reason,solved:rating.solved,tier:strictTier(rating),steps:rating.steps,techniques:rating.techniques,budgetMs:1000};
 if(rating.status==='budget'){record.outcome='validation-budget';record.code='HINTS_BUDGET';record.failedProof=rating;return;}
 if(!rating.solved){record.outcome='validation-stalled';record.code='HINTS_NOT_SOLVED';record.failedProof=rating;return;}
 if(strictTier(rating)!=='hard'){record.outcome='validation-wrong-tier';record.code='NOT_STRICT_HARD';record.failedProof=rating;return;}
 const board=p.givens.slice();for(const a of rating.trace||[])if(a.kind!=='elimination'){if(board[a.index]){record.outcome='invalid';record.code='TRACE_OVERWRITES_GIVEN';return;}board[a.index]=a.value;}
 if(board.join('')!==p.solution.join('')){record.outcome='invalid';record.code='TRACE_SOLUTION_MISMATCH';return;}record.outcome='verified-hard';
}
// Warming is explicit, recorded, and never included in success/latency denominators.
for(const a of arms)for(const mode of modes)for(const difficulty of ['easy','hard']){const request={mode,difficulty,seed:`hard-bench-warmup-v1-${mode}-${difficulty}`,fresh:true};try{const p=generators[a].generate(request);warmups.push({arm:a,mode,difficulty,status:'returned'});}catch(e){warmups.push({arm:a,mode,difficulty,status:classifyError(e),code:e.code||e.message});}}
const warm=BE.getPuzzle('easy','validator-warmup','classic');E.analyzeSolutions(warm.givens,'classic',{limit:2,maxNodes:500000});H.ratePuzzle(warm.givens,'classic',{maxSteps:200,timeLimitMs:1000});D.solutionSignature(warm.solution);
for(let index=0;index<cases.length;index++){
 const c=cases[index],reverse=c.cohort==='independent'?c.index%2:index%2,order=arms.length===2&&reverse?arms.slice().reverse():arms;
 for(const a of order){const request={mode:c.mode,difficulty:'hard',seed:c.seed,fresh:true,avoidFingerprints:c.avoidFingerprints.slice()},r={arm:a,cohort:c.cohort,mode:c.mode,seed:c.seed,index:c.index,caseOrder:index,armOrder:order,requestSha256:hash(JSON.stringify(request)),loadAverage:os.loadavg(),startedAt:new Date().toISOString()},cpu=process.cpuUsage(),start=performance.now();let p;
  try{p=generators[a].generate(request);}catch(e){r.outcome=classifyError(e);r.code=e.code||e.message;r.error=e.message;}
  r.generationMs=performance.now()-start;const used=process.cpuUsage(cpu);r.cpuMs=(used.user+used.system)/1000;r.above8SecondWatchdog=r.generationMs>8000;
  if(p){r.puzzle=p;const at=performance.now();try{validate(p,r);}catch(e){r.outcome='validation-error';r.code=e.code||e.message;r.validationStack=String(e.stack).split(candidateRoot).join('<candidate>').split(baselineRoot).join('<baseline>');}r.validationMs=performance.now()-at;}
  records.push(r);
 }
 if(index%10===9||index===cases.length-1){save(false);console.log('Cases',index+1,'/',cases.length);}
}
const final=save(true);console.log(JSON.stringify({output,requests:final.requests,elapsedMs:final.elapsedMs,rows:final.rows,paired:final.paired,duplicates:duplicateFindings.length,changedSourceArms:final.changedSourceArms},null,2));
if(final.changedSourceArms.length||duplicateFindings.length||records.some(r=>['invalid','validation-error','validation-budget','validation-stalled','validation-wrong-tier','generation-error'].includes(r.outcome)))process.exitCode=1;
