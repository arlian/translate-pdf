/* Penerjemah: memanggil MyMemory langsung dari browser ini.
   Tidak ada server perantara, jadi kuota dan alamat email yang dipakai adalah milik
   orang yang sedang membuka halaman ini. */
(function (global) {
  "use strict";

  var ENDPOINT = "https://api.mymemory.translated.net/get";
  var CHUNK_LIMIT = 450;   // MyMemory menolak permintaan di atas ~500 karakter
  var MAX_CHARS = 4000;    // batas satu sorotan, supaya tidak menghabiskan kuota sekaligus

  // Kode MyMemory memakai bentuk berlokal (id-ID), tampilan memakai bentuk pendek (id).
  var LANGUAGES = [
    { name: "indonesian", label: "Indonesia", mm: "id-ID", short: "id" },
    { name: "english", label: "Inggris", mm: "en-GB", short: "en" },
    { name: "japanese", label: "Jepang", mm: "ja-JP", short: "ja" },
    { name: "korean", label: "Korea", mm: "ko-KR", short: "ko" },
    { name: "chinese", label: "Mandarin", mm: "zh-CN", short: "zh" },
    { name: "arabic", label: "Arab", mm: "ar-SA", short: "ar" },
    { name: "german", label: "Jerman", mm: "de-DE", short: "de" },
    { name: "french", label: "Prancis", mm: "fr-FR", short: "fr" },
    { name: "spanish", label: "Spanyol", mm: "es-ES", short: "es" },
    { name: "dutch", label: "Belanda", mm: "nl-NL", short: "nl" },
    { name: "italian", label: "Italia", mm: "it-IT", short: "it" },
    { name: "portuguese", label: "Portugis", mm: "pt-PT", short: "pt" },
    { name: "russian", label: "Rusia", mm: "ru-RU", short: "ru" },
    { name: "thai", label: "Thai", mm: "th-TH", short: "th" },
    { name: "vietnamese", label: "Vietnam", mm: "vi-VN", short: "vi" },
    { name: "malay", label: "Melayu", mm: "ms-MY", short: "ms" }
  ];

  var BY_NAME = {};
  LANGUAGES.forEach(function (lang) { BY_NAME[lang.name] = lang; });

  var ID_MARKERS = /\b(yang|dan|dengan|untuk|tidak|adalah|akan|dari|pada|karena|sudah|bisa|juga|itu|ini|saya|kamu|anda|kami|kita|mereka|tersebut|dalam|atau|apa|kabar|selamat|bagaimana|kenapa|siapa|belum|masih|harus|banyak|lebih|hanya|setelah|sebelum|ketika|jika|agar|tetapi|tapi|bukan|punya|orang|hari|sangat|terima)\b/gi;

  /* MyMemory tidak punya deteksi bahasa, jadi tebak sendiri dari aksara dan kata penanda. */
  function guessSource(text, target) {
    if (/[぀-ヿ]/.test(text)) return "japanese";
    if (/[가-힯]/.test(text)) return "korean";
    if (/[一-鿿]/.test(text)) return "chinese";
    if (/[؀-ۿ]/.test(text)) return "arabic";
    if (/[Ѐ-ӿ]/.test(text)) return "russian";
    if (/[฀-๿]/.test(text)) return "thai";
    var hits = (text.match(ID_MARKERS) || []).length;
    if (hits >= 2 || (hits === 1 && text.split(/\s+/).length <= 6)) return "indonesian";
    return target === "english" ? "indonesian" : "english";
  }

  /* Pecah di batas kalimat supaya tiap potongan muat di batas MyMemory. */
  function chunkText(text, limit) {
    if (text.length <= limit) return [text];
    var parts = [];
    var buffer = "";
    text.split(/(?<=[.!?…。！？])\s+/).forEach(function (piece) {
      piece = piece.trim();
      if (!piece) return;
      while (piece.length > limit) {
        var cut = piece.lastIndexOf(" ", limit);
        if (cut < limit / 2) cut = limit;
        parts.push(piece.slice(0, cut).trim());
        piece = piece.slice(cut).trim();
      }
      if ((buffer + " " + piece).trim().length <= limit) {
        buffer = (buffer + " " + piece).trim();
      } else {
        if (buffer) parts.push(buffer);
        buffer = piece;
      }
    });
    if (buffer) parts.push(buffer);
    return parts.filter(Boolean);
  }

  /* MyMemory membalas 200 sekalipun jatahnya habis, dengan peringatan di badan jawaban —
     tanpa pemeriksaan ini, peringatan itu akan tampil seolah-olah hasil terjemahan. */
  function readResponse(body, hasEmail) {
    var out = body && body.responseData ? body.responseData.translatedText : "";
    if (body && (body.quotaFinished || /MYMEMORY WARNING/i.test(out || ""))) {
      throw new Error(hasEmail
        ? "Jatah MyMemory untuk email ini sudah habis hari ini (50.000 karakter)."
        : "Jatah MyMemory untuk jaringan ini habis (5.000 karakter/hari). " +
          "Isi kolom Email di kanan atas untuk jatah 50.000 karakter.");
    }
    if (String(body && body.responseStatus) !== "200") {
      throw new Error((body && body.responseDetails) || "MyMemory menolak permintaan ini.");
    }
    if (!out) throw new Error("MyMemory tidak mengembalikan terjemahan.");
    return out;
  }

  var cache = new Map();

  function cacheKey(text, source, target) {
    return [text, source, target].join("\u0000");
  }

  /* opts: {target, source, email, signal} — source "auto" berarti ditebak di sini. */
  function translate(text, opts) {
    var target = opts.target;
    var guessed = !opts.source || opts.source === "auto";
    var source = guessed ? guessSource(text, target) : opts.source;

    if (text.length > MAX_CHARS) {
      return Promise.reject(new Error(
        "Sorotan " + text.length + " karakter, batasnya " + MAX_CHARS + ". Pilih bagian yang lebih pendek."));
    }
    if (!BY_NAME[source] || !BY_NAME[target]) {
      return Promise.reject(new Error("MyMemory tidak mendukung pasangan bahasa ini."));
    }

    function wrap(translation, note, cached) {
      return {
        translation: translation,
        source: source,
        sourceCode: BY_NAME[source].short,
        targetCode: BY_NAME[target].short,
        guessed: guessed,
        note: note || "",
        cached: !!cached
      };
    }

    if (source === target) return Promise.resolve(wrap(text, "bahasanya sudah sama"));

    var key = cacheKey(text, source, target);
    if (cache.has(key)) return Promise.resolve(wrap(cache.get(key), "", true));

    var pair = BY_NAME[source].mm + "|" + BY_NAME[target].mm;
    var email = (opts.email || "").trim();

    // Potongan dikirim berurutan: kalau yang pertama gagal, sisanya tidak ikut
    // menghabiskan kuota.
    return chunkText(text, CHUNK_LIMIT).reduce(function (chain, chunk) {
      return chain.then(function (done) {
        var url = ENDPOINT + "?q=" + encodeURIComponent(chunk) +
          "&langpair=" + encodeURIComponent(pair) +
          (email ? "&de=" + encodeURIComponent(email) : "");
        return fetch(url, { signal: opts.signal })
          .then(function (response) {
            if (!response.ok) throw new Error("MyMemory membalas kode " + response.status + ".");
            return response.json();
          })
          .then(function (body) {
            done.push(readResponse(body, !!email));
            return done;
          });
      });
    }, Promise.resolve([])).then(function (parts) {
      var joined = parts.join(" ").trim();
      cache.set(key, joined);
      if (cache.size > 800) cache.delete(cache.keys().next().value);
      return wrap(joined);
    });
  }

  global.TL = global.TL || {};
  global.TL.languages = LANGUAGES;
  global.TL.translate = translate;
  global.TL.chunkText = chunkText;
  global.TL.guessSource = guessSource;
})(window);
