/* =====================================================================
   Laporan Per Kebun (LHP) — kebun.js
   Berdiri sendiri: tidak mengubah/menyentuh logika script.js.
   Isi:
     1. Evaluator rumus Excel (SUM, IFERROR, + - * /) -> nilai sama dengan Excel
     2. Parser sheet "LHP" -> baris kebun, subtotal wilayah, subtotal CRO, total
     3. Tampilan: KPI, tabel (header bertingkat, kolom kiri tetap), pagination
     4. Unggah file Excel (halaman Perbarui Data) + penyimpanan di localStorage
   ===================================================================== */
(function (global) {
  "use strict";

  var KUNCI = "tbs_laporan_kebun";
  var KOLOM_ANGKA = "FGHIJKLMNOPQRSTUVWXY".split("").concat(["Z", "AA"]); // 22 kolom angka (F..AA)

  /* ---------------------------------------------------------------
     1. EVALUATOR RUMUS EXCEL
     --------------------------------------------------------------- */
  var PROSES = { proses: true };

  function galat(pesan) { var e = new Error(pesan); e.excel = true; return e; }
  function tidakDidukung(f) { var e = new Error("Rumus belum didukung: =" + f); e.tidakDidukung = true; return e; }

  function noKolom(huruf) {
    var n = 0;
    for (var i = 0; i < huruf.length; i++) n = n * 26 + (huruf.charCodeAt(i) - 64);
    return n;
  }
  function hurufKolom(n) {
    var s = "";
    while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }
  function pecahAlamat(a) {
    var m = /^\$?([A-Z]{1,3})\$?(\d+)$/.exec(a);
    if (!m) throw tidakDidukung(a);
    return { kol: noKolom(m[1]), baris: parseInt(m[2], 10) };
  }

  /* Tokenizer + parser rekursif -> pohon (AST) */
  function ambilToken(teks) {
    var re = /\s*(?:([A-Za-z][A-Za-z0-9.]*)\s*\(|(\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?)|(\d+(?:\.\d+)?)|([-+*\/(),]))/y;
    var token = [], pos = 0, m;
    teks = teks.replace(/\s+$/, "");
    while (pos < teks.length) {
      re.lastIndex = pos;
      m = re.exec(teks);
      if (!m) throw tidakDidukung(teks);
      if (m[1] !== undefined) token.push({ t: "fn", v: m[1].toUpperCase() });
      else if (m[2] !== undefined) token.push({ t: "ref", v: m[2].replace(/\$/g, "") });
      else if (m[3] !== undefined) token.push({ t: "num", v: parseFloat(m[3]) });
      else token.push({ t: "op", v: m[4] });
      pos = re.lastIndex;
    }
    return token;
  }

  function parseRumus(teks) {
    var tk = ambilToken(teks), i = 0;
    function intip() { return tk[i]; }
    function op(v) { var t = tk[i]; if (t && t.t === "op" && t.v === v) { i++; return true; } return false; }

    function ekspresi() {
      var kiri = suku();
      for (;;) {
        var t = intip();
        if (t && t.t === "op" && (t.v === "+" || t.v === "-")) { i++; kiri = { k: "bin", op: t.v, l: kiri, r: suku() }; }
        else return kiri;
      }
    }
    function suku() {
      var kiri = faktor();
      for (;;) {
        var t = intip();
        if (t && t.t === "op" && (t.v === "*" || t.v === "/")) { i++; kiri = { k: "bin", op: t.v, l: kiri, r: faktor() }; }
        else return kiri;
      }
    }
    function faktor() {
      var t = tk[i++];
      if (!t) throw tidakDidukung(teks);
      if (t.t === "num") return { k: "num", v: t.v };
      if (t.t === "ref") {
        var bagian = t.v.split(":");
        return bagian.length === 2 ? { k: "rng", a: bagian[0], b: bagian[1] } : { k: "ref", a: bagian[0] };
      }
      if (t.t === "op" && t.v === "-") return { k: "neg", x: faktor() };
      if (t.t === "op" && t.v === "+") return faktor();      // plus unair, mis. =+W7/1000
      if (t.t === "op" && t.v === "(") {
        var e = ekspresi();
        if (!op(")")) throw tidakDidukung(teks);
        return e;
      }
      if (t.t === "fn") {
        var args = [];
        if (!op(")")) {
          do { args.push(ekspresi()); } while (op(","));
          if (!op(")")) throw tidakDidukung(teks);
        }
        return { k: "fn", n: t.v, args: args };
      }
      throw tidakDidukung(teks);
    }

    var pohon = ekspresi();
    if (i !== tk.length) throw tidakDidukung(teks);
    return pohon;
  }

  /* cells: { "F7": { v: 69.57, f: "SUM(...)" }, ... } */
  function buatEvaluator(cells) {
    var memo = {};

    function nilaiSel(alamat) {
      if (Object.prototype.hasOwnProperty.call(memo, alamat)) {
        if (memo[alamat] === PROSES) throw galat("#REF! (rumus melingkar)");
        return memo[alamat];
      }
      var c = cells[alamat];
      if (!c) { memo[alamat] = null; return null; }
      if (c.f) {
        memo[alamat] = PROSES;
        var hasil;
        try {
          hasil = hitung(parseRumus(String(c.f).replace(/^=/, "")));
        } catch (e) {
          if (e.tidakDidukung && typeof c.v === "number") hasil = c.v;   // cadangan: nilai tersimpan
          else if (e.excel) hasil = { galat: e.message };
          else { delete memo[alamat]; throw e; }
        }
        memo[alamat] = hasil;
        return hasil;
      }
      memo[alamat] = c.v === undefined ? null : c.v;
      return memo[alamat];
    }

    function angka(alamat) {            // nilai sel untuk aritmetika
      var v = nilaiSel(alamat);
      if (v && v.galat) throw galat(v.galat);
      if (v === null || v === "") return 0;
      if (typeof v === "number") return v;
      if (typeof v === "boolean") return v ? 1 : 0;
      throw galat("#VALUE!");
    }

    function hitung(n) {
      switch (n.k) {
        case "num": return n.v;
        case "ref": return angka(n.a);
        case "neg": return -hitung(n.x);
        case "bin": {
          var l = hitung(n.l), r = hitung(n.r);
          if (n.op === "+") return l + r;
          if (n.op === "-") return l - r;
          if (n.op === "*") return l * r;
          if (r === 0) throw galat("#DIV/0!");
          return l / r;
        }
        case "rng": throw tidakDidukung("rentang di luar SUM");
        case "fn": return fungsi(n);
      }
      throw tidakDidukung("?");
    }

    function jumlahSel(alamat, total) {
      var v = nilaiSel(alamat);
      if (v && v.galat) throw galat(v.galat);
      return typeof v === "number" ? total + v : total;      // teks/kosong diabaikan (seperti SUM Excel)
    }

    function fungsi(n) {
      if (n.n === "SUM") {
        var total = 0;
        n.args.forEach(function (a) {
          if (a.k === "rng") {
            var p = pecahAlamat(a.a), q = pecahAlamat(a.b);
            for (var r = Math.min(p.baris, q.baris); r <= Math.max(p.baris, q.baris); r++)
              for (var c = Math.min(p.kol, q.kol); c <= Math.max(p.kol, q.kol); c++)
                total = jumlahSel(hurufKolom(c) + r, total);
          } else if (a.k === "ref") {
            total = jumlahSel(a.a, total);
          } else {
            total += hitung(a);
          }
        });
        return total;
      }
      if (n.n === "IFERROR" && n.args.length === 2) {
        try {
          var v = hitung(n.args[0]);
          if (typeof v === "number" && !isFinite(v)) throw galat("#NUM!");
          return v;
        } catch (e) {
          if (e.excel) return hitung(n.args[1]);
          throw e;
        }
      }
      throw tidakDidukung(n.n + "()");
    }

    return { nilaiSel: nilaiSel };
  }

  /* ---------------------------------------------------------------
     2. PARSER SHEET "LHP"
     --------------------------------------------------------------- */
  function teks(c) { return c && c.v !== undefined && c.v !== null ? String(c.v).trim() : ""; }

  function parseLHP(cells) {
    if (teks(cells.A4).toLowerCase() !== "regional" || teks(cells.D4).toLowerCase() !== "kebun")
      throw new Error("format tidak sesuai (header Regional/Kebun tidak ditemukan pada baris 4)");

    var ev = buatEvaluator(cells);
    var maxBaris = 0;
    Object.keys(cells).forEach(function (k) {
      var m = /^[A-Z]+(\d+)$/.exec(k);
      if (m) maxBaris = Math.max(maxBaris, parseInt(m[1], 10));
    });

    var rows = [];
    for (var r = 7; r <= maxBaris; r++) {
      var a = teks(cells["A" + r]), d = teks(cells["D" + r]);
      if (!a && !d) continue;

      var jenis;
      if (/^total\b/i.test(a)) jenis = "T";
      else if (/^subtotal\s+cro\b/i.test(a)) jenis = "c";
      else if (/^subtotal\b/i.test(a)) jenis = "w";
      else if (d) jenis = "k";
      else continue;

      var n = KOLOM_ANGKA.map(function (kol) {
        var v = ev.nilaiSel(kol + r);
        return typeof v === "number" && isFinite(v) ? v : 0;
      });

      if (jenis === "k") rows.push(["k", a, teks(cells["B" + r]), teks(cells["C" + r]), d, teks(cells["E" + r]), n]);
      else rows.push([jenis, a, n]);
    }
    return { judul: teks(cells.A1), periode: teks(cells.A2), rows: rows };
  }

  function sheetKeCells(ws) {
    var cells = {};
    Object.keys(ws).forEach(function (k) {
      if (k.charAt(0) === "!") return;
      var c = ws[k];
      cells[k] = { v: c.v, f: c.f };
    });
    return cells;
  }

  /* ---------------------------------------------------------------
     3. TAMPILAN
     --------------------------------------------------------------- */
  var nfInt = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
  var nf1 = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  var nf2 = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var nfPct = new Intl.NumberFormat("id-ID", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });

  function bersih(v) { return v === 0 || Object.is(v, -0) ? 0 : v; }
  // jenis format kolom F..AA, sama dengan format angka di Excel (Z & AA = 0.00)
  var FORMAT = ["i", "i", "i", "i", "p", "i", "i", "i", "d1", "d2", "i", "i", "i", "p", "i", "i", "p", "i", "i", "p", "d2", "d2"];
  function fmt(v, jenis) {
    v = bersih(v);
    if (jenis === "p") return nfPct.format(v);
    if (jenis === "d1") return nf1.format(v);
    if (jenis === "d2") return nf2.format(v);
    return nfInt.format(v);
  }

  // Aturan warna kolom % (sama dengan conditional formatting Excel)
  function warnaPersen(v) {
    if (v >= 1) return { bg: "#10B981", fg: "#000000" };
    if (v >= 0.9 && v <= 0.99999) return { bg: "#EAB308", fg: "#000000" };
    return { bg: "#EF4444", fg: "#FFFFFF" };
  }

  var LEBAR = [80, 96, 90, 270, 118,                      // A..E
               76, 76,                                    // F,G
               96, 96, 70,                                // H,I,J
               76, 68, 96, 76, 62, 92,                    // K..P
               106, 106, 70,                              // Q,R,S
               120, 120, 70,                              // T,U,V
               70, 70, 70,                               // W,X,Y
               80, 80];                                   // Z,AA

  var HEADER =
    '<tr class="h1">' +
      '<th rowspan="3" class="sa kb-g0">Regional</th><th rowspan="3" class="sb kb-g0">Wilayah</th>' +
      '<th rowspan="3" class="sc kb-g0">Distrik</th><th rowspan="3" class="sd kb-g0">Kebun</th>' +
      '<th rowspan="3" class="kb-g0">Status Kelola</th>' +
      '<th colspan="2" class="kb-g0">Luas Planted TM (Ha)</th>' +
      '<th colspan="9" class="kb-g1">Hari Ini</th>' +
      '<th colspan="3" class="kb-g2">s.d Hari Ini</th>' +
      '<th colspan="3" class="kb-g3">s.d Bulan Ini</th>' +
      '<th colspan="3" class="kb-g4">s.d Bulan Ini</th>' +
      '<th rowspan="3" class="kb-g5">s.d Hari Ini</th><th rowspan="3" class="kb-g5">s.d bulan Ini</th>' +
    '</tr>' +
    '<tr class="h2">' +
      '<th rowspan="2" class="kb-g0">Real</th><th rowspan="2" class="kb-g0">RKAP</th>' +
      '<th colspan="3" class="kb-g1">Produksi (Kg)</th><th colspan="6" class="kb-g1">Kinerja Panen Hari Ini</th>' +
      '<th colspan="3" class="kb-g2">Produksi (Kg)</th>' +
      '<th colspan="3" class="kb-g3">Produksi (Kg)</th>' +
      '<th colspan="3" class="kb-g4">Produktivitas (Kg/Ha)</th>' +
    '</tr>' +
    '<tr class="h3">' +
      '<th class="kb-g1">Real</th><th class="kb-g1">RKAP</th><th class="kb-g1">%</th>' +
      '<th class="kb-g1">Ha Panen</th><th class="kb-g1">TK</th><th class="kb-g1">Kg Panen</th>' +
      '<th class="kb-g1">Kg/Hk</th><th class="kb-g1">Ha/Hk</th><th class="kb-g1">Restan (Kg)</th>' +
      '<th class="kb-g2">Real</th><th class="kb-g2">RKAP</th><th class="kb-g2">%</th>' +
      '<th class="kb-g3">Real</th><th class="kb-g3">RKAP</th><th class="kb-g3">%</th>' +
      '<th class="kb-g4">Real</th><th class="kb-g4">RKAP</th><th class="kb-g4">%</th>' +
    '</tr>';

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
  }

  function selAngka(n) {
    var h = "";
    for (var i = 0; i < FORMAT.length; i++) {
      var jenis = FORMAT[i];
      if (jenis === "p") {
        var w = warnaPersen(n[i]);
        h += '<td class="pct" style="background:' + w.bg + ";color:" + w.fg + '">' + fmt(n[i], "p") + "</td>";
      } else {
        h += "<td>" + fmt(n[i], jenis) + "</td>";
      }
    }
    return h;
  }

  function barisKebun(r) {
    return "<tr>" +
      '<td class="sa">' + esc(r[1]) + '</td><td class="sb">' + esc(r[2]) + '</td><td class="sc">' + esc(r[3]) + "</td>" +
      '<td class="sd nama" title="' + esc(r[4]) + '">' + esc(r[4]) + "</td>" +
      '<td class="teks">' + esc(r[5]) + "</td>" + selAngka(r[6]) + "</tr>";
  }

  function barisRingkas(r, pin) {
    // label menggabungkan kolom Regional..Kebun (seperti sel gabungan A:E di Excel)
    return '<tr class="ringkas r-' + r[0] + (pin ? " pin" : "") + '">' +
      '<td class="sa label" colspan="4">' + esc(r[1]) + '</td><td class="teks"></td>' + selAngka(r[2]) + "</tr>";
  }

  var S = { data: null, hal: 0, per: 25, kIdx: [], total: null };

  // Data tersimpan sebelum kolom Z & AA ada (20 angka) dilengkapi dengan rumus Excel yang sama:
  //   Z  = IFERROR(Q/F, 0) / 1000     AA = W / 1000      (idx: F=0, Q=11, W=17)
  function lengkapiKolomBaru(data) {
    data.rows.forEach(function (r) {
      var n = r[0] === "k" ? r[6] : r[2];
      if (!Array.isArray(n) || n.length >= KOLOM_ANGKA.length) return;
      n[20] = n[0] ? n[11] / n[0] / 1000 : 0;
      n[21] = n[17] / 1000;
    });
    return data;
  }

  function siapkan(data) {
    lengkapiKolomBaru(data);
    S.data = data;
    S.kIdx = [];
    S.total = null;
    data.rows.forEach(function (r, i) {
      if (r[0] === "k") S.kIdx.push(i);
      else if (r[0] === "T") S.total = r;
    });
    S.hal = 0;
  }

  function el(id) { return document.getElementById(id); }

  function renderKpi() {
    var n = S.total ? S.total[2] : null;
    function isi(id, idx, sat) { var e = el(id); if (e) e.textContent = (n ? fmt(n[idx], "i") : "0") + " " + sat; }
    isi("kebunKpiTk", 6, "HK");
    isi("kebunKpiLuas", 5, "Ha");
    isi("kebunKpiPanen", 7, "Kg");
    isi("kebunKpiKirim", 2, "Kg");
    isi("kebunKpiRestan", 10, "Kg");
  }

  function renderJudul() {
    var j = el("kebunJudul"), p = el("kebunPeriode");
    if (j && S.data.judul) j.textContent = " " + S.data.judul.toUpperCase();
    if (p && S.data.periode) p.textContent = S.data.periode;
  }

  function renderTabel() {
    var thead = el("kebunThead"), tbody = el("kebunTbody");
    if (!thead || !tbody) return;
    var rows = S.data.rows, totalKebun = S.kIdx.length;
    var halaman = Math.max(1, Math.ceil(totalKebun / S.per));
    if (S.hal > halaman - 1) S.hal = halaman - 1;
    if (S.hal < 0) S.hal = 0;

    thead.innerHTML = HEADER + (S.total ? barisRingkas(S.total, true) : "");

    if (!totalKebun) {
      tbody.innerHTML = '<tr><td class="kosong" colspan="27">Belum ada data. Unggah file Excel di menu Perbarui Data.</td></tr>';
    } else {
      var awal = S.hal * S.per;
      var akhirKebun = Math.min(awal + S.per, totalKebun);
      var dari = S.hal === 0 ? 0 : S.kIdx[awal];
      var sampai = akhirKebun < totalKebun ? S.kIdx[akhirKebun] : rows.length;
      var h = "";
      for (var i = dari; i < sampai; i++) {
        var r = rows[i];
        if (r[0] === "k") h += barisKebun(r);
        else if (r[0] !== "T") h += barisRingkas(r, false);
      }
      tbody.innerHTML = h;
    }
    var area = el("kebunScroll");
    if (area) area.scrollTop = 0;
    renderPager(totalKebun, halaman);
  }

  function renderPager(totalKebun, halaman) {
    var awal = S.hal * S.per, tampil = Math.max(0, Math.min(S.per, totalKebun - awal));
    var info = el("kebunInfo");
    if (info) info.innerHTML = "Menampilkan <b>" + nfInt.format(tampil) + "</b> data dari <b>" + nfInt.format(totalKebun) + "</b> total";

    var box = el("kebunPager");
    if (!box) return;
    var mulai = Math.max(0, Math.min(S.hal - 2, halaman - 5));
    var akhir = Math.min(halaman, mulai + 5);
    var h = '<button type="button" class="pg-btn pg-nav" data-hal="' + (S.hal - 1) + '"' + (S.hal === 0 ? " disabled" : "") +
            ' aria-label="Halaman sebelumnya"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>Prev</button>';
    for (var p = mulai; p < akhir; p++) {
      h += '<button type="button" class="pg-btn pg-no' + (p === S.hal ? " aktif" : "") + '" data-hal="' + p + '"' +
           (p === S.hal ? ' aria-current="page"' : "") + ">" + (p + 1) + "</button>";
    }
    h += '<button type="button" class="pg-btn pg-nav" data-hal="' + (S.hal + 1) + '"' + (S.hal >= halaman - 1 ? " disabled" : "") +
         ' aria-label="Halaman berikutnya">Next<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>';
    box.innerHTML = h;
  }

  /* ---------------------------------------------------------------
     3b. GRAFIK DONAT PER WILAYAH (kolom S, V, Y)
         Hanya membaca S.data (baris subtotal wilayah "w" + baris TOTAL "T").
         Tidak mengubah parser, tabel, KPI, maupun pagination.
         Untuk mengganti kolom sumber cukup ubah daftar GRAFIK di bawah
         (idx = urutan kolom dari F: F=0 ... S=13, V=16, Y=19).
     --------------------------------------------------------------- */
  var GRAFIK = [
    { idx: 13, kol: "S", judul: "Produksi s.d Hari Ini" },
    { idx: 16, kol: "V", judul: "Produksi s.d Bulan Ini" },
    { idx: 19, kol: "Y", judul: "Produktivitas s.d Bulan Ini" }
  ];
  var JUMLAH_TERATAS = 5;   // hanya 5 kebun dengan capaian tertinggi per grafik

  // pasangan warna gradasi [terang, gelap] untuk tiap irisan
  var WARNA_GRAFIK = [
    ["#6EE7B7", "#059669"],   // hijau
    ["#93C5FD", "#2563EB"],   // biru
    ["#D8B4FE", "#7E22CE"],   // ungu
    ["#FDBA74", "#EA580C"],   // oranye
    ["#F9A8D4", "#BE185D"],   // merah muda
    ["#67E8F9", "#0E7490"]    // sian
  ];

  var D = { cx: 110, cy: 110, R: 100, r: 68 };

  function titikPolar(rad, a) { return [D.cx + rad * Math.cos(a), D.cy + rad * Math.sin(a)]; }
  function p2(n) { return Math.round(n * 100) / 100; }

  function jalurIrisan(a0, a1) {
    var o0 = titikPolar(D.R, a0), o1 = titikPolar(D.R, a1), i1 = titikPolar(D.r, a1), i0 = titikPolar(D.r, a0);
    var besar = (a1 - a0) > Math.PI ? 1 : 0;
    return "M" + p2(o0[0]) + " " + p2(o0[1]) +
      "A" + D.R + " " + D.R + " 0 " + besar + " 1 " + p2(o1[0]) + " " + p2(o1[1]) +
      "L" + p2(i1[0]) + " " + p2(i1[1]) +
      "A" + D.r + " " + D.r + " 0 " + besar + " 0 " + p2(i0[0]) + " " + p2(i0[1]) + "Z";
  }
  function jalurCincin() {
    var c = D.cx, y = D.cy;
    return "M" + c + " " + (y - D.R) + "A" + D.R + " " + D.R + " 0 1 1 " + c + " " + (y + D.R) + "A" + D.R + " " + D.R + " 0 1 1 " + c + " " + (y - D.R) + "Z" +
           "M" + c + " " + (y - D.r) + "A" + D.r + " " + D.r + " 0 1 0 " + c + " " + (y + D.r) + "A" + D.r + " " + D.r + " 0 1 0 " + c + " " + (y - D.r) + "Z";
  }

  function donat(ci, g, items, total) {
    var jumlah = items.reduce(function (s, it) { return s + Math.max(0, it.v); }, 0);
    var defs = "", irisan = "", legenda = "", sudut = -Math.PI / 2, rm = (D.R + D.r) / 2;

    items.forEach(function (it, i) {
      var w = WARNA_GRAFIK[i % WARNA_GRAFIK.length];
      var porsi = jumlah > 0 ? Math.max(0, it.v) / jumlah : 0;
      var id = "kbg" + ci + "_" + i, d = "", g1, g2;

      if (porsi > 0) {
        if (porsi >= 0.9999) {
          d = jalurCincin();
          g1 = [D.cx, D.cy - D.R]; g2 = [D.cx, D.cy + D.R];
        } else {
          var a1 = sudut + porsi * Math.PI * 2;
          d = jalurIrisan(sudut, a1);
          g1 = titikPolar(rm, sudut); g2 = titikPolar(rm, a1);
          sudut = a1;
        }
        defs += '<linearGradient id="' + id + '" gradientUnits="userSpaceOnUse" x1="' + p2(g1[0]) + '" y1="' + p2(g1[1]) +
                '" x2="' + p2(g2[0]) + '" y2="' + p2(g2[1]) + '"><stop offset="0" stop-color="' + w[0] + '"/><stop offset="1" stop-color="' + w[1] + '"/></linearGradient>';
        irisan += '<path class="kg-irisan" data-c="' + ci + '" data-i="' + i + '" d="' + d + '" fill="url(#' + id + ')" fill-rule="evenodd">' +
                  "<title>" + esc(it.nama) + (it.wil ? " (" + esc(it.wil) + ")" : "") + ": " + fmt(it.v, "p") + "</title></path>";
      }
      legenda += '<li class="kg-baris" data-c="' + ci + '" data-i="' + i + '">' +
        '<span class="kg-titik" style="background:linear-gradient(135deg,' + w[0] + "," + w[1] + ')"></span>' +
        '<span class="kg-nama" title="' + esc(it.nama + (it.wil ? " (" + it.wil + ")" : "")) + '"><span class="kg-kebun">' + esc(it.nama) + "</span>" +
          (it.wil ? "<small>" + esc(it.wil) + "</small>" : "") + "</span>" +
        '<span class="kg-nilai">' + fmt(it.v, "p") + "</span></li>";
    });

    if (jumlah <= 0) irisan = '<path class="kg-kosong" d="' + jalurCincin() + '" fill-rule="evenodd"></path>';

    return '<section class="kg-panel" data-c="' + ci + '">' +
      '<div class="kg-kepala"><h3>' + esc(g.judul) + "</h3></div>" +
      '<div class="kg-donat"><svg viewBox="0 0 220 220" role="img" aria-label="Grafik donat ' + esc(g.judul) + '"><defs>' + defs + "</defs>" + irisan + "</svg>" +
      '<div class="kg-tengah" data-awal-n="' + fmt(total, "p") + '"><b>' + fmt(total, "p") + "</b><span>TOTAL AGRINAS</span></div></div>" +
      '<div class="kg-judul-legenda"><span>Kebun</span><span>Capaian</span></div>' +
      '<ul class="kg-legenda">' + legenda + "</ul></section>";
  }

  // Wadah grafik: halaman Grafik Laporan Per Kebun (S, V, Y) dan halaman Monitoring Produksi (hanya V dan Y)
  var TARGET_GRAFIK = [
    { id: "kebunGrafikMon", pakai: [1, 2] }
  ];

  function pasangSorotGrafik(box) {
    // hover: sorot irisan + legenda yang sama, isi tengah donat ikut berubah (dipasang sekali per wadah)
    if (box.__kgTerpasang) return;
    box.__kgTerpasang = true;
    function sorot(e, aktif) {
      var t = e.target.closest ? e.target.closest("[data-i]") : null;
      if (!t) return;
      var panel = t.closest(".kg-panel");
      if (!panel) return;
      var i = t.getAttribute("data-i");
      var tengah = panel.querySelector(".kg-tengah");
      panel.classList.toggle("kg-sorot", aktif);
      Array.prototype.forEach.call(panel.querySelectorAll('[data-i="' + i + '"]'), function (n) { n.classList.toggle("on", aktif); });
      if (!tengah) return;
      if (aktif) {
        var baris = panel.querySelector('.kg-baris[data-i="' + i + '"]');
        tengah.innerHTML = "<b>" + (baris ? baris.querySelector(".kg-nilai").textContent : "") + "</b><span>" +
                           (baris ? esc(baris.querySelector(".kg-kebun").textContent) : "") + "</span>";
      } else {
        tengah.innerHTML = "<b>" + tengah.getAttribute("data-awal-n") + "</b><span>TOTAL AGRINAS</span>";
      }
    }
    box.addEventListener("mouseover", function (e) { sorot(e, true); });
    box.addEventListener("mouseout", function (e) { sorot(e, false); });
  }


  /* ---------------------------------------------------------------
     3c. GRAFIK PERINGKAT KEBUN (halaman Grafik Laporan Per Kebun)
         5 kebun tertinggi & 5 terendah, untuk dua periode:
           - Bulan Ini     = kelompok kolom "s.d Hari Ini"  (Q, R, S)
           - s.d Bulan Ini = kelompok kolom "s.d Bulan Ini" (T, U, V, W)
         Produktivitas (Ton/Ha) : s.d Hari Ini   = kolom Z (Excel, langsung)
                                  s.d Bulan Ini = kolom AA (Excel, langsung)
         Pencapaian (% RKAP)    : kolom S dan kolom V (nilai Excel)
         Hanya membaca S.data; dirender ulang otomatis setiap file Excel diunggah.
         idx = urutan kolom dari F (F=0 ... Q=11, R=12, S=13, T=14, U=15, V=16, Z=20, AA=21).
     --------------------------------------------------------------- */
  var JUMLAH_PERINGKAT = 5;
  var PERIODE_GRAFIK = [
    { kunci: "Bi", judul: "Bulan Ini",     ket: "s.d Hari Ini",
      pt: { real: 11, luas: 0, ton: 20 }, tn: { real: 11, rkap: 12, pct: 13 } },
    { kunci: "Sd", judul: "s.d Bulan Ini", ket: "Kumulatif",
      pt: { real: 14, luas: 0, ton: 21 }, tn: { real: 14, rkap: 15, pct: 16 } }
  ];
  var FONT_GRAFIK = "'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', sans-serif";

  // pasangan warna gradasi [awal, akhir]
  // [terang (puncak), gelap (dasar), warna angka]
  var WARNA_TERTINGGI = ["#3FA9E0", "#22288A", "#22288A"];   // biru langit -> navy
  var WARNA_AMBANG_PENCAPAIAN = false;   // true = grafik pencapaian kembali berwarna per ambang (hijau/kuning/merah)
  
  // WARNA TERENDAH DIUBAH MENJADI MERAH (gradasi merah muda ke merah tua)
  var WARNA_TERENDAH  = ["#FCA5A5", "#B91C1C", "#B91C1C"];   
  
  var WARNA_HIJAU  = ["#4ADE80", "#15803D"];
  var WARNA_ORANYE = ["#FDE047", "#D98E04"];
  var WARNA_MERAH  = ["#FCA5A5", "#B91C1C"];

  var chartPeringkat = [];
  var nf3 = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

  // Produktivitas (kolom Z / AA): format sama dengan Excel (0.00)
  function nfTon(v) {
    return nf2.format(bersih(v));
  }
  function potong(t, maks) { t = String(t); return t.length > maks ? t.slice(0, maks - 1).trim() + "…" : t; }

  // kumpulkan kebun yang layak dirangking, urut tertinggi -> terendah
  function kumpulkan(kebun, jenis, p) {
    var out = [];
    kebun.forEach(function (r) {
      var n = r[6], v, kgHa = null;
      if (jenis === "pt") {
        var m = p.pt;
        if (!(n[m.real] > 0)) return;          // hanya kebun yang sudah berproduksi
        v = n[m.ton];                          // nilai kolom Z / AA Excel apa adanya (Ton/Ha)
        if (!isFinite(v) || !(v > 0)) return;
        kgHa = v * 1000;
      } else {
        var t = p.tn;
        if (!(n[t.real] > 0) || !(n[t.rkap] > 0)) return;   // butuh realisasi dan target RKAP
        v = n[t.pct];
        if (!isFinite(v)) return;
      }
      out.push({ nama: r[4], wil: r[2], status: r[5], v: v, kgHa: kgHa, n: n });
    });
    out.sort(function (a, b) { return b.v - a.v; });
    out.forEach(function (it, i) { it.rank = i + 1; });   // nomor urut untuk label sumbu
    return out;
  }

  function bagiPeringkat(urut) {
    var k = JUMLAH_PERINGKAT;
    if (urut.length <= k) return { atas: urut.slice(), bawah: [] };
    return { atas: urut.slice(0, k), bawah: urut.slice(Math.max(k, urut.length - k)) };
  }

  function modeGelap() {
    var t = document.documentElement.getAttribute("data-theme");
    if (t) return t === "dark";
    return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }
  function warnaTema() {
    var cs = getComputedStyle(document.documentElement);
    function ambil(n, cad) { var v = cs.getPropertyValue(n); return v && v.trim() ? v.trim() : cad; }
    var teks = modeGelap() ? "#FFFFFF" : "#000000";   // semua teks grafik: hitam (terang) / putih (gelap)
    return { tx: teks, mut: teks, bd: ambil("--bd", "#d4d4d8") };
  }

  function gradasi(ctx, w) {
    var e = ctx.element;
    if (!e) return w[1];
    var p = e.getProps(["y", "base"], true);
    var y0 = Math.min(p.y, p.base), y1 = Math.max(p.y, p.base);
    if (!isFinite(y0) || !isFinite(y1) || y1 - y0 < 1) return w[1];
    var g = ctx.chart.ctx.createLinearGradient(0, y1, 0, y0);
    g.addColorStop(0, w[1]); g.addColorStop(1, w[0]);
    return g;
  }

  function warnaBatang(jenis, it, atas) {
    if (jenis === "pt" || !WARNA_AMBANG_PENCAPAIAN) return atas ? WARNA_TERTINGGI : WARNA_TERENDAH;
    if (it.v >= 1) return WARNA_HIJAU;
    if (it.v >= 0.8) return WARNA_ORANYE;
    return WARNA_MERAH;
  }

  function buatGrafikPeringkat(idCanvas, jenis, p) {
    var cv = el(idCanvas);
    if (!cv || typeof Chart === "undefined") return;
    var rk = bagiPeringkat(kumpulkan(S.data.rows.filter(function (r) { return r[0] === "k"; }), jenis, p));
    var tema = warnaTema();

    // satu grafik: 5 tertinggi + (celah) + 5 terendah. Tiap grup tetap punya skala sumbu sendiri
    // (sumbu y untuk tertinggi, y2 untuk terendah) agar batang terendah tetap terlihat.
    var nAtas = rk.atas.length;
    var item = rk.atas.concat(rk.bawah.length ? [null] : [], rk.bawah);
    var labels = item.map(function (it) { return it ? it.nama : ""; });
    var nilai = item.map(function (it) { return it ? it.v : null; });
    var warna = item.map(function (it, i) {
      return it ? warnaBatang(jenis, it, i < nAtas) : WARNA_TERTINGGI;
    });
    var dataAtas = nilai.map(function (v, i) { return i < nAtas ? v : null; });
    var dataBawah = nilai.map(function (v, i) { return i > nAtas ? v : null; });
    // Pencapaian (kolom S / V): format sama dengan Excel (0.0%)
    var fmtNilai = jenis === "pt" ? nfTon : function (v) { return fmt(v, "p"); };

    function bungkus(ctx, teks, lebar, maks) {
      var kata = String(teks).split(/\s+/), baris = [], cur = "";
      kata.forEach(function (k) {
        var coba = cur ? cur + " " + k : k;
        if (cur && ctx.measureText(coba).width > lebar) { baris.push(cur); cur = k; } else cur = coba;
      });
      if (cur) baris.push(cur);
      if (baris.length > maks) {
        baris = baris.slice(0, maks);
        var t = baris[maks - 1];
        while (t.length > 1 && ctx.measureText(t + "…").width > lebar) t = t.slice(0, -1);
        baris[maks - 1] = t.trim() + "…";
      }
      return baris;
    }

    var plugin = {
      id: "ktOverlay",
      afterDatasetsDraw: function (c) {
        var ctx = c.ctx, sy = c.scales.y, area = c.chartArea;
        var lebarKat = area.width / Math.max(1, item.length) - 4, sempit = lebarKat < 56;
        ctx.save();
        if (jenis === "tn" && sy.min < 1 && sy.max > 1) {      // garis acuan 100% RKAP
          var y100 = sy.getPixelForValue(1);
          var xAkhir = (item.length > nAtas && nAtas > 0) ? c.getDatasetMeta(0).data[nAtas - 1].x + area.width / item.length / 2 : area.right;
          ctx.setLineDash([4, 4]); ctx.lineWidth = 1; ctx.strokeStyle = tema.mut;
          ctx.beginPath(); ctx.moveTo(area.left, y100); ctx.lineTo(xAkhir, y100); ctx.stroke();
          ctx.setLineDash([]);
          // Perbesar font penanda 100%
          ctx.font = "700 11px " + FONT_GRAFIK; ctx.fillStyle = tema.tx; ctx.textAlign = "left"; ctx.textBaseline = "bottom";
          ctx.fillText("100%", area.left + 2, y100 - 2);
        }
        if (item.length > nAtas + 1 && nAtas > 0) {      // pemisah tipis antara grup tertinggi dan terendah
          var xp = c.getDatasetMeta(0).data[nAtas].x;
          ctx.setLineDash([3, 4]); ctx.lineWidth = 1; ctx.strokeStyle = tema.bd;
          ctx.beginPath(); ctx.moveTo(xp, area.top); ctx.lineTo(xp, area.bottom + 80); ctx.stroke();
          ctx.setLineDash([]);
        }
        item.forEach(function (it, i) {
          if (nilai[i] === null) return;
          var bar = c.getDatasetMeta(i < nAtas ? 0 : 1).data[i];
          // Nilai angka di atas batang: diperbesar ukurannya (12px bold) agar sangat jelas
          ctx.save();
          ctx.translate(bar.x, bar.y - 6); ctx.rotate(-Math.PI / 2);
          ctx.font = "800 12px " + FONT_GRAFIK; ctx.fillStyle = tema.tx; ctx.textAlign = "left"; ctx.textBaseline = "middle";
          ctx.fillText(fmtNilai(nilai[i]), 0, 0);
          ctx.restore();
          
          // Nama kebun & wilayah di bawah sumbu
          ctx.textAlign = "center"; ctx.textBaseline = "top";
          var y = area.bottom + 8;
          
          // Nama kebun diperbesar (11px, bold)
          ctx.font = "800 " + (sempit ? 10 : 11) + "px " + FONT_GRAFIK; ctx.fillStyle = tema.tx;
          bungkus(ctx, item[i].nama, lebarKat, 3).forEach(function (t) { ctx.fillText(t, bar.x, y); y += sempit ? 12 : 14; });
          
          if (item[i].wil) {
            y += 2;
            // Nama wilayah diperbesar (10px) agar mudah terbaca
            ctx.font = "700 " + (sempit ? 9.5 : 10.5) + "px " + FONT_GRAFIK; ctx.fillStyle = tema.mut;
            bungkus(ctx, item[i].wil, lebarKat, 1).forEach(function (t) { ctx.fillText(t, bar.x, y); y += 12; });
          }
        });
        ctx.restore();
      }
    };

    function dataset(data, sumbu) {
      return {
        data: data, yAxisID: sumbu, grouped: false,
        backgroundColor: function (c) { var i = c.dataIndex; return i == null ? "#999" : gradasi(c, warna[i]); },
        borderRadius: { topLeft: 3, topRight: 3, bottomLeft: 0, bottomRight: 0 }, borderSkipped: "bottom",
        barPercentage: 0.8, categoryPercentage: 0.7, maxBarThickness: 28
      };
    }

    var chart = new Chart(cv, {
      type: "bar",
      data: { labels: labels, datasets: [dataset(dataAtas, "y"), dataset(dataBawah, "y2")] },
      options: {
        indexAxis: "x", responsive: true, maintainAspectRatio: false,
        animation: { duration: 550 },
        layout: { padding: { top: 26, right: 4, bottom: 66, left: 4 } },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { display: false } },
          y: {
            beginAtZero: true, grace: "30%",
            grid: { color: tema.bd, lineWidth: 1, borderDash: [3, 4], drawTicks: false },
            border: { display: false },
            ticks: { display: false }
          },
          y2: { display: false, beginAtZero: true, grace: "30%", grid: { display: false }, border: { display: false } }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            filter: function (t) { return item[t.dataIndex] !== null; },
            backgroundColor: "rgba(255,255,255,.98)",
            titleColor: "#0f172a", bodyColor: "#1e293b", footerColor: "#475569",
            borderColor: "rgba(100,116,139,.28)", borderWidth: 1,
            padding: 11, cornerRadius: 9,
            titleFont: { family: FONT_GRAFIK, size: 12.5, weight: 700 }, bodyFont: { family: FONT_GRAFIK, size: 12 },
            displayColors: false,
            callbacks: {
              title: function (t) { return item[t[0].dataIndex].nama; },
              afterTitle: function (t) { var it = item[t[0].dataIndex]; return it.wil + (it.status ? " · " + it.status : ""); },
              label: function (t) {
                var it = item[t.dataIndex], n = it.n, ln = [];
                if (jenis === "pt") {
                  ln.push("Produktivitas: " + nfTon(it.v) + " Ton/Ha");
                  ln.push("Kg/Ha: " + nf2.format(it.kgHa));
                  ln.push("Produksi: " + nfInt.format(n[p.pt.real]) + " Kg · Luas: " + nf2.format(n[p.pt.luas]) + " Ha");
                } else {
                  ln.push("Pencapaian: " + fmt(it.v, "p"));
                  ln.push("Real: " + nfInt.format(n[p.tn.real]) + " Kg");
                  ln.push("RKAP: " + nfInt.format(n[p.tn.rkap]) + " Kg");
                }
                return ln;
              }
            }
          }
        }
      },
      plugins: [plugin]
    });

    // Pembaruan chart secara instan untuk memastikan gradasi langsung muncul sejak awal render
    setTimeout(function() {
      try { chart.update(); } catch(e) {}
    }, 50);

    chartPeringkat.push(chart);
  }

  // Grafik peringkat tampil di 2 tempat (keduanya dirender ulang setiap data baru dimuat/diunggah):
  //   - halaman Grafik Laporan Per Kebun  (#kebunGrafik)
  //   - halaman Monitoring Produksi       (#kebunGrafikPeringkatMon)
  // "awalan" membuat id canvas unik di tiap tempat.
  var TARGET_PERINGKAT = [
    { id: "kebunGrafik", awalan: "kt" },
    { id: "kebunGrafikPeringkatMon", awalan: "km" }
  ];

  function blokPeringkat(id, p) {
    return '<div class="kt-blok"><h4>' + esc(p.judul) + "<small>" + esc(p.ket) + " · 5 Tertinggi &amp; 5 Terendah</small></h4>" +
           '<div class="kt-sub"><span class="kt-sub-t"><i style="background:linear-gradient(180deg,' + WARNA_TERTINGGI[0] + "," + WARNA_TERTINGGI[1] + ')"></i>5 Tertinggi</span>' +
           '<span class="kt-sub-t"><i style="background:linear-gradient(180deg,' + WARNA_TERENDAH[0] + "," + WARNA_TERENDAH[1] + ')"></i>5 Terendah</span></div>' +
           '<div class="kt-cv"><canvas id="' + id + 'A" role="img" aria-label="Grafik 5 tertinggi dan 5 terendah kebun ' + esc(p.judul) + '"></canvas></div></div>';
  }

  function renderGrafikPeringkat() {
    chartPeringkat.forEach(function (c) { try { c.destroy(); } catch (e) {} });
    chartPeringkat = [];
    var kebun = S.data.rows.filter(function (r) { return r[0] === "k"; });
    TARGET_PERINGKAT.forEach(function (tgt) { renderPeringkatKe(tgt, kebun); });
  }

  function renderPeringkatKe(tgt, kebun) {
    var box = el(tgt.id);
    if (!box) return;
    var aw = tgt.awalan;
    box.classList.add("kt-grid");

    if (!kebun.length) {
      box.innerHTML = '<p class="kg-kosong-teks">Belum ada data. Unggah file Excel di menu Perbarui Data.</p>';
      return;
    }

    var kolPt = "", kolTn = "";
    PERIODE_GRAFIK.forEach(function (p) {
      kolPt += blokPeringkat(aw + "Pt" + p.kunci, p);
      kolTn += blokPeringkat(aw + "Tn" + p.kunci, p);
    });
    box.innerHTML =
      '<section class="kt-kolom"><div class="kt-kepala"><h3>Produktivitas per Kebun (Ton/Ha)</h3>' +
        '<span class="kt-leg"><span><i style="background:linear-gradient(180deg,' + WARNA_TERTINGGI[0] + "," + WARNA_TERTINGGI[1] + ')"></i>Tertinggi</span>' +
        '<span><i style="background:linear-gradient(180deg,' + WARNA_TERENDAH[0] + "," + WARNA_TERENDAH[1] + ')"></i>Terendah</span></span></div>' + kolPt + "</section>" +
      '<section class="kt-kolom"><div class="kt-kepala"><h3>Pencapaian Produksi per Kebun (% RKAP)</h3>' +
        (WARNA_AMBANG_PENCAPAIAN ?
          '<span class="kt-leg"><span><i style="background:linear-gradient(180deg,' + WARNA_HIJAU[0] + "," + WARNA_HIJAU[1] + ')"></i>≥ 100%</span>' +
          '<span><i style="background:linear-gradient(180deg,' + WARNA_ORANYE[0] + "," + WARNA_ORANYE[1] + ')"></i>80 - &lt; 100%</span>' +
          '<span><i style="background:linear-gradient(180deg,' + WARNA_MERAH[0] + "," + WARNA_MERAH[1] + ')"></i>&lt; 80%</span></span>' :
          '<span class="kt-leg"><span><i style="background:linear-gradient(180deg,' + WARNA_TERTINGGI[0] + "," + WARNA_TERTINGGI[1] + ')"></i>Tertinggi</span>' +
          '<span><i style="background:linear-gradient(180deg,' + WARNA_TERENDAH[0] + "," + WARNA_TERENDAH[1] + ')"></i>Terendah</span></span>') + '</div>' + kolTn + "</section>" +
      '<p class="kt-cat">Tertinggi dan terendah memakai skala sumbu masing-masing agar batang terendah tetap terlihat. Peringkat hanya memuat kebun yang sudah berproduksi (realisasi &gt; 0); pencapaian juga mensyaratkan target RKAP &gt; 0. ' +
      'Produktivitas memakai nilai kolom Z (s.d Hari Ini) dan kolom AA (s.d Bulan Ini) pada Excel; pencapaian memakai kolom S dan kolom V.</p>';

    PERIODE_GRAFIK.forEach(function (p) {
      buatGrafikPeringkat(aw + "Pt" + p.kunci + "A", "pt", p);
      buatGrafikPeringkat(aw + "Tn" + p.kunci + "A", "tn", p);
    });
  }

  // ikut berubah saat mode terang/gelap diganti, dan menyesuaikan ukuran saat halaman dibuka
  if (typeof MutationObserver !== "undefined" && typeof document !== "undefined" && document.documentElement) {
    new MutationObserver(function () { if (S.data) renderGrafikPeringkat(); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  }
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("resize", function () {
      chartPeringkat.forEach(function (c) { try { c.resize(); } catch (e) {} });
    });
  }

  function renderGrafik() {
    // sumber: baris kebun ("k"), nilai asli kolom S/V/Y; tiap grafik = 5 kebun dengan capaian tertinggi
    var kebun = S.data.rows.filter(function (r) { return r[0] === "k"; });

    TARGET_GRAFIK.forEach(function (tgt) {
      var box = el(tgt.id);
      if (!box) return;
      if (!kebun.length) {
        box.innerHTML = '<p class="kg-kosong-teks">Belum ada data. Unggah file Excel di menu Perbarui Data.</p>';
      } else {
        var h = "";
        tgt.pakai.forEach(function (gi) {
          var g = GRAFIK[gi];
          var items = kebun.map(function (r) {
            return { nama: r[4], wil: r[2], v: r[6][g.idx] };
          }).sort(function (a, b) { return b.v - a.v; }).slice(0, JUMLAH_TERATAS);
          h += donat(tgt.id + "_" + gi, g, items, S.total ? S.total[2][g.idx] : 0);
        });
        box.innerHTML = h;
      }
      pasangSorotGrafik(box);
    });

    renderGrafikPeringkat();   // halaman Grafik Laporan Per Kebun
  }

  function pasang(data) {
    siapkan(data);
    renderJudul();
    renderKpi();
    renderTabel();
    renderGrafik();
  }

  /* ---------------------------------------------------------------
     4. EVENT, UNGGAH, PENYIMPANAN
     --------------------------------------------------------------- */
  function pasangEvent() {
    var box = el("kebunPager");
    if (box) box.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest("button[data-hal]") : null;
      if (!b || b.disabled) return;
      S.hal = parseInt(b.getAttribute("data-hal"), 10);
      renderTabel();
    });

    var pilih = el("kebunPerHalaman");
    if (pilih) pilih.addEventListener("change", function () {
      S.per = parseInt(pilih.value, 10) || 25;
      S.hal = 0;
      renderTabel();
    });

    var input = el("fileExcelKebun"), pesan = el("msgKebun");
    if (input) input.addEventListener("change", async function (e) {
      var file = e.target.files[0];
      if (!file) return;
      if (pesan) pesan.textContent = "Membaca file Laporan Per Kebun…";
      try {
        if (typeof XLSX === "undefined") throw new Error("library XLSX belum termuat");
        var buku = XLSX.read(await file.arrayBuffer(), { type: "array" });
        var nama = buku.SheetNames.indexOf("LHP") >= 0 ? "LHP" : buku.SheetNames[0];
        var hasil = parseLHP(sheetKeCells(buku.Sheets[nama]));
        if (!hasil.rows.some(function (r) { return r[0] === "k"; })) throw new Error("tidak ada data kebun pada file");
        pasang(hasil);
        try { localStorage.setItem(KUNCI, JSON.stringify(hasil)); } catch (err) {}
        if (pesan) pesan.textContent = "✓ Laporan Per Kebun diperbarui: " + file.name;
      } catch (err) {
        if (pesan) pesan.textContent = "Gagal membaca file laporan kebun: " + err.message;
      }
      e.target.value = "";
    });

    var reset = el("rsKebun");
    if (reset) reset.addEventListener("click", function () {
      var kosong = { judul: "LAPORAN PRODUKSI HARIAN (LHP)", periode: "", rows: [] };
      try { localStorage.setItem(KUNCI, JSON.stringify(kosong)); } catch (err) {}
      pasang(kosong);
      if (pesan) pesan.textContent = "Data Laporan Per Kebun dikosongkan.";
    });

    // "Lihat Dashboard" memakai navigasi sidebar yang sudah ada (ke Monitoring Produksi)
    var kembali = el("kembaliKebun");
    if (kembali) kembali.addEventListener("click", function () {
      var tautan = document.querySelector('.sub-link[data-target="monitoring"]');
      if (tautan) tautan.click();
    });
  }

  function mulai() {
    var data = null;
    try {
      var simpanan = JSON.parse(localStorage.getItem(KUNCI) || "null");
      if (simpanan && Array.isArray(simpanan.rows)) data = simpanan;
    } catch (e) {}
    if (!data && global.KEBUN_DATA_AWAL && Array.isArray(global.KEBUN_DATA_AWAL.rows)) data = global.KEBUN_DATA_AWAL;
    if (!data) data = { judul: "", periode: "", rows: [] };
    var pilih = el("kebunPerHalaman");
    if (pilih) S.per = parseInt(pilih.value, 10) || 25;
    pasangEvent();
    pasang(data);
  }

  global.KebunLHP = { peringkat: function (rows, jenis, kunci) { var p = PERIODE_GRAFIK.filter(function (x) { return x.kunci === kunci; })[0]; return bagiPeringkat(kumpulkan(rows.filter(function (r) { return r[0] === "k"; }), jenis, p)); }, parseLHP: parseLHP, sheetKeCells: sheetKeCells, buatEvaluator: buatEvaluator, warnaPersen: warnaPersen, fmt: fmt, FORMAT: FORMAT };

  if (typeof document !== "undefined" && document.getElementById) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mulai);
    else mulai();
  }
})(typeof window !== "undefined" ? window : globalThis);