/* Tooltip terjemahan: mengawasi sorotan teks, lalu menampilkan hasilnya di dekat
   tempat mata sedang membaca. Hidup di dalam shadow DOM supaya CSS lapisan teks PDF
   tidak bisa mengubah bentuknya. */
(function (global) {
  "use strict";

  var STYLE = [
    ".card, .toast {",
    "  position: absolute; pointer-events: auto; box-sizing: border-box;",
    '  font-family: "IBM Plex Sans", ui-sans-serif, system-ui, -apple-system, sans-serif;',
    "  color: #E7EEEC; background: #16262F; border: 1px solid #2E4753; border-radius: 4px;",
    "  box-shadow: 0 12px 32px rgba(5,16,22,.38), 0 2px 6px rgba(5,16,22,.3); }",
    ".card { width: max-content; min-width: 13rem; max-width: min(23rem, calc(100vw - 1.5rem));",
    "  padding: .7rem .85rem .5rem; animation: in 110ms ease-out; }",
    ".card[hidden], .toast[hidden] { display: none; }",
    "@keyframes in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }",
    ".caret { position: absolute; width: 9px; height: 9px; background: #16262F;",
    "  border-left: 1px solid #2E4753; border-top: 1px solid #2E4753; transform: rotate(45deg); top: -5px; }",
    '.card[data-flip="up"] .caret { top: auto; bottom: -5px; transform: rotate(225deg); }',
    ".source { margin: 0; font-family: \"IBM Plex Serif\", Georgia, serif; font-style: italic;",
    "  font-size: .78rem; line-height: 1.45; color: #91A8B0; display: -webkit-box;",
    "  -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }",
    ".rule { margin: .5rem 0; border: none; border-top: 1px solid #2A4048; }",
    '.out { margin: 0; font-family: "IBM Plex Serif", Georgia, serif; font-size: 1rem;',
    "  line-height: 1.55; color: #F4F8F6; max-height: 11rem; overflow-y: auto; overscroll-behavior: contain; }",
    ".error { margin: 0; font-size: .82rem; line-height: 1.5; color: #F0C36A; }",
    ".bars { display: flex; flex-direction: column; gap: .4rem; padding: .15rem 0 .3rem; }",
    ".bars span { height: .55rem; border-radius: 2px; background-size: 200% 100%;",
    "  background-image: linear-gradient(90deg, #223A44 25%, #31505C 50%, #223A44 75%);",
    "  animation: shimmer 1.2s linear infinite; }",
    ".bars span:nth-child(2) { width: 82%; } .bars span:nth-child(3) { width: 54%; }",
    "@keyframes shimmer { from { background-position: 100% 0; } to { background-position: -100% 0; } }",
    ".meta { display: flex; align-items: center; gap: .55rem; margin-top: .6rem; padding-top: .45rem;",
    "  border-top: 1px solid #23383F; font-size: .7rem; color: #7F98A1; }",
    ".pair { color: #D9A441; }",
    ".note { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
    ".meta button { font: inherit; font-size: .7rem; color: #A9C0C6; background: transparent;",
    "  border: 1px solid #2E4753; border-radius: 3px; padding: .12rem .45rem; cursor: pointer; }",
    ".meta button:hover { color: #F4F8F6; border-color: #47707F; }",
    ".meta button:focus-visible, .out:focus-visible { outline: 2px solid #D9A441; outline-offset: 1px; }",
    '.card[data-state="loading"] .out, .card[data-state="loading"] .error,',
    '.card[data-state="ready"] .bars, .card[data-state="ready"] .error,',
    '.card[data-state="error"] .bars, .card[data-state="error"] .out { display: none; }',
    '.card[data-state="loading"] .meta button, .card[data-state="error"] [data-act="copy"] { display: none; }',
    '.card[data-state="ready"] [data-act="retry"] { display: none; }',
    ".toast { left: 50%; bottom: 1.2rem; transform: translateX(-50%); padding: .5rem .8rem; font-size: .8rem; }",
    "@media (prefers-reduced-motion: reduce) { .card { animation: none; } .bars span { animation: none; } }"
  ].join("\n");

  var MARKUP =
    '<div class="card" hidden data-state="loading">' +
      '<div class="caret"></div>' +
      '<p class="source"></p>' +
      '<hr class="rule">' +
      '<div class="bars"><span></span><span></span><span></span></div>' +
      '<p class="out" tabindex="0"></p>' +
      '<p class="error"></p>' +
      '<footer class="meta">' +
        '<span class="pair"></span>' +
        '<span class="note"></span>' +
        '<button type="button" data-act="retry">Coba lagi</button>' +
        '<button type="button" data-act="copy">Salin</button>' +
        '<button type="button" data-act="close">Tutup</button>' +
      '</footer>' +
    '</div>' +
    '<div class="toast" hidden></div>';

  function create(getSettings) {
    var host = document.createElement("div");
    host.setAttribute("data-translate-tooltip", "");
    host.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
    var root = host.attachShadow({ mode: "open" });
    var style = document.createElement("style");
    style.textContent = STYLE;
    root.appendChild(style);
    var template = document.createElement("template");
    template.innerHTML = MARKUP;
    root.appendChild(template.content);
    document.documentElement.appendChild(host);

    var card = root.querySelector(".card");
    var caret = root.querySelector(".caret");
    var elSource = root.querySelector(".source");
    var elOut = root.querySelector(".out");
    var elError = root.querySelector(".error");
    var elPair = root.querySelector(".pair");
    var elNote = root.querySelector(".note");
    var toast = root.querySelector(".toast");

    var anchorRange = null;
    var currentText = "";
    var currentResult = null;
    var pending = null;
    var timer = null;

    function place() {
      if (card.hidden || !anchorRange) return;
      var rects = anchorRange.getClientRects();
      var rect = rects.length ? rects[rects.length - 1] : anchorRange.getBoundingClientRect();
      if (!rect || (!rect.width && !rect.height)) return;

      var vw = document.documentElement.clientWidth;
      var vh = document.documentElement.clientHeight;
      var box = card.getBoundingClientRect();
      var pad = 8;

      var left = Math.max(pad, Math.min(rect.left + rect.width / 2 - box.width / 2, vw - box.width - pad));
      var top = rect.bottom + 10;
      var flip = "down";
      if (top + box.height > vh - pad) {
        var above = rect.top - box.height - 10;
        if (above >= pad) { top = above; flip = "up"; }
        else { top = Math.max(pad, vh - box.height - pad); }
      }

      card.style.left = left + "px";
      card.style.top = top + "px";
      card.dataset.flip = flip;
      caret.style.left = Math.max(12, Math.min(rect.left + rect.width / 2 - left - 4.5, box.width - 21)) + "px";
    }

    function show(state) {
      card.dataset.state = state;
      card.hidden = false;
      place();
    }

    function hide() {
      card.hidden = true;
      anchorRange = null;
      currentResult = null;
      if (pending) { pending.abort(); pending = null; }
    }

    function flash(message) {
      toast.textContent = message;
      toast.hidden = false;
      clearTimeout(flash.timer);
      flash.timer = setTimeout(function () { toast.hidden = true; }, 2600);
    }

    function render(data) {
      currentResult = data;
      elOut.textContent = data.translation;
      elPair.textContent = data.sourceCode + " → " + data.targetCode;
      var notes = [];
      if (data.guessed) notes.push("asal ditebak");
      if (data.note) notes.push(data.note);
      if (data.cached) notes.push("dari cache");
      elNote.textContent = notes.join(", ");
      show("ready");
    }

    function run(text) {
      currentText = text;
      elSource.textContent = text;
      elOut.textContent = "";
      elError.textContent = "";
      elPair.textContent = "";
      elNote.textContent = "";
      show("loading");

      if (pending) pending.abort();
      var ctrl = new AbortController();
      pending = ctrl;

      var settings = getSettings();
      global.TL.translate(text, {
        target: settings.target,
        source: settings.source,
        email: settings.email,
        signal: ctrl.signal
      }).then(function (data) {
        if (ctrl !== pending) return;
        pending = null;
        render(data);
      }).catch(function (err) {
        if (err.name === "AbortError" || ctrl !== pending) return;
        pending = null;
        elError.textContent = err.message || "Terjemahan tidak berhasil.";
        show("error");
      });
    }

    function readSelection() {
      var sel = document.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
      var node = sel.anchorNode;
      if (node && host.contains(node.nodeType === 1 ? node : node.parentNode)) return null;
      var text = sel.toString().replace(/\s+/g, " ").trim();
      if (!text) return null;
      return { text: text, range: sel.getRangeAt(0).cloneRange() };
    }

    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(function () {
        var picked = readSelection();
        if (!picked) return;
        if (picked.text === currentText && !card.hidden) return;
        anchorRange = picked.range;
        run(picked.text);
      }, 40);
    }

    document.addEventListener("mouseup", schedule, true);
    document.addEventListener("touchend", schedule, true);
    document.addEventListener("dblclick", schedule, true);
    document.addEventListener("keyup", function (event) {
      if (event.shiftKey || event.key.indexOf("Arrow") === 0 || event.key === "a") schedule();
    }, true);

    document.addEventListener("mousedown", function (event) {
      if (event.composedPath().indexOf(host) !== -1) return;
      if (!card.hidden) hide();
    }, true);

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !card.hidden) hide();
    }, true);

    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);

    root.addEventListener("click", function (event) {
      var act = event.target && event.target.dataset ? event.target.dataset.act : null;
      if (!act) return;
      if (act === "close") return hide();
      if (act === "retry") return run(currentText);
      if (act === "copy" && currentResult) {
        navigator.clipboard.writeText(currentResult.translation)
          .then(function () { flash("Terjemahan disalin."); })
          .catch(function () { flash("Browser menolak akses papan klip."); });
      }
    });

    return {
      hide: hide,
      flash: flash,
      // Dipanggil saat bahasa atau email berubah: hasil yang terbuka ikut diperbarui.
      refresh: function () { if (!card.hidden && currentText) run(currentText); }
    };
  }

  global.TL = global.TL || {};
  global.TL.createTooltip = create;
})(window);
