/* =====================================================================
   ppt.js — Unduh semua grafik halaman Monitoring Produksi sebagai PowerPoint (.pptx)
   Dimuat SETELAH script.js dan pustaka PptxGenJS. Mengambil angka dan data
   grafik yang sedang tampil di dashboard (mengikuti regional yang dipilih),
   lalu menyusunnya menjadi slide dengan grafik PowerPoint asli (bisa diedit).
   Tombol pemicu: #btnUnduhPpt (di header halaman Monitoring Produksi).
   Isi PPT = seluruh grafik di halaman Monitoring: Produksi bulanan, Total per CRO, 4 grafik Laporan Per Regional,
   Produktivitas & Pencapaian Produksi per Kebun, Historis & Proyeksi, serta Tren Indikator Panen.
   ===================================================================== */
(function () {
  "use strict";

  const tombol = document.getElementById("btnUnduhPpt");
  if (!tombol) return;

  /* Lampiran grafik halaman lain:
     indikator diaktifkan (true) agar grafik tren indikator panen ikut masuk slide PPT. */
  const LAMPIRAN = { protas: false, indikator: true, kebun: false };

  /* ---------- Warna & ukuran (hex tanpa tanda #) ---------- */
  const W = 13.333;                       // lebar slide (inci), layout LAYOUT_WIDE
  const C = {
    hijauTua: "0A3A28", hijau: "1C7A4C", aksen: "2F8F5B", emas: "E8A33D", hijauMuda: "E7F4EC",
    teks: "14231B", redup: "55655B", garis: "DDE5E0", kartu: "F8F9FA", merah: "D1503F", putih: "FFFFFF",
    latar: "F6F9F7",
    persen: "14231B",        // SATU warna untuk semua angka persen (label batang, 100%, lencana)
  };
  const AKSEN_KPI = ["2F8F5B", "3182CE", "805AD5", "DD6B20"];
  const FONT = "Calibri";

  const hex = (w) => String(w || "").replace("#", "").slice(0, 6).toUpperCase();
  const teks = (e) => (e ? e.textContent.replace(/\s+/g, " ").trim() : "");
  const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const kodeAngka = (d) => (d > 0 ? "#,##0." + "0".repeat(d) : "#,##0");

  /* ---------- Membaca warna batang dari Chart.js ---------- */
  function rgbDariCss(css) {
    if (typeof css !== "string") return null;
    const t = css.trim();
    let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(t);
    if (m) {
      const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
      return [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16));
    }
    m = /^rgba?\(([^)]+)\)$/i.exec(t);
    if (m) {
      const p = m[1].split(",").map(Number), a = p.length > 3 ? p[3] : 1;
      return p.slice(0, 3).map((v) => Math.round(v * a + 255 * (1 - a)));
    }
    return null;
  }
  function warnaDataset(ds, i) {
    let bg = ds.backgroundColor;
    if (Array.isArray(bg)) bg = bg[i % bg.length];
    let daftar = [];
    if (typeof bg === "function") {
      const catatan = [], grad = { addColorStop: (o, w) => catatan.push(w) };
      try {
        const hasil = bg({ chart: { ctx: { createLinearGradient: () => grad }, chartArea: { left: 0, right: 1, top: 0, bottom: 1 } }, dataIndex: i, datasetIndex: 0 });
        daftar = hasil === grad ? catatan : [hasil];
      } catch (e) { daftar = []; }
    } else daftar = [bg];
    const rgb = daftar.map(rgbDariCss).filter(Boolean);
    if (!rgb.length) return null;
    return [0, 1, 2].map((k) => Math.round(rgb.reduce((t, c) => t + c[k], 0) / rgb.length).toString(16).padStart(2, "0")).join("").toUpperCase();
  }

  const hexCss = (css) => { const r = rgbDariCss(css); return r ? r.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase() : null; };
  const WARNA_NAMA = [[/2025/, "A8D5B5"], [/rkap/i, "B8C3CE"], [/proyeksi/i, "3B8EA5"], [/real|2026/i, "1B4D3E"]];
  const WARNA_ZONA = { "START POINT": ["E8F5EA", "2F7D4F"], "SAAT INI": ["FEF3D0", "B7791F"], "PROYEKSI": ["E3F0F8", "2C6B8A"] };

  function tangkapHiasan(hc) {
    const ctx = hc.ctx, rekTeks = [], kotak = [], dipasang = [];
    let rectTerakhir = null, jalur = null;
    const titik = (x, y) => { if (!jalur) jalur = { x1: x, y1: y, x2: x, y2: y }; else { jalur.x1 = Math.min(jalur.x1, x); jalur.y1 = Math.min(jalur.y1, y); jalur.x2 = Math.max(jalur.x2, x); jalur.y2 = Math.max(jalur.y2, y); } };
    const sadap = (nama, fn) => {
      if (typeof ctx[nama] !== "function") return;
      const asli = ctx[nama];
      ctx[nama] = function () { try { fn.apply(null, arguments); } catch (e) {} return asli.apply(ctx, arguments); };
      dipasang.push(nama);
    };
    sadap("fillText", (s, x, y) => rekTeks.push({ t: String(s).trim(), x, y, fill: ctx.fillStyle }));
    sadap("fillRect", (x, y, w, h) => kotak.push({ x, y, w, h, fill: ctx.fillStyle }));
    sadap("rect", (x, y, w, h) => { rectTerakhir = { x, y, w, h }; });
    sadap("roundRect", (x, y, w, h) => { rectTerakhir = { x, y, w, h }; });
    sadap("beginPath", () => { rectTerakhir = null; jalur = null; });
    sadap("moveTo", (x, y) => titik(x, y));
    sadap("lineTo", (x, y) => titik(x, y));
    sadap("arcTo", (x1, y1, x2, y2) => { titik(x1, y1); titik(x2, y2); });
    sadap("fill", () => {
      if (rectTerakhir) kotak.push(Object.assign({ fill: ctx.fillStyle }, rectTerakhir));
      else if (jalur) kotak.push({ x: jalur.x1, y: jalur.y1, w: jalur.x2 - jalur.x1, h: jalur.y2 - jalur.y1, fill: ctx.fillStyle });
    });
    try { hc.draw(); } catch (e) {}
    dipasang.forEach((n) => { delete ctx[n]; });
    try { hc.draw(); } catch (e) {}

    const sx = hc.scales && (hc.scales.x || hc.scales["x-axis-0"]), area = hc.chartArea, n = hc.data.labels.length;
    if (!sx || !area || !n) return null;
    const xs = hc.data.labels.map((_, i) => sx.getPixelForValue(i));
    const lebarKat = (area.right - area.left) / n, tinggiArea = area.bottom - area.top;
    const terdekat = (x) => xs.reduce((b, v, i) => (Math.abs(v - x) < Math.abs(xs[b] - x) ? i : b), 0);

    const zona = [];
    rekTeks.filter((r) => /^(start point|saat ini|proyeksi)$/i.test(r.t)).forEach((r) => {
      const nama = r.t.toUpperCase();
      const calon = kotak.filter((k) => k.w >= lebarKat * 0.8 && k.h >= tinggiArea * 0.5 &&
        r.x >= k.x - 1 && r.x <= k.x + k.w + 1 && r.y >= k.y - 2 && r.y <= k.y + k.h)
        .sort((a, b) => a.w * a.h - b.w * b.h);
      const idx = calon.length ? xs.map((x, i) => (x >= calon[0].x && x <= calon[0].x + calon[0].w ? i : -1)).filter((i) => i >= 0) : [];
      if (!idx.length) return;
      const asal = WARNA_ZONA[nama] || ["EEF2EF", "55655B"];
      zona.push({ teks: nama, dari: idx[0], sampai: idx[idx.length - 1],
                  warna: hexCss(calon[0].fill) || asal[0], warnaTeks: asal[1] });
    });

    const badge = new Array(n).fill(null);
    let warnaBadge = "E5484D";
    rekTeks.filter((r) => /^\d+(?:[.,]\d+)?\s*%$/.test(r.t)).forEach((r) => {
      badge[terdekat(r.x)] = r.t.replace(/\s+/g, "");
      const latar = kotak.find((k) => k.w < 90 && k.h < 40 && r.x >= k.x && r.x <= k.x + k.w && r.y >= k.y && r.y <= k.y + k.h + 4);
      const w = latar && hexCss(latar.fill);
      if (w && w !== "FFFFFF") warnaBadge = w;
    });
    return { zona, badge, warnaBadge };
  }

  const teksSendiri = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ").replace(/\s+/g, " ").trim();
  const labelBersih = (l) => (Array.isArray(l) ? l.join(" ") : String(l == null ? "" : l)).replace(/\s+/g, " ").trim();
  const angkaTitik = (v) => { if (v && typeof v === "object") v = v.y != null ? v.y : v.x; const n = Number(v); return v == null || v === "" || !isFinite(n) ? null : n; };
  const angkaId = (t) => parseFloat(String(t).replace("%", "").replace(/\./g, "").replace(",", "."));

  function teksTergambar(ch) {
    const ctx = ch.ctx, rek = [], asli = ctx.fillText;
    if (typeof asli !== "function") return rek;
    ctx.fillText = function (s) { try { rek.push(String(s).trim()); } catch (e) {} return asli.apply(ctx, arguments); };
    try { ch.draw(); } catch (e) {}
    delete ctx.fillText;
    try { ch.draw(); } catch (e) {}
    return rek;
  }
  function warnaPiksel(ch, di, i) {
    try {
      const el = ch.getDatasetMeta(di).data[i];
      if (!el) return null;
      const p = el.getProps(["x", "y", "base", "width", "height"], true);
      const dpr = ch.currentDevicePixelRatio || window.devicePixelRatio || 1;
      const horiz = ch.options && ch.options.indexAxis === "y";
      if (Math.abs(horiz ? p.x - p.base : p.y - p.base) < 3) return null;
      const px = horiz ? (p.x + p.base) / 2 : p.x, py = horiz ? p.y : (p.y + p.base) / 2;
      const d = ch.ctx.getImageData(Math.round(px * dpr), Math.round(py * dpr), 1, 1).data;
      if (!d[3]) return null;
      const a = d[3] / 255;
      return [0, 1, 2].map((k) => Math.round(d[k] * a + 255 * (1 - a)).toString(16).padStart(2, "0")).join("").toUpperCase();
    } catch (e) { return null; }
  }

  function bacaKebunBar() {
    try {
      const akar = document.getElementById("kebunGrafikPeringkatMon");
      if (!akar || !window.Chart || typeof Chart.getChart !== "function") return [];
      const lingkup = akar.closest(".kebun-mon") || akar;
      const daftar = [...akar.querySelectorAll("canvas")].map((cv) => ({ cv, ch: Chart.getChart(cv) }))
        .filter((o) => o.ch && o.ch.data && o.ch.data.datasets && o.ch.data.datasets.length);
      if (!daftar.length) return [];

      const penanda = [];
      lingkup.querySelectorAll("*").forEach((el) => {
        const t = teksSendiri(el);
        if (!t || t.length > 90) return;
        if (/(produktivitas|pencapaian|capaian).*kebun/i.test(t)) penanda.push({ el, jenis: "kartu", t });
        else if (/^(s\.?\s*d\.?\s+)?bulan ini$/i.test(t)) penanda.push({ el, jenis: "seksi", t });
        else if (/(hari ini|kumulatif)/i.test(t) && /tertinggi|terendah/i.test(t)) penanda.push({ el, jenis: "sub", t });
      });
      const sebelum = (el, cv) => !el.contains(cv) && (el.compareDocumentPosition(cv) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      const terakhir = (cv, jenis) => { const a = penanda.filter((m) => m.jenis === jenis && sebelum(m.el, cv)); return a.length ? a[a.length - 1].t : ""; };

      const kelompok = [], peta = {};
      daftar.forEach(({ cv, ch }) => {
        const kartu = terakhir(cv, "kartu") || "Grafik per Kebun", seksi = terakhir(cv, "seksi"), sub = terakhir(cv, "sub");
        const persen = /%|rkap|pencapaian/i.test(kartu);
        const jenisDasar = (ch.config && ch.config.type) || "bar";
        const aktif = ch.data.datasets.map((ds, di) => ({ ds, di })).filter((o) => (o.ds.type || jenisDasar) !== "line" && !o.ds.hidden);
        const titik = (ch.data.labels || []).map((lab, i) => {
          let nilai = null, di = -1;
          for (const o of aktif) { const v = angkaTitik(o.ds.data[i]); if (v != null) { nilai = v; di = o.di; break; } }
          return { lab: labelBersih(lab), nilai, di, i };
        });
        let grup = [], kini = [];
        titik.forEach((t) => {
          if (t.nilai == null && !t.lab) { if (kini.length) grup.push(kini); kini = []; }
          else if (t.nilai != null) kini.push(t);
        });
        if (kini.length) grup.push(kini);
        if (grup.length === 1 && grup[0].length >= 10) grup = [grup[0].slice(0, 5), grup[0].slice(5)];

        let faktor = 1;
        if (persen) {
          const semua = titik.filter((t) => t.nilai != null).map((t) => t.nilai), mks = Math.max.apply(null, semua.concat([0]));
          const tampil = teksTergambar(ch).filter((s) => /^[\d.,]+%?$/.test(s)).map(angkaId).filter((n) => isFinite(n));
          const dekat = (a, b) => Math.abs(a - b) <= 0.06 + Math.abs(b) * 0.001;
          if (mks > 0 && tampil.length && !tampil.some((n) => dekat(n, mks)) && tampil.some((n) => dekat(n, mks * 100))) faktor = 100;
        }

        const kunci = kartu + "|" + seksi;
        if (!peta[kunci]) { peta[kunci] = { kartu, seksi, sub, persen, grafik: [] }; kelompok.push(peta[kunci]); }
        grup.forEach((g) => {
          const ref = g.map((t) => ({ t, w: warnaDataset(ch.data.datasets[t.di], t.i) || warnaPiksel(ch, t.di, t.i) }));
          const cadangan = (ref.find((r) => r.w) || {}).w;
          peta[kunci].grafik.push({
            label: g.map((t) => t.lab), nilai: g.map((t) => t.nilai * faktor),
            warna: ref.map((r) => r.w || cadangan || null),
          });
        });
      });

      const hasil = [];
      kelompok.forEach((k) => {
        const ket = k.sub ? k.sub.split("·")[0].trim() : "";
        for (let a = 0; a < k.grafik.length; a += 2) {
          const dua = k.grafik.slice(a, a + 2);
          dua.forEach((g, j) => {
            const peringkat = dua.length === 2 ? (j === 0 ? "5 Tertinggi" : "5 Terendah") : "";
            const biru = "15803D", merah = "B91C1C";
            g.warna = g.warna.map((w) => w || (dua.length === 2 && j === 1 ? merah : biru));
            g.judul = [k.seksi, peringkat].filter(Boolean).join(" — ") || k.kartu;
            g.sub = ket;
          });
          hasil.push({ judul: k.kartu, persen: k.persen, grafik: dua });
        }
      });
      return hasil;
    } catch (e) { console.warn("Grafik per kebun (Monitoring) tidak terbaca:", e); return []; }
  }

  async function gambarKebun() {
    const akar = document.getElementById("kebunGrafikPeringkatMon");
    if (!akar || !window.html2canvas || !akar.children.length || !akar.offsetWidth) return [];
    const hasil = [];
    for (const el of [...akar.children]) {
      if (!el.offsetWidth || !el.offsetHeight) continue;
      try {
        const k = await html2canvas(el, { backgroundColor: "#ffffff", scale: 2, useCORS: true, logging: false });
        const jdl = teks(el.querySelector("h2, h3, h4")) || "Capaian Produksi per Kebun";
        hasil.push({ judul: jdl, data: k.toDataURL("image/png").replace(/^data:/, ""), rasio: k.width / k.height });
      } catch (e) { }
    }
    return hasil;
  }

  /* Extractor fallback untuk membaca kartu indikator langsung dari DOM bila `dataIndikator` belum siap */
  function bacaIndikatorDariDom() {
    const wadah = document.querySelectorAll("#halamanIndikator .c-ind, .grid-ind .c-ind, .indikator-card, [id*='ind'] .c");
    const kartuList = [];
    const labelsDefault = typeof BULAN !== "undefined" ? BULAN.slice(0, 9) : ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep"];

    wadah.forEach((card) => {
      const nama = teks(card.querySelector("h3, h4, .j-ind, .title")) || "Indikator Panen";
      const valEl = card.querySelector(".n-ind, .val, b, .big-num");
      const nilai = valEl ? teks(valEl) : "-";
      const satEl = card.querySelector("small, .satuan, .sub-text");
      const satuan = satEl ? teks(satEl) : "";
      const badgeEl = card.querySelector(".badge, .status, .ket");
      const badge = badgeEl ? teks(badgeEl) : "";
      const baik = badgeEl ? !/memburuk|turun|merah/i.test(badgeEl.className + " " + badge) : true;

      let seri = [];
      const cv = card.querySelector("canvas");
      if (cv && window.Chart && typeof Chart.getChart === "function") {
        const ch = Chart.getChart(cv);
        if (ch && ch.data && ch.data.datasets && ch.data.datasets.length) {
          seri = ch.data.datasets[0].data.map((v) => (v != null ? Number(v) : null));
        }
      }

      kartuList.push({
        nama, satuan, nilai, badge, baik,
        seri: seri.length ? seri : [null],
        desimal: nilai.includes(",") ? nilai.split(",")[1].length : 0,
      });
    });

    return kartuList.length ? { label: labelsDefault, kartu: kartuList } : null;
  }

  /* ---------- 1. Kumpulkan data yang sedang tampil di dashboard ---------- */
  function kumpulkan() {
    const filter = (document.getElementById("f") && document.getElementById("f").value) || "Semua";
    const lokasi = filter === "Semua" ? "Seluruh regional" : filter;
    const kunci = filter === "Semua" ? "Total" : filter.replace("CRO", "Regional");

    const dariChart = (id) => {
      const c = typeof charts !== "undefined" ? charts[id] : null;
      if (!c || !c.data || !c.data.datasets.length) return null;
      const ds = c.data.datasets[0];
      return { label: c.data.labels.slice(), nilai: ds.data.slice(), warna: ds.data.map((_, i) => warnaDataset(ds, i) || C.aksen) };
    };
    const bulanan = dariChart("c1"), perCro = dariChart("c2"), protas = dariChart("c3");
    if (!bulanan || !perCro) throw new Error("Grafik dashboard belum siap. Tunggu sebentar lalu coba lagi.");
    // garis merah Ton/Ha (sumbu kanan) pada grafik Produksi bulanan (c1) dan Total produksi per CRO (c2)
    const garisDari = (id) => {
      const c = typeof charts !== "undefined" ? charts[id] : null;
      const ds = c && c.data ? c.data.datasets.find((x) => x.type === "line" && !x.hidden) : null;
      return ds ? ds.data.map((v) => { const n = Number(v); return v == null || v === "" || !isFinite(n) ? null : n; }) : null;
    };
    bulanan.garis = garisDari("c1");
    perCro.garis = garisDari("c2");

    const kpi = [...document.querySelectorAll("#kpi > .c")].map((c) => ({
      judul: teks(c.querySelector("span")), nilai: teks(c.querySelector("b")), ket: teks(c.querySelector("i")),
    }));
    const sorotan = [...document.querySelectorAll("#ins li")]
      .map((li) => li.textContent.replace(/[\u26A0\uFE0F]/g, "").replace(/\s+/g, " ").trim())
      .filter(Boolean);

    const baris = [...document.querySelectorAll("#t tr")];
    const tabel = baris.length ? {
      kepala: [...baris[0].children].map(teks),
      isi: baris.slice(1).map((tr) => [...tr.children].map((td) => ({ teks: teks(td), kelas: td.className }))),
    } : { kepala: [], isi: [] };

    const angkaId = (t) => parseFloat(String(t).replace("%", "").replace(/\./g, "").replace(",", "."));
    const bacaKebun = (wadah) => [...document.querySelectorAll(wadah + " .kg-panel")].map((p) => {
      const tengah = p.querySelector(".kg-tengah");
      return {
        judul: teks(p.querySelector("h3")),
        total: tengah ? tengah.getAttribute("data-awal-n") || teks(tengah.querySelector("b")) : "",
        baris: [...p.querySelectorAll(".kg-baris")].map((li) => ({
          nama: teks(li.querySelector(".kg-kebun")), wilayah: teks(li.querySelector("small")),
          teks: teks(li.querySelector(".kg-nilai")), nilai: angkaId(teks(li.querySelector(".kg-nilai"))),
        })),
      };
    }).filter((p) => p.baris.length);
    let kebun = bacaKebun("#kebunGrafikPeringkatMon");
    if (!kebun.length) kebun = bacaKebun("#kebunGrafikMon");

    const ranking = [...document.querySelectorAll("#halamanMonitoring .grafik-ringkas")].map((wadah) => {
      const kartu = wadah.closest(".c"), h2 = kartu ? kartu.querySelector("h2") : null;
      const judulKartu = h2 ? [...h2.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim() : "Grafik Laporan";
      const grafik = [...wadah.querySelectorAll(".blok-ringkas")].map((blok) => {
        const cv = blok.querySelector("canvas"), h4 = blok.querySelector("h4"), kecil = h4 ? h4.querySelector("small") : null;
        const data = cv ? dariChart(cv.id) : null;
        if (!data) return null;
        const judul = h4 ? [...h4.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").replace(/\s+/g, " ").trim() : cv.id;
        return Object.assign({ judul, sub: teks(kecil) }, data);
      }).filter(Boolean);
      return { judul: judulKartu, tonnase: !!(h2 && h2.querySelector(".lg-oranye")), grafik };
    }).filter((k) => k.grafik.length);

    const kebunBar = bacaKebunBar();

    let historis = null;
    try {
      const hc = (typeof charts !== "undefined" && charts.chHistorisMon) ||
                 (window.Chart && typeof Chart.getChart === "function" ? Chart.getChart("chHistorisMon") : null);
      if (hc && hc.data && hc.data.datasets && hc.data.datasets.length) {
        const jenisDasar = (hc.config && hc.config.type) || "bar";
        const angka = (v) => { if (v && typeof v === "object") v = v.y; const n = Number(v); return v == null || isNaN(n) ? null : n; };
        const seri = hc.data.datasets.filter((ds) => !ds.hidden).map((ds, i) => {
          const tipe = (ds.type || jenisDasar) === "line" ? "line" : "bar";
          let warna = null;
          if (tipe === "line") { const r = rgbDariCss(ds.borderColor); if (r) warna = r.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase(); }
          return { nama: ds.label || ("Seri " + (i + 1)), tipe, nilai: ds.data.map(angka), warna: warna || warnaDataset(ds, 0) || C.aksen };
        }).filter((s) => s.nilai.some((v) => v != null));
        if (seri.length) {
          const cat = document.getElementById("apnCatatanMon");
          const legenda = [...document.querySelectorAll("#apnLegendaMon > *")].map((el) => {
            const nama = teks(el);
            let warna = null;
            for (const k of el.querySelectorAll("*")) {
              const bg = getComputedStyle(k).backgroundColor;
              if (!bg || bg === "transparent" || /,\s*0\)$/.test(bg)) continue;
              warna = hexCss(bg); if (warna) break;
            }
            if (!warna) { const f = WARNA_NAMA.find((w) => w[0].test(nama)); warna = f ? f[1] : C.aksen; }
            return { nama, warna };
          }).filter((l) => l.nama);
          let hiasan = null;
          try { hiasan = tangkapHiasan(hc); } catch (e) { hiasan = null; }
          historis = { label: hc.data.labels.slice(), seri, legenda, hiasan, sub: teks(document.getElementById("apnSubMon")), catatan: cat && !cat.hidden ? teks(cat) : "" };
        }
      }
    } catch (e) { historis = null; }

    /* Indikator panen: utamakan dataIndikator global, fallback ke pembacaan DOM jika tidak ada */
    let indikator = null;
    if (LAMPIRAN.indikator) {
      const data = (typeof dataIndikator !== "undefined" && dataIndikator) ? dataIndikator[kunci] : null;
      if (data && typeof BULAN !== "undefined" && typeof INDIKATOR !== "undefined" && typeof bandingkanBulan === "function" && typeof fmt === "function") {
        indikator = {
          label: BULAN.slice(0, data.bulanan[0].length),
          kartu: INDIKATOR.map((ind, i) => {
            const { baik, teks: badge } = bandingkanBulan(data.bulanan[i], ind.arah);
            return { nama: ind.nama, satuan: ind.satuan, nilai: fmt(data.akumulasi[i], ind.desimal),
                     badge, baik, seri: data.bulanan[i], desimal: ind.desimal };
          }),
        };
      } else {
        indikator = bacaIndikatorDariDom();
      }
    }

    return { filter, lokasi, sub: teks(document.getElementById("sub")), kpi, sorotan, bulanan, perCro, protas, tabel, indikator, kebun, ranking, kebunBar, historis };
  }

  /* ---------- Logo ---------- */
  function logoPng() {
    return new Promise((selesai) => {
      const img = document.querySelector(".brand-logo");
      if (!img) return selesai(null);
      const ambil = () => {
        try {
          const k = document.createElement("canvas");
          k.width = img.naturalWidth; k.height = img.naturalHeight;
          k.getContext("2d").drawImage(img, 0, 0);
          selesai(k.toDataURL("image/png").replace(/^data:/, ""));
        } catch (e) { selesai(null); }
      };
      if (img.complete && img.naturalWidth) ambil();
      else { img.onload = ambil; img.onerror = () => selesai(null); }
    });
  }

  /* ---------- 2. Susun slide ---------- */
  function susun(pres, d, logo) {
    pres.layout = "LAYOUT_WIDE";
    pres.title = "Monitoring Produksi TBS 2026 - " + d.lokasi;
    pres.author = "Dashboard Produksi TBS";
    pres.theme = { headFontFace: FONT, bodyFontFace: FONT };

    pres.defineSlideMaster({
      title: "ISI",
      background: { color: C.latar },
      objects: [
        { rect: { x: 0, y: 0, w: W, h: 1.05, fill: { color: C.hijauTua } } },
        { rect: { x: 0, y: 1.05, w: W, h: 0.06, fill: { color: C.emas } } },
        { rect: { x: 0.5, y: 0.3, w: 0.09, h: 0.45, fill: { color: C.emas } } },
        { line: { x: 0.5, y: 7.0, w: W - 1, h: 0, line: { color: C.garis, width: 0.75 } } },
        { text: { text: "Monitoring Produksi TBS 2026 · " + d.lokasi,
                  options: { x: 0.5, y: 7.05, w: 9, h: 0.3, fontSize: 11, color: C.redup, fontFace: FONT, margin: 0 } } },
        { placeholder: { options: { name: "judul", type: "title", x: 0.75, y: 0.12, w: W - 3.4, h: 0.8, fontSize: 28, bold: true,
                                    color: C.putih, fontFace: FONT, align: "left", valign: "middle", margin: 0 }, text: "" } },
      ],
      slideNumber: { x: W - 1.2, y: 7.05, w: 0.7, h: 0.3, fontSize: 11, color: C.redup, fontFace: FONT, align: "right" },
    });
    pres.defineSlideMaster({
      title: "SAMPUL",
      background: { color: C.hijauTua },
      objects: [
        { rect: { x: 0, y: 0, w: 0.35, h: 7.5, fill: { color: C.emas } } },
      ],
    });

    const slideIsi = (judul) => {
      const s = pres.addSlide({ masterName: "ISI" });
      s.addShape(pres.ShapeType.ellipse, { x: W - 2.15, y: 0.18, w: 0.7, h: 0.7, fill: { color: C.hijau, transparency: 35 }, line: { color: C.hijau, transparency: 100 } });
      s.addShape(pres.ShapeType.ellipse, { x: W - 1.55, y: 0.33, w: 0.4, h: 0.4, fill: { color: C.emas, transparency: 25 }, line: { color: C.emas, transparency: 100 } });
      s.addShape(pres.ShapeType.ellipse, { x: W - 1.05, y: 0.12, w: 0.9, h: 0.9, fill: { color: C.hijau, transparency: 55 }, line: { color: C.hijau, transparency: 100 } });
      const ukJudul = judul.length > 40 ? Math.max(17, Math.floor(28 * 40 / judul.length)) : 28;   // judul panjang diperkecil agar muat
      s.addText(judul, { placeholder: "judul", fit: "shrink", fontSize: ukJudul });
      return s;
    };
    const kartu = (s, x, y, w, h, garis) => s.addShape(pres.ShapeType.roundRect, {
      x, y, w, h, rectRadius: 0.12, fill: { color: C.putih }, line: { color: garis || C.garis, width: 0.75 },
      shadow: { type: "outer", color: "000000", opacity: 0.1, blur: 6, offset: 2, angle: 90 },
    });
    const catatan = (s, t, y) => s.addText(t, { x: 0.5, y: y, w: W - 1, h: 0.4, fontSize: 12, italic: true, color: C.redup, fontFace: FONT, margin: 0, valign: "middle", isTextBox: true });

    const sumbu = { catAxisLabelFontFace: FONT, valAxisLabelFontFace: FONT, dataLabelFontFace: FONT, dataLabelFontBold: true,
                    catAxisLabelColor: C.teks, valAxisLabelColor: C.redup, dataLabelColor: C.teks,
                    valGridLine: { color: C.garis, size: 0.5 }, catGridLine: { style: "none" }, showLegend: false };

    /* --- Sampul --- */
    const s1 = pres.addSlide({ masterName: "SAMPUL" });
    [[8.4, -1.6, 7.2, C.hijau, 55], [10.9, 4.3, 4.4, C.emas, 78], [7.7, 3.2, 1.1, C.emas, 40]].forEach(([x, y, u, w, tr]) =>
      s1.addShape(pres.ShapeType.ellipse, { x, y, w: u, h: u, fill: { color: w, transparency: tr }, line: { color: w, transparency: 100 } }));
    let yJudul = 1.9;
    if (logo) {
      s1.addShape(pres.ShapeType.ellipse, { x: 1.0, y: 0.7, w: 1.2, h: 1.2, fill: { color: C.putih }, line: { color: C.emas, width: 2 } });
      s1.addImage({ data: logo, x: 1.09, y: 0.79, w: 1.02, h: 1.02, altText: "Logo Monitoring" });
      yJudul = 2.55;
    }
    s1.addText("PERKEBUNAN KELAPA SAWIT", { x: 1.0, y: yJudul - 0.55, w: 10, h: 0.4, fontSize: 16, bold: true, color: C.emas, fontFace: FONT, charSpacing: 4, margin: 0, isTextBox: true });
    s1.addText("Monitoring Produksi TBS 2026", { x: 1.0, y: yJudul, w: 11, h: 1.1, fontSize: 48, bold: true, color: C.putih, fontFace: FONT, margin: 0, isTextBox: true });
    s1.addShape(pres.ShapeType.rect, { x: 1.0, y: yJudul + 1.25, w: 1.8, h: 0.07, fill: { color: C.emas }, line: { color: C.emas } });
    s1.addText(d.sub || d.lokasi, { x: 1.0, y: yJudul + 1.5, w: 11, h: 0.5, fontSize: 22, color: C.putih, fontFace: FONT, margin: 0, isTextBox: true });
    s1.addText("Laporan bulanan · diunduh " + new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }),
      { x: 1.0, y: yJudul + 2.05, w: 11, h: 0.4, fontSize: 16, color: "CFE5D8", fontFace: FONT, margin: 0, isTextBox: true });

    if (d.kpi.length) {
      const n = Math.min(4, d.kpi.length), gP = 0.2, wM = (W - 2.0 - gP * (n - 1)) / n;
      d.kpi.slice(0, n).forEach((k, i) => {
        const x = 1.0 + i * (wM + gP);
        s1.addShape(pres.ShapeType.roundRect, { x, y: 5.75, w: wM, h: 1.0, rectRadius: 0.1, fill: { color: C.putih, transparency: 88 }, line: { color: C.putih, width: 0.75, transparency: 60 } });
        s1.addShape(pres.ShapeType.rect, { x: x + 0.12, y: 5.9, w: 0.06, h: 0.7, fill: { color: AKSEN_KPI[i % 4] }, line: { color: AKSEN_KPI[i % 4] } });
        s1.addText(k.judul.toUpperCase(), { x: x + 0.28, y: 5.85, w: wM - 0.38, h: 0.3, fontSize: 10, bold: true, color: "CFE5D8", fontFace: FONT, margin: 0, isTextBox: true });
        s1.addText(k.nilai, { x: x + 0.28, y: 6.15, w: wM - 0.38, h: 0.5, fontSize: 20, bold: true, color: C.putih, fontFace: FONT, margin: 0, valign: "middle", fit: "shrink", isTextBox: true });
      });
    }

    /* --- Ringkasan: KPI --- */
    const s2 = slideIsi("Ringkasan Produksi");
    const gap = 0.25;
    if (d.sorotan.length) {
      const wK = (W - 1 - gap * 3) / 4;
      d.kpi.forEach((k, i) => {
        const x = 0.5 + i * (wK + gap);
        kartu(s2, x, 1.45, wK, 1.75);
        s2.addShape(pres.ShapeType.rect, { x, y: 1.45, w: 0.09, h: 1.75, fill: { color: AKSEN_KPI[i % 4] }, line: { color: AKSEN_KPI[i % 4] } });
        s2.addText(k.judul.toUpperCase(), { x: x + 0.2, y: 1.58, w: wK - 0.35, h: 0.32, fontSize: 11, bold: true, color: C.redup, fontFace: FONT, align: "center", margin: 0, isTextBox: true });
        s2.addText(k.nilai, { x: x + 0.2, y: 1.95, w: wK - 0.35, h: 0.65, fontSize: 28, bold: true, color: C.teks, fontFace: FONT, align: "center", valign: "middle", margin: 0, fit: "shrink", isTextBox: true });
        s2.addText(k.ket, { x: x + 0.2, y: 2.65, w: wK - 0.35, h: 0.4, fontSize: 11, color: C.redup, fontFace: FONT, align: "center", margin: 0, fit: "shrink", isTextBox: true });
      });
      s2.addText("Sorotan otomatis", { x: 0.5, y: 3.5, w: 6, h: 0.4, fontSize: 18, bold: true, color: C.hijau, fontFace: FONT, margin: 0, isTextBox: true });
      const butir = d.sorotan.slice(0, 7);
      if (d.sorotan.length > butir.length) butir.push("… dan " + (d.sorotan.length - butir.length) + " catatan lain (lihat dashboard).");
      s2.addText(butir.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < butir.length - 1 } })),
        { x: 0.5, y: 3.95, w: W - 1, h: 2.9, fontSize: 15, color: C.teks, fontFace: FONT, valign: "top", paraSpaceAfter: 6, margin: 0, isTextBox: true });
    } else {
      const wK = (W - 1 - gap) / 2, hK = 2.55;
      d.kpi.slice(0, 4).forEach((k, i) => {
        const x = 0.5 + (i % 2) * (wK + gap), y = 1.45 + Math.floor(i / 2) * (hK + gap);
        kartu(s2, x, y, wK, hK);
        s2.addShape(pres.ShapeType.rect, { x, y, w: 0.12, h: hK, fill: { color: AKSEN_KPI[i % 4] }, line: { color: AKSEN_KPI[i % 4] } });
        s2.addText(k.judul.toUpperCase(), { x: x + 0.3, y: y + 0.25, w: wK - 0.5, h: 0.4, fontSize: 14, bold: true, color: C.redup, fontFace: FONT, align: "center", charSpacing: 2, margin: 0, isTextBox: true });
        s2.addText(k.nilai, { x: x + 0.3, y: y + 0.75, w: wK - 0.5, h: 1.0, fontSize: 44, bold: true, color: AKSEN_KPI[i % 4], fontFace: FONT, align: "center", valign: "middle", margin: 0, fit: "shrink", isTextBox: true });
        s2.addText(k.ket, { x: x + 0.3, y: y + 1.85, w: wK - 0.5, h: 0.45, fontSize: 14, color: C.redup, fontFace: FONT, align: "center", margin: 0, fit: "shrink", isTextBox: true });
      });
    }

    /* --- Produksi bulanan & Total produksi per CRO: batang Ton (sumbu kiri) + garis Ton/Ha berlabel (sumbu kanan) --- */
    const WARNA_GARIS = "DC2626";
    const grafikProduksi = (sl, label, nilai, warna, garis, geo, gapPct) => {
      const ada = !!garis && garis.some((v) => v != null);
      const dasar = Object.assign({ x: geo.x, y: geo.y, w: geo.w, h: geo.h }, sumbu);
      const opBar = { barDir: "col", barGapWidthPct: gapPct, chartColors: warna.map(hex), showValue: true, dataLabelPosition: "outEnd",
                      dataLabelFormatCode: "#,##0", dataLabelFontSize: 12, dataLabelColor: C.teks };
      if (!ada) {
        sl.addChart(pres.charts.BAR, [{ name: "Produksi (Ton)", labels: label, values: nilai }],
          Object.assign(dasar, opBar, { catAxisLabelFontSize: 13, valAxisLabelFontSize: 11, valAxisLabelFormatCode: "#,##0" }));
        return;
      }
      // Susunan sama dengan dashboard: batang Ton (sumbu kiri) dan garis Ton/Ha (sumbu kanan merah) pada area yang sama
      sl.addChart([
        { type: pres.charts.BAR, data: [{ name: "Ton", labels: label, values: nilai }], options: opBar },
        { type: pres.charts.LINE, data: [{ name: "Ton/Ha", labels: label, values: garis }], options: {
            chartColors: [WARNA_GARIS], lineSize: 3, lineSmooth: true, lineDataSymbol: "circle", lineDataSymbolSize: 7,
            secondaryValAxis: true, secondaryCatAxis: true,
            showValue: true, dataLabelPosition: "t", dataLabelFormatCode: "#,##0.00", dataLabelFontSize: 10, dataLabelColor: "FFFFFF", dataLabelBkgrdColors: true } },   // label berlatar merah, teks putih: terbaca di atas batang maupun di luar
      ], Object.assign(dasar, {
        showLegend: true, legendPos: "b", legendFontSize: 12, legendFontFace: FONT, legendColor: C.teks, displayBlanksAs: "gap",
        catAxisLabelFontSize: 13,
        valAxes: [
          { valAxisLabelFontSize: 11, valAxisLabelFormatCode: "#,##0", valAxisMinVal: 0 },
          { valAxisLabelFontSize: 11, valAxisLabelFormatCode: "#,##0.00", valAxisLabelColor: WARNA_GARIS, valAxisLineShow: false, valAxisMinVal: 0, valGridLine: { style: "none" } },
        ],
        catAxes: [{ catAxisLabelFontSize: 13 }, { catAxisHidden: true }],
      }));
    };

    const adaGarisBln = !!(d.bulanan.garis && d.bulanan.garis.some((v) => v != null));
    const s3 = slideIsi(adaGarisBln ? "Produksi Bulanan (Ton) & Produktivitas (Ton/Ha)" : "Produksi Bulanan (Ton)");
    kartu(s3, 0.5, 1.4, W - 1, 5.0);
    grafikProduksi(s3, d.bulanan.label, d.bulanan.nilai, d.bulanan.warna, d.bulanan.garis, { x: 0.65, y: 1.5, w: W - 1.3, h: 4.8 }, 40);
    catatan(s3, "Bulan terakhir berwarna oranye karena datanya bisa belum penuh; jangan dibandingkan langsung dengan bulan sebelumnya." +
                (adaGarisBln ? " Garis merah = Produktivitas (Ton/Ha)." : ""), 6.5);

    const adaGarisCro = !!(d.perCro.garis && d.perCro.garis.some((v) => v != null));
    const s4 = slideIsi(adaGarisCro ? "Total Produksi per CRO & Produktivitas (Ton/Ha)" : "Total Produksi per CRO (Ton)");
    kartu(s4, 0.5, 1.4, W - 1, 5.45);
    grafikProduksi(s4, d.perCro.label.map((l) => "CRO " + l), d.perCro.nilai, d.perCro.warna, d.perCro.garis, { x: 0.65, y: 1.5, w: W - 1.3, h: 5.25 }, 50);

    /* --- Grafik Laporan Protas & Tonnase --- */
    d.ranking.forEach((k) => {
      const sr = slideIsi(k.judul);
      const gapP = 0.3, wP = (W - 1 - gapP) / 2;
      k.grafik.forEach((g, i) => {
        const x = 0.5 + i * (wP + gapP);
        kartu(sr, x, 1.4, wP, 5.1);
        sr.addText([{ text: g.judul, options: { fontSize: 15, bold: true, color: C.teks, breakLine: true } },
                    { text: g.sub, options: { fontSize: 12, color: C.redup } }],
          { x: x + 0.2, y: 1.5, w: wP - 0.4, h: 0.7, fontFace: FONT, valign: "top", margin: 0, fit: "shrink", isTextBox: true });
        sr.addChart(pres.charts.BAR, [{ name: g.judul, labels: g.label, values: g.nilai }], Object.assign({
          x: x + 0.1, y: 2.25, w: wP - 0.2, h: 4.15, barDir: "bar", barGapWidthPct: 35, catAxisOrientation: "maxMin", valAxisHidden: true,
          chartColors: g.warna.length > 1 ? g.warna.map(hex) : [C.aksen], showValue: true, dataLabelPosition: "outEnd",
          dataLabelFormatCode: '0.00"%"', dataLabelFontSize: 11, catAxisLabelFontSize: 11,
        }, sumbu, { dataLabelColor: C.persen }));
      });
      catatan(sr, k.tonnase ? "Hijau: ≥ 100%; oranye: 80 - < 100%; merah: < 80% (tertinggi di atas, terendah di bawah)."
                            : "Hijau: tertinggi; merah: terendah (warna lebih pucat untuk peringkat berikutnya).", 6.55);
    });

    /* --- Grafik Laporan Per Kebun --- */
    d.kebunBar.forEach((k) => {
      const sk = slideIsi(k.judul);
      const gapP = 0.3, wP = (W - 1 - gapP) / 2;
      k.grafik.forEach((g, i) => {
        const x = 0.5 + i * (wP + gapP);
        kartu(sk, x, 1.4, wP, 5.1);
        sk.addText([{ text: g.judul, options: { fontSize: 15, bold: true, color: C.teks, breakLine: true } },
                    { text: g.sub, options: { fontSize: 12, color: C.redup } }],
          { x: x + 0.2, y: 1.5, w: wP - 0.4, h: 0.7, fontFace: FONT, valign: "top", margin: 0, fit: "shrink", isTextBox: true });
        const cx = x + 0.1, cy = 2.25, cw2 = wP - 0.2, ch2 = 4.15;
        const opsi = Object.assign({
          x: cx, y: cy, w: cw2, h: ch2, barDir: "col", barGapWidthPct: 45, valAxisHidden: true,
          chartColors: g.warna.length > 1 ? g.warna.map(hex) : [hex(g.warna[0])], showValue: true, dataLabelPosition: "outEnd",
          dataLabelFormatCode: k.persen ? '#,##0.0"%"' : "#,##0.00", dataLabelFontSize: 10, catAxisLabelFontSize: 9,
        }, sumbu, { dataLabelColor: k.persen ? C.persen : C.teks });
        const mks = Math.max.apply(null, g.nilai.concat([0]));
        const garis100 = k.persen && mks >= 100;
        if (garis100) {
          const M = mks * 1.2, lay = { x: 0.03, y: 0.08, w: 0.94, h: 0.72 };
          Object.assign(opsi, { valAxisMinVal: 0, valAxisMaxVal: M, layout: lay });
          const px = cx + lay.x * cw2, py = cy + lay.y * ch2, pw = lay.w * cw2, ph = lay.h * ch2, yL = py + ph * (1 - 100 / M);
          sk.addChart(pres.charts.BAR, [{ name: g.judul, labels: g.label, values: g.nilai }], opsi);
          sk.addShape(pres.ShapeType.line, { x: px, y: yL, w: pw, h: 0, line: { color: "6B7280", width: 1, dashType: "dash" } });
          sk.addText("100%", { x: px + pw - 0.6, y: yL - 0.2, w: 0.6, h: 0.18, fontSize: 9, bold: true, color: C.persen, fontFace: FONT, align: "right", margin: 0, isTextBox: true });
        } else {
          sk.addChart(pres.charts.BAR, [{ name: g.judul, labels: g.label, values: g.nilai }], opsi);
        }
      });
      catatan(sk, k.persen ? "Hijau: 5 tertinggi; merah: 5 terendah. Garis putus-putus: acuan 100% RKAP (tampil bila ada kebun yang melampauinya)."
                           : "Hijau: 5 tertinggi; merah: 5 terendah.", 6.55);
    });
    (d.kebunGambar || []).forEach((gm) => {
      const sg = slideIsi(gm.judul);
      kartu(sg, 0.5, 1.4, W - 1, 5.45);
      const bw = W - 1.3, bh = 5.25, rs = gm.rasio || 2;
      const w = Math.min(bw, bh * rs), h = w / rs;
      sg.addImage({ data: gm.data, x: 0.65 + (bw - w) / 2, y: 1.5 + (bh - h) / 2, w, h, altText: gm.judul });
    });

    /* --- Capaian Produksi per Kebun (donat) --- */
    const WARNA_DONAT = ["10B981", "3B82F6", "A855F7", "F97316", "EC4899"];
    for (let h = 0; LAMPIRAN.kebun && h < d.kebun.length; h += 2) {
      const panel = d.kebun.slice(h, h + 2);
      const sk = slideIsi("Capaian Produksi per Kebun");
      const gapP = 0.3, wP = (W - 1 - gapP) / 2;
      panel.forEach((p, i) => {
        const x = 0.5 + i * (wP + gapP), warna = p.baris.map((_, j) => WARNA_DONAT[j % WARNA_DONAT.length]);
        kartu(sk, x, 1.4, wP, 5.5);
        sk.addText(p.judul, { x: x + 0.2, y: 1.5, w: wP - 0.4, h: 0.4, fontSize: 17, bold: true, color: C.teks, fontFace: FONT, align: "center", margin: 0, fit: "shrink", isTextBox: true });
        sk.addChart(pres.charts.DOUGHNUT, [{ name: p.judul, labels: p.baris.map((b) => b.nama), values: p.baris.map((b) => Math.max(0, b.nilai)) }], {
          x: x + wP / 2 - 1.5, y: 1.95, w: 3.0, h: 2.4, holeSize: 62, chartColors: warna, showLegend: false,
          showLabel: false, showValue: false, showPercent: false, showTitle: false, dataBorder: { pt: 2, color: C.putih },
        });
        sk.addText([{ text: p.total, options: { fontSize: 20, bold: true, color: C.teks, breakLine: true } },
                    { text: "TOTAL AGRINAS", options: { fontSize: 9, bold: true, color: C.redup } }],
          { x: x + wP / 2 - 0.85, y: 3.15 - 0.4, w: 1.7, h: 0.8, fontFace: FONT, align: "center", valign: "middle", margin: 0, fit: "shrink", isTextBox: true });
        sk.addText("Kebun", { x: x + 0.25, y: 4.4, w: wP - 1.8, h: 0.3, fontSize: 12, bold: true, color: C.redup, fontFace: FONT, margin: 0, isTextBox: true });
        sk.addText("Capaian", { x: x + wP - 1.65, y: 4.4, w: 1.4, h: 0.3, fontSize: 12, bold: true, color: C.redup, fontFace: FONT, align: "right", margin: 0, isTextBox: true });
        sk.addShape(pres.ShapeType.line, { x: x + 0.2, y: 4.72, w: wP - 0.4, h: 0, line: { color: C.garis, width: 0.75 } });
        const tinggi = Math.min(0.42, 2.05 / Math.max(1, p.baris.length));
        p.baris.forEach((b, j) => {
          const y = 4.78 + j * tinggi;
          sk.addShape(pres.ShapeType.ellipse, { x: x + 0.25, y: y + tinggi / 2 - 0.07, w: 0.14, h: 0.14, fill: { color: warna[j] }, line: { color: warna[j] } });
          sk.addText([{ text: b.nama, options: { fontSize: 13, bold: true, color: C.teks, breakLine: !!b.wilayah } }]
            .concat(b.wilayah ? [{ text: b.wilayah, options: { fontSize: 10, color: C.redup } }] : []),
            { x: x + 0.5, y, w: wP - 2.2, h: tinggi, fontFace: FONT, valign: "middle", margin: 0, fit: "shrink", isTextBox: true });
          sk.addText(b.teks, { x: x + wP - 1.65, y, w: 1.4, h: tinggi, fontSize: 14, bold: true, color: C.teks, fontFace: FONT, align: "right", valign: "middle", margin: 0, isTextBox: true });
        });
      });
    }

    /* --- Historis & Proyeksi --- */
    if (d.historis) {
      try {
        const hs = d.historis, sh = slideIsi("Historis & Proyeksi Produksi 2026");
        kartu(sh, 0.5, 1.4, W - 1, 5.45);
        if (hs.sub) sh.addText(hs.sub, { x: 0.7, y: 1.48, w: W - 1.4, h: 0.35, fontSize: 13, color: C.redup, fontFace: FONT, margin: 0, fit: "shrink", isTextBox: true });
        const bar = hs.seri.filter((s) => s.tipe === "bar"), line = hs.seri.filter((s) => s.tipe === "line");
        const hanyaBar = bar.length > 0 && !line.length;
        const adaChip = hs.legenda.length > 0;

        let yChart = 1.9;
        if (adaChip) {
          let xc = 0.7;
          hs.legenda.forEach((l) => {
            const wc = 0.6 + l.nama.length * 0.085;
            sh.addShape(pres.ShapeType.roundRect, { x: xc, y: 1.88, w: wc, h: 0.34, rectRadius: 0.17, fill: { color: "F3F7F4" }, line: { color: C.garis, width: 0.75 } });
            sh.addShape(pres.ShapeType.roundRect, { x: xc + 0.12, y: 1.97, w: 0.16, h: 0.16, rectRadius: 0.04, fill: { color: l.warna }, line: { color: l.warna } });
            sh.addText(l.nama, { x: xc + 0.36, y: 1.88, w: wc - 0.42, h: 0.34, fontSize: 11, bold: true, color: C.teks, fontFace: FONT, valign: "middle", margin: 0, isTextBox: true });
            xc += wc + 0.12;
          });
          yChart = 2.3;
        }
        const fx = 0.65, fw = W - 1.3, fy = yChart, fh = (hs.catatan ? 6.25 : 6.8) - yChart;
        const data = (s) => ({ name: s.nama, labels: hs.label, values: s.nilai });
        const opsiUmum = Object.assign({
          x: fx, y: fy, w: fw, h: fh, showLegend: !adaChip, legendPos: "b", legendFontSize: 12, legendFontFace: FONT, legendColor: C.teks,
          catAxisLabelFontSize: 12, valAxisLabelFontSize: 10, valAxisLabelFormatCode: "#,##0", displayBlanksAs: "gap",
        }, sumbu, { showLegend: !adaChip, valAxisLabelColor: "8A9A90", valGridLine: { color: "EAF0EC", size: 0.5 } });

        if (hanyaBar) {
          const maks = Math.max.apply(null, bar.reduce((a, s) => a.concat(s.nilai.filter((v) => v != null)), [1]));
          const mentah = maks * 1.3, mag = Math.pow(10, Math.floor(Math.log10(mentah))), langkah = mag / 2;
          const M = Math.ceil(mentah / langkah) * langkah;
          const lay = { x: 0.02, y: 0.03, w: 0.96, h: adaChip ? 0.86 : 0.74 };
          const px = fx + lay.x * fw, py = fy + lay.y * fh, pw = lay.w * fw, ph = lay.h * fh, n = hs.label.length, cw = pw / n;
          const hi = hs.hiasan;

          if (hi) hi.zona.forEach((z) => {
            const zx = px + z.dari * cw, zw = (z.sampai - z.dari + 1) * cw;
            sh.addShape(pres.ShapeType.roundRect, { x: zx + 0.03, y: py, w: zw - 0.06, h: ph + 0.42, rectRadius: 0.06, fill: { color: z.warna }, line: { color: z.warna, transparency: 100 } });
            sh.addText(z.teks, { x: zx, y: py + 0.06, w: zw, h: 0.26, fontSize: 10, bold: true, color: z.warnaTeks, fontFace: FONT, align: "center", valign: "middle", charSpacing: 1, margin: 0, isTextBox: true });
          });

          sh.addChart(pres.charts.BAR, bar.map(data), Object.assign(opsiUmum, {
            barDir: "col", barGrouping: "clustered", barGapWidthPct: 40, chartColors: bar.map((s) => s.warna),
            showValue: true, dataLabelPosition: "outEnd", dataLabelFormatCode: "#,##0", dataLabelFontSize: 12,
            valAxisMinVal: 0, valAxisMaxVal: M, layout: lay,
          }));

          if (hi) {
            let kReal = -1;
            bar.forEach((s, k) => { if (!/rkap|proyeksi|2025/i.test(s.nama)) kReal = k; });
            if (kReal < 0) kReal = bar.length - 1;
            const kRk = bar.findIndex((s) => /rkap/i.test(s.nama));
            hi.badge.forEach((teksB, i) => {
              const v = bar[kReal].nilai[i];
              if (!teksB || v == null) return;
              const vRk = kRk >= 0 && bar[kRk].nilai[i] != null ? bar[kRk].nilai[i] : 0;
              const cx = px + (i + 0.5) * cw;
              const yAtas = py + ph * (1 - Math.max(v, vRk) / M);
              sh.addShape(pres.ShapeType.roundRect, { x: cx - 0.27, y: yAtas - 0.6, w: 0.54, h: 0.26, rectRadius: 0.13, fill: { color: C.putih }, line: { color: hi.warnaBadge, width: 1.25 } });
              sh.addText(teksB, { x: cx - 0.27, y: yAtas - 0.6, w: 0.54, h: 0.26, fontSize: 10, bold: true, color: C.persen, fontFace: FONT, align: "center", valign: "middle", margin: 0, isTextBox: true });
            });
          }
        } else {
          const lamaOps = Object.assign(opsiUmum, { showLegend: true });
          if (bar.length && line.length) {
            sh.addChart([
              { type: pres.charts.BAR, data: bar.map(data), options: { chartColors: bar.map((s) => s.warna), barGrouping: "clustered", barGapWidthPct: 40 } },
              { type: pres.charts.LINE, data: line.map(data), options: { chartColors: line.map((s) => s.warna), lineSize: 3, lineDataSymbol: "circle", lineDataSymbolSize: 7 } },
            ], lamaOps);
          } else {
            sh.addChart(pres.charts.LINE, line.map(data), Object.assign(lamaOps, { chartColors: line.map((s) => s.warna), lineSize: 3, lineDataSymbol: "circle", lineDataSymbolSize: 7,
              showValue: true, dataLabelPosition: "t", dataLabelFormatCode: "#,##0", dataLabelFontSize: 11 }));
          }
        }
        if (hs.catatan) sh.addText(hs.catatan, { x: 0.7, y: 6.3, w: W - 1.4, h: 0.5, fontSize: 11, italic: true, color: C.redup, fontFace: FONT, margin: 0, valign: "middle", fit: "shrink", isTextBox: true });
      } catch (e) { console.warn("Slide Historis & Proyeksi dilewati:", e); }
    }

    /* --- Tren Indikator Panen (6 grafik) --- */
    if (LAMPIRAN.indikator) {
      const ind = d.indikator;
      const s6 = slideIsi("Tren Indikator Panen · " + (ind && ind.label ? "Jan–" + ind.label[ind.label.length - 1] : "") + " · " + d.lokasi);
      if (!ind || !ind.kartu || !ind.kartu.length) {
        s6.addText("Data indikator panen untuk " + d.lokasi + " tidak ditemukan.",
          { x: 0.5, y: 3.2, w: W - 1, h: 0.6, fontSize: 16, color: C.redup, fontFace: FONT, align: "center", margin: 0, isTextBox: true });
      } else {
        const wC = 4.0, hC = 2.7, gx = 0.17, x0 = (W - (3 * wC + 2 * gx)) / 2;
        ind.kartu.forEach((k, i) => {
          const x = x0 + (i % 3) * (wC + gx), y = 1.4 + Math.floor(i / 3) * (hC + 0.15);
          const warna = k.baik ? C.aksen : C.merah;
          kartu(s6, x, y, wC, hC);
          s6.addShape(pres.ShapeType.rect, { x: x + 0.1, y, w: wC - 0.2, h: 0.06, fill: { color: warna }, line: { color: warna } });
          s6.addText([{ text: k.nama, options: { bold: true, fontSize: 14, color: C.teks, breakLine: true } },
                      { text: k.satuan, options: { fontSize: 10, color: C.redup } }],
            { x: x + 0.15, y: y + 0.15, w: wC - 1.5, h: 0.55, fontFace: FONT, margin: 0, valign: "top", fit: "shrink", isTextBox: true });
          s6.addText(k.nilai, { x: x + wC - 1.4, y: y + 0.15, w: 1.25, h: 0.4, fontSize: 20, bold: true, color: warna, fontFace: FONT, align: "right", margin: 0, isTextBox: true });
          s6.addText(k.badge, { x: x + 0.15, y: y + 0.72, w: wC - 0.3, h: 0.25, fontSize: 10, color: warna, fontFace: FONT, margin: 0, isTextBox: true });
          if (k.seri.every((v) => v == null)) {
            s6.addText("Tidak ada data", { x, y: y + 1.5, w: wC, h: 0.4, fontSize: 12, italic: true, color: C.redup, fontFace: FONT, align: "center", margin: 0, isTextBox: true });
          } else {
            s6.addChart(pres.charts.LINE, [{ name: k.nama, labels: ind.label.slice(0, k.seri.length), values: k.seri.map((v) => (v == null ? 0 : v)) }], Object.assign({
              x: x + 0.05, y: y + 1.0, w: wC - 0.1, h: hC - 1.07, chartColors: [warna], lineSize: 2, lineDataSymbol: "circle", lineDataSymbolSize: 6,
              showValue: true, dataLabelPosition: "t", dataLabelFormatCode: kodeAngka(k.desimal), dataLabelFontSize: 9,
              catAxisLabelFontSize: 9, valAxisHidden: true,
            }, sumbu, { valGridLine: { style: "none" } }));
          }
        });
      }
    }

    /* --- (Lampiran) Produktivitas per wilayah --- */
    if (LAMPIRAN.protas && d.protas) {
      const s5 = slideIsi("Produktivitas per Wilayah (Ton/Ha)");
      const warnaP = d.protas.warna.map(hex);
      kartu(s5, 0.5, 1.4, W - 1, 5.1);
      s5.addChart(pres.charts.BAR, [{ name: "Ton/Ha", labels: d.protas.label, values: d.protas.nilai }], Object.assign({
        x: 0.65, y: 1.5, w: W - 1.3, h: 4.9, barDir: "bar", barGapWidthPct: 35, catAxisOrientation: "maxMin", valAxisHidden: true,
        chartColors: warnaP.length > 1 ? warnaP : [C.aksen], showValue: true, dataLabelPosition: "outEnd", dataLabelFormatCode: "0.00", dataLabelFontSize: 11,
        catAxisLabelFontSize: d.protas.label.length > 14 ? 10 : 12,
      }, sumbu));
      catatan(s5, "Hijau: di atas rata-rata produktivitas; oranye: di bawah rata-rata.", 6.55);
    }

    /* --- Rincian per wilayah (tabel) --- */
    const POTONG = 12, kolomW = [2.7, 1.5, 2.0, 1.8, 2.3, 2.03];
    const jumlahHal = Math.ceil(d.tabel.isi.length / POTONG);
    for (let h = 0; h < jumlahHal; h++) {
      const s = slideIsi("Rincian per Wilayah" + (jumlahHal > 1 ? " (" + (h + 1) + "/" + jumlahHal + ")" : ""));
      const kepala = d.tabel.kepala.map((t, j) => ({ text: t, options: { bold: true, color: C.putih, fill: { color: C.hijau }, align: j < 2 ? "left" : "right", fontFace: FONT } }));
      const isi = d.tabel.isi.slice(h * POTONG, (h + 1) * POTONG).map((r, n) => r.map((sel, j) => ({
        text: sel.teks,
        options: { align: j < 2 ? "left" : "right", fontFace: FONT, color: sel.kelas === "ok" ? C.aksen : sel.kelas === "no" ? C.merah : C.teks,
                   bold: sel.kelas === "ok" || sel.kelas === "no", fill: { color: n % 2 ? C.kartu : C.putih } },
      })));
      s.addTable([kepala].concat(isi), { x: 0.5, y: 1.45, w: kolomW.reduce((a, b) => a + b, 0), colW: kolomW, rowH: 0.4, fontSize: 13,
        border: { type: "solid", pt: 0.5, color: C.garis }, valign: "middle", margin: [0, 0.1, 0, 0.1] });
    }
  }

  /* ---------- 3. Tombol: susun lalu unduh ---------- */
  async function unduh() {
    if (tombol.disabled) return;
    if (typeof PptxGenJS === "undefined") {
      alert("Pustaka PowerPoint belum termuat. Periksa koneksi internet, lalu muat ulang halaman.");
      return;
    }
    const label = tombol.querySelector(".ppt-teks");
    tombol.disabled = true;
    tombol.classList.add("memuat");
    tombol.setAttribute("aria-busy", "true");
    if (label) label.textContent = "Menyiapkan PPT…";
    try {
      const d = kumpulkan();
      if (!d.kebunBar.length) d.kebunGambar = await gambarKebun();
      const logo = await logoPng();
      const pres = new PptxGenJS();
      susun(pres, d, logo);
      const tgl = new Date().toISOString().slice(0, 10);
      await pres.writeFile({ fileName: "Dashboard_TBS_2026_" + slug(d.lokasi) + "_" + tgl + ".pptx" });
    } catch (err) {
      console.error(err);
      alert("Gagal membuat PPT: " + err.message);
    } finally {
      tombol.disabled = false;
      tombol.classList.remove("memuat");
      tombol.removeAttribute("aria-busy");
      if (label) label.textContent = "Unduh PPT";
    }
  }

  /* ---------- Posisi tombol ---------- */
  function tempatkanTombol() {
    const hero = tombol.closest(".hero") || document.querySelector("#halamanMonitoring .hero");
    const pilih = document.getElementById("f");
    if (!hero || !pilih) return;
    const fs = [...hero.querySelectorAll("button")].find((b) => b !== tombol);
    let G = hero;
    if (fs) {
      G = pilih.parentElement;
      while (G && G !== hero && !G.contains(fs)) G = G.parentElement;
      if (!G || !hero.contains(G)) G = hero;
    }
    let acuan = pilih;
    while (acuan.parentElement && acuan.parentElement !== G) acuan = acuan.parentElement;
    if (acuan.parentElement !== G) return;
    if (G === hero) {
      const bungkus = document.createElement("div");
      bungkus.className = "hero-aksi";
      hero.insertBefore(bungkus, acuan);
      bungkus.appendChild(tombol);
      bungkus.appendChild(acuan);
      if (fs && fs.parentElement === hero) bungkus.appendChild(fs);
    } else if (tombol.parentElement !== G || tombol.nextElementSibling !== acuan) {
      G.insertBefore(tombol, acuan);
    }
    hero.querySelectorAll(".hero-aksi").forEach((w) => { if (!w.children.length) w.remove(); });
  }
  tempatkanTombol();
  document.addEventListener("DOMContentLoaded", tempatkanTombol);
  window.addEventListener("load", tempatkanTombol);
  const heroPantau = tombol.closest(".hero");
  if (heroPantau && window.MutationObserver) new MutationObserver(tempatkanTombol).observe(heroPantau, { childList: true, subtree: true });

  window.unduhPpt = unduh;
  tombol.addEventListener("click", unduh);
})();