/* Test-only opt-in for preserved advanced-tool code. Not a shipped UI entry.
 * Browser suites use this only for dormant feature regression, never as evidence
 * that those removed controls are reachable in the current product. */
'use strict';
async function enableDormantTools(run) {
  await run(`(() => {
    document.body.dataset.advancedTools = 'on';
    const button=document.getElementById('more-tools-toggle'), panel=document.getElementById('more-tools-panel');
    button.hidden=false; button.disabled=false; panel.inert=false; panel.removeAttribute('inert');
    window.NineRealmsWorkspace.refreshTools();
  })()`);
}
function enableDormantDOM(window) {
  const d=window.document; d.body.dataset.advancedTools='on';
  d.getElementById('more-tools-toggle').hidden=false;d.getElementById('more-tools-toggle').disabled=false;
  d.getElementById('more-tools-panel').removeAttribute('inert');
  window.NineRealmsWorkspace.showMoreTools();
}
module.exports={enableDormantTools,enableDormantDOM};
