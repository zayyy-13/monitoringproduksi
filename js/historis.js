/* =====================================================================
   historis.js — Menu "Historis & Proyeksi" (Grafik Laporan)
   ===================================================================== */
(function () {
  "use strict";

  const KUNCI = "tbs_data_historis_v1";
  const KUNCI_KOSONG = "tbs_data_historis_v1_kosong";
  // Tabel "Luas TM (Ha)" di bawah sumbu bulan grafik Historis & Proyeksi: dimatikan. Ubah ke true bila ingin ditampilkan lagi.
  const TAMPILKAN_LUAS_TM = false;
  const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const NAMA_BULAN = {
    jan: 0, januari: 0, january: 0,
    feb: 1, februari: 1, february: 1,
    mar: 2, maret: 2, march: 2,
    apr: 3, april: 3,
    mei: 4, may: 4,
    jun: 5, juni: 5, june: 5,
    jul: 6, juli: 6, july: 6,
    agu: 7, agt: 7, agus: 7, agustus: 7, aug: 7, august: 7,
    sep: 8, sept: 8, september: 8,
    okt: 9, oktober: 9, oct: 9, october: 9,
    nov: 10, november: 10,
    des: 11, desember: 11, dec: 11, december: 11,
  };

  const teks = (v) => String(v == null ? "" : v).trim();

  function angka(v) {
    if (typeof v === "number") return isFinite(v) ? v : null;
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v.trim().replace(",", "."));
      return isFinite(n) ? n : null;
    }
    return null;
  }

  function indeksBulan(v) {
    const k = teks(v).toLowerCase().replace(/\.$/, "");
    return Object.prototype.hasOwnProperty.call(NAMA_BULAN, k) ? NAMA_BULAN[k] : -1;
  }

  function jenisBaris(label) {
    const l = label.toLowerCase();
    if (/proyeksi|estimasi|forecast/.test(l)) return "proy";
    if (/rkap|target|anggaran/.test(l)) return "rkap";
    if (/2025/.test(l)) return "real25";
    if (/2026|real/.test(l)) return "real26";
    return null;
  }

  function bacaSheet(aoa) {
    let barisJudul = -1, peta = null;
    for (let r = 0; r < Math.min(aoa.length, 20); r++) {
      const p = {};
      (aoa[r] || []).forEach((sel, c) => {
        const i = indeksBulan(sel);
        if (i >= 0 && p[i] === undefined) p[i] = c;
      });
      if (Object.keys(p).length >= 6) { barisJudul = r; peta = p; break; }
    }
    if (!peta) throw new Error("judul bulan tidak ditemukan");
    const kolomPertama = Math.min(...Object.values(peta));

    const seri = {};
    for (let r = barisJudul + 1; r < aoa.length; r++) {
      const baris = aoa[r] || [];
      let label = "";
      for (let c = 0; c < kolomPertama; c++) { if (teks(baris[c])) { label = teks(baris[c]); break; } }
      if (!label) continue;
      const jenis = jenisBaris(label);
      if (!jenis || seri[jenis]) continue;
      seri[jenis] = BULAN.map((_, i) => (peta[i] === undefined ? null : angka(baris[peta[i]])));
    }
    if (!seri.rkap || !seri.real26) throw new Error('Baris RKAP / Real 2026 tidak lengkap');

    let satuan = "", startIdx = null;
    aoa.forEach((baris) => {
      (baris || []).forEach((sel, c) => {
        const l = teks(sel).toLowerCase();
        if (l === "satuan" && !satuan) satuan = teks(baris[c + 1]).toLowerCase();
        if (l === "start point" && startIdx === null) {
          const i = indeksBulan(baris[c + 1]);
          if (i >= 0) startIdx = i;
        }
      });
    });
    const bagi = satuan === "ton" ? 1000 : 1;
    const bersih = (a, buangNol) =>
      (a || BULAN.map(() => null)).map((x) => (x == null || (buangNol && x <= 0) ? null : x / bagi));
    return {
      real25: bersih(seri.real25, false),
      rkap: bersih(seri.rkap, false),
      real26: bersih(seri.real26, true),
      proy: bersih(seri.proy, true),
      startIdx,
    };
  }

  function bacaGrandTotal(aoa) {
    let hdr = -1, peta = null;
    for (let r = 0; r < Math.min(aoa.length, 15); r++) {
      const p = {};
      (aoa[r] || []).forEach((sel, c) => {
        const i = indeksBulan(sel);
        if (i >= 0 && p[i] === undefined) p[i] = c;
      });
      if (Object.keys(p).length >= 6) { hdr = r; peta = p; break; }
    }
    if (!peta) return null;
    const baris = aoa.slice(hdr + 1).find((b) => (b || []).some((x) => /^grand total$/i.test(teks(x))));
    if (!baris) return null;
    const hasil = BULAN.map((_, i) => {
      const v = peta[i] === undefined ? null : angka(baris[peta[i]]);
      return v != null && v > 0 ? v / 1000 : null;
    });
    return hasil.some((x) => x != null) ? hasil : null;
  }

  function bacaRkap(aoa) {
    let idx = -1;
    for (let r = 0; r < Math.min(aoa.length, 6) && idx < 0; r++) {
      (aoa[r] || []).forEach((sel) => {
        const m = /s\.?\s*d\.?\s+([A-Za-z]+)\s+\d{4}/i.exec(teks(sel));
        if (m && idx < 0) idx = indeksBulan(m[1]);
      });
    }
    if (idx < 0) return null;
    const total = aoa.find((b) => (b || []).slice(0, 3).some((x) => /^total\s+pt/i.test(teks(x))));
    if (!total) return null;
    let cBi = -1, cSd = -1, rHdr = -1;
    for (let r = 0; r < Math.min(aoa.length, 10); r++) {
      (aoa[r] || []).forEach((sel, c) => {
        const t = teks(sel);
        if (/produksi\s+bulan\s+ini/i.test(t) && cBi < 0) { cBi = c; rHdr = r; }
        if (/produksi\s+s\.?\s*d\.?\s+bulan\s+ini/i.test(t) && cSd < 0) cSd = c;
      });
    }
    if (cBi < 0 || cSd < 0) return null;
    const kolom = (nama, dari) => {
      for (let r = rHdr + 1; r <= rHdr + 3; r++) {
        const b = aoa[r] || [];
        for (let c = dari; c < b.length; c++) if (teks(b[c]).toLowerCase() === nama) return c;
      }
      return -1;
    };
    const ambil = (nama, dari) => { const c = kolom(nama, dari); return c < 0 ? null : angka(total[c]); };
    const rkapBi = ambil("rkap", cBi), rkapSd = ambil("rkap", cSd);
    if (!(rkapBi > 0)) return null;
    return { idx, rkapBi: rkapBi / 1000, rkapSd: rkapSd > 0 ? rkapSd / 1000 : null };
  }

  /* ---------- Sheet "Grafik Dirut" (sumber utama grafik) ---------- */
  function cariJudulBulan(aoa, dariKolom, maksBaris) {
    for (let r = 0; r < Math.min(aoa.length, maksBaris); r++) {
      const p = {};
      (aoa[r] || []).forEach((sel, c) => {
        if (c <= dariKolom) return;
        const i = indeksBulan(sel);
        if (i >= 0 && p[i] === undefined) p[i] = c;
      });
      if (Object.keys(p).length >= 6) return { baris: r, peta: p };
    }
    return null;
  }

  function bacaLuasTm(aoa) {
    for (let r = 0; r < aoa.length; r++) {
      const b = aoa[r] || [];
      for (let c = 0; c < b.length; c++) {
        if (!/^luas\s*tm/i.test(teks(b[c]))) continue;
        const j = cariJudulBulan(aoa, c, 25);
        if (!j) continue;
        const hasil = {};
        for (let rr = r + 1; rr <= r + 6 && rr < aoa.length; rr++) {
          const bb = aoa[rr] || [];
          const th = angka(bb[c]);
          if (th === 2025 || th === 2026) {
            hasil[th] = BULAN.map((_, i) => {
              const v = j.peta[i] === undefined ? null : angka(bb[j.peta[i]]);
              return v > 0 ? v : null;
            });
          }
        }
        if (hasil[2025] || hasil[2026]) {
          return { l25: hasil[2025] || BULAN.map(() => null), l26: hasil[2026] || BULAN.map(() => null) };
        }
      }
    }
    return null;
  }

  // Baris 4-7: judul bulan, Real 2025, RKAP 2026, Real 2026 (angka sudah dalam Ribu Ton)
  function bacaGrafikDirut(aoa) {
    const j = cariJudulBulan(aoa, -1, 20);
    if (!j) throw new Error("judul bulan Grafik Dirut tidak ditemukan");
    const peta = j.peta;
    const kolomPertama = Math.min(...Object.values(peta));
    const seri = {};
    for (let r = j.baris + 1; r <= j.baris + 6 && r < aoa.length; r++) {
      const baris = aoa[r] || [];
      let jenis = null;
      for (let c = 0; c < kolomPertama && !jenis; c++) { if (teks(baris[c])) jenis = jenisBaris(teks(baris[c])); }
      if (!jenis) continue;
      const arr = BULAN.map((_, i) => (peta[i] === undefined ? null : angka(baris[peta[i]])));
      if (!seri[jenis]) seri[jenis] = arr;
      else if (jenis === "real26" && !seri.real26alt) seri.real26alt = arr;
    }
    if (!seri.rkap || !seri.real26) throw new Error("Baris RKAP / Real 2026 tidak lengkap di Grafik Dirut");
    return { real25: seri.real25 || BULAN.map(() => null), rkap: seri.rkap, real26: seri.real26, real26alt: seri.real26alt || null, luas: bacaLuasTm(aoa) };
  }

  // Bulan berjalan = bulan terakhir pada periode file ("Estimasi s.d Oktober 2026" / nama file "s_d_Oktober_2026")
  function bulanBerjalan(sheets, namaFile) {
    const dariSel = (n) => {
      const aoa = sheets[n] || [];
      for (let r = 0; r < Math.min(aoa.length, 8); r++) {
        for (const sel of aoa[r] || []) {
          const m = /(?:^|[^A-Za-z])s\.?\s*d\.?\s+([A-Za-z]+)\s+\d{4}/i.exec(teks(sel));
          if (m && indeksBulan(m[1]) >= 0) return indeksBulan(m[1]);
        }
      }
      return -1;
    };
    const nama = Object.keys(sheets);
    const utama = nama.filter((n) => /all region|source bulanan/i.test(n));
    for (const n of utama) { const i = dariSel(n); if (i >= 0) return i; }
    const m = /(?:^|[^A-Za-z])s[._\s]*d[._\s]+([A-Za-z]+)[._\s]+\d{4}/i.exec(String(namaFile || ""));
    if (m && indeksBulan(m[1]) >= 0) return indeksBulan(m[1]);
    for (const n of nama) { if (utama.indexOf(n) >= 0) continue; const i = dariSel(n); if (i >= 0) return i; }
    return -1;
  }

  function bacaDirut(sheets, namaSheet, namaFile) {
    const x = bacaGrafikDirut(sheets[namaSheet]);
    const jumlah = (a) => a.reduce((s, v) => s + (v || 0), 0);
    let saatIni = bulanBerjalan(sheets, namaFile);
    if (saatIni < 0 && x.real26alt) {            // cadangan: bulan terakhir yang sama di kedua skenario
      x.real26.forEach((v, i) => { if (v != null && x.real26alt[i] != null && Math.abs(v - x.real26alt[i]) < 1e-6) saatIni = i; });
    }
    if (saatIni < 0) x.real26.forEach((v, i) => { if (v > 0) saatIni = i; });
    if (saatIni < 0) throw new Error("bulan berjalan tidak dapat ditentukan");

    const real26 = x.real26.map((v, i) => (i <= saatIni && v > 0 ? v : null));   // setelah bulan berjalan = kosong
    const estimasi = jumlah(x.real26);
    const rkapTahun = jumlah(x.rkap);
    return {
      real25: x.real25,
      rkap: x.rkap,
      real26,
      proy: BULAN.map(() => null),
      startIdx: 3,
      saatIni,
      realSd: jumlah(real26),
      rkapSd: jumlah(x.rkap.slice(0, saatIni + 1)),
      estimasi,
      persenEstimasi: rkapTahun > 0 ? (estimasi / rkapTahun) * 100 : null,
      luas: x.luas,
    };
  }

  function bacaDariAoa(sheets, namaFile) {
    const nama = Object.keys(sheets);
    const namaDirut = nama.find((n) => /grafik\s*dirut/i.test(n));
    if (namaDirut) { try { return bacaDirut(sheets, namaDirut, namaFile); } catch (e) { /* lanjut ke cara lama */ } }
    let real26 = null, rkap = null;
    nama.forEach((n) => { if (!real26) real26 = bacaGrandTotal(sheets[n]); });
    nama.forEach((n) => { if (!rkap) rkap = bacaRkap(sheets[n]); });
    if (!real26) throw new Error('Baris "GRAND TOTAL" tidak ditemukan');

    const hasil = {
      real25: BULAN.map(() => null),
      rkap: BULAN.map(() => null),
      real26,
      proy: BULAN.map(() => null),
      startIdx: null,
      realSd: real26.reduce((a, x) => a + (x || 0), 0),
      rkapSd: null,
    };
    if (rkap) { hasil.rkap[rkap.idx] = rkap.rkapBi; hasil.rkapSd = rkap.rkapSd; }

    for (const n of nama) {
      try {
        const x = bacaSheet(sheets[n]);
        hasil.real25 = x.real25; hasil.rkap = x.rkap; hasil.real26 = x.real26;
        hasil.proy = x.proy; hasil.startIdx = x.startIdx;
        hasil.realSd = x.real26.reduce((a, v) => a + (v || 0), 0);
        hasil.rkapSd = null;
        break;
      } catch (e) {}
    }
    return hasil;
  }

  function bacaBuku(buku, namaFile) {
    const urut = buku.SheetNames.slice().sort((a, b) =>
      (/source bulanan|all region/i.test(b) ? 1 : 0) - (/source bulanan|all region/i.test(a) ? 1 : 0));
    const sheets = {};
    urut.forEach((n) => { sheets[n] = XLSX.utils.sheet_to_json(buku.Sheets[n], { header: 1, defval: null }); });
    return bacaDariAoa(sheets, namaFile);
  }

  if (typeof window === "undefined") { module.exports = { bacaSheet, bacaDariAoa, bacaGrafikDirut, bulanBerjalan, indeksBulan }; return; }

  const $ = (id) => document.getElementById(id);
  const fmt = (n, d) => n.toLocaleString("id-ID", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });

  let data = null;
  const charts = { "": null, "Mon": null }; // "" = halaman Grafik Laporan, "Mon" = halaman Monitoring Produksi
  try { data = JSON.parse(localStorage.getItem(KUNCI) || "null"); } catch (e) { data = null; }
  // Data contoh hanya muncul saat pertama kali dibuka; setelah pengguna menekan "Kosongkan", tetap kosong
  let sudahDikosongkan = false;
  try { sudahDikosongkan = localStorage.getItem(KUNCI_KOSONG) === "1"; } catch (e) {}
  if (!data && !sudahDikosongkan) {
    data = {
      real25: [113.040209, 98.601824, 97.755119, 128.609233, 145.978032, 157.970368, 174.512506, 166.167435, 194.913148, 219.894146, 244.160204, 215.953163],
      rkap:   [357.242382, 328.740385, 339.807481, 370.799721, 379.240435, 402.878558, 469.559125, 466.754683, 490.765669, 490.342916, 473.935385, 466.286546],
      real26: [217.011843, 189.041514, 178.079708, 244.290878, 251.23993, 302.806333, 338.15592, 409.297334, 340.507311, 300, null, null],
      proy:   [null, null, null, null, null, null, null, null, null, null, null, null],
      startIdx: 3,
      saatIni: 9,
      realSd: 2770.43,
      rkapSd: 4096.13,
      estimasi: 4030,
      persenEstimasi: 80.02,
      luas: {
        l25: [182941, 182941, 185758, 247242, 247242, 251738, 251179, 251179, 254255, 277314, 277283, 288179],
        l26: [444447.37, 444447.37, 444447.37, 444447.37, 444447.37, 444447.37, 444447.37, 480417, 480417, 480417, 480417, 480417]
      }
    };
  }

  function gelap() {
    const r = document.documentElement;
    return r.getAttribute("data-theme") === "dark" ||
      (!r.hasAttribute("data-theme") && matchMedia("(prefers-color-scheme: dark)").matches);
  }

  // Warna palet dirancang dinamis menyesuaikan tema terang/gelap agar tetap elegan & kontras sempurna
  function warna() {
    const g = gelap();
    return {
      teks: g ? "#e2e8f0" : "#334155",
      redam: g ? "#475569" : "#cbd5e1",
      grid: g ? "rgba(148, 163, 184, 0.14)" : "rgba(100, 116, 139, 0.12)",
      r25: g ? "#6ee7b7" : "#9fd3b0",
      rkap: g ? "#94a3b8" : "#b8c2cc",
      r26: g ? "#34a77a" : "#1b4d3e",
      proy: g ? "#38bdf8" : "#2a7f95",
      bandHijau: g ? "rgba(110, 231, 183, 0.07)" : "rgba(149, 201, 162, 0.16)",
      bandKuning: g ? "rgba(251, 191, 36, 0.09)" : "rgba(254, 240, 190, 0.60)",
      bandBiru: g ? "rgba(56, 189, 248, 0.08)" : "rgba(214, 233, 242, 0.65)",
      lblHijau: g ? "#6ee7b7" : "#2d6a4f",
      lblKuning: g ? "#fbbf24" : "#a16207",
      lblBiru: g ? "#7dd3fc" : "#1d4e6b",
      stripe: g ? "rgba(148, 163, 184, 0.10)" : "rgba(100, 116, 139, 0.08)",
      pil25Teks: g ? "#052e1b" : "#14532d",
      lencanaMerah: "#e5484d",
      lencanaHijau: "#1f9d7a",
      tipBg: "rgba(255, 255, 255, 0.98)",
      tipTeks: "#0f172a",
      tipBorder: "rgba(100, 116, 139, 0.28)",
    };
  }

  // Pola garis diagonal untuk batang proyeksi (membedakan dari realisasi)
  function polaProyeksi(warnaDasar, g) {
    const k = document.createElement("canvas");
    k.width = k.height = 10;
    const x = k.getContext("2d");
    x.fillStyle = warnaDasar;
    x.fillRect(0, 0, 10, 10);
    x.strokeStyle = g ? "rgba(15, 23, 42, 0.45)" : "rgba(255, 255, 255, 0.50)";
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(-2, 12); x.lineTo(12, -2);
    x.moveTo(-2, 2); x.lineTo(2, -2);
    x.moveTo(8, 12); x.lineTo(12, 8);
    x.stroke();
    return x.createPattern(k, "repeat") || warnaDasar;
  }

  function kotakBulat(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function turunan(d) {
    let saatIni = -1;
    d.real26.forEach((x, i) => { if (x != null) saatIni = i; });
    if (d.saatIni != null && d.saatIni >= 0 && d.saatIni <= 11) saatIni = d.saatIni;   // bulan berjalan dari file Excel
    const gabung = BULAN.map((_, i) => (d.real26[i] != null ? d.real26[i] : d.proy[i]));
    const bulanProy = BULAN.map((_, i) => d.real26[i] == null && d.proy[i] != null);
    return { saatIni, gabung, bulanProy };
  }

  function isiTeks(d, t, s) {
    let sub;
    if (d.estimasi > 0 && d.persenEstimasi > 0) {
      sub = `Estimasi 2026: <b>${fmt(d.estimasi / 1000, 2)} Juta Ton TBS</b> • <b class="${d.persenEstimasi >= 100 ? "apn-baik" : "apn-buruk"}">${fmt(d.persenEstimasi, 0)}% RKAP</b> • Satuan grafik: Ribu Ton`;
    } else {
      const persen = d.rkapSd > 0 ? (d.realSd / d.rkapSd) * 100 : 68.5;
      const bln = t.saatIni >= 0 ? BULAN[t.saatIni] : "Sep";
      sub = `Realisasi s.d. ${bln} 2026: <b>${fmt(d.realSd || 2470, 0)} Ribu Ton</b> • <b class="apn-buruk">${fmt(persen, 1)}% RKAP s.d. ${bln}</b> • Satuan grafik: Ribu Ton`;
    }
    $("apnSub" + s).innerHTML = sub;
  }

  function isiCatatan(d, t, s) {
    const hilang = [];
    if (!d.real25.some((x) => x != null)) hilang.push("Real 2025");
    if (!$("apnCatatan" + s)) return;
    $("apnCatatan" + s).hidden = !hilang.length;
    $("apnCatatan" + s).textContent = hilang.length ? "Belum tersedia di file Excel: " + hilang.join("; ") + "." : "";
  }

  function isiLegenda(d, t, s) {
    const c = warna();
    const item = (w, n, pola) => `<span class="apn-lg"><i style="background:${w}"${pola ? ' class="apn-pola"' : ""}></i>${n}</span>`;
    $("apnLegenda" + s).innerHTML =
      item(c.r25, "Real 2025") +
      item(c.rkap, "RKAP 2026") +
      item(c.r26, "Real 2026") +
      item(c.proy, "Proyeksi 2026");
  }

  function buatPlugin(d, t, c, fontFamily) {
    return {
      id: "historisProyeksi",
      beforeDatasetsDraw(ch) {
        const { ctx, scales } = ch;
        const lebar = scales.x.width / BULAN.length;
        // Start Point = Apr (atau dari file); Saat Ini = bulan berjalan; Proyeksi = bulan sesudahnya sampai Des
        const mulai = d.startIdx != null ? d.startIdx : 3;
        const pita = [];
        if (mulai >= 0 && mulai < t.saatIni) pita.push({ dari: mulai, ke: mulai, isi: c.bandHijau, lbl: c.lblHijau, nama: "Start Point" });
        if (t.saatIni >= 0) pita.push({ dari: t.saatIni, ke: t.saatIni, isi: c.bandKuning, lbl: c.lblKuning, nama: "Saat Ini" });
        if (t.saatIni < 11) pita.push({ dari: t.saatIni + 1, ke: 11, isi: c.bandBiru, lbl: c.lblBiru, nama: "Proyeksi" });
        ctx.save();
        pita.forEach((p) => {
          const x1 = scales.x.getPixelForValue(p.dari) - lebar / 2 + 3;
          const x2 = scales.x.getPixelForValue(p.ke) + lebar / 2 - 3;
          const y1 = 4, tinggi = scales.x.bottom + 6 - y1;   // sampai menutupi label bulan
          ctx.fillStyle = p.isi;
          kotakBulat(ctx, x1, y1, x2 - x1, tinggi, 10);
          ctx.fill();
          ctx.fillStyle = p.lbl;
          ctx.font = "700 11px " + fontFamily;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(p.nama, (x1 + x2) / 2, 20);
        });
        ctx.restore();
      },
      afterDatasetsDraw(ch) {
        const { ctx, scales } = ch;
        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        const g = gelap();
        const puncak = BULAN.map(() => Infinity);

        ch.data.datasets.forEach((ds, di) => {
          ch.getDatasetMeta(di).data.forEach((bar, i) => {
            const v = ds.data[i];
            if (v == null) return;
            // Warna teks angka sangat kontras dan tajam pada mode terang maupun gelap
            ctx.fillStyle = di === 0 ? (g ? "#a3cef1" : "#1d3557") : (di === 1 ? (g ? "#e2e8f0" : "#334155") : (i > t.saatIni ? (g ? "#90e0ef" : "#1f4e5b") : (g ? "#b7e4c7" : "#11382b")));
            ctx.font = "700 10.5px " + fontFamily;
            ctx.fillText(fmt(v, 0), bar.x, bar.y - 5);
            if (di === 2 || di === 1) puncak[i] = Math.min(puncak[i], bar.y);
          });
        });

        const rkapDefault = [357, 329, 340, 371, 379, 403, 470, 467, 491, 490, 474, 466];
        t.gabung.forEach((v, i) => {
          if (v == null) return;
          const target = (d.rkap && d.rkap[i] > 0) ? d.rkap[i] : rkapDefault[i];
          const persen = Math.round((v / target) * 100);
          const label = persen + "%";
          ctx.font = "700 11.5px " + fontFamily;
          const w = Math.max(44, ctx.measureText(label).width + 16), h = 22;
          const x = scales.x.getPixelForValue(i) - w / 2;
          const y = (puncak[i] < Infinity ? puncak[i] : scales.y.getPixelForValue(v)) - 18 - 6 - h;
          ctx.fillStyle = persen >= 100 ? c.lencanaHijau : c.lencanaMerah;
          ctx.shadowColor = "rgba(0, 0, 0, 0.18)";
          ctx.shadowBlur = 6;
          ctx.shadowOffsetY = 2;
          kotakBulat(ctx, x, y, w, h, 11);
          ctx.fill();
          ctx.shadowColor = "transparent";
          ctx.beginPath();
          ctx.moveTo(x + w / 2 - 4, y + h - 0.5);
          ctx.lineTo(x + w / 2 + 4, y + h - 0.5);
          ctx.lineTo(x + w / 2, y + h + 4);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = "#ffffff";
          ctx.textBaseline = "middle";
          ctx.fillText(label, x + w / 2, y + h / 2 + 1);
          ctx.textBaseline = "alphabetic";
        });
        // Tabel Luas TM (Ha) di bawah sumbu bulan
        if (d.luas && TAMPILKAN_LUAS_TM) {
          const atas = scales.x.bottom + 14;
          ctx.textBaseline = "middle";
          ctx.textAlign = "left";
          ctx.fillStyle = c.teks;
          ctx.font = "700 12px " + fontFamily;
          ctx.fillText("Luas TM (Ha)", 6, atas + 8);
          [
            { th: "2025", v: d.luas.l25, pil: c.r25, tp: c.pil25Teks },
            { th: "2026", v: d.luas.l26, pil: c.r26, tp: "#ffffff" },
          ].forEach((b, k) => {
            const h = 26, y = atas + 24 + k * 32;
            ctx.fillStyle = c.stripe;
            kotakBulat(ctx, 4, y, ch.width - 8, h, 5);
            ctx.fill();
            ctx.fillStyle = b.pil;
            kotakBulat(ctx, 4, y, 62, h, 5);
            ctx.fill();
            ctx.fillStyle = b.tp;
            ctx.textAlign = "center";
            ctx.font = "700 14px " + fontFamily;
            ctx.fillText(b.th, 35, y + h / 2 + 1);
            ctx.fillStyle = c.teks;
            ctx.font = "600 12px " + fontFamily;
            b.v.forEach((x, i) => { if (x != null) ctx.fillText(fmt(x, 0), scales.x.getPixelForValue(i), y + h / 2 + 1); });
          });
        }
        ctx.restore();
      },
    };
  }

  // Menggambar grafik ke salah satu tujuan. s = akhiran id elemen ("" atau "Mon"), idHalaman = id halaman pemiliknya
  function renderKe(s, idHalaman) {
    const halaman = $(idHalaman);
    if (!halaman || halaman.hidden || !$("chHistoris" + s)) return;

    charts[s]?.destroy();
    charts[s] = null;

    // Data dikosongkan / belum ada: tampilkan keadaan kosong, jangan isi ulang dengan data contoh
    if (!data) {
      if ($("apnKosong" + s)) $("apnKosong" + s).hidden = false;
      if ($("apnIsi" + s)) $("apnIsi" + s).hidden = true;
      return;
    }

    if ($("apnKosong" + s)) $("apnKosong" + s).hidden = true;
    if ($("apnIsi" + s)) $("apnIsi" + s).hidden = false;

    if (typeof Chart === "undefined") return;

    const t = turunan(data);
    const c = warna();
    const fontFamily = getComputedStyle(document.body).fontFamily || "sans-serif";
    isiTeks(data, t, s);
    isiCatatan(data, t, s);
    isiLegenda(data, t, s);

    const pProy = c.proy;
    const nilaiMax = Math.max(...(data.rkap || [0]), ...t.gabung, ...(data.real25 || [0]));
    charts[s] = new Chart($("chHistoris" + s), {
      type: "bar",
      plugins: [buatPlugin(data, t, c, fontFamily)],
      data: {
        labels: BULAN,
        datasets: [
          { label: "Real 2025", data: data.real25, backgroundColor: c.r25 },
          { label: "RKAP 2026", data: data.rkap, backgroundColor: c.rkap },
          { label: "2026", data: t.gabung, backgroundColor: t.gabung.map((_, i) => (i > t.saatIni ? pProy : c.r26)) },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 600, easing: "easeOutQuart" },
        layout: { padding: { top: 58, left: (data.luas && TAMPILKAN_LUAS_TM) ? 72 : 6, right: 6, bottom: (data.luas && TAMPILKAN_LUAS_TM) ? 118 : 12 } },
        datasets: { bar: { borderRadius: { topLeft: 5, topRight: 5 }, borderSkipped: false, categoryPercentage: 0.86, barPercentage: 0.94 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: c.tipBg,
            titleColor: c.tipTeks,
            bodyColor: c.tipTeks,
            borderColor: c.tipBorder,
            borderWidth: 1,
            padding: 12,
            cornerRadius: 10,
            boxPadding: 5,
            usePointStyle: true,
            titleFont: { family: fontFamily, size: 13, weight: "700" },
            bodyFont: { family: fontFamily, size: 12.5 },
            callbacks: {
              labelColor: (it) => ({ borderColor: "transparent", backgroundColor: it.dataIndex > t.saatIni && it.datasetIndex === 2 ? c.proy : it.dataset.backgroundColor instanceof Array ? c.r26 : it.dataset.backgroundColor, borderRadius: 3 }),
              title: (it) => it[0].label + " 2026",
              label: (it) => `${it.datasetIndex === 2 ? (it.dataIndex > t.saatIni ? "Proyeksi 2026" : "Real 2026") : it.dataset.label}: ${fmt(it.parsed.y, 1)} ribu ton`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { color: c.redam },
            ticks: { color: c.teks, padding: 8, font: { size: 13, weight: "600", family: fontFamily } },
          },
          y: { beginAtZero: true, max: nilaiMax * 1.40, border: { display: false }, ticks: { display: false }, grid: { color: c.grid, drawTicks: false } },
        },
      },
    });
  }

  // Gambar ulang di kedua halaman (Grafik Laporan & Monitoring Produksi); yang sedang tersembunyi dilewati otomatis
  function render() {
    renderKe("", "halamanGrafikHistoris");
    renderKe("Mon", "halamanMonitoring");
  }

  const halaman = $("halamanGrafikHistoris");
  if (halaman) {
    new MutationObserver(render).observe(halaman, { attributes: true, attributeFilter: ["hidden"] });
  }
  const halamanMon = $("halamanMonitoring");
  if (halamanMon) {
    new MutationObserver(render).observe(halamanMon, { attributes: true, attributeFilter: ["hidden"] });
  }
  new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", render);

  const input = $("fileExcelHistoris");
  if (input) {
    input.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      const pesan = $("msgHistoris");
      if (!file) return;
      pesan.textContent = "Membaca file Historis & Proyeksi…";
      try {
        const buku = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const hasil = bacaBuku(buku, file.name);
        data = hasil;
        try { localStorage.setItem(KUNCI, JSON.stringify(hasil)); localStorage.removeItem(KUNCI_KOSONG); } catch (err) {}
        pesan.textContent = `✓ Historis & Proyeksi diperbarui: ${file.name}`;
        render();
      } catch (err) {
        pesan.textContent = "Gagal membaca file: " + err.message;
      }
      e.target.value = "";
    });
  }

  const tombolKosong = $("rsHistoris");
  if (tombolKosong) {
    tombolKosong.addEventListener("click", () => {
      try { localStorage.removeItem(KUNCI); localStorage.setItem(KUNCI_KOSONG, "1"); } catch (err) {}
      data = null;
      render();
      const pesan = $("msgHistoris");
      if (pesan) pesan.textContent = "Data Historis & Proyeksi berhasil dikosongkan.";
    });
  }

  ["apnBukaPerbarui", "apnBukaPerbaruiMon"].forEach((idTombol) => {
    const tombolBuka = $(idTombol);
    if (tombolBuka) {
      tombolBuka.addEventListener("click", () => {
        const m = document.querySelector('.sub-link[data-target="perbaruiHistoris"]');
        if (m) m.click();
      });
    }
  });

  render();
})();