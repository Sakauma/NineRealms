'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('src/app.js','utf8');
const pattern=/  function setStatus\(message\) \{[\s\S]*?\n  \}/;
const fn=source.match(pattern)[0];
let quiet=false;const status={parentElement:{classList:{toggle:(name,value)=>{assert.equal(name,'status-quiet');quiet=value}}},textContent:''};
const context=vm.createContext({$:id=>id==='status-message'?status:null});vm.runInContext(fn,context);
const E=require('../src/engine.js');
for(const mode of E.getModes())for(const message of [mode.label+' · 入门已准备好，点击开始游戏后计时。',mode.label+'新题已准备好 · 标准密度档（非技巧评级），点击开始后计时。','已准备'+mode.label+' · 进阶。极境仅用于经典玩法，点击开始后计时。']){
 context.setStatus(message);assert(quiet);assert.equal(status.textContent,message);
}
for(const message of ['正在离线生成并验证新题，可点击“取消生成”保留原局……','已取消生成，原有棋局和进度已保留。','棋盘暂时未能生成，请重新打开游戏后再试。','本次生成未在预算内完成，已切换为原题库题目；点击开始后计时。','这个数字与答案不符，可以撤销后再想一想。','已暂停 · 你的进度已保存在这台设备。','计时已开始，选一个空格，按自己的节奏探索。']){
 context.setStatus(message);assert(!quiet);assert.equal(status.textContent,message);
}
const html=fs.readFileSync('src/index.html','utf8'),css=fs.readFileSync('src/styles.css','utf8');
assert(html.includes('id="status-message" role="status" aria-live="polite"'));
assert(html.includes('id="mode-rule" aria-live="polite"'));
assert(html.includes('aria-haspopup="dialog" aria-controls="rules-dialog"'));
assert(css.includes('#mode-rule,#puzzle-bank-status,.status-box.status-quiet{'));
assert(css.includes('min-height:44px;padding:10px 14px'));
assert(!css.includes('var(--glass-button-bg)'));
assert(E.getPuzzleCatalog().every(p=>E.getModes().some(m=>m.id===p.mode)),'All catalog sources have a UI mode');
console.log('PASS: '+(E.getModes().length*3)+' mode-ready messages quiet; 7 actionable statuses visible; live-region semantics retained.');
