/* Perekat: mengisi pilihan bahasa, mengingat pengaturan, membuka berkas, dan
   menyambungkan pembaca PDF dengan tooltip terjemahan. */
(function (global) {
  "use strict";

  var WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  var STORE_KEY = "translate-pdf.settings";

  var start = document.getElementById("start");
  var pages = document.getElementById("pages");
  var fileInput = document.getElementById("file");
  var dropVeil = document.getElementById("drop-veil");
  var docname = document.getElementById("docname");
  var homeButton = document.getElementById("home");
  var zoomBox = document.getElementById("zoom-controls");
  var zoomLabel = document.getElementById("zoom-label");
  var pagecount = document.getElementById("pagecount");
  var fetcher = document.getElementById("fetcher");
  var urlInput = document.getElementById("url");

  var fields = {
    target: document.getElementById("target"),
    source: document.getElementById("source"),
    email: document.getElementById("email")
  };

  if (global.pdfjsLib) global.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER;

  // ------------------------------------------------------------- pengaturan

  var settings = { target: "indonesian", source: "auto", email: "" };
  try {
    var saved = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    Object.keys(settings).forEach(function (k) {
      if (typeof saved[k] === "string") settings[k] = saved[k];
    });
  } catch (err) { /* localStorage bisa diblokir; pakai bawaan saja */ }

  function option(value, label, selected) {
    var el = document.createElement("option");
    el.value = value;
    el.textContent = label;
    if (selected) el.selected = true;
    return el;
  }

  global.TL.languages.forEach(function (lang) {
    fields.target.appendChild(option(lang.name, lang.label, lang.name === settings.target));
  });
  fields.source.appendChild(option("auto", "Deteksi sendiri", settings.source === "auto"));
  global.TL.languages.forEach(function (lang) {
    fields.source.appendChild(option(lang.name, lang.label, lang.name === settings.source));
  });
  fields.email.value = settings.email;

  var tooltip = global.TL.createTooltip(function () { return settings; });

  Object.keys(fields).forEach(function (key) {
    fields[key].addEventListener("change", function () {
      settings[key] = fields[key].value;
      try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch (err) { /* abaikan */ }
      tooltip.refresh();
    });
  });

  // ----------------------------------------------------------- pembaca PDF

  var viewer = global.TL.createViewer(pages, {
    onPages: function (count) {
      pagecount.textContent = count + " halaman";
    },
    onZoom: function (percent) {
      zoomLabel.textContent = percent + "%";
    }
  });

  document.querySelectorAll("[data-zoom]").forEach(function (button) {
    button.addEventListener("click", function () { viewer.zoom(Number(button.dataset.zoom)); });
  });

  function showReader(name) {
    tooltip.hide();
    start.hidden = true;
    pages.hidden = false;
    zoomBox.hidden = false;
    homeButton.hidden = false;
    docname.hidden = false;
    docname.textContent = name;
    docname.title = name;
    document.title = name + " — translate-pdf";
  }

  function showStart() {
    tooltip.hide();
    pages.hidden = true;
    pages.innerHTML = "";
    start.hidden = false;
    zoomBox.hidden = true;
    homeButton.hidden = true;
    docname.hidden = true;
    document.title = "translate-pdf";
  }

  homeButton.addEventListener("click", showStart);

  function openFile(file) {
    if (!file) return;
    if (file.type && file.type.indexOf("pdf") === -1 && !/\.pdf$/i.test(file.name)) {
      tooltip.flash("Berkas itu bukan PDF.");
      return;
    }
    showReader(file.name);
    // Dibaca sebagai data mentah di memori: tidak ada unggahan, tidak ada jejak di server.
    file.arrayBuffer().then(function (buffer) {
      return viewer.open({ data: new Uint8Array(buffer) });
    });
  }

  fileInput.addEventListener("change", function () {
    openFile(fileInput.files && fileInput.files[0]);
    fileInput.value = "";
  });

  // --------------------------------------------------- memuat lewat alamat

  function tellFetchFailed(url) {
    showStart();
    var old = document.getElementById("fetch-error");
    if (old) old.remove();
    var box = document.createElement("div");
    box.className = "fetch-error";
    box.id = "fetch-error";
    box.appendChild(document.createTextNode(
      "Berkas itu tidak bisa diambil langsung oleh browser. Situsnya tidak mengizinkan " +
      "pengambilan lintas-situs, dan halaman ini memang tidak punya server perantara. "));
    var link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Buka berkasnya di tab baru";
    box.appendChild(link);
    box.appendChild(document.createTextNode(", simpan, lalu buka dari perangkatmu."));
    fetcher.insertAdjacentElement("afterend", box);
  }

  function openUrl(raw) {
    var url = (raw || "").trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;

    var name = url.split("/").pop() || "Dokumen PDF";
    var previous = document.getElementById("fetch-error");
    if (previous) previous.remove();

    // Diambil lebih dulu dengan fetch supaya kegagalan CORS bisa dijelaskan sendiri,
    // bukan muncul sebagai error pdf.js yang membingungkan.
    fetch(url, { mode: "cors" })
      .then(function (response) {
        if (!response.ok) throw new Error("kode " + response.status);
        return response.arrayBuffer();
      })
      .then(function (buffer) {
        showReader(name);
        return viewer.open({ data: new Uint8Array(buffer) }, url);
      })
      .catch(function () { tellFetchFailed(url); });
  }

  fetcher.addEventListener("submit", function (event) {
    event.preventDefault();
    openUrl(urlInput.value);
  });

  document.querySelectorAll(".samples button").forEach(function (button) {
    button.addEventListener("click", function () {
      urlInput.value = button.dataset.url;
      openUrl(button.dataset.url);
    });
  });

  // Alamat di hash: bisa ditautkan, mis. index.html#https://arxiv.org/pdf/1706.03762
  function fromHash() {
    return location.hash.length > 1 ? decodeURIComponent(location.hash.slice(1)) : "";
  }
  if (fromHash()) {
    urlInput.value = fromHash();
    openUrl(fromHash());
  }
  global.addEventListener("hashchange", function () {
    if (fromHash()) openUrl(fromHash());
  });

  // ------------------------------------------------------- jatuhkan berkas

  var dragDepth = 0;
  global.addEventListener("dragenter", function (event) {
    if (!event.dataTransfer || event.dataTransfer.types.indexOf("Files") === -1) return;
    dragDepth += 1;
    dropVeil.hidden = false;
  });
  global.addEventListener("dragover", function (event) { event.preventDefault(); });
  global.addEventListener("dragleave", function () {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) dropVeil.hidden = true;
  });
  global.addEventListener("drop", function (event) {
    event.preventDefault();
    dragDepth = 0;
    dropVeil.hidden = true;
    var file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    openFile(file);
  });
})(window);
