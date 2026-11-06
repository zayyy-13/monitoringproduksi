/* =====================================================================
   Dashboard Produksi TBS per Regional 2026
   ===================================================================== */

/* Tooltip semua grafik: selalu putih (mode terang maupun gelap). Hanya gaya, bukan logika. */
(function () {
  if (typeof Chart === "undefined") return;
  const gelap = () => {
    const r = document.documentElement, t = r.getAttribute("data-theme");
    return t ? t === "dark" : !!(window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);
  };
  const tip = Chart.defaults.plugins.tooltip;
  tip.backgroundColor = "rgba(255, 255, 255, 0.98)";
  tip.titleColor = "#0f172a";
  tip.bodyColor = "#1e293b";
  tip.footerColor = "#475569";
  tip.borderColor = "rgba(100, 116, 139, 0.28)";
  tip.borderWidth = 1;
  tip.padding = 10;
  tip.cornerRadius = 10;
  tip.boxPadding = 4;
})();

const ExcelLoader = (() => {
  const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const ROMAWI = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
  const TAB = ["Produksi TBS", "KG Panen", "Janjang TBS", "Jumlah HK Kerja", "Luas Panen",
               "Restan", "BJR", "Janjang Per Pokok", "Output Panen", "Brondolan"];
  const ENTITAS = [["Total", "GRAND TOTAL"], ...ROMAWI.map((r) => ["Regional " + r, "Subtotal CRO " + r])];

  const teks = (v) => String(v ?? "").trim();
  const angka = (v) => (typeof v === "number" && isFinite(v) ? v : 0);
  const jumlah = (a) => a.reduce((x, y) => x + y, 0);
  const bulat = (x, d = 2) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);

  function kolomBulan(aoa, akhiran = "") {
    for (const baris of aoa.slice(0, 10)) {
      const peta = {};
      baris.forEach((sel, i) => {
        const label = teks(sel);
        BULAN.forEach((b) => { if (label === b + akhiran) peta[b] = i; });
      });
      if (peta.Jan !== undefined) return peta;
    }
    throw new Error("Judul bulan (Jan, Feb, ...) tidak ditemukan");
  }

  function barisBernama(aoa, label) {
    const baris = aoa.find((b) => teks(b[1]) === label);
    if (!baris) throw new Error(`Baris "${label}" tidak ditemukan`);
    return baris;
  }

  function seri(aoa, label, n, akhiran = "") {
    const peta = kolomBulan(aoa, akhiran);
    const baris = barisBernama(aoa, label);
    return BULAN.slice(0, n).map((b) => angka(baris[peta[b]]));
  }

  function hitungBulan(aoa) {
    const peta = kolomBulan(aoa);
    const total = barisBernama(aoa, "GRAND TOTAL");
    let n = 0;
    BULAN.forEach((b, i) => { 
      if (peta[b] !== undefined && angka(total[peta[b]]) > 0) n = i + 1; 
    });
    return n;
  }

  function bacaWilayah(aoa, n) {
    const peta = kolomBulan(aoa);
    return aoa
      .filter((b) => /^CRO [IVX]+$/.test(teks(b[1])) && teks(b[2]))
      .map((b) => [teks(b[1]), teks(b[2]), angka(b[3]), angka(b[4]),
                   BULAN.slice(0, n).map((m) => bulat(angka(b[peta[m]]), 3))]);
  }

  function bacaIndikator(tab, n) {
    const m = n;
    const hasil = {};
    ENTITAS.forEach(([kunci, label]) => {
      const ambil = (nama, akhiran) => seri(tab[nama], label, m, akhiran);
      const kg = ambil("KG Panen"), jj = ambil("Janjang TBS"), hk = ambil("Jumlah HK Kerja");
      const lp = ambil("Luas Panen"), rs = ambil("Restan"), prod = ambil("Produksi TBS");
      const bjr = ambil("BJR"), jp = ambil("Janjang Per Pokok");
      const outKg = ambil("Output Panen", " Kg/HK"), outHa = ambil("Output Panen", " Ha/HK");
      const brKg = ambil("Brondolan", " (Kg)"), brPct = ambil("Brondolan", " (%)").map((x) => x * 100);
      const restan = rs.map((x, i) => (prod[i] ? (x / prod[i]) * 100 : 0));
      const kosong = rs.every((x) => Math.abs(x) < 1e-9);
      hasil[kunci] = {
        bulanan: [bjr, outKg, outHa, jp, kosong ? rs.map(() => null) : restan, brPct]
          .map((s) => s.map((x) => bulat(x))),
        akumulasi: [
          (jumlah(kg) * 1000) / jumlah(jj),
          (jumlah(kg) * 1000) / jumlah(hk),
          jumlah(lp) / jumlah(hk),
          jumlah(jp),
          kosong ? 0 : (jumlah(rs) / jumlah(prod)) * 100,
          jumlah(brKg) / (jumlah(prod) * 1000) * 100,
        ].map((x) => bulat(x)),
      };
    });
    return hasil;
  }

  // Produktivitas (Ton/Ha) per bulan dari sheet "Produktivitas":
  // baris 38 = GRAND TOTAL; baris CRO I..X = 8, 10, 13, 15, 20, 24, 29, 32, 34, 37 (Subtotal CRO).
  // Baris dicari lewat labelnya dulu; bila tidak ketemu, dipakai nomor barisnya.
  // Bulan yang belum ada / kosong / 0 diisi null sehingga tidak tampil di grafik.
  const BARIS_PROTAS = { "Total": 38, "CRO I": 8, "CRO II": 10, "CRO III": 13, "CRO IV": 15, "CRO V": 20,
                         "CRO VI": 24, "CRO VII": 29, "CRO VIII": 32, "CRO IX": 34, "CRO X": 37 };

  function bacaProtas(aoa) {
    const peta = kolomBulan(aoa);
    const hasil = {};
    Object.entries(BARIS_PROTAS).forEach(([kunci, nomorBaris]) => {
      const label = kunci === "Total" ? "GRAND TOTAL" : "Subtotal " + kunci;
      const baris = aoa.find((b) => teks(b[1]) === label) || aoa[nomorBaris - 1] || [];
      hasil[kunci] = BULAN.map((b) => {
        const v = peta[b] === undefined ? null : baris[peta[b]];
        return typeof v === "number" && isFinite(v) && v !== 0 ? bulat(v, 4) : null;
      });
    });
    return hasil;
  }

  function baca(tab) {
    TAB.forEach((nama) => { if (!tab[nama]) throw new Error(`Tab "${nama}" tidak ditemukan`); });
    const n = hitungBulan(tab["Produksi TBS"]);
    if (n < 2) throw new Error("Data bulanan belum cukup");
    const hasil = { wilayah: bacaWilayah(tab["Produksi TBS"], n), indikator: bacaIndikator(tab, n) };
    // Sheet "Produktivitas" bersifat opsional: bila tidak ada / gagal dibaca, garis Ton/Ha tidak ditampilkan
    if (tab["Produktivitas"]) {
      try { hasil.protasBulanan = bacaProtas(tab["Produktivitas"]); } catch (e) {}
    }
    return hasil;
  }

  return { baca, TAB };
})();

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const KUNCI_MONITORING = "tbs_data_monitoring_v2";
const KUNCI_LAPORAN = "tbs_data_laporan_resmi_v1";

const DATA_AWAL = [
  ["CRO I","Aceh",1257.17,1257.17,[60.052,127.746,122.654,216.585,246.013,265.124,280.788,203.418,204.112,10.113]],
  ["CRO I","Sumut 1",6498.24,8123.84,[2362.065,2278.931,2194.859,2820.512,1713.106,1898.733,1063.146,1987.877,1968.891,230.989]],
  ["CRO I","Sumut 2",46677.7,45293.53,[14079.358,11989.058,10662.779,13363.095,12268.817,21071.513,26483.829,31380.577,27934.834,2407.906]],
  ["CRO II","Riau 1",66610.43,68574,[87121.55,73838.39,67726.24,97152.12,101515.58,115552.96,130000.949,120028.25,122420.777,10490.63]],
  ["CRO III","Riau 2",39754.42,37737.82,[14924.213,14132.234,12967.917,17890.024,16516.107,20104.817,22799.909,100787.025,28482.428,2568.432]],
  ["CRO III","Riau 3",13187.62,18533.36,[5914.623,5136.226,4160.518,6097.055,6056.944,7209.823,7813.307,8218.725,8515.277,822.824]],
  ["CRO IV","Riau 4",38121.47,56620.64,[1152.52,1485.11,2415.342,2810.32,2890.68,8637.37,25002.893,26108.723,17894.848,1626.034]],
  ["CRO V","Babel",568.47,617.44,[315.028,301.322,293.84,418.223,504.357,579.343,831.99,544.027,572.45,61.566]],
  ["CRO V","Jambi",565.59,1985.51,[208.35,261.83,193.375,172.526,289.1,231.12,198.77,428.938,504.575,59.417]],
  ["CRO V","Sumbar",2741.65,5534.61,[1904.404,2252.707,2365.703,2712.706,2954.246,3672.191,3647.429,2729.285,2495.135,165.965]],
  ["CRO V","Sumsel",8712.9,8610.32,[2846.896,1616.918,1340.966,1350.547,1153.948,1567.217,1291.007,1475.754,1282.459,224.313]],
  ["CRO VI","Kalbar 1A",39838.88,40541.88,[19928.7,16873.07,13410.26,20436.01,24215.54,28580.973,29643.419,28029.592,30635.261,2579.064]],
  ["CRO VI","Kalbar 1B",38117.11,39342.91,[15498.7,14690.07,11602.25,18207.13,18688.459,21539.524,22349.064,22367.405,23581.156,2087.86]],
  ["CRO VI","Kalbar 2",12993.09,6893.56,[12.26,28.103,653.839,915.075,1357.563,1912.087,1369.294,867.012,1289.244,107.411]],
  ["CRO VII","Kalsel 1",4772.06,7141.55,[5279.382,4032.55,3281.62,3692.283,3285.235,2465.097,3180.644,3059.531,3640.834,308.11]],
  ["CRO VII","Kalsel 2",2850.38,9864.23,[272.822,317.243,391.971,1525.572,1305.692,1598.371,1873.037,1892.669,2335.937,231.893]],
  ["CRO VII","Kaltara",1145.28,579.09,[104.77,58.93,34.435,93.179,94.862,127.922,152.961,94.02,97.73,8.04]],
  ["CRO VII","Kaltim",3562.21,3562.21,[3058.851,2623.661,2500.554,2358.502,2863.636,2754.605,3996.132,3837.189,3972.595,427.729]],
  ["CRO VIII","Kalteng 1",63248.25,70924.93,[21904.162,20837.89,25537.528,32888.74,33852.45,39009.42,34278.374,35519.719,40674.674,2416.463]],
  ["CRO VIII","Kalteng 3",30467.52,27370.11,[2638.03,2249.043,2129.89,2875.76,2766.205,3372.248,2937.106,2718.645,3688.624,363.462]],
  ["CRO IX","Kalteng 2",17408.64,16264.69,[16838.232,13272.864,13756.798,15970.571,16323.984,19582.81,17897.224,16035.822,20227.488,896.238]],
  ["CRO X","Sulteng",2116.83,2742.61,[505.802,397.404,195.871,75.18,130.352,504.598,549.589,570.208,606.871,67.089]],
  ["CRO X","Sultra",3231.46,2300.92,[81.073,240.214,140.499,249.163,247.054,568.467,515.059,412.923,354.437,7.824]],
];

const INDIKATOR = [
  { nama: "BJR",           satuan: "kg/janjang",                    desimal: 1, arah:  1 },
  { nama: "Output Panen",  satuan: "kg/HK",                         desimal: 0, arah:  1 },
  { nama: "Prestasi Panen", satuan: "Ha/HK",                        desimal: 2, arah:  1 },
  { nama: "Janjang/Pokok", satuan: "per bulan · nilai besar = jumlah", desimal: 2, arah:  1 },
  { nama: "Restan",        satuan: "% thd kirim PKS",               desimal: 1, arah: -1 },
  { nama: "Brondolan",     satuan: "% dari TBS",                    desimal: 2, arah:  1 },
];

const DATA_INDIKATOR_AWAL = {
  "Total": {
    bulanan: [
      [12.02, 12.21, 12.57, 12.46, 12.58, 12.94, 12.26, 13.42, 12.41],
      [1258.71, 1222.22, 1183.39, 1282.45, 1362.75, 1458.25, 1428.34, 1333.94, 1288.11],
      [3.17, 3.58, 3.71, 3.48, 3.6, 3.63, 3.59, 3.17, 3.38],
      [0.38, 0.32, 0.29, 0.41, 0.42, 0.49, 0.57, 0.63, 0.58],
      [43.95, 25.31, 18.52, 29.35, 34.59, 29.09, 36.31, 18.33, 31.13],
      [2.54, 2.24, 2.47, 2.41, 2.21, 2.22, 1.96, 1.6, 2.16],
    ],
    akumulasi: [12.64, 1322.35, 3.46, 4.09, 29.42, 2.14],
  },
  "Regional I": {
    bulanan: [
      [10.36, 10.36, 10.76, 11.01, 11.78, 13.77, 13.31, 13.24, 12.89],
      [1037.38, 899.68, 840.06, 915.2, 849.56, 1104.46, 1340.07, 1373.32, 1177.04],
      [4.6, 4.63, 4.9, 4.99, 5.28, 5.08, 4.5, 3.98, 4.09],
      [0.23, 0.2, 0.18, 0.22, 0.18, 0.25, 0.31, 0.37, 0.34],
      [56.41, 48.12, 25.78, 20.8, 41.32, 39.08, 59.69, 33.79, 35.56],
      [0.69, 0.63, 1.49, 2.23, 2.01, 1.31, 1.55, 0.74, 0.92],
    ],
    akumulasi: [12.45, 1086.02, 4.63, 2.28, 40.48, 1.22],
  },
  "Regional II": {
    bulanan: [
      [11.26, 11.23, 11.02, 11.63, 11.77, 11.74, 11.5, 12.08, 11.75],
      [1568.58, 1429.85, 1322.99, 1494.84, 1615.34, 1781.48, 1715.39, 1606.18, 1474.74],
      [4.39, 4.94, 4.94, 4.2, 4.47, 4.45, 4.41, 4.07, 4.02],
      [0.85, 0.72, 0.67, 0.91, 0.94, 1.08, 1.24, 1.09, 1.14],
      [31.67, 5.43, 6.15, 26.47, 34.4, 32.92, 44.79, 28.16, 34.19],
      [4.42, 4.08, 3.96, 3.77, 3.32, 3.03, 2.54, 2.01, 1.72],
    ],
    akumulasi: [11.61, 1565.39, 4.39, 8.64, 29.31, 3.05],
  },
  "Regional III": {
    bulanan: [
      [13, 13.74, 14.24, 13.92, 14.15, 14.32, 13.77, 15.99, 14.74],
      [1035.58, 917.35, 957.37, 1021.89, 980.64, 1042.64, 1020.54, 1150.31, 1101.75],
      [2.46, 2.5, 2.4, 2.68, 2.88, 2.77, 2.75, 2.41, 3.04],
      [0.29, 0.25, 0.22, 0.31, 0.29, 0.34, 0.4, 1.23, 0.45],
      [12.74, 7.32, 6.09, 3.57, 2.07, 1.22, 0.41, 0.04, 0.12],
      [0.05, 0.01, 2.68, 0, 0.1, 1.34, 0.91, 0.21, 0.68],
    ],
    akumulasi: [14.63, 1060.82, 2.62, 3.78, 2.27, 0.53],
  },
  "Regional IV": {
    bulanan: [
      [10.7, 9.4, 10.07, 9.96, 10.56, 10.52, 11.28, 13.22, 12.32],
      [614.66, 542.63, 549, 503.25, 490.26, 616.66, 1301.06, 1191.19, 746.17],
      [5.95, 6.33, 6.42, 6.41, 6.56, 6.39, 5.96, 5.62, 5.47],
      [0.02, 0.03, 0.05, 0.06, 0.06, 0.17, 0.45, 0.4, 0.3],
      [1.28, 5.95, 37.53, 106.55, 79.44, 33.37, 16.19, 14.67, 16.66],
      [2.98, 2.6, 4.44, 2.73, 2.38, 1.44, 0.24, 0, 0.31],
    ],
    akumulasi: [12.04, 892.15, 5.91, 1.53, 22.67, 0.64],
  },
  "Regional V": {
    bulanan: [
      [15.6, 14.73, 14.41, 14.5, 14.26, 14.42, 14.57, 13.74, 13.31],
      [561.29, 1080.36, 983.7, 947.41, 1168.06, 1426.22, 1221.99, 1019.31, 932.78],
      [1.02, 2.36, 2.48, 2.18, 2.69, 3.08, 2.52, 2.45, 2.46],
      [0.25, 0.22, 0.22, 0.24, 0.25, 0.31, 0.3, 0.28, 0.27],
      [42.51, 64.13, 80, 48.66, 43.81, 51.8, 71.09, 57.83, 41.3],
      [6.22, 4.49, 5.05, 3.79, 2.93, 3.96, 3.1, 2.57, 3.18],
    ],
    akumulasi: [14.47, 982.3, 2.21, 2.35, 55.44, 3.89],
  },
  "Regional VI": {
    bulanan: [
      [11.07, 11.08, 11.2, 11.16, 11.25, 12.11, 11.3, 11.65, 11.79],
      [1459.59, 1365.2, 1271.25, 1428.01, 1670.15, 1648.41, 1397.62, 1398.8, 1424.96],
      [2.35, 2.59, 2.76, 2.54, 2.82, 2.92, 2.9, 2.79, 2.61],
      [0.3, 0.27, 0.22, 0.33, 0.37, 0.41, 0.45, 0.42, 0.44],
      [144.4, 95.65, 62.83, 77.9, 79.92, 52.45, 67.95, 39.81, 82.74],
      [0, 0, 0.08, 0.07, 0.04, 0.01, 0.01, 1.47, 1.9],
    ],
    akumulasi: [11.52, 1454.54, 2.71, 3.21, 75.54, 0.49],
  },
  "Regional VII": {
    bulanan: [
      [9.94, 13.99, 14.17, 13.51, 12.48, 11.62, 12.5, 12.38, 11.48],
      [869.34, 1171.24, 1107.92, 1153.33, 1168.04, 1155.33, 1218.15, 1139.35, 1148.84],
      [2.39, 2.4, 2.82, 2.73, 2.43, 2.17, 2.28, 2.52, 2.51],
      [0.52, 0.3, 0.26, 0.34, 0.36, 0.36, 0.44, 0.43, 0.52],
      [3.62, 15.38, 36.49, 32.58, 49.43, 73.19, 17.66, 26.85, 30.53],
      [0.02, 0.1, 0.11, 0.43, 0.35, 0.47, 1.46, 4.01, 6.67],
    ],
    akumulasi: [12.21, 1113.93, 2.47, 3.52, 30.52, 1.76],
  },
  "Regional VIII": {
    bulanan: [
      [16.25, 16.48, 18.97, 15.54, 15.51, 16, 13.81, 14.94, 13],
      [1322.85, 1395.31, 1461.91, 1459.98, 1538.92, 1691.86, 1431.1, 1351.64, 1256.82],
      [2.27, 2.39, 2.48, 2.79, 2.34, 2.18, 2.13, 1.94, 2.05],
      [0.26, 0.24, 0.25, 0.39, 0.41, 0.45, 0.46, 0.44, 0.59],
      [8.49, 4.9, 6.34, 8.48, 5.41, 4.7, 3.55, 0, 0],
      [0.86, 1.04, 1.14, 1.59, 1.07, 1.77, 2.3, 2.74, 2.81],
    ],
    akumulasi: [15.26, 1428.46, 2.26, 3.49, 4.29, 1.81],
  },
  "Regional IX": {
    bulanan: [
      [15.92, 15.4, 15.76, 15.9, 16.2, 17.32, 15.81, 14.44, 13.28],
      [1038.16, 1031.21, 1123.79, 1136.82, 1175.83, 1384.14, 1329.07, 1312.48, 1717.4],
      [2.14, 2.26, 2.3, 2.15, 1.93, 1.71, 2.08, 1.91, 1.64],
      [0.55, 0.45, 0.46, 0.53, 0.53, 0.59, 0.59, 0.58, 0.8],
      [null, null, null, null, null, null, null, null, null],
      [5.55, 4.55, 2.86, 6.12, 7.51, 6.79, 7.46, 8.26, 7.8],
    ],
    akumulasi: [15.45, 1240.19, 2.02, 5.09, 0, 6.47],
  },
  "Regional X": {
    bulanan: [
      [19.7, 16.81, 16.96, 14.69, 15.54, 17.45, 17.03, 15.24, 14.18],
      [1869.03, 1177.7, 1234.31, 940.12, 1250.51, 1538.55, 1288.08, 1213.74, 1283.46],
      [3.09, 2.14, 2.38, 2.09, 2.63, 2.15, 2.32, 2.69, 3.55],
      [0.11, 0.14, 0.07, 0.08, 0.09, 0.22, 0.23, 0.24, 0.25],
      [0, 21.3, 5.9, 28.77, 29.48, 23.14, 28.98, 23.26, 32.07],
      [5.06, 4.41, 3.4, 1.73, 2.61, 6.26, 3.03, 3.04, 3.73],
    ],
    akumulasi: [16.26, 1306.31, 2.58, 1.42, 22.92, 3.94],
  },
};
let dataIndikator = DATA_INDIKATOR_AWAL;

// Produktivitas bulanan (Ton/Ha) bawaan dari sheet "Produktivitas" (Jan–Sep). Diganti otomatis saat Excel diunggah.
const DATA_PROTAS_AWAL = {
  "Total": [0.4883, 0.4253, 0.4007, 0.5497, 0.5653, 0.6813, 0.7608, 0.9209, 0.7661],
  "CRO I": [0.3032, 0.2645, 0.2385, 0.3013, 0.2614, 0.4269, 0.5112, 0.6168, 0.5531],
  "CRO II": [1.3079, 1.1085, 1.0168, 1.4585, 1.524, 1.7348, 1.9517, 1.8019, 1.8377],
  "CRO III": [0.3936, 0.364, 0.3235, 0.4531, 0.4264, 0.5159, 0.5782, 2.059, 0.6477],
  "CRO IV": [0.0302, 0.039, 0.0634, 0.0737, 0.0758, 0.2266, 0.6559, 0.6849, 0.4694],
  "CRO V": [0.419, 0.3521, 0.3331, 0.3697, 0.3894, 0.4806, 0.4742, 0.4113, 0.3933],
  "CRO VI": [0.3897, 0.3474, 0.2822, 0.4349, 0.4867, 0.5721, 0.5867, 0.5637, 0.609],
  "CRO VII": [0.7069, 0.5704, 0.5035, 0.622, 0.6123, 0.5633, 0.7464, 0.7205, 0.8148],
  "CRO VIII": [0.2619, 0.2464, 0.2952, 0.3816, 0.3907, 0.4522, 0.3971, 0.408, 0.4707],
  "CRO IX": [0.9672, 0.7624, 0.7902, 0.9174, 0.9377, 1.1249, 1.0281, 0.9211, 1.168],
  "CRO X": [0.1097, 0.1192, 0.0629, 0.0606, 0.0706, 0.2006, 0.1991, 0.1838, 0.1809],
};
let protasAktif = DATA_PROTAS_AWAL;

const el = (id) => document.getElementById(id);
const jumlahArr = (arr) => arr.reduce((a, b) => a + b, 0);

const fmt = (n, desimal = 0) =>
  n == null
    ? "–"
    : n.toLocaleString("id-ID", { minimumFractionDigits: desimal, maximumFractionDigits: desimal });

const keWilayah = ([cro, nama, tmReal, tmRkap, produksi]) => ({ cro, nama, tmReal, tmRkap, produksi });
const totalProduksi = (w) => jumlahArr(w.produksi);

function warnaTema() {
  const css = getComputedStyle(document.body);
  const ambil = (nama) => css.getPropertyValue(nama).trim();
  return {
    teks: css.color,
    aksen: ambil("--ac"),
    aksen2: ambil("--ac2"),
    buruk: ambil("--bad"),
    grid: "rgba(128,128,128,.18)",
  };
}

// Font grafik: memakai font halaman + sedikit lebih tebal agar tulisan dan angka terbaca jelas
function fontGrafik(ukuran, tebal) {
  return { size: ukuran, weight: tebal || 500, family: getComputedStyle(document.body).fontFamily || "sans-serif" };
}
function fontCanvas(ukuran, tebal) {
  return (tebal || 600) + " " + ukuran + "px " + (getComputedStyle(document.body).fontFamily || "sans-serif");
}

const charts = {};
function buatChart(id, config) {
  if (typeof Chart === "undefined") return null;
  charts[id]?.destroy();
  charts[id] = new Chart(el(id), config);
  return charts[id];
}

function bandingkanBulan(seri, arah) {
  const n = seri.length;
  const lalu = seri[n - 2];
  const kini = seri[n - 1];
  const baik = lalu == null || kini == null || arah * (kini - lalu) >= 0;
  if (lalu == null || kini == null || lalu === 0) {
    return { baik, teks: "data " + BULAN[n - 2] + "/" + BULAN[n - 1] + " belum lengkap" };
  }
  const persen = ((kini - lalu) / lalu) * 100;
  const panah = persen >= 0 ? "▲" : "▼";
  return {
    baik,
    teks: `${BULAN[n - 1]} vs ${BULAN[n - 2]} ${panah} ${fmt(Math.abs(persen), 1)}% · ${baik ? "membaik" : "memburuk"}`,
  };
}

function pluginLabel(warnaTeks, desimal) {
  return {
    id: "label-titik",
    afterDatasetsDraw(chart) {
      const ctx = chart.ctx;
      ctx.save();
      ctx.fillStyle = warnaTeks;
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      chart.getDatasetMeta(0).data.forEach((titik, j) => {
        const nilai = chart.data.datasets[0].data[j];
        if (nilai != null) ctx.fillText(fmt(nilai, desimal), titik.x, titik.y - 8);
      });
      ctx.restore();
    },
  };
}

async function downloadChart(cardId, format, namaIndikator) {
  const cardElement = document.getElementById(cardId);
  if (!cardElement) return;

  const btnContainer = cardElement.querySelector('.chart-download-actions');
  if (btnContainer) btnContainer.style.display = 'none';

  try {
    const canvas = await html2canvas(cardElement, { scale: 2, backgroundColor: null });
    
    if (format === 'png') {
      const link = document.createElement('a');
      link.download = `Grafik_${namaIndikator.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } else if (format === 'pdf') {
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const imgData = canvas.toDataURL('image/png');
      const imgWidth = 277;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
      pdf.save(`Grafik_${namaIndikator.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
    }
  } catch (err) {
    console.error("Gagal mengunduh grafik:", err);
  } finally {
    if (btnContainer) btnContainer.style.display = 'flex';
  }
}

function renderIndikator(filter) {
  const kunci = filter === "Semua" ? "Total" : filter.replace("CRO", "Regional");
  const data = dataIndikator[kunci];
  if (!data) return;
  const n = data.bulanan[0].length;

  INDIKATOR.forEach((_, i) => {
    charts["i" + i]?.destroy();
    delete charts["i" + i];
  });

  el("ih").textContent =
  "Tren indikator panen 2026 · " + (kunci === "Total" ? "Total PT Agrinas" : kunci);
  el("subIndikator").textContent = `${filter === "Semua" ? "Seluruh regional" : filter} · 2026`;

  const tema = warnaTema();

  el("ig").innerHTML = INDIKATOR.map((ind, i) => {
    const { baik, teks } = bandingkanBulan(data.bulanan[i], ind.arah);
    return `
      <div class="c ic ${baik ? "" : "w"}" id="card-indikator-${i}">
        <div class="t">
          <div><b>${ind.nama}</b> <span>${ind.satuan}</span></div>
          <b>${fmt(data.akumulasi[i], ind.desimal)}</b>
        </div>
        <div class="bd">${teks}</div>
        <div class="cv"><canvas id="i${i}"></canvas></div>
        <div class="chart-download-actions">
          <button type="button" class="btn-dl" onclick="downloadChart('card-indikator-${i}', 'png', '${ind.nama}')">Unduh PNG</button>
          <button type="button" class="btn-dl" onclick="downloadChart('card-indikator-${i}', 'pdf', '${ind.nama}')">Unduh PDF</button>
        </div>
      </div>`;
  }).join("");

  INDIKATOR.forEach((ind, i) => {
    const seri = data.bulanan[i];
    const { baik } = bandingkanBulan(seri, ind.arah);
    buatChart("i" + i, {
      type: "line",
      plugins: [pluginLabel(tema.teks, ind.desimal)],
      data: {
        labels: BULAN.slice(0, n),
        datasets: [{
          data: seri,
          borderColor: tema.aksen,
          backgroundColor: tema.aksen,
          tension: 0,
          pointRadius: 4,
          pointBackgroundColor: seri.map((_, j) => (j === n - 1 && !baik ? tema.buruk : tema.aksen)),
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 16 } },
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: tema.teks }, grid: { display: false } },
          y: { display: false, grace: "15%" },
        },
      },
    });
  });
}

let dataAktif = DATA_AWAL.map(keWilayah);
let dataLaporanResmiAktif = null;

try {
  const tersimpanMon = JSON.parse(localStorage.getItem(KUNCI_MONITORING) || "null");
  if (tersimpanMon) {
    dataAktif = tersimpanMon.wilayah.map(keWilayah);
    dataIndikator = tersimpanMon.indikator;
    // Data tersimpan dari versi lama belum memuat Ton/Ha -> pakai data bawaan sampai Excel diunggah ulang
    protasAktif = tersimpanMon.protasBulanan || DATA_PROTAS_AWAL;
  }

  const tersimpanLap = JSON.parse(localStorage.getItem(KUNCI_LAPORAN) || "null");
  if (tersimpanLap) {
    dataLaporanResmiAktif = tersimpanLap;
  }
} catch (e) {}

function isiFilter() {
  const daftarCro = [...new Set(dataAktif.map((w) => w.cro))];
  const optionHTML = ["Semua", ...daftarCro].map((c) => `<option>${c}</option>`).join("");
  
  const filterMain = el("f");
  const filterIndikator = el("fIndikator");
  
  const valMain = filterMain.value || "Semua";
  const valIndikator = filterIndikator.value || "Semua";

  filterMain.innerHTML = optionHTML;
  filterMain.value = valMain;

  filterIndikator.innerHTML = optionHTML;
  filterIndikator.value = valIndikator;
}

function renderKpi(ringkasan) {
  const { total, tmReal, tmRkap, bulanan, label, idxPuncak } = ringkasan;
  const kartu = [
    ["Total produksi", fmt(total) + " Ton", ""],
    ["Luas TM real", fmt(tmReal) + " Ha", `RKAP ${fmt(tmRkap)} Ha (${fmt((tmReal / tmRkap) * 100, 2)}%)`],
    ["Produktivitas", fmt(total / tmReal, 2) + " Ton/Ha", "akumulasi tahun berjalan"],
    ["Bulan Tertinggi", fmt(bulanan[idxPuncak]) + " Ton", "bulan " + label[idxPuncak]],
  ];
  el("kpi").innerHTML = kartu
    .map(([judul, nilai, ket]) => `<div class="c"><span>${judul}</span><b>${nilai}</b><i>${ket}</i></div>`)
    .join("");
}

function renderGrafikProduksi(wilayah, ringkasan, protas) {
  const tema = warnaTema();
  const { bulanan, label, total, tmReal } = ringkasan;

  const pluginLabelBar = {
    id: "labelBar",
    afterDatasetsDraw(chart) {
      const ctx = chart.ctx;
      ctx.save();
      ctx.fillStyle = tema.teks;
      ctx.font = fontCanvas(chart.config.options.indexAxis === 'y' ? 11 : 12, 600);
      ctx.textAlign = "center";
      
      chart.getDatasetMeta(0).data.forEach((bar, index) => {
        const nilai = chart.data.datasets[0].data[index];
        if (nilai != null && nilai > 0) {
          if (chart.config.options.indexAxis === 'y') {
            const teksNilai = fmt(nilai, 2), lebar = ctx.measureText(teksNilai).width;
            ctx.textAlign = "left";
            ctx.fillText(teksNilai, Math.min(bar.x + 8, chart.width - lebar - 3), bar.y + 4);      // tidak melewati tepi kanan
          } else {
            const teksNilai = fmt(nilai), lebar = ctx.measureText(teksNilai).width;
            const px = Math.min(Math.max(bar.x, lebar / 2 + 3), chart.width - lebar / 2 - 3);      // tidak melewati tepi kiri/kanan
            ctx.fillText(teksNilai, px, Math.max(bar.y - 8, 14));                                   // tidak melewati tepi atas
          }
        }
      });
      ctx.restore();
    }
  };

  const opsi = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: tema.teks, font: fontGrafik(12) }, grid: { display: false } },
      y: { grace: "8%", ticks: { color: tema.teks, font: fontGrafik(12) }, grid: { color: tema.grid }, afterFit: (sk) => { sk.width += 20; } },
    },
  };

  // Warna gradasi grafik batang (sama dengan donat Capaian Produksi per Kebun): [terang, gelap]
  const GRAD_HIJAU = ['#6EE7B7', '#059669'];
  const GRAD_KUNING = ['#FDBA74', '#EA580C'];

  // Helper aman untuk membuat objek gradient Chart.js
  function buatGradient(ctx, chartArea, c1, c2, isHorizontal = false) {
    if (!chartArea) return c1;
    const grad = isHorizontal
      ? ctx.createLinearGradient(chartArea.left, 0, chartArea.right, 0)
      : ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
    grad.addColorStop(0, c2);
    grad.addColorStop(1, c1);
    return grad;
  }

  // ===== Grafik gabungan: batang Ton (sumbu kiri) + garis merah Ton/Ha (sumbu kanan) =====
  const WARNA_GARIS = "#dc2626";
  const adaNilai = (arr) => arr.some((v) => typeof v === "number");
  const rataBaris = (arr, i) => (typeof arr[i] === "number" ? arr[i] : null);

  const datasetGaris = (data) => ({
    type: "line",
    label: "Ton/Ha",
    data,
    yAxisID: "y2",
    order: 0,
    borderColor: WARNA_GARIS,
    backgroundColor: WARNA_GARIS,
    borderWidth: 3,
    tension: 0.25,
    spanGaps: false,                     // bulan tanpa data = tidak ada titik / garis
    pointRadius: 5,
    pointHoverRadius: 7,
    pointBackgroundColor: "#ffffff",
    pointBorderColor: WARNA_GARIS,
    pointBorderWidth: 2,
  });

  // Label angka Ton/Ha pada titik garis merah (grafik c1 & c2). Hanya menggambar teks, tidak mengubah data.
  const pluginLabelGaris = {
    id: "labelGaris",
    afterDatasetsDraw(chart) {
      const idx = chart.data.datasets.findIndex((d) => d.type === "line");
      if (idx < 0) return;
      const garis = chart.getDatasetMeta(idx), batang = chart.getDatasetMeta(0), ctx = chart.ctx;
      const t = document.documentElement.getAttribute("data-theme");
      const gelap = t ? t === "dark" : !!(window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);
      ctx.save();
      ctx.font = fontCanvas(11, 700);
      ctx.textAlign = "center";
      ctx.lineJoin = "round";
      ctx.lineWidth = 3;
      ctx.strokeStyle = gelap ? "rgba(15,26,20,.9)" : "rgba(255,255,255,.95)";
      ctx.fillStyle = gelap ? "#f87171" : WARNA_GARIS;
      garis.data.forEach((pt, i) => {
        const v = chart.data.datasets[idx].data[i];
        if (v == null || !isFinite(v)) return;
        const teksNilai = fmt(v, 2), lebar = ctx.measureText(teksNilai).width;
        const px = Math.min(Math.max(pt.x, lebar / 2 + 3), chart.width - lebar / 2 - 3);
        let py = pt.y - 11;
        const bar = batang.data[i], nilaiBar = chart.data.datasets[0].data[i];
        // hindari bertumpuk dengan angka Ton di atas batang
        if (bar && nilaiBar > 0 && Math.abs(py - (bar.y - 8)) < 14) py = pt.y + 21;
        if (py < 12) py = pt.y + 21;
        ctx.strokeText(teksNilai, px, py);
        ctx.fillText(teksNilai, px, py);
      });
      ctx.restore();
    },
  };

  const opsiGabungan = (adaGaris) => ({
    ...opsi,
    layout: { padding: { top: 24 } },
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: {
        display: adaGaris,
        position: "bottom",
        labels: { color: tema.teks, usePointStyle: true, boxWidth: 8, boxHeight: 8, padding: 18, font: fontGrafik(12) },
      },
      tooltip: {
        callbacks: {
          label: (c) => `${c.dataset.label}: ${fmt(c.parsed.y, c.dataset.yAxisID === "y2" ? 2 : 0)}`,
        },
      },
    },
    scales: {
      ...opsi.scales,
      y2: {
        display: adaGaris,
        position: "right",
        grace: "10%",
        ticks: { color: WARNA_GARIS, font: fontGrafik(12), callback: (v) => fmt(+v, 2) },
        grid: { drawOnChartArea: false },
        afterFit: (sk) => { sk.width += 12; },
      },
    },
  });

  // Kunci data Ton/Ha mengikuti filter CRO: "Semua" -> Total (GRAND TOTAL), "CRO II" -> Subtotal CRO II, dst.
  const kunciProtas = ringkasan.kunciProtas || "Total";
  const garisBulanan = label.map((_, i) => rataBaris(protasAktif[kunciProtas] || [], i));
  const adaGarisBulanan = adaNilai(garisBulanan);

  buatChart("c1", {
    type: "bar",
    plugins: [pluginLabelBar, pluginLabelGaris],
    data: {
      labels: label,
      datasets: [
        {
          label: "Ton",
          data: bulanan,
          yAxisID: "y",
          order: 1,
          backgroundColor: function(context) {
            const { ctx, chartArea } = context.chart;
            if (context.dataIndex === label.length - 1) {
              return buatGradient(ctx, chartArea, ...GRAD_KUNING);
            }
            return buatGradient(ctx, chartArea, ...GRAD_HIJAU);
          },
          borderRadius: 6,
          barPercentage: 0.6,
          categoryPercentage: 0.8,
        },
        ...(adaGarisBulanan ? [datasetGaris(garisBulanan)] : []),
      ],
    },
    options: opsiGabungan(adaGarisBulanan),
  });

  const daftarCro = [...new Set(wilayah.map((w) => w.cro))];
  // Ton/Ha per CRO = akumulasi (jumlah) produktivitas bulanan yang sudah ada datanya, Jan–Des
  const garisCro = daftarCro.map((c) => {
    const bulanAda = (protasAktif[c] || []).slice(0, label.length).filter((v) => typeof v === "number");
    return bulanAda.length ? +jumlahArr(bulanAda).toFixed(2) : null;
  });
  const adaGarisCro = adaNilai(garisCro);

  buatChart("c2", {
    type: "bar",
    plugins: [pluginLabelBar, pluginLabelGaris],
    data: {
      labels: daftarCro.map((c) => c.replace("CRO ", "")),
      datasets: [
        {
          label: "Ton",
          data: daftarCro.map((c) => jumlahArr(wilayah.filter((w) => w.cro === c).map(totalProduksi))),
          yAxisID: "y",
          order: 1,
          backgroundColor: function(context) {
            const { ctx, chartArea } = context.chart;
            return buatGradient(ctx, chartArea, ...GRAD_HIJAU);
          },
          borderRadius: 6,
          barPercentage: 0.6,
          categoryPercentage: 0.8,
        },
        ...(adaGarisCro ? [datasetGaris(garisCro)] : []),
      ],
    },
    options: opsiGabungan(adaGarisCro),
  });

  el("c3w").style.height = Math.max(260, protas.length * 22 + 40) + "px";
  buatChart("c3", {
    type: "bar",
    plugins: [pluginLabelBar],
    data: {
      labels: protas.map((p) => p.nama),
      datasets: [{
        data: protas.map((p) => +p.nilai.toFixed(2)),
        backgroundColor: function(context) {
          const { ctx, chartArea } = context.chart;
          const p = protas[context.dataIndex];
          if (p && p.nilai >= total / tmReal) {
            return buatGradient(ctx, chartArea, ...GRAD_HIJAU, true);
          }
          return buatGradient(ctx, chartArea, ...GRAD_KUNING, true);
        },
        borderRadius: 5,
      }],
    },
    options: {
      ...opsi,
      indexAxis: "y",
      layout: { padding: { right: 64 } },
      scales: {
        x: { grace: "10%", ticks: { color: tema.teks, font: fontGrafik(11) }, grid: { color: tema.grid } },
        y: { ticks: { color: tema.teks, font: fontGrafik(11.5) }, grid: { display: false } },
      },
    },
  });
}

function renderSorotan(wilayah, urut, protas, ringkasan) {
  const { total, label } = ringkasan;
  const catatan = [];

  const terbesar = urut[0];
  catatan.push(
    `<b>${terbesar.nama}</b> penyumbang terbesar: ${fmt(totalProduksi(terbesar))} Ton ` +
    `(${fmt((totalProduksi(terbesar) / total) * 100, 2)}% dari total).`
  );

  const tertinggi = protas[0];
  const terendah = protas[protas.length - 1];
  catatan.push(
    `Produktivitas tertinggi: <b>${tertinggi.nama}</b> (${fmt(tertinggi.nilai, 2)} Ton/Ha); ` +
    `terendah: <b>${terendah.nama}</b> (${fmt(terendah.nilai, 2)} Ton/Ha).`
  );

  const kurang = wilayah.filter((w) => w.tmReal / w.tmRkap < 0.9).map((w) => w.nama);
  if (kurang.length) catatan.push(`Luas TM real di bawah 90% RKAP: ${kurang.join(", ")}.`);

  wilayah.forEach((w) => {
    const bulanPenuh = w.produksi.slice(0, -1);
    const median = [...bulanPenuh].sort((a, b) => a - b)[Math.floor(bulanPenuh.length / 2)];
    bulanPenuh.forEach((x, i) => {
      if (median > 0 && x > 3 * median) {
        catatan.push(
          `<span class="no">⚠ Data perlu dicek:</span> ${w.nama} bulan ${label[i]} = ${fmt(x)} Ton (median ${fmt(median)}).`
        );
      }
    });
  });

  el("ins").innerHTML = catatan.map((c) => `<li>${c}</li>`).join("");
}

function renderTabel(urut, protas) {
  if (!el("t")) return;
  const maks = Math.max(...protas.map((p) => p.nilai));
  const baris = urut.map((w) => {
    const persenRkap = (w.tmReal / w.tmRkap) * 100;
    const protasW = totalProduksi(w) / w.tmReal;
    const kelas = persenRkap >= 100 ? "ok" : persenRkap < 90 ? "no" : "";
    return `<tr>
      <td>${w.nama}</td><td>${w.cro}</td><td>${fmt(w.tmReal)}</td>
      <td class="${kelas}">${fmt(persenRkap, 2)}%</td>
      <td>${fmt(totalProduksi(w))}</td>
      <td>${fmt(protasW, 2)}<span class="bar" style="width:${(protasW / maks) * 60}px"></span></td>
    </tr>`;
  });
  el("t").innerHTML =
    `<tr><th>Wilayah</th><th>CRO</th><th>TM Real (Ha)</th><th>vs RKAP</th><th>Total (Ton)</th><th>Ton/Ha</th></tr>` +
    baris.join("");
}

function render() {
  const filterMain = el("f").value || "Semua";
  const wilayah = dataAktif.filter((w) => filterMain === "Semua" || w.cro === filterMain);

  const jmlBulan = Math.max(...dataAktif.map((w) => w.produksi.length));
  const label = BULAN.slice(0, jmlBulan);
  const bulanan = label.map((_, i) => jumlahArr(wilayah.map((w) => w.produksi[i] || 0)));
  const ringkasan = {
    label,
    bulanan,
    total: jumlahArr(wilayah.map(totalProduksi)),
    tmReal: jumlahArr(wilayah.map((w) => w.tmReal)),
    tmRkap: jumlahArr(wilayah.map((w) => w.tmRkap)),
    idxPuncak: bulanan.indexOf(Math.max(...bulanan)),
    kunciProtas: filterMain === "Semua" ? "Total" : filterMain,
  };

  el("sub").textContent =
  `${filterMain === "Semua" ? "Seluruh regional" : filterMain} · 2026 · ${wilayah.length} wilayah`;

  const urut = [...wilayah].sort((a, b) => totalProduksi(b) - totalProduksi(a));
  const protas = wilayah
    .map((w) => ({ nama: w.nama, nilai: totalProduksi(w) / w.tmReal }))
    .sort((a, b) => b.nilai - a.nilai);

  renderKpi(ringkasan);
  renderGrafikProduksi(wilayah, ringkasan, protas);
  renderSorotan(wilayah, urut, protas, ringkasan);
  
  const filterIndikator = el("fIndikator").value || "Semua";
  renderIndikator(filterIndikator);

  renderTabel(urut, protas);
}

function pasangData({ wilayah, indikator, protasBulanan }) {
  dataAktif = wilayah.map(keWilayah);
  dataIndikator = indikator;
  protasAktif = protasBulanan || {};
  isiFilter();
  render();
}

const inputMon = el("fileExcel");
if (inputMon) {
  inputMon.onchange = async (e) => {
    const file = e.target.files[0];
    const pesan = el("msg");
    if (!file) return;
    pesan.textContent = "Membaca file monitoring…";
    try {
      const buku = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const tab = {};
      ExcelLoader.TAB.forEach((nama) => {
        const sheet = buku.Sheets[nama];
        if (!sheet) throw new Error(`Tab "${nama}" tidak ditemukan`);
        tab[nama] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
      });
      if (buku.Sheets["Produktivitas"]) {
        tab["Produktivitas"] = XLSX.utils.sheet_to_json(buku.Sheets["Produktivitas"], { header: 1, defval: null });
      }
      const hasil = ExcelLoader.baca(tab);
      pasangData(hasil);
      try { localStorage.setItem(KUNCI_MONITORING, JSON.stringify(hasil)); } catch (err) {}
      pesan.textContent = `✓ Monitoring diperbarui: ${file.name}`;
    } catch (err) {
      pesan.textContent = "Gagal membaca file: " + err.message;
    }
    e.target.value = "";
  };
}

const inputLap = el("fileExcelLaporan");
if (inputLap) {
  inputLap.onchange = async (e) => {
    const file = e.target.files[0];
    const pesan = el("msgLaporan");
    if (!file) return;
    pesan.textContent = "Membaca file Laporan Per Regional…";
    try {
      const buku = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const hasilLaporan = {};
      if (buku.Sheets["Laporan Produksi per CRO"]) {
        hasilLaporan.produksiCro = XLSX.utils.sheet_to_json(buku.Sheets["Laporan Produksi per CRO"], { header: 1, defval: null });
      }
      if (buku.Sheets["Kinerja Panen per CRO"]) {
        hasilLaporan.kinerjaPanen = XLSX.utils.sheet_to_json(buku.Sheets["Kinerja Panen per CRO"], { header: 1, defval: null });
      }

      dataLaporanResmiAktif = hasilLaporan;
      renderTabelLaporanResmi();

      try { localStorage.setItem(KUNCI_LAPORAN, JSON.stringify(hasilLaporan)); } catch (err) {}
      pesan.textContent = `✓ Laporan Per Regional diperbarui: ${file.name}`;
    } catch (err) {
      pesan.textContent = "Gagal membaca file laporan: " + err.message;
    }
    e.target.value = "";
  };
}

const btnRsLaporan = el("rsLaporan");
if (btnRsLaporan) {
  btnRsLaporan.onclick = () => {
    try { localStorage.removeItem(KUNCI_LAPORAN); } catch (err) {}
    dataLaporanResmiAktif = null;
    renderTabelLaporanResmi();
    el("msgLaporan").textContent = "Data Laporan Per Regional dikosongkan.";
  };
}

el("rs").onclick = () => {
  try { localStorage.removeItem(KUNCI_MONITORING); } catch (err) {}
  
  const dataNol = DATA_AWAL.map(w => [
    w[0], w[1], 0, 0, w[4].map(() => 0)
  ]);

  const indikatorNol = {};
  Object.keys(DATA_INDIKATOR_AWAL).forEach(k => {
    const item = DATA_INDIKATOR_AWAL[k];
    indikatorNol[k] = {
      bulanan: item.bulanan.map(arr => arr.map(() => 0)),
      akumulasi: item.akumulasi.map(() => 0)
    };
  });

  pasangData({ wilayah: dataNol, indikator: indikatorNol });
  el("msg").textContent = "Data monitoring dikosongkan (0). Silakan unggah file Excel baru.";
};

document.getElementById("temaToggle").addEventListener("click", () => {
  const root = document.documentElement;
  const isDark = root.getAttribute("data-theme") === "dark" || 
                 (!root.hasAttribute("data-theme") && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const targetTheme = isDark ? "light" : "dark";
  root.setAttribute("data-theme", targetTheme);
  try { localStorage.setItem("tbs_tema", targetTheme); } catch (e) {}
  render();
  if (typeof renderGrafikLaporanResmi === "function") renderGrafikLaporanResmi();
});

el("f").onchange = () => {
  el("fIndikator").value = el("f").value;
  render();
  renderGrafikLaporanResmi();
};
el("fIndikator").onchange = () => {
  el("f").value = el("fIndikator").value;
  render();
  renderGrafikLaporanResmi();
};

matchMedia("(prefers-color-scheme: dark)").addEventListener("change", render);
isiFilter();
render();
renderTabelLaporanResmi();

function renderTabelLaporanResmi() {
  const tbody = el("tbodyLaporanResmi");
  if (!tbody) return;

  if (!dataLaporanResmiAktif || !dataLaporanResmiAktif.produksiCro) {
    tbody.innerHTML = `<tr><td colspan="27" style="text-align:center; padding:25px; color:var(--mut);">Belum ada data Laporan Resmi. Silakan unggah file Excel Laporan Per Regional.</td></tr>`;
    if (el("totPanen")) el("totPanen").textContent = "0 TON";
    if (el("totKirim")) el("totKirim").textContent = "0 TON";
    if (el("totJanjang")) el("totJanjang").textContent = "0";
    if (el("totBrondolan")) el("totBrondolan").textContent = "0 TON";
    if (el("totRestan")) el("totRestan").textContent = "0 TON";
    return;
  }

  const rows = dataLaporanResmiAktif.produksiCro;
  const rowsPanen = dataLaporanResmiAktif.kinerjaPanen || [];
  let htmlBaris = "";
  let currentCro = "";

  const fmtBigNum = (v) => {
    if (v === null || v === undefined || v === "" || isNaN(v)) return typeof v === "string" ? v : "-";
    const num = Number(v);
    if (isNaN(num)) return v;
    return Math.round(num).toLocaleString("id-ID");
  };

  const fmtProd = (v) => {
    if (v === null || v === undefined || v === "" || isNaN(v)) return "-";
    const num = Number(v);
    if (isNaN(num)) return v;
    return num.toFixed(2).replace(".", ",");
  };

  const fmtPctID = (v) => {
    if (v === null || v === undefined || v === "" || isNaN(v)) return "-";
    const num = typeof v === "number" ? v * 100 : parseFloat(v);
    if (isNaN(num)) return "-";
    return num.toFixed(2).replace(".", ",") + "%";
  };

  for (let i = 5; i < rows.length; i++) {
    const r = rows[i];
    const rPanen = rowsPanen[i] || [];
    if (!r || (r[0] == null && r[1] == null && r[2] == null)) continue;

    const col0Str = String(r[0] ?? "").trim();
    const col1Str = String(r[1] ?? "").trim();
    const isSubtotal = col0Str.toLowerCase().includes("subtotal") || col1Str.toLowerCase().includes("subtotal");
    const isTotal = col0Str.toLowerCase().includes("total") || col0Str.toLowerCase().includes("grand total");

    if (!isSubtotal && !isTotal && r[1]) {
      currentCro = r[1];
    }

    const no = isSubtotal || isTotal ? "" : (r[0] ?? "");
    const cro = isSubtotal ? "" : (isTotal ? "" : currentCro);
    const wilayah = isSubtotal ? "Subtotal" : (isTotal ? "Total" : (r[2] || ""));

    const realHa = fmtBigNum(r[3]);
    const rkapHa = fmtBigNum(r[4]);
    const targetHi = fmtBigNum(r[5]);
    const rkapHi = fmtBigNum(r[6]);
    const rkapSdHi = fmtBigNum(r[7]);
    const rkapSdBi = fmtBigNum(r[8]);

    const hl = fmtBigNum(r[9]);
    const realHi = fmtBigNum(r[10]);
    const tren = r[11] || "▲";
    const realSdHi = fmtBigNum(r[12]);
    const realSdBi = fmtBigNum(r[13]);

    const pencTarget = fmtPctID(r[14]);
    const pencRkapHi = fmtPctID(r[15]);
    const pencRkapSdHi = fmtPctID(r[16]);
    const pencRkapSdBi = fmtPctID(r[17]);
    
    const rank1 = r[18] != null && r[18] !== "-" && !isNaN(r[18]) ? Math.round(Number(r[18])) : "-";

    const prodHi = fmtProd(r[19]);
    const prodSdHi = fmtProd(r[20]);
    const prodSdBi = fmtProd(r[21]);

    const pencRkapProdHi = fmtPctID(r[22]);
    const pencRkapProdSdHi = fmtPctID(r[23]);
    const pencRkapProdSdBi = fmtPctID(r[24]);
    
    const rankProdPct = r[25] != null && r[25] !== "-" && !isNaN(r[25]) ? Math.round(Number(r[25])) : "-";
    
    const valRestan = r[26] != null ? r[26] : (rPanen[9] != null ? rPanen[9] : 0);
    const restanHi = fmtBigNum(valRestan);

    let trClass = "";
    if (isSubtotal) trClass = 'class="subtotal-row" style="background: rgba(76, 198, 138, 0.15); font-weight: bold;"';
    if (isTotal) trClass = 'class="total-row" style="background: rgba(47, 143, 91, 0.25); font-weight: bold;"';

    const getBadgeStyle = (val) => {
      if (isSubtotal || isTotal || val === "-") return "";
      const num = typeof val === "number" ? val * 100 : parseFloat(String(val).replace(",", "."));
      if (isNaN(num)) return "";
      if (num >= 100) {
        return 'background-color: rgba(76, 198, 138, 0.2); color: #2e7d32; padding: 2px 6px; border-radius: 4px; font-weight: 500;';
      } else {
        return 'background-color: rgba(229, 115, 115, 0.2); color: #c62828; padding: 2px 6px; border-radius: 4px; font-weight: 500;';
      }
    };

    htmlBaris += `
      <tr ${trClass}>
        <td>${no}</td>
        <td><b>${isSubtotal ? r[0] : cro}</b></td>
        <td>${wilayah}</td>
        <td>${realHa}</td>
        <td>${rkapHa}</td>
        <td>${targetHi}</td>
        <td>${rkapHi}</td>
        <td>${rkapSdHi}</td>
        <td>${rkapSdBi}</td>
        <td>${hl}</td>
        <td>${realHi}</td>
        <td><span style="color:${String(tren).includes('▲') ? 'var(--ac)' : 'var(--bad)'};">${tren}</span></td>
        <td>${realSdHi}</td>
        <td>${realSdBi}</td>
        <td><span style="${getBadgeStyle(r[14])}">${pencTarget}</span></td>
        <td><span style="${getBadgeStyle(r[15])}">${pencRkapHi}</span></td>
        <td><span style="${getBadgeStyle(r[16])}">${pencRkapSdHi}</span></td>
        <td><span style="${getBadgeStyle(r[17])}">${pencRkapSdBi}</span></td>
        <td>${rank1}</td>
        <td>${prodHi}</td>
        <td>${prodSdHi}</td>
        <td>${prodSdBi}</td>
        <td><span style="${getBadgeStyle(r[22])}">${pencRkapProdHi}</span></td>
        <td><span style="${getBadgeStyle(r[23])}">${pencRkapProdSdHi}</span></td>
        <td><span style="${getBadgeStyle(r[24])}">${pencRkapProdSdBi}</span></td>
        <td>${rankProdPct}</td>
        <td>${restanHi}</td>
      </tr>`;
  }

  tbody.innerHTML = htmlBaris;

  const barisTotal = rows[rows.length - 1] || [];
  const barisTotalPanen = rowsPanen.length > 0 ? rowsPanen[rowsPanen.length - 1] : [];
  
  const valPanen = barisTotalPanen[5] != null ? barisTotalPanen[5] : (barisTotal[10] != null ? barisTotal[10] : 0);
  if (el("totPanen")) el("totPanen").textContent = fmtBigNum(valPanen) + " TON";
  
  const valKirim = barisTotalPanen[6] != null ? barisTotalPanen[6] : (barisTotal[13] != null ? barisTotal[13] : 0);
  if (el("totKirim")) el("totKirim").textContent = fmtBigNum(valKirim) + " TON";
  
  const realSdBi = barisTotal[13] != null ? Number(barisTotal[13]) : 2470430.77;
  const valJanjang = Math.round((realSdBi * 1000) / 2116);
  if (el("totJanjang")) el("totJanjang").textContent = fmtBigNum(valJanjang);
  
  const valBrondolan = Math.round(realSdBi * 0.000121);
  if (el("totBrondolan")) el("totBrondolan").textContent = fmtBigNum(valBrondolan) + " TON";
  
  const totalRestanVal = barisTotal[26] != null ? barisTotal[26] : (barisTotalPanen[9] != null ? barisTotalPanen[9] : 0);
  if (el("totRestan")) el("totRestan").textContent = fmtBigNum(totalRestanVal) + " TON";

  renderGrafikLaporanResmi();
}

const ID_CHART_LAPORAN = [
  "chPtHi", "chPtSdHi", "chPtSdBi",
  "chTnHi", "chTnSdHi", "chTnSdBi",
  "chPtHiMon", "chPtSdHiMon", "chPtSdBiMon",
  "chTnHiMon", "chTnSdHiMon", "chTnSdBiMon",
  "chRgPtCroSdHi", "chRgPtCroSdBi", "chRgTnCroSdHi", "chRgTnCroSdBi",
  "chRgPtWilSdHi", "chRgPtWilSdBi", "chRgTnWilSdHi", "chRgTnWilSdBi",
  "chRgPtCroSdHiMon", "chRgPtCroSdBiMon", "chRgTnCroSdHiMon", "chRgTnCroSdBiMon",
  "chRgPtWilSdHiMon", "chRgPtWilSdBiMon", "chRgTnWilSdHiMon", "chRgTnWilSdBiMon"
];

// Isi <tbody> hanya jika elemennya ada (tabel lama di halaman Grafik Laporan Per Regional sudah dihapus)
function isiTbody(tbody, html) { if (tbody) tbody.innerHTML = html; }

function renderGrafikLaporanResmi() {
  const tbodyTopHariIni = el("tbodyTopHariIni");
  const tbodyTopSdHariIni = el("tbodyTopSdHariIni");
  const tbodyTopSdBulanIni = el("tbodyTopSdBulanIni");
  
  const tbodyLowHariIni = el("tbodyLowHariIni");
  const tbodyLowSdHariIni = el("tbodyLowSdHariIni");
  const tbodyLowSdBulanIni = el("tbodyLowSdBulanIni");
  
  const tbodyTopRightHi = el("tbodyGrafikRegionalTopHi");
  const tbodyTopRightSdHi = el("tbodyGrafikRegionalTopSdHi");
  const tbodyTopRightSdBi = el("tbodyGrafikRegionalTopSdBi");
  const tbodyLowRightHi = el("tbodyGrafikRegionalLowHi");
  const tbodyLowRightSdHi = el("tbodyGrafikRegionalLowSdHi");
  const tbodyLowRight = el("tbodyGrafikRegionalLow");


  if (!dataLaporanResmiAktif || !dataLaporanResmiAktif.produksiCro) {
    const emptyKiri = `<tr><td colspan="7" class="td-center" style="padding:15px; color:var(--mut);">Belum ada data. Silakan unggah file Excel.</td></tr>`;
    const emptyKanan = `<tr><td colspan="8" class="td-center" style="padding:15px; color:var(--mut);">Belum ada data. Silakan unggah file Excel.</td></tr>`;
    isiTbody(tbodyTopHariIni, emptyKiri);
    isiTbody(tbodyTopSdHariIni, emptyKiri);
    isiTbody(tbodyTopSdBulanIni, emptyKiri);
    isiTbody(tbodyLowHariIni, emptyKiri);
    isiTbody(tbodyLowSdHariIni, emptyKiri);
    isiTbody(tbodyLowSdBulanIni, emptyKiri);
    ID_CHART_LAPORAN.forEach((id) => { charts[id]?.destroy(); delete charts[id]; });
    isiTbody(tbodyTopRightHi, emptyKanan);
    isiTbody(tbodyTopRightSdHi, emptyKanan);
    isiTbody(tbodyTopRightSdBi, emptyKanan);
    isiTbody(tbodyLowRightHi, emptyKanan);
    isiTbody(tbodyLowRightSdHi, emptyKanan);
    isiTbody(tbodyLowRight, emptyKanan);
    return;
  }

  const rows = dataLaporanResmiAktif.produksiCro;
  const listWilayah = [];

  const fmtBigNum = (v) => {
    if (v === null || v === undefined || v === "" || isNaN(v)) return "-";
    const num = Number(v);
    if (isNaN(num)) return v;
    return Math.round(num).toLocaleString("id-ID");
  };

  const fmtProd = (v) => {
    if (v === null || v === undefined || v === "" || isNaN(v)) return "-";
    const num = Number(v);
    if (isNaN(num)) return v;
    return num.toFixed(num < 0.015 ? 3 : 2).replace(".", ",");
  };

  const fmtPenc = (v) => {
    if (v === null || v === undefined || !isFinite(v)) return "-";
    return Number(v).toFixed(1).replace(".", ",");
  };

  const hitungPenc = (aktual, rkap) => (rkap > 0 ? (aktual / rkap) * 100 : null);

  // Grafik baru: kolom Q, R (indeks 16, 17) dan X, Y (indeks 23, 24) dibaca apa adanya dari Excel (format persen)
  const KOLOM_RG = { q: 16, r: 17, x: 23, y: 24 };
  const nilaiExcelPct = (v) => (v === null || v === undefined || v === "" || isNaN(v)) ? 0 : Number(v) * 100;
  const ambilRg = (r) => ({
    rgQ: nilaiExcelPct(r[KOLOM_RG.q]), rgR: nilaiExcelPct(r[KOLOM_RG.r]),
    rgX: nilaiExcelPct(r[KOLOM_RG.x]), rgY: nilaiExcelPct(r[KOLOM_RG.y])
  });
  const listCro = [];

  let currentCro = "";
  for (let i = 5; i < rows.length; i++) {
    const r = rows[i];
    if (!r || (r[0] == null && r[1] == null && r[2] == null)) continue;

    const col0Str = String(r[0] ?? "").trim();
    const col1Str = String(r[1] ?? "").trim();
    const isSubtotal = col0Str.toLowerCase().includes("subtotal") || col1Str.toLowerCase().includes("subtotal");
    const isTotal = col0Str.toLowerCase().includes("total") || col0Str.toLowerCase().includes("grand total");

    if (!isSubtotal && !isTotal && r[1]) {
      currentCro = r[1];
    }

    if (isSubtotal) listCro.push({ regional: currentCro, ...ambilRg(r) });

    if (isSubtotal || isTotal) continue;

    const wilayah = String(r[2] || "").trim();
    if (!wilayah) continue;

    const tmReal = Number(r[3]) || 0;           
    const tonnaseHariIni = Number(r[10]) || 0;
    const protasHariIni = Number(r[19]) || 0;
    
    const tonnaseSdHi = Number(r[12]) || 0;
    const protasSdHi = Number(r[20]) || 0;

    const tonnaseSdBulan = Number(r[13]) || 0;
    const protasSdBulan = Number(r[21]) || 0;

    const rkapHi = Number(r[6]) || 0;
    const rkapSdHi = Number(r[7]) || 0;
    const rkapSdBi = Number(r[8]) || 0;

    const pencHi = hitungPenc(tonnaseHariIni, rkapHi);
    const pencSdHi = hitungPenc(tonnaseSdHi, rkapSdHi);
    const pencSdBi = hitungPenc(tonnaseSdBulan, rkapSdBi);

    listWilayah.push({
      regional: currentCro,
      wilayah,
      tmReal,
      tmRealFormatted: fmtBigNum(tmReal),
      
      tonnaseHariIni: fmtBigNum(tonnaseHariIni),
      protasHariIni: fmtProd(protasHariIni),
      rawProtasHariIni: protasHariIni,

      tonnaseSdHi: fmtBigNum(tonnaseSdHi),
      protasSdHi: fmtProd(protasSdHi),
      rawProtasSdHi: protasSdHi,

      tonnaseSdBulan: fmtBigNum(tonnaseSdBulan),
      protasSdBulan: fmtProd(protasSdBulan),
      rawProtasSdBulan: protasSdBulan,

      rkapHi: fmtBigNum(rkapHi),
      pencHi: fmtPenc(pencHi),
      rawPencHi: pencHi,

      rkapSdHi: fmtBigNum(rkapSdHi),
      pencSdHi: fmtPenc(pencSdHi),
      rawPencSdHi: pencSdHi,

      rkapSdBi: fmtBigNum(rkapSdBi),
      pencSdBi: fmtPenc(pencSdBi),
      rawPencSdBi: pencSdBi,

      ...ambilRg(r)
    });
  }

  if (listWilayah.length === 0) return;

  // Filter "Pilih regional" di halaman Monitoring: grafik versi "Mon" ikut berubah, versi halaman Grafik Laporan tetap lengkap
  const filterMon = (el("f") && el("f").value) || "Semua";
  const rapikan = (v) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().toUpperCase();
  const cocokFilter = (it) => filterMon === "Semua" || rapikan(it.regional) === rapikan(filterMon);
  const listCroMon = listCro.filter(cocokFilter);
  const listWilayahMon = listWilayah.filter(cocokFilter);

  const generateTopRows = (dataItems, getTonnase, getProtas) => {
    return dataItems.map((item, idx) => {
      const num = idx + 1;
      const kelasBaris = idx < 3 ? "baris-sorot-top" : "";
      return `
        <tr class="${kelasBaris}">
          <td class="td-center">${num}</td>
          <td class="td-center">${item.regional}</td>
          <td class="td-center">${item.wilayah}</td>
          <td class="td-right">${item.tmRealFormatted}</td>
          <td class="td-right">${getTonnase(item)}</td>
          <td class="td-right">${getProtas(item)}</td>
          <td class="td-center">${num}</td>
        </tr>
      `;
    }).join("");
  };

  const generateLowRows = (dataItems, getTonnase, getProtas) => {
    return dataItems.map((item, idx) => {
      const num = idx + 1;
      const rankVal = 23 - idx;
      const kelasBaris = idx < 3 ? "baris-sorot-low" : "";
      return `
        <tr class="${kelasBaris}">
          <td class="td-center">${num}</td>
          <td class="td-center">${item.regional}</td>
          <td class="td-center">${item.wilayah}</td>
          <td class="td-right">${item.tmRealFormatted}</td>
          <td class="td-right">${getTonnase(item)}</td>
          <td class="td-right">${getProtas(item)}</td>
          <td class="td-center">${rankVal}</td>
        </tr>
      `;
    }).join("");
  };

  const sortedTopHariIni = [...listWilayah].sort((a, b) => b.rawProtasHariIni - a.rawProtasHariIni);
  const sortedTopSdHi = [...listWilayah].sort((a, b) => b.rawProtasSdHi - a.rawProtasSdHi);
  const sortedTopSdBulan = [...listWilayah].sort((a, b) => b.rawProtasSdBulan - a.rawProtasSdBulan);

  isiTbody(tbodyTopHariIni, generateTopRows(sortedTopHariIni.slice(0, 12), i => i.tonnaseHariIni, i => i.protasHariIni));
  isiTbody(tbodyTopSdHariIni, generateTopRows(sortedTopSdHi.slice(0, 12), i => i.tonnaseSdHi, i => i.protasSdHi));
  isiTbody(tbodyTopSdBulanIni, generateTopRows(sortedTopSdBulan.slice(0, 12), i => i.tonnaseSdBulan, i => i.protasSdBulan));

  const sortedLowHariIni = [...listWilayah].sort((a, b) => a.rawProtasHariIni - b.rawProtasHariIni);
  const sortedLowSdHi = [...listWilayah].sort((a, b) => a.rawProtasSdHi - b.rawProtasSdHi);
  const sortedLowSdBulan = [...listWilayah].sort((a, b) => a.rawProtasSdBulan - b.rawProtasSdBulan);

  isiTbody(tbodyLowHariIni, generateLowRows(sortedLowHariIni.slice(0, 11), i => i.tonnaseHariIni, i => i.protasHariIni));
  isiTbody(tbodyLowSdHariIni, generateLowRows(sortedLowSdHi.slice(0, 11), i => i.tonnaseSdHi, i => i.protasSdHi));
  isiTbody(tbodyLowSdBulanIni, generateLowRows(sortedLowSdBulan.slice(0, 11), i => i.tonnaseSdBulan, i => i.protasSdBulan));

  const kelasPenc = (raw) => (raw >= 100 ? "penc-hijau" : (raw >= 80 ? "penc-oranye" : "penc-merah"));

  const generatePencRows = (dataItems, tema, totalWilayah, getAktual, getRkap, getPenc, getRaw) => {
    return dataItems.map((item, idx) => {
      const num = idx + 1;
      const rankVal = tema === "top" ? num : totalWilayah - idx;
      const kelasBaris = idx < 3 ? `baris-sorot-${tema}` : "";
      return `
        <tr class="${kelasBaris}">
          <td class="td-center">${num}</td>
          <td class="td-center">${item.regional}</td>
          <td class="td-center">${item.wilayah}</td>
          <td class="td-center">${item.tmRealFormatted}</td>
          <td class="td-center">${getAktual(item)}</td>
          <td class="td-center">${getRkap(item)}</td>
          <td class="td-center sel-penc ${kelasPenc(getRaw(item))}">${getPenc(item)}</td>
          <td class="td-center">${rankVal}</td>
        </tr>
      `;
    }).join("");
  };

  const rankHi = listWilayah.filter((w) => w.rawPencHi !== null);
  const rankSdHi = listWilayah.filter((w) => w.rawPencSdHi !== null);
  const rankSdBi = listWilayah.filter((w) => w.rawPencSdBi !== null);

  const topPencHi = [...rankHi].sort((a, b) => b.rawPencHi - a.rawPencHi);
  const topPencSdHi = [...rankSdHi].sort((a, b) => b.rawPencSdHi - a.rawPencSdHi);
  const topPencSdBi = [...rankSdBi].sort((a, b) => b.rawPencSdBi - a.rawPencSdBi);

  const lowPencHi = [...rankHi].sort((a, b) => a.rawPencHi - b.rawPencHi);
  const lowPencSdHi = [...rankSdHi].sort((a, b) => a.rawPencSdHi - b.rawPencSdHi);
  const lowPencSdBi = [...rankSdBi].sort((a, b) => a.rawPencSdBi - b.rawPencSdBi);

  const gHi = [i => i.tonnaseHariIni, i => i.rkapHi, i => i.pencHi, i => i.rawPencHi];
  const gSdHi = [i => i.tonnaseSdHi, i => i.rkapSdHi, i => i.pencSdHi, i => i.rawPencSdHi];
  const gSdBi = [i => i.tonnaseSdBulan, i => i.rkapSdBi, i => i.pencSdBi, i => i.rawPencSdBi];

  isiTbody(tbodyTopRightHi, generatePencRows(topPencHi.slice(0, 12), "top", rankHi.length, ...gHi));
  isiTbody(tbodyTopRightSdHi, generatePencRows(topPencSdHi.slice(0, 12), "top", rankSdHi.length, ...gSdHi));
  isiTbody(tbodyTopRightSdBi, generatePencRows(topPencSdBi.slice(0, 12), "top", rankSdBi.length, ...gSdBi));

  isiTbody(tbodyLowRightHi, generatePencRows(lowPencHi.slice(0, 11), "low", rankHi.length, ...gHi));
  isiTbody(tbodyLowRightSdHi, generatePencRows(lowPencSdHi.slice(0, 11), "low", rankSdHi.length, ...gSdHi));
  isiTbody(tbodyLowRight, generatePencRows(lowPencSdBi.slice(0, 11), "low", rankSdBi.length, ...gSdBi));

  const temaChart = warnaTema();

  const pluginLabelBatang = (formatter) => ({
    id: "label-batang",
    afterDatasetsDraw(chart) {
      const ctx = chart.ctx;
      ctx.save();
      ctx.fillStyle = temaChart.teks;
      ctx.font = fontCanvas(11, 700);
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      chart.getDatasetMeta(0).data.forEach((batang, j) => {
        const nilai = chart.data.datasets[0].data[j];
        if (nilai != null) {
          const teksNilai = formatter(nilai), lebar = ctx.measureText(teksNilai).width;
          ctx.fillText(teksNilai, Math.min(batang.x + 5, chart.width - lebar - 3), batang.y);   // tidak melewati tepi kanan
        }
      });
      ctx.restore();
    }
  });

  const pluginPemisah = () => ({
    id: "pemisah-grup",
    afterDatasetsDraw(chart) {
      const batang = chart.getDatasetMeta(0).data;
      if (batang.length < 6) return;
      const y = (batang[4].y + batang[5].y) / 2;
      const area = chart.chartArea;
      const ctx = chart.ctx;
      ctx.save();
      ctx.strokeStyle = temaChart.teks;
      ctx.globalAlpha = 0.45;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(area.left, y);
      ctx.lineTo(area.right, y);
      ctx.stroke();
      ctx.restore();
    }
  });

  const pluginGarisTarget = (target) => ({
    id: "garis-target",
    afterDatasetsDraw(chart) {
      const sumbuX = chart.scales.x;
      const area = chart.chartArea;
      if (target < sumbuX.min || target > sumbuX.max) return;
      const x = sumbuX.getPixelForValue(target);
      const ctx = chart.ctx;
      ctx.save();
      ctx.strokeStyle = temaChart.teks;
      ctx.globalAlpha = 0.6;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(x, area.top);
      ctx.lineTo(x, area.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = temaChart.teks;
      ctx.font = fontCanvas(11, 700);
      ctx.textAlign = "center";
      const lebarT = ctx.measureText(target + "%").width;
      ctx.fillText(target + "%", Math.min(Math.max(x, lebarT / 2 + 3), chart.width - lebarT / 2 - 3), Math.max(area.top - 4, 12));
      ctx.restore();
    }
  });

  const susunRingkas = (daftarTop, daftarLow, rankTerendah) => [
    ...daftarTop.slice(0, 5).map((it, j) => ({ it, grup: "top", urut: j, label: `${j + 1}. ${it.regional} - ${it.wilayah}` })),
    ...daftarLow.slice(0, 5).map((it, j) => ({ it, grup: "low", urut: j, label: `${rankTerendah - j}. ${it.regional} - ${it.wilayah}` }))
  ];

  const gambarChartRingkas = (id, daftar, getNilai, getWarna, formatter, pluginTambahan = [], tanpaPemisah = false) => {
    if (!el(id)) return;
    buatChart(id, {
      type: "bar",
      plugins: [pluginLabelBatang(formatter), ...(tanpaPemisah ? [] : [pluginPemisah()]), ...pluginTambahan],
      data: {
        labels: daftar.map((d) => d.label),
        datasets: [{
          data: daftar.map((d) => getNilai(d.it)),
          backgroundColor: function(context) {
            const { ctx, chartArea } = context.chart;
            if (!chartArea) return '#2f5fe3';

            const d = daftar[context.dataIndex];
            const warnaObj = getWarna(d);

            const gradient = ctx.createLinearGradient(chartArea.left, 0, chartArea.right, 0);

            if (typeof warnaObj === 'object' && warnaObj.start && warnaObj.end) {
              gradient.addColorStop(0, warnaObj.start);
              gradient.addColorStop(1, warnaObj.end);
              return gradient;
            } else if (typeof warnaObj === 'string') {
              gradient.addColorStop(0, warnaObj);
              gradient.addColorStop(1, warnaObj);
              return gradient;
            }
            return '#2f5fe3';
          },
          borderRadius: 3,
          maxBarThickness: 14
        }]
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 18, right: 16 } },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => formatter(c.parsed.x) } }
        },
        scales: {
          x: { beginAtZero: true, grace: "26%", ticks: { color: temaChart.teks, font: fontGrafik(10.5), maxTicksLimit: 6 }, grid: { color: temaChart.grid } },
          y: { ticks: { color: temaChart.teks, font: fontGrafik(11.5), autoSkip: false }, grid: { display: false } }
        }
      }
    });
  };

  const gambarChartDuaHalaman = (id, ...argumen) => {
    gambarChartRingkas(id, ...argumen);
    gambarChartRingkas(id + "Mon", ...argumen);
  };

  // Seperti gambarChartDuaHalaman, tetapi grafik "Mon" memakai daftar yang sudah difilter regional
  const gambarChartRegional = (id, daftarPenuh, daftarMon, ...argumen) => {
    gambarChartRingkas(id, daftarPenuh, ...argumen);
    gambarChartRingkas(id + "Mon", daftarMon, ...argumen);
  };

  const warnaProtas = (d) => {
    if (d.grup === "top") {
      return d.urut < 3 
        ? { start: "#1d4ed8", end: "#60a5fa" }
        : { start: "rgba(29, 78, 216, 0.4)", end: "rgba(96, 165, 250, 0.6)" };
    } else {
      return d.urut < 3 
        ? { start: "#b91c1c", end: "#f87171" }
        : { start: "rgba(185, 28, 28, 0.4)", end: "rgba(248, 113, 113, 0.6)" };
    }
  };
  const fmtProtasChart = (v) => fmtProd(v);

  gambarChartDuaHalaman("chPtHi", susunRingkas(sortedTopHariIni, sortedLowHariIni, 23), (i) => i.rawProtasHariIni, warnaProtas, fmtProtasChart);
  gambarChartDuaHalaman("chPtSdHi", susunRingkas(sortedTopSdHi, sortedLowSdHi, 23), (i) => i.rawProtasSdHi, warnaProtas, fmtProtasChart);
  gambarChartDuaHalaman("chPtSdBi", susunRingkas(sortedTopSdBulan, sortedLowSdBulan, 23), (i) => i.rawProtasSdBulan, warnaProtas, fmtProtasChart);

  const warnaPencChart = (nilai) => {
    if (nilai >= 100) {
      return { start: "#047857", end: "#34d399" };
    } else if (nilai >= 80) {
      return { start: "#b45309", end: "#fbbf24" };
    } else {
      return { start: "#b91c1c", end: "#f87171" };
    }
  };
  const fmtPencChart = (v) => fmtPenc(v) + "%";
  const garis100 = [pluginGarisTarget(100)];

  gambarChartDuaHalaman("chTnHi", susunRingkas(topPencHi, lowPencHi, rankHi.length), (i) => i.rawPencHi, (d) => warnaPencChart(d.it.rawPencHi), fmtPencChart, garis100);
  gambarChartDuaHalaman("chTnSdHi", susunRingkas(topPencSdHi, lowPencSdHi, rankSdHi.length), (i) => i.rawPencSdHi, (d) => warnaPencChart(d.it.rawPencSdHi), fmtPencChart, garis100);
  gambarChartDuaHalaman("chTnSdBi", susunRingkas(topPencSdBi, lowPencSdBi, rankSdBi.length), (i) => i.rawPencSdBi, (d) => warnaPencChart(d.it.rawPencSdBi), fmtPencChart, garis100);

  // ===== Halaman Grafik Laporan Per Regional (kiri: Produktivitas, kanan: Pencapaian) =====
  const fmtPctExcel = (v) => Number(v).toFixed(2).replace(".", ",") + "%";   // sama dengan format Excel 0.00%
  // Warna grafik kiri (persen RKAP Tonnase): tertinggi hijau, terendah merah
  const HIJAU_KUAT = { start: "#047857", end: "#34d399" }, HIJAU_PUCAT = { start: "rgba(4, 120, 87, 0.4)", end: "rgba(52, 211, 153, 0.6)" };
  const MERAH_KUAT = { start: "#b91c1c", end: "#f87171" }, MERAH_PUCAT = { start: "rgba(185, 28, 28, 0.4)", end: "rgba(248, 113, 113, 0.6)" };
  // Per CRO (satu daftar urut): 3 teratas hijau tua, 3 terbawah merah, sisanya hijau pucat
  const warnaTertinggiHijauCro = (d) => (d.n && d.urut >= d.n - 3 && d.urut >= 3) ? MERAH_KUAT : (d.urut < 3 ? HIJAU_KUAT : HIJAU_PUCAT);
  // Per Wilayah (5 tertinggi & 5 terendah)
  const warnaTertinggiHijauWil = (d) => d.grup === "top" ? (d.urut < 3 ? HIJAU_KUAT : HIJAU_PUCAT) : (d.urut < 3 ? MERAH_KUAT : MERAH_PUCAT);
  const urutTurun = (daftar, kunci) => [...daftar].sort((a, b) => b[kunci] - a[kunci]);
  const urutNaik = (daftar, kunci) => [...daftar].sort((a, b) => a[kunci] - b[kunci]);

  // Per CRO: seluruh baris Subtotal, urut tertinggi -> terendah (tanpa pemisah 5/5)
  const susunCroDari = (daftar, kunci) => urutTurun(daftar, kunci).map((it, j) => ({ it, grup: "top", urut: j, n: daftar.length, label: `${j + 1}. ${it.regional}` }));
  const susunCro = (kunci) => susunCroDari(listCro, kunci);
  const susunCroMon = (kunci) => susunCroDari(listCroMon, kunci);
  gambarChartRegional("chRgPtCroSdHi", susunCro("rgQ"), susunCroMon("rgQ"), (i) => i.rgQ, warnaTertinggiHijauCro, fmtPctExcel, [], true);
  gambarChartRegional("chRgPtCroSdBi", susunCro("rgR"), susunCroMon("rgR"), (i) => i.rgR, warnaTertinggiHijauCro, fmtPctExcel, [], true);
  gambarChartRegional("chRgTnCroSdHi", susunCro("rgX"), susunCroMon("rgX"), (i) => i.rgX, (d) => warnaPencChart(d.it.rgX), fmtPctExcel, garis100, true);
  gambarChartRegional("chRgTnCroSdBi", susunCro("rgY"), susunCroMon("rgY"), (i) => i.rgY, (d) => warnaPencChart(d.it.rgY), fmtPctExcel, garis100, true);

  // Per Wilayah: 5 tertinggi & 5 terendah
  const susunWil = (kunci) => susunRingkas(urutTurun(listWilayah, kunci), urutNaik(listWilayah, kunci), listWilayah.length);
  // Versi Monitoring: bila regional terpilih hanya punya <= 10 wilayah, tampilkan semuanya (tanpa baris ganda 5 tertinggi / 5 terendah)
  const semuaWilayahMon = filterMon !== "Semua" && listWilayahMon.length <= 10;
  const susunWilMon = (kunci) => {
    if (!semuaWilayahMon) return susunRingkas(urutTurun(listWilayahMon, kunci), urutNaik(listWilayahMon, kunci), listWilayahMon.length);
    const urut = urutTurun(listWilayahMon, kunci);
    return urut.map((it, j) => ({
      it, grup: j < 5 ? "top" : "low", urut: j < 5 ? j : urut.length - 1 - j,
      label: `${j + 1}. ${it.regional} - ${it.wilayah}`
    }));
  };
  gambarChartRegional("chRgPtWilSdHi", susunWil("rgQ"), susunWilMon("rgQ"), (i) => i.rgQ, warnaTertinggiHijauWil, fmtPctExcel);
  gambarChartRegional("chRgPtWilSdBi", susunWil("rgR"), susunWilMon("rgR"), (i) => i.rgR, warnaTertinggiHijauWil, fmtPctExcel);
  gambarChartRegional("chRgTnWilSdHi", susunWil("rgX"), susunWilMon("rgX"), (i) => i.rgX, (d) => warnaPencChart(d.it.rgX), fmtPctExcel, garis100);
  gambarChartRegional("chRgTnWilSdBi", susunWil("rgY"), susunWilMon("rgY"), (i) => i.rgY, (d) => warnaPencChart(d.it.rgY), fmtPctExcel, garis100);

  // Keterangan kecil di bawah judul grafik Per Wilayah (halaman Monitoring) ikut menyesuaikan
  ["chRgPtWilSdHiMon", "chRgPtWilSdBiMon", "chRgTnWilSdHiMon", "chRgTnWilSdBiMon"].forEach((id) => {
    const cv = el(id), kecil = cv && cv.closest(".blok-ringkas") && cv.closest(".blok-ringkas").querySelector("h4 small");
    if (!kecil) return;
    if (kecil.dataset.subAwal === undefined) kecil.dataset.subAwal = kecil.textContent;
    kecil.textContent = semuaWilayahMon
      ? `Seluruh wilayah ${filterMon} · ${listWilayahMon.length} wilayah · urut tertinggi → terendah `
      : kecil.dataset.subAwal;
  });
}

window.renderGrafikLaporanResmi = renderGrafikLaporanResmi;

function teksTanggalLaporan() {
  const inputTgl = el("pilihTanggalLaporan");
  if (!inputTgl || !inputTgl.value) return "";
  const [y, m, d] = inputTgl.value.split("-").map(Number);
  const namaHari = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const namaBulan = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  return `${namaHari[new Date(y, m - 1, d).getDay()]}, ${d} ${namaBulan[m - 1]} ${y}`;
}

function unduhPdfLaporan(idKontainer, namaFile) {
  const JsPDF = window.jspdf && window.jspdf.jsPDF;
  if (!JsPDF) { alert("Library PDF belum termuat. Periksa koneksi internet lalu coba lagi."); return; }

  const wadah = el(idKontainer);
  const semuaTabel = wadah ? [...wadah.querySelectorAll("table")] : [];
  const tabelAda = semuaTabel.filter((t) => t.querySelectorAll("tbody tr td.td-right, tbody tr td.sel-penc").length > 0);
  if (!tabelAda.length) { alert("Belum ada data. Silakan unggah file Excel Laporan Per Regional."); return; }

  const bacaTabel = (t) => {
    const tema = t.classList.contains("table-penc-low") ? "low" : "top";
    const h4 = t.closest(".tw") ? t.closest(".tw").previousElementSibling : null;
    const judulUtama = h4 ? h4.textContent.trim() : "";
    const barisHead = [...t.querySelectorAll("thead tr")];
    const subJudul = barisHead[0].textContent.trim();
    const kolom = Number(barisHead[0].children[0].getAttribute("colspan"));

    const sel = [];
    let kolBerjalan = 0;
    const grup = [];
    [...barisHead[1].children].forEach((th) => {
      const cs = Number(th.getAttribute("colspan") || 1);
      const rs = Number(th.getAttribute("rowspan") || 1);
      sel.push({ teks: th.textContent.trim(), kol: kolBerjalan, span: cs, baris: rs });
      if (cs > 1) grup.push({ kol: kolBerjalan, span: cs });
      kolBerjalan += cs;
    });
    let idxAnak = 0;
    [...barisHead[2].children].forEach((th) => {
      const g = grup[0];
      sel.push({ teks: th.textContent.trim(), kol: g.kol + idxAnak, span: 1, baris: 1, anak: true });
      idxAnak++;
    });

    const baris = [...t.querySelectorAll("tbody tr")].map((tr) => ({
      kelas: tr.className || "",
      sel: [...tr.children].map((td) => ({
        teks: td.textContent.trim(),
        kanan: td.classList.contains("td-right"),
        penc: td.classList.contains("penc-hijau") ? [15, 186, 130]
            : td.classList.contains("penc-oranye") ? [245, 158, 10]
            : td.classList.contains("penc-merah") ? [240, 69, 69] : null
      }))
    }));
    return { tema, judulUtama, subJudul, kolom, sel, baris };
  };

  const data = tabelAda.map(bacaTabel);

  const LEBAR = {
    7: [34, 70, 90, 80, 85, 78, 60],
    8: [34, 68, 80, 70, 65, 65, 55, 60]
  };

  const doc = new JsPDF({ unit: "pt", format: "a4" });
  const X0 = 41, BAR = 22, HH = 21, RH = 19;
  const tgl = teksTanggalLaporan();

  const garis = () => { doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.5); };
  const sel = (x, y, w, h, isi) => {
    garis();
    if (isi) { doc.setFillColor(isi[0], isi[1], isi[2]); doc.rect(x, y, w, h, "FD"); }
    else { doc.rect(x, y, w, h, "S"); }
  };
  const teksTengah = (teks, x, y, w, h, kanan) => {
    const baris = doc.splitTextToSize(String(teks), w - 8);
    const tinggiBaris = doc.getFontSize() * 1.15;
    let yy = y + h / 2 - ((baris.length - 1) * tinggiBaris) / 2 + doc.getFontSize() * 0.35;
    baris.forEach((b) => {
      if (kanan) doc.text(b, x + w - 7, yy, { align: "right" });
      else doc.text(b, x + w / 2, yy, { align: "center" });
      yy += tinggiBaris;
    });
  };

  const halaman = [];
  ["top", "low"].forEach((tema) => {
    const kel = data.filter((d) => d.tema === tema);
    for (let i = 0; i < kel.length; i += 2) halaman.push(kel.slice(i, i + 2));
  });

  halaman.forEach((tabelHalaman, nomorHalaman) => {
    if (nomorHalaman > 0) doc.addPage();
    const tema = tabelHalaman[0].tema;

    doc.setFont("helvetica", "bold");
    let ukuran = 16;
    doc.setFontSize(ukuran);
    while (doc.getTextWidth(tabelHalaman[0].judulUtama) > 520 && ukuran > 9) { ukuran -= 0.5; doc.setFontSize(ukuran); }
    if (tema === "top") doc.setTextColor(10, 54, 217); else doc.setTextColor(239, 68, 68);
    doc.text(tabelHalaman[0].judulUtama, 297.64, 38, { align: "center" });
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    if (tgl) doc.text(tgl, 297.64, 54, { align: "center" });

    let y = 66;
    tabelHalaman.forEach((tb) => {
      const lebar = LEBAR[tb.kolom];
      const total = lebar.reduce((a, b) => a + b, 0);
      const xKol = [];
      lebar.reduce((acc, w) => { xKol.push(X0 + acc); return acc + w; }, 0);

      sel(X0, y, total, BAR, [255, 245, 181]);
      doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(0, 0, 0);
      teksTengah(tb.subJudul, X0, y, total, BAR, false);
      y += BAR;

      doc.setFontSize(9.5);
      tb.sel.forEach((s) => {
        const x = xKol[s.kol];
        const w = lebar.slice(s.kol, s.kol + s.span).reduce((a, b) => a + b, 0);
        const yy = s.anak ? y + HH : y;
        const hh = s.baris === 2 ? HH * 2 : HH;
        sel(x, yy, w, hh, [199, 229, 201]);
        doc.setTextColor(0, 0, 0);
        teksTengah(s.teks, x, yy, w, hh, false);
      });
      y += HH * 2;

      tb.baris.forEach((br) => {
        const sorotTop = br.kelas.includes("baris-sorot-top");
        const sorotLow = br.kelas.includes("baris-sorot-low");
        br.sel.forEach((c, i) => {
          const isi = c.penc || (sorotTop || sorotLow ? [245, 245, 245] : [255, 255, 255]);
          sel(xKol[i], y, lebar[i], RH, isi);
          if (c.penc) { doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255); }
          else if (sorotTop) { doc.setFont("helvetica", "bold"); doc.setTextColor(0, 0, 255); }
          else if (sorotLow) { doc.setFont("helvetica", "bold"); doc.setTextColor(239, 68, 68); }
          else { doc.setFont("helvetica", "normal"); doc.setTextColor(0, 0, 0); }
          doc.setFontSize(9);
          teksTengah(c.teks, xKol[i], y, lebar[i], RH, c.kanan);
        });
        y += RH;
      });
      y += 26;
    });
  });

  const tglFile = (el("pilihTanggalLaporan") && el("pilihTanggalLaporan").value) || "";
  doc.save(`${namaFile}${tglFile ? "_" + tglFile : ""}.pdf`);
}

const btnPdfProtas = el("unduhPdfProtas");
if (btnPdfProtas) btnPdfProtas.onclick = () => unduhPdfLaporan("kontainerLaporanProtas", "Laporan_Protas");
const btnPdfTonnase = el("unduhPdfTonnase");
if (btnPdfTonnase) btnPdfTonnase.onclick = () => unduhPdfLaporan("kontainerLaporanTonnase", "Laporan_Tonnase");