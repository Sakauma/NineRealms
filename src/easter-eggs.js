/* Nine Realms — small discoveries, separate from every puzzle and its save. */
(function (root) {
  "use strict";
  var STORAGE_KEY = "nine-realms.secrets.v1";
  var IDS = ["gate", "visitor", "lotus", "constellation", "gravity", "rain", "crane"];
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
  var initialized = false;

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

    var found = [], selected = null, warnedStorage = false;
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
      if (raw) {
        var saved = JSON.parse(raw);
        if (saved && saved.version === 1 && Array.isArray(saved.found)) {
          found = IDS.filter(function (id) { return saved.found.indexOf(id) !== -1; });
        }
      }
    } catch (error) {
      // Corrupt data can safely start a fresh collection. Storage denial is
      // reported on the first attempted discovery save, never at game startup.
    }
    if (found.length) selected = found[0];

    function saveCollection() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, found: found.slice() }));
      } catch (error) { storageWarning(); }
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
      if (replayButton) replayButton.hidden = !unlocked;
      cards.forEach(function (card) {
        var id = card.dataset.secretCard;
        if (IDS.indexOf(id) === -1) return;
        var known = found.indexOf(id) !== -1;
        var name = card.querySelector("[data-secret-name]");
        var state = card.querySelector("[data-secret-state]");
        if (name) name.textContent = known ? DETAILS[id].title : DETAILS[id].locked;
        if (state) state.textContent = known ? "已发现 · 可以重看" : "未发现 · 查看线索";
        card.dataset.found = known ? "true" : "false";
        card.setAttribute("aria-pressed", String(selected === id));
        card.setAttribute("aria-label", (known ? DETAILS[id].title : DETAILS[id].locked) + (known ? "，已发现，点击重看" : "，未发现，点击查看线索"));
      });
      renderMiniGames();
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
      if (IDS.indexOf(id) === -1 || otherDialogOpen() || document.hidden) return false;
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

  root.NineRealmsEasterEggs = { init: init };
})(window);
