/* Optional classic constructor; never edits the active playing board. */
(function (root) {
  "use strict";
  root.NineRealmsCustomUI = function (options) {
    var doc = root.document, C = root.NineRealmsCustom, E = root.SudokuEngine, $ = function (id) { return doc.getElementById(id); };
    var givens = Array(81).fill(0), inputs = [], verified = null, busy = false, epoch = 0, textDirty = false, draftLoaded = false, client = C.createClient();
    function persistDraft() { if (options.writeDraft) options.writeDraft($("custom-text").value); }
    function status(message) { $("custom-status").textContent = message; }
    function invalidate() { epoch++; client.cancel(); verified = null; busy = false; renderActions(); }
    function renderActions() {
      var valid = Boolean(verified && verified.status === "unique" && verified.playable && !busy);
      $("custom-validate").textContent = busy ? "取消校验" : "校验题面";
      $("custom-validate").setAttribute("aria-busy", String(busy));
      $("custom-play").disabled = !valid; $("custom-save").disabled = !valid || !options.savePuzzle;
      $("custom-copy").disabled = !valid;
      $("custom-current").disabled = !options.current() || options.current().mode !== "classic";
    }
    function renderGrid() {
      var conflicts = new Set(E.getConflicts(givens, "classic"));
      inputs.forEach(function (input, i) { input.value = givens[i] ? String(givens[i]) : ""; input.classList.toggle("custom-conflict", conflicts.has(i)); input.setAttribute("aria-invalid", String(conflicts.has(i))); });
      renderActions();
    }
    function adopt(board) { invalidate(); givens = board.slice(); textDirty = false; $("custom-text").value = C.toText(givens); renderGrid(); persistDraft(); }
    function readText() { var value = C.parse($("custom-text").value); adopt(value); return value; }
    for (var i = 0; i < 81; i++) {
      var input = doc.createElement("input"); input.type = "text"; input.inputMode = "numeric"; input.maxLength = 1; input.autocomplete = "off"; input.spellcheck = false;
      input.tabIndex = i === 0 ? 0 : -1;
      input.addEventListener("focus", function (event) { inputs.forEach(function (cell) { cell.tabIndex = cell === event.currentTarget ? 0 : -1; }); event.currentTarget.select(); });
      input.dataset.index = String(i); input.setAttribute("role", "gridcell"); input.setAttribute("aria-rowindex", String(Math.floor(i / 9) + 1)); input.setAttribute("aria-colindex", String(i % 9 + 1));
      input.setAttribute("aria-label", "第 " + (Math.floor(i / 9) + 1) + " 行第 " + (i % 9 + 1) + " 列的给定数");
      input.addEventListener("input", function (event) {
        var element = event.currentTarget, index = Number(element.dataset.index), value = element.value;
        if (!/^[0-9.]?$/.test(value)) { element.value = givens[index] ? String(givens[index]) : ""; status("仅填写 1～9；0 或 . 清空当前格。"); return; }
        invalidate(); givens[index] = /^[1-9]$/.test(value) ? Number(value) : 0;
        textDirty = false; $("custom-text").value = C.toText(givens); renderGrid(); persistDraft(); status("题面已修改，请重新校验。");
      });
      input.addEventListener("keydown", function (event) {
        var index = Number(event.currentTarget.dataset.index), delta = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[event.key];
        if (delta && index + delta >= 0 && index + delta < 81) { event.preventDefault(); inputs[index + delta].focus(); inputs[index + delta].select(); }
        if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); adopt(givens.map(function (n, i) { return i === index ? 0 : n; })); status("题面已修改，请重新校验。"); }
      });
      input.addEventListener("paste", function (event) {
        var text = event.clipboardData && event.clipboardData.getData("text"); if (!text || text.length <= 1) return;
        event.preventDefault(); try { adopt(C.parse(text)); status("已读取题面，请校验唯一解。"); } catch (error) { status(error.message); }
      });
      $("custom-board").appendChild(input); inputs.push(input);
    }
    $("custom-text").addEventListener("input", function () { invalidate(); textDirty = true; persistDraft(); status("文本已修改，请读取或校验题面。"); });
    $("custom-read").addEventListener("click", function () { try { readText(); status("已读取题面，请校验唯一解。"); } catch (error) { status(error.message); } });
    root.NineRealmsGridRows.wrap($("custom-board"),inputs);
    $("custom-clear").addEventListener("click", function () { adopt(Array(81).fill(0)); status("已清空编辑器，当前棋局不受影响。"); inputs[0].focus(); });
    $("custom-current").addEventListener("click", function () { var game = options.current(); if (!game || game.mode !== "classic") return; adopt(game.givens); status("只读取原始给定数，未带入进度或答案。"); });
    $("custom-validate").addEventListener("click", async function () {
      if (busy) { invalidate(); status("已取消校验，题面仍保留。"); return; }
      try { if (textDirty) readText(); } catch (error) { status(error.message); return; }
      var request = ++epoch, board = givens.slice(); busy = true; verified = null; renderActions(); status("正在离线校验解的数量……");
      try { var result = await client.run(board); if (request !== epoch) return; verified = result; status(result.message); renderGrid(); }
      catch (error) { if (request === epoch && error.name !== "AbortError") status(error.message); }
      finally { if (request === epoch) { busy = false; renderActions(); } }
    });
    $("custom-play").addEventListener("click", async function () {
      if (!verified || busy) return;
      try { await options.play(C.puzzle(givens, verified)); } catch (error) { status(error.message); }
    });
    $("custom-save").addEventListener("click", function () {
      if (!verified || busy || !options.savePuzzle) return;
      try { options.savePuzzle(C.puzzle(givens, verified)); status("题面已收藏，可从“我的题目”重新打开。"); } catch (error) { status("收藏未完成，请检查本机存储空间后重试。"); }
    });
    $("custom-copy").addEventListener("click", async function () {
      if (!verified || busy) return; var text = C.toText(givens);
      try { if (root.NineRealmsDesktop) await root.NineRealmsDesktop.copyText(text); else { if (!root.navigator.clipboard) throw new Error(); await root.navigator.clipboard.writeText(text); } status("题面文本已复制，只包含给定数。"); }
      catch (error) { $("custom-text").value = text; $("custom-text-editor").open = true; $("custom-text").focus(); $("custom-text").select(); status("已选中题面文本，请按 Ctrl/⌘ C 或长按复制。"); }
    });
    $("custom-close").addEventListener("click", function () { options.close($("custom-dialog")); });
    $("custom-dialog").addEventListener("close", function () { epoch++; client.cancel(); busy = false; renderActions(); options.afterClose(); });
    $("custom-text").value = C.toText(givens); renderGrid();
    return { open: function () {
      if (options.blocked()) return;
      if (!draftLoaded) {
        draftLoaded = true;
        var draft = options.readDraft && options.readDraft();
        if (typeof draft === "string" && draft.length) {
          $("custom-text").value = draft; textDirty = true;
          try { givens = C.parse(draft); textDirty = false; renderGrid(); } catch (error) { $("custom-text-editor").open = true; }
          status("已恢复编辑草稿，请重新校验。不要填写答案，只填写给定数。");
        }
      }
      renderActions(); options.open($("custom-dialog")); inputs[0].focus();
    }, cancel: function () { invalidate(); } };
  };
})(window);
