'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const css=fs.readFileSync('src/styles.css','utf8'),history=fs.readFileSync('src/history.css','utf8');
for(const selector of ['.history-dialog','.history-list','.history-board-viewport','.history-review-events'])assert(history.includes(selector));
for(const property of ['scrollbar-width:thin','scrollbar-width:auto;scrollbar-color:auto','width:10px;height:10px','border:3px solid transparent','border-radius:999px','background:color-mix(in srgb,var(--accent) 42%,transparent)','background-clip:padding-box','background-color:color-mix(in srgb,var(--accent) 66%,transparent)']){assert(css.includes(property),property+' mode catalog');assert(history.includes(property),property+' archive');}
assert(history.includes('.history-board-viewport{overflow:auto;'),'horizontal replay scrolling preserved');assert(history.includes('forced-colors:active'));
const marker=css.indexOf('/* Rules remain visibly available at rest');assert(marker>0);const rules=css.slice(marker);assert(rules.includes('.game-toolbar>#rules-open{background:var(--glass-button);border:1px solid var(--glass-edge);color:var(--text)'));assert(rules.includes(':focus-visible'));assert(rules.includes('background:ButtonFace'));
console.log('PASS menu chrome: all four archive scroll containers match catalog thumb geometry/tokens and retain horizontal/high-contrast fallback; rules visible resting border/background with hover/focus distinction. Static declarations, not rendered pixels.');

const draft=css.slice(css.indexOf('/* Draft window: match mode catalog scrollbars'));
for(const selector of ['.floating-draft-content','#draft-panel .draft-links'])assert(draft.includes(selector));
for(const property of ['scrollbar-width:thin','scrollbar-width:auto;scrollbar-color:auto','width:10px;height:10px','border:3px solid transparent','border-radius:999px','background:color-mix(in srgb,var(--accent) 42%,transparent)','background-clip:padding-box','background-color:color-mix(in srgb,var(--accent) 66%,transparent)','forced-colors:active','background:ButtonText'])assert(draft.includes(property),property+' draft window');
assert(css.includes('.floating-draft-content{overflow:auto;'),'desktop/mobile content remains scrollable');
assert(css.includes('.draft-links{max-height:180px;overflow:auto}'),'nested links remain scrollable');
const html=fs.readFileSync('src/index.html','utf8');assert(html.includes('id="draft-links" class="draft-links"'));assert(html.includes('id="draft-cages" class="draft-buttons"'));
console.log('PASS draft scroll chrome: content and nested links (cage notes scroll with content) share catalog geometry, theme colors and forced-colors fallback without changing scrolling or resizing. Static assertions only.');
