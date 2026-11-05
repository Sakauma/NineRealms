/* Presentation only. Never reads answers or writes puzzle/storage state. */
(function (root) {
  'use strict';
  var doc = root.document, body = doc.body;
  var hint = doc.getElementById('hint-panel'), lens = doc.getElementById('candidate-lens');
  var draft = doc.getElementById('draft-toggle'), hintButton = doc.getElementById('hint-btn');
  if (!body || !hint || !lens || !draft) return;
  if (hintButton) hintButton.setAttribute('aria-controls', 'hint-panel');
  var previous = '', desktop = false, layout = doc.querySelector('.game-layout');
  var wide = root.matchMedia('(min-width:980px) and (min-height:560px)');
  var context = doc.createElement('div'), boardArea = doc.createElement('div');
  var tools = doc.createElement('div'), alerts = doc.createElement('div');
  var heading = doc.createElement('div'), status = doc.createElement('div');
  var controls = doc.getElementById('play-controls');
  var more = doc.getElementById('more-tools-panel'), moreButton = doc.getElementById('more-tools-toggle');
  var moreClose = doc.getElementById('more-tools-close'), batch = doc.getElementById('batch-panel');
  context.className = 'desktop-context';
  boardArea.className = 'desktop-board-area';
  tools.className = 'desktop-tools'; tools.setAttribute('role', 'region'); tools.setAttribute('aria-label', '填数与推理');
  alerts.className = 'desktop-board-alerts';
  heading.className = 'desktop-heading'; status.className = 'desktop-status';
  // DOM order follows the visual rows, including keyboard access to multi-board navigation.
  var regions = [context, heading, alerts, boardArea, tools, status];
  regions.forEach(function (node) { node.hidden = true; layout.appendChild(node); });
  // Move the original controls, retaining their listeners and IDs. Comment anchors
  // restore the exact narrow-screen order without clones or saved game changes.
  var homes = [
    ['#puzzle-settings', context], ['.session-strip', status],
    ['.board-section', boardArea], ['.status-box', status],
    ['.difficulty-wrap', heading], ['.stats', tools],
    ['.control-panel', tools], ['.board-bottomline', tools],
    ['.keyboard-guide', tools], ['#multigrid-tools', alerts], ['.session-badges', alerts],
    ['#branch-banner', alerts], ['#fog-banner', alerts],
    ['#undo-btn', controls], ['#redo-btn', controls], ['#erase-btn', controls],
    ['#notes-btn', controls], ['#hint-btn', controls], ['.pad-heading', controls], ['#number-pad', controls],
    ['#new-game', controls], ['#hint-panel', controls], ['#more-tools-toggle', controls]
  ].map(function (entry) {
    var node = doc.querySelector(entry[0]), anchor = doc.createComment('workspace: ' + entry[0]);
    node.before(anchor); return {node:node, anchor:anchor, target:entry[1]};
  });
  // Retain optional-tool code and saved data, but no hidden entry or batch drawer
  // may reopen it in the simplified interface.
  function advancedToolsEnabled() { return body.dataset.advancedTools !== 'off'; }
  function refreshTools() {
    if (!more || !moreButton) return;
    if (!advancedToolsEnabled()) {
      more.hidden = true; moreButton.hidden = true; moreButton.disabled = true;
      moreButton.setAttribute('aria-expanded', 'false');
      return;
    }
    if (batch && !batch.hidden) more.hidden = false;
    moreButton.setAttribute('aria-expanded', String(!more.hidden));
    var active = Number(lens.dataset.activeDigit) > 0;
    moreButton.setAttribute('aria-label', active ? '更多工具，候选筛选已开启' : '更多工具');
    moreButton.dataset.activeFilter = String(active);
  }
  function showMoreTools(focusPanel) {
    if (!more || !advancedToolsEnabled()) return;
    more.hidden = false;
    refreshTools();
    if (focusPanel) {
      moreClose.focus({preventScroll:true});
      more.scrollIntoView({block:'nearest', behavior:'instant'});
    }
  }
  function closeMoreTools() {
    if (!more || !advancedToolsEnabled()) return;
    // Leave no invisible multi-selection keyboard mode behind a closed drawer.
    if (batch && !batch.hidden) doc.getElementById('batch-selection-clear').click();
    if (root.NineRealmsSelect) root.NineRealmsSelect.close();
    if (root.NineRealmsFloatingDraft && root.NineRealmsFloatingDraft.isOpen()) root.NineRealmsFloatingDraft.close(false);
    more.hidden = true;
    moreButton.setAttribute('aria-expanded', 'false');
    var focus = !desktop && body.dataset.workspace === 'unified' && !hint.hidden ? doc.getElementById('hint-title') : moreButton;
    if (focus !== moreButton) focus.tabIndex = -1;
    focus.focus({preventScroll:false});
  }
  hint.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault(); event.stopPropagation();
    doc.getElementById('hint-close').click();
  });
  if (more && moreButton && moreClose) {
    moreButton.addEventListener('click', function () { if (more.hidden) showMoreTools(true); else closeMoreTools(); });
    moreClose.addEventListener('click', closeMoreTools);
    more.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault(); event.stopPropagation(); closeMoreTools();
    });
  }
  function set(name, value) {
    if (body.dataset[name] !== value) body.dataset[name] = value;
  }
  function sizeAlerts() {
    var height = desktop ? Math.ceil(alerts.getBoundingClientRect().height) : 0;
    if (height) height += 16; // One grid gutter below the visible status strip.
    var value = height + 'px';
    if (body.style.getPropertyValue('--desktop-alert-height') !== value) body.style.setProperty('--desktop-alert-height', value);
  }
  function compose(enabled) {
    if (enabled === desktop) return;
    var focus = doc.activeElement;
    if (root.NineRealmsSelect) root.NineRealmsSelect.close();
    desktop = enabled; set('desktop', enabled ? 'on' : 'off');
    regions.forEach(function (node) { node.hidden = !enabled; });
    homes.forEach(function (entry) {
      if (enabled) entry.target.appendChild(entry.node);
      else entry.anchor.after(entry.node);
    });
    // The compact result leaves the input controls visible at every breakpoint.
    if (focus && focus !== body && focus.isConnected) focus.focus({preventScroll:true});
    sizeAlerts();
    if (root.NineRealmsFloatingDraft && root.NineRealmsFloatingDraft.isOpen()) root.NineRealmsFloatingDraft.reposition();
  }
  function sync() {
    // One presentation shell for every mode. Board cells, clues and view geometry
    // remain owned by the game; only existing controls move at the breakpoint.
    set('workspace', 'unified');
    compose(wide.matches);
    set('desktop', desktop ? 'on' : 'off');
    var tool = !hint.hidden ? 'hint' : draft.getAttribute('aria-expanded') === 'true' ? 'draft' : '';
    set('workspaceTool', tool);
    if (hintButton) hintButton.setAttribute('aria-expanded', String(!hint.hidden));
    // Keep focus in newly opened help, and return it even when another tool stays open.
    if (tool === 'hint' && previous !== 'hint' && doc.activeElement === hintButton) {
      var heading = doc.getElementById('hint-title');
      heading.tabIndex = -1; heading.focus({preventScroll:true});
    } else if (tool !== 'hint' && previous === 'hint' && (hint.contains(doc.activeElement) || doc.activeElement === body)) {
      hintButton.focus({preventScroll:true});
    }
    previous = tool;
  }
  if (root.MutationObserver) {
    var observer = new root.MutationObserver(sync);
    observer.observe(body, {attributes:true, attributeFilter:['data-mode', 'data-multi', 'data-multi-view', 'data-outside-clues']});
    observer.observe(hint, {attributes:true, attributeFilter:['hidden']});
    observer.observe(draft, {attributes:true, attributeFilter:['aria-expanded']});
  }
  wide.addEventListener('change', sync);
  if (root.ResizeObserver) new root.ResizeObserver(sizeAlerts).observe(alerts);
  root.NineRealmsWorkspace = {
    sync: sync,
    showMoreTools: showMoreTools,
    refreshTools: refreshTools,
    revealHint: function () {
      sync();
      hint.scrollIntoView({block:'nearest', behavior:'instant'});
    }
  };
  sync();
  refreshTools();
})(window);
