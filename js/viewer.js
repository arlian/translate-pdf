/* Pembaca PDF: tiap halaman digambar ke canvas, lalu lapisan teks PDF.js ditumpuk
   persis di atasnya. Lapisan itulah yang membuat teks PDF bisa disorot seperti
   teks HTML biasa — dan tooltip terjemahan tidak perlu tahu ini PDF. */
(function (global) {
  "use strict";

  var BASE_SCALE = 1.3;

  function create(container, ui) {
    var lib = global.pdfjsLib;
    var doc = null;
    var slots = [];
    var observer = null;
    var zoom = 1;
    var containerWidth = 0;

    function viewportFor(page) {
      var style = global.getComputedStyle(container);
      var width = container.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      var natural = page.getViewport({ scale: 1 });
      var fit = Math.min(BASE_SCALE, Math.max(1, width) / natural.width);
      return page.getViewport({ scale: fit * zoom });
    }

    function note(title, detail, link) {
      container.innerHTML = "";
      var box = document.createElement("div");
      box.className = "doc-note";
      var head = document.createElement("h2");
      head.textContent = title;
      var body = document.createElement("p");
      body.textContent = detail;
      box.appendChild(head);
      box.appendChild(body);
      if (link) {
        var wrap = document.createElement("p");
        var anchor = document.createElement("a");
        anchor.href = link;
        anchor.target = "_blank";
        anchor.rel = "noopener";
        anchor.textContent = "Buka berkasnya di tab baru";
        wrap.appendChild(anchor);
        box.appendChild(wrap);
      }
      container.appendChild(box);
    }

    function drawPage(index) {
      var slot = slots[index];
      if (!slot || slot.drawn) return Promise.resolve();
      slot.drawn = true;

      return doc.getPage(index + 1).then(function (page) {
        var viewport = viewportFor(page);
        var ratio = global.devicePixelRatio || 1;
        var holder = slot.node;

        holder.classList.remove("pending");
        holder.textContent = "";
        holder.style.width = Math.floor(viewport.width) + "px";
        holder.style.height = Math.floor(viewport.height) + "px";

        var canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = Math.floor(viewport.width) + "px";
        canvas.style.height = Math.floor(viewport.height) + "px";
        holder.appendChild(canvas);

        var layer = document.createElement("div");
        layer.className = "textLayer";
        // PDF.js memposisikan tiap potongan teks lewat variabel ini.
        layer.style.setProperty("--scale-factor", String(viewport.scale));
        holder.appendChild(layer);

        return page.render({
          canvasContext: canvas.getContext("2d"),
          viewport: viewport,
          transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : null
        }).promise
          .then(function () { return page.getTextContent(); })
          .then(function (content) {
            return lib.renderTextLayer({
              textContent: content,
              textContentSource: content,
              container: layer,
              viewport: viewport,
              textDivs: []
            }).promise;
          });
      });
    }

    function watch() {
      if (observer) observer.disconnect();
      observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) drawPage(Number(entry.target.dataset.index));
        });
      }, { root: container, rootMargin: "800px 0px" });
      slots.forEach(function (slot) { observer.observe(slot.node); });
    }

    /* Halaman disiapkan sebagai kotak kosong seukuran aslinya, lalu digambar saat
       mendekati layar — PDF ratusan halaman tidak membekukan tab. */
    function layout() {
      container.innerHTML = "";
      slots = [];
      return doc.getPage(1).then(function (first) {
        var viewport = viewportFor(first);
        for (var i = 0; i < doc.numPages; i++) {
          var node = document.createElement("div");
          node.className = "page pending";
          node.dataset.index = String(i);
          node.style.width = Math.floor(viewport.width) + "px";
          node.style.height = Math.floor(viewport.height) + "px";
          node.textContent = "Halaman " + (i + 1);
          container.appendChild(node);
          slots.push({ node: node, drawn: false });
        }
        ui.onZoom(Math.round(zoom * 100));
        watch();
        return drawPage(0);
      });
    }

    /* Sampul bergambar bukan berarti seluruh dokumen tanpa teks, jadi tengok
       beberapa halaman awal sebelum menuduh. */
    function countText() {
      var jobs = [];
      for (var i = 1; i <= Math.min(3, doc.numPages); i++) {
        jobs.push(doc.getPage(i).then(function (page) {
          return page.getTextContent().then(function (content) {
            return content.items.reduce(function (n, item) {
              return n + (item.str ? item.str.trim().length : 0);
            }, 0);
          });
        }));
      }
      return Promise.all(jobs).then(function (counts) {
        return counts.reduce(function (a, b) { return a + b; }, 0);
      });
    }

    var resizeObserver = new ResizeObserver(function () {
      var width = container.clientWidth;
      if (!width || width === containerWidth) return;
      containerWidth = width;
      if (doc && !container.hidden) layout();
    });
    resizeObserver.observe(container);

    return {
      open: function (source, link) {
        if (!lib) {
          note("PDF.js tidak termuat",
               "Pustaka pdf.js dari cdnjs tidak sampai ke browser ini. Periksa koneksi, lalu muat ulang.");
          return Promise.resolve();
        }
        return lib.getDocument(source).promise
          .then(function (pdf) {
            doc = pdf;
            zoom = 1;
            containerWidth = container.clientWidth;
            ui.onPages(pdf.numPages);
            return layout();
          })
          .then(countText)
          .then(function (chars) {
            if (chars > 0) return;
            var box = document.createElement("div");
            box.className = "doc-note";
            var head = document.createElement("h2");
            head.textContent = "PDF ini tidak punya lapisan teks";
            var body = document.createElement("p");
            body.textContent = "Halaman awalnya berupa gambar hasil pindaian, jadi tidak ada teks " +
              "yang bisa disorot. Terjemahan hanya bekerja pada PDF yang teksnya bisa dipilih.";
            box.appendChild(head);
            box.appendChild(body);
            container.insertBefore(box, container.firstChild);
          })
          .catch(function (err) {
            note("PDF gagal dibuka",
                 (err && err.message) ? err.message : "Berkasnya tidak bisa dibaca PDF.js.",
                 link);
          });
      },
      zoom: function (step) {
        if (!doc) return;
        var next = Math.min(2.5, Math.max(0.5, zoom + step * 0.25));
        if (next === zoom) return;
        zoom = next;
        layout();
      }
    };
  }

  global.TL = global.TL || {};
  global.TL.createViewer = create;
})(window);
