#!/usr/bin/env node
'use strict';
// Read-only synchronous quality benchmark. Evidence only; no product changes.
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const H=require('../src/hints'),E=require('../src/engine'),G=require('../src/generator'),D=require('../src/puzzle-diversity'),C=require('../src/diversity-clues'),R=require('../src/rule-path-grading'),Q=require('../src/rule-quality');
const sourceDigests=Object.fromEntries(['generator.js','engine.js','hints.js','diversity-source.js','diversity-clues.js','puzzle-diversity.js','rule-path-grading.js','rule-quality.js'].map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../src',name))).digest('hex')]));
const samples=Number(process.env.FRESH_AUDIT_SAMPLES||30),selected=process.env.FRESH_AUDIT_MODES?process.env.FRESH_AUDIT_MODES.split(','):G.freshModes();
if(!Number.isInteger(samples)||samples<1||samples>1000||selected.some(m=>!G.supportsFresh(m)))throw Error('Invalid audit sample count/modes');
const filename=process.env.FRESH_AUDIT_OUTPUT||'v5-audit-30.json';if(path.basename(filename)!==filename)throw Error('Output must be a basename');
const out=path.join(__dirname,'../evidence/diversity',filename),started=Date.now(),marked=new Set(C.supportedModes()),withLayout=new Set([...marked,'jigsaw']);
const expected=new Set(['DIVERSITY_BUDGET','DIVERSITY_REGIONS_UNAVAILABLE','DIVERSITY_LAYOUT_UNAVAILABLE','DENSITY_NOT_REACHED','RULE_DEPTH_NOT_REACHED','RULE_QUALITY_NOT_REACHED','UNCHANGED_MASK','FRESH_DIFFICULTY_NOT_REACHED','FRESH_LOGIC_NOT_REACHED','FRESH_RULE_NOT_USED','FRESH_BUDGET','RECENT_STRUCTURE_DUPLICATE','RECENT_DUPLICATE']);
let recent=[],priorLedger=null;
if(process.env.FRESH_AUDIT_PRIOR){
 const name=process.env.FRESH_AUDIT_PRIOR;if(path.basename(name)!==name)throw Error('Prior report must be a basename');
 const prior=JSON.parse(fs.readFileSync(path.join(__dirname,'../evidence/diversity',name))),stop=prior.records.findIndex(r=>r.mode===selected[0]);
 if(stop<0)throw Error('Prior report does not contain starting mode');
 for(const r of prior.records.slice(0,stop))if(r.status==='success')remember([r.fingerprint,r.baseFingerprint,r.layoutFingerprint]);
 priorLedger={report:name,precedingRecords:stop,keys:recent.length};
}
const globalSolutions=new Map(),layouts=new Map(),records=[],duplicates=[],invalid=[];
function remember(keys){for(const key of keys)if(typeof key==='string'&&/^[a-f0-9]{32}$/.test(key))recent=recent.filter(v=>v!==key).concat(key).slice(-256);}
function stats(a){if(!a.length)return {count:0,p50:null,p95:null,max:null};const s=a.slice().sort((a,b)=>a-b);return {count:s.length,p50:Math.round(s[Math.ceil(s.length*.5)-1]),p95:Math.round(s[Math.ceil(s.length*.95)-1]),max:Math.round(s.at(-1))};}
function range(a){a=a.filter(Number.isFinite);return a.length?{min:Math.min(...a),max:Math.max(...a)}:null;}
function row(mode){
 const a=records.filter(r=>r.mode===mode),ok=a.filter(r=>r.status==='success'),declined=a.filter(r=>r.status==='declined');
 return {mode,requests:a.length,successes:ok.length,explicitDeclines:declined.length,unexpectedFailures:a.filter(r=>r.status==='unexpected-error').length,validationIssues:ok.filter(r=>r.validationError).length,
  independentBaseClasses:new Set(ok.filter(r=>r.solutionClass).map(r=>r.solutionClass)).size,baseScope:E.getLayout(mode).cellCount===81?'classical-fixed-band-group':'conservative-sorted-subgrid-spectrum-not-full-multigrid-isomorphism',
  layoutD4Classes:withLayout.has(mode)?new Set(ok.filter(r=>r.layoutClass).map(r=>r.layoutClass)).size:null,
  generationMs:stats(a.map(r=>r.generationMs)),successGenerationMs:stats(ok.map(r=>r.generationMs)),declineGenerationMs:stats(declined.map(r=>r.generationMs)),above8SecondWatchdog:a.filter(r=>r.generationMs>8000).map(r=>({index:r.index,status:r.status,ms:Math.round(r.generationMs)})),
  ruleContribution:range(ok.map(r=>r.ruleReductions)),overlapContribution:range(ok.map(r=>r.overlapReductionCells)),
  byDifficulty:['easy','medium','hard'].map(d=>({difficulty:d,requests:a.filter(r=>r.difficulty===d).length,successes:ok.filter(r=>r.difficulty===d).length,givenCounts:range(ok.filter(r=>r.difficulty===d).map(r=>r.givenCount)),logicRounds:range(ok.filter(r=>r.difficulty===d).map(r=>r.logicRounds)),declines:declined.filter(r=>r.difficulty===d).map(r=>({index:r.index,code:r.code}))}))};
}
function write(complete){
 const success=records.filter(r=>r.status==='success');
 const report={version:2,generationVersion:5,complete,sourceDigests,priorLedger,samplesPerMode:samples,modes:selected,
  method:'Consecutive fresh requests per mode; alternating tiers; actual app recent keys deduplicated and capped at 256. Full classical fixed-band-group base canonicalization for 81-cell Latin boards, sorted component canonical spectrum for multi boards (conservative, NOT full overlap-graph isomorphism). Pure-geometry D4 clue layouts. Independently replayed uniqueness and declared logical grading.',
  timingScope:'Synchronous Node generation wall time, not an actual browser/Windows/worker UI benchmark. Samples beyond 8000ms are not counted as within-watchdog generator completions and are never claimed as UI-delivered. Within-watchdog also does not prove UI delivery.',
  startedAt:new Date(started).toISOString(),elapsedMs:Date.now()-started,requests:records.length,successes:success.length,explicitDeclines:records.filter(r=>r.status==='declined').length,unexpectedFailures:records.filter(r=>r.status==='unexpected-error').length,
  independentBaseClasses:globalSolutions.size,within8SecondGeneratorCompletions:success.filter(r=>r.generationMs<=8000).length,above8SecondWatchdog:records.filter(r=>r.generationMs>8000).map(r=>({mode:r.mode,difficulty:r.difficulty,index:r.index,status:r.status,ms:Math.round(r.generationMs)})),
  generationMs:stats(records.map(r=>r.generationMs)),duplicateFindings:duplicates,invalidFindings:invalid,rows:selected.filter(m=>records.some(r=>r.mode===m)).map(row),records};
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2));return report;
}
function baseClass(p){
 if(p.solution.length===81)return {signature:D.solutionSignature(p.solution),scope:'classical-fixed-band-group'};
 const components=E.getLayout(p.mode).boards.map(b=>D.solutionSignature(b.cells.map(i=>p.solution[i])));
 return {signature:'joint-subgrid-spectrum-v1:'+p.mode+':'+components.slice().sort().join('|'),scope:'conservative-sorted-subgrid-spectrum-not-full-multigrid-isomorphism',components};
}
function checkLogic(p,record,context){
 if(p.generation.difficultyBasis==='supported-logic'){
  assert(G.supportsDifficulty(p.mode));
  const rating=H.ratePuzzle(p.givens,context,{maxSteps:200,timeLimitMs:1000,trace:true});
  record.logicAudit={status:rating.status,reason:rating.reason,techniques:rating.techniques,tier:G.ratingTier(rating),budgetMs:1000};
  if(!rating.solved||G.ratingTier(rating)!==p.difficulty){record.validationErrorKind=rating.status==='budget'?'audit-budget-unresolved':rating.solved?'solved-wrong-tier':'logic-not-completed';record.logicAuditFailure=rating;throw Error(record.validationErrorKind+': '+rating.reason);}
  const b=p.givens.slice();for(const action of rating.trace||[])if(action.kind!=='elimination'){assert(!b[action.index]);b[action.index]=action.value;}assert.deepEqual(b,p.solution,'strict technique trace reconstructs unique solution');
  record.logicProof='supported-technique-tier';
 }else{
  assert.equal(p.generation.difficultyBasis,'rule-depth');assert(!G.supportsDifficulty(p.mode));
  const rating=R.analyze(p.givens,context,{trace:true});record.logicAudit={status:rating.status,reason:rating.reason,tier:R.tier(rating,p.mode),rounds:rating.rounds,method:rating.method,thresholds:R.thresholds(p.mode)};
  assert(rating.solved,'complete answer-free rule path');assert.equal(R.tier(rating,p.mode),p.difficulty);assert.equal(rating.rounds,p.generation.logicRounds);assert.equal(p.generation.logicGrade,p.difficulty);
  const b=p.givens.slice();for(const wave of rating.trace||[])for(const move of wave){assert(!b[move.index]);b[move.index]=move.digit;}assert.deepEqual(b,p.solution,'parallel trace reconstructs unique solution');
  record.logicProof='answer-free-rule-depth';record.logicRounds=rating.rounds;record.ruleReductionPlacements=rating.ruleReductionPlacements;
 }
}
function contribution(p,record,context){
 if(p.mode==='jigsaw'){record.ruleReductions=null;record.ruleContributionScope='not-compared-with-classic-boxes';return;}
 if(p.solution.length===81){
  record.ruleReductions=p.givens.reduce((n,v,i)=>n+(!v&&E.candidates(p.givens,i,context).length<E.candidates(p.givens,i,'classic').length?1:0),0);
  if(marked.has(p.mode)){assert(record.ruleReductions>0);assert.equal(record.ruleReductions,p.generation.ruleReductions);}
 }else{
  const layout=E.getLayout(p.mode);let reductions=0;
  for(let i=0;i<p.givens.length;i++)if(!p.givens[i]&&layout.cells[i].boards.length>1){const global=E.candidates(p.givens,i,context);if(layout.boards.some(b=>{const local=b.cells.indexOf(i);return local>=0&&E.candidates(b.cells.map(j=>p.givens[j]),local,'classic').length>global.length;}))reductions++;}
  record.overlapReductionCells=reductions;record.ruleReductions=null;
 }
}
for(const mode of selected){
 for(let index=0;index<samples;index++){
  const difficulty=['easy','medium','hard'][index%3],seed=`fresh-quality-v4-${mode}-${index}`,record={mode,difficulty,index,seed},at=performance.now();let p;
  try{p=G.generate({mode,difficulty,seed,fresh:true,avoidFingerprints:recent.slice()});}catch(error){record.generationMs=performance.now()-at;record.status=expected.has(error.code)?'declined':'unexpected-error';record.code=error.code||error.message;records.push(record);if(index%10===9){write(false);console.log(mode,index+1,'requests');}continue;}
  record.generationMs=performance.now()-at;record.status='success';record.within8SecondGeneratorBudget=record.generationMs<=8000;
  // Capture ALL output before any assertion. Never lose the original suspect board.
  record.puzzle=p;record.givenCount=p.givens.filter(Boolean).length;record.logicRepairs=p.generation.logicRepairs;record.difficultyBasis=p.generation.difficultyBasis;
  record.fingerprint=p.generation.fingerprint;record.baseFingerprint=p.generation.baseFingerprint;record.layoutFingerprint=p.generation.layoutFingerprint;
  try{
   const base=baseClass(p),previous=globalSolutions.get(base.signature);record.solutionClass=base.signature;record.baseScope=base.scope;if(base.components)record.componentClasses=base.components;
   if(previous)duplicates.push({kind:'base-class',current:{mode,index,difficulty},previous});else globalSolutions.set(base.signature,{mode,index,difficulty});
   if(withLayout.has(mode)){const key=D.layoutSignature(mode,p.clues,{includeValues:false});record.layoutClass=key;if(!layouts.has(mode))layouts.set(mode,new Map());const prior=layouts.get(mode).get(key);if(prior)duplicates.push({kind:'D4-rule-layout',current:{mode,index,difficulty},previous:prior});else layouts.get(mode).set(key,{mode,index,difficulty});}
   const context={mode,clues:p.clues};assert.equal(p.generation.kind,'constructed');assert.equal(p.generation.version,5);assert.equal(p.mode,mode);assert.equal(p.difficulty,difficulty);assert(E.validateComplete(p.solution,context));assert(p.givens.every((n,i)=>!n||n===p.solution[i]));assert.equal(p.generation.fingerprint,G.fingerprint(p));
   const unique=E.analyzeSolutions(p.givens,context,{limit:2,maxNodes:500000});assert.equal(unique.count,1);assert.equal(unique.exhausted,false);assert.deepEqual(unique.solution,p.solution);record.uniquenessVerified=true;record.uniqueProofNodes=unique.nodes;
   checkLogic(p,record,context);contribution(p,record,context);
   if(marked.has(mode)) {
    const evidence=Q.analyze(p.givens,context);assert(Q.accepts(evidence,difficulty));assert(Q.sameSummary(p.generation.ruleQuality,Q.summary(evidence)));record.ruleQuality=Q.summary(evidence);
    const baseline=R.analyze(p.givens,'classic');assert.equal(baseline.solved,evidence.classicSolved);assert.equal(baseline.remaining,evidence.classicRemaining);if(difficulty!=='easy')assert.equal(baseline.solved,false);
    const classic=E.analyzeSolutions(p.givens,'classic',{limit:2,maxNodes:100000});record.classicAblationSolutions={count:classic.count,exhausted:classic.exhausted,nodes:classic.nodes};
    if(C.describeLayout)record.layoutDescription=C.describeLayout(p.clues);
   }
  }catch(error){record.validationError=error.message;invalid.push({mode,difficulty,index,kind:record.validationErrorKind||'integrity',message:error.message,stack:error.stack});}
  remember([p.generation.fingerprint,p.generation.baseFingerprint,p.generation.layoutFingerprint]);records.push(record);
  if(index%10===9){write(false);console.log(mode,index+1,'requests');}
 }
 write(false);console.log(JSON.stringify(row(mode)));
}
const report=write(true);console.log(JSON.stringify({output:out,requests:report.requests,successes:report.successes,explicitDeclines:report.explicitDeclines,unexpectedFailures:report.unexpectedFailures,duplicates:duplicates.length,invalid:invalid.length,elapsedMs:report.elapsedMs}));
if(invalid.length||duplicates.length||report.unexpectedFailures)process.exitCode=1;
