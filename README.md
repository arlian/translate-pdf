# translate-pdf

Buka PDF, sorot kata atau kalimatnya, terjemahannya muncul di tempat kamu melihat.
Seluruhnya berjalan di browser: tidak ada backend, tidak ada Python, tidak ada berkas
yang diunggah ke mana pun.

## Menjalankan

Klik ganda `index.html`. Itu saja — `file://` sudah cukup, dan sudah diuji bekerja penuh
di Chrome: PDF terbaca, tooltip jalan, pengaturan tersimpan.

Kalau mau ditaruh online, salin isi folder ini ke hosting statis apa pun (GitHub Pages,
Netlify, Cloudflare Pages). Tidak ada yang perlu dikonfigurasi.

## Isi

| Berkas | Tugas |
| --- | --- |
| [`index.html`](index.html) | Rangka halaman |
| [`css/app.css`](css/app.css) | Tata letak dan warna |
| [`js/translate.js`](js/translate.js) | Penerjemah: memanggil MyMemory langsung dari browser |
| [`js/tooltip.js`](js/tooltip.js) | Mengawasi sorotan, menampilkan kartu terjemahan |
| [`js/viewer.js`](js/viewer.js) | Menggambar halaman PDF dan lapisan teksnya |
| [`js/app.js`](js/app.js) | Perekat: buka berkas, pengaturan, muat dari alamat |

PDF.js diambil dari cdnjs saat halaman dibuka. Kalau ingin bisa dipakai tanpa internet
sama sekali (selain untuk menerjemahkan), unduh `pdf.min.js` dan `pdf.worker.min.js`
versi 3.11.174 ke folder ini, lalu ubah dua alamat itu di `index.html` dan `js/app.js`.

## Cara kerjanya

**Membaca PDF.** Tiap halaman digambar ke `<canvas>`, lalu di atasnya ditumpuk *text
layer* milik PDF.js — potongan teks tak terlihat yang duduk persis di atas hurufnya.
Karena lapisan itu teks HTML biasa, penerjemah sorotan tidak perlu tahu bahwa yang
dibaca sebuah PDF. Halaman digambar saat mendekati layar, jadi dokumen tebal tidak
membekukan tab.

**Menerjemahkan.** Sorotan dikirim ke `api.mymemory.translated.net` langsung dari
browser (API-nya mengirim `Access-Control-Allow-Origin: *`). Teks panjang dipecah di
batas kalimat maksimal 450 karakter karena MyMemory menolak permintaan yang lebih besar,
dan potongan dikirim berurutan supaya kuota tidak terbuang kalau yang pertama gagal.
Hasil yang sama tidak diminta dua kali — ada cache di memori halaman.

**Bahasa asal.** MyMemory tidak punya deteksi bahasa, jadi ditebak dari aksara
(CJK/Arab/Sirilik/Thai) dan kata penanda bahasa Indonesia. Saat menebak, tooltip menulis
"asal ditebak"; kalau meleset, pilih bahasanya di menu **Dari**.

## Kuota MyMemory

Dari dokumentasi resmi MyMemory:

| Cara pakai | Jatah |
| --- | --- |
| Tanpa email | 5.000 karakter/hari, dihitung per alamat IP |
| Dengan email (parameter `de`) | 50.000 karakter/hari |

Kolom **Email** di kanan atas mengisi parameter itu. Alamatnya disimpan di
`localStorage` browser ini dan dikirim langsung ke MyMemory — tidak ada server lain yang
menerimanya. Karena permintaan berangkat dari perangkat masing-masing, tiap orang yang
membuka halaman ini memakai kuotanya sendiri.

Kalau jatah habis, MyMemory tetap membalas kode 200 sambil menyelipkan peringatan di
badan jawaban. Peringatan itu dikenali dan ditampilkan sebagai error, bukan sebagai
terjemahan.

## Batasnya

- **Alamat PDF dari situs lain hanya bisa dimuat kalau situsnya mengizinkan pengambilan
  lintas-situs.** arXiv dan GitHub Pages mengizinkan; banyak situs jurnal tidak. Untuk
  yang menolak, halaman ini mengatakannya terus terang dan menawarkan membuka berkasnya
  di tab baru — unduh, lalu buka dari perangkat. Tanpa backend, tidak ada jalan lain.
- **PDF hasil pindaian tidak punya teks yang bisa disorot.** Tiga halaman awal diperiksa
  dulu, jadi sampul bergambar tidak langsung dituduh pindaian.
- Satu sorotan maksimal 4.000 karakter.
- Mutu MyMemory di bawah Google atau DeepL, terutama untuk kalimat panjang. Itu harga
  dari tidak memakai kunci API dan tidak memakai server.

## Privasi

Berkas PDF dibaca sebagai data di memori browser lewat `FileReader`; tidak ada unggahan.
Yang meninggalkan perangkatmu hanya potongan teks yang kamu sorot, menuju MyMemory —
ditambah alamat email kalau kamu mengisinya. Pengaturan bahasa dan email disimpan di
`localStorage` perangkat ini saja.
