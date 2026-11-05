/* =====================================================================
   Pembaca file Excel Laporan_Bulanan_PerRegional_2026.xlsx
   Input : isi tiap tab sebagai array baris (hasil XLSX.utils.sheet_to_json header:1)
   Output: { wilayah, indikator } siap dipakai dashboard
   Semua angka diambil dari nilai sel asli, jadi tidak terpengaruh format
   tampilan (titik/koma) di Excel atau Google Sheets.
   ===================================================================== */
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

  // Peta { Jan: indeksKolom, ... } dari baris judul (dicari di 10 baris pertama)
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

  // Nilai per bulan (sebanyak n bulan) untuk satu baris
  function seri(aoa, label, n, akhiran = "") {
    const peta = kolomBulan(aoa, akhiran);
    const baris = barisBernama(aoa, label);
    return BULAN.slice(0, n).map((b) => angka(baris[peta[b]]));
  }

  // Jumlah bulan yang sudah berisi data (dilihat dari GRAND TOTAL produksi)
  function hitungBulan(aoa) {
    const peta = kolomBulan(aoa);
    const total = barisBernama(aoa, "GRAND TOTAL");
    let n = 0;
    BULAN.forEach((b, i) => { if (peta[b] !== undefined && angka(total[peta[b]]) > 0) n = i + 1; });
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
    const m = n - 1;                      // bulan terakhir belum penuh → tidak dipakai
    const hasil = {};
    ENTITAS.forEach(([kunci, label]) => {
      const ambil = (nama, akhiran) => seri(tab[nama], label, m, akhiran);
      const kg = ambil("KG Panen"), jj = ambil("Janjang TBS"), hk = ambil("Jumlah HK Kerja");
      const lp = ambil("Luas Panen"), rs = ambil("Restan"), prod = ambil("Produksi TBS");
      const bjr = ambil("BJR"), jp = ambil("Janjang Per Pokok");
      const outKg = ambil("Output Panen", " Kg/HK"), outHa = ambil("Output Panen", " Ha/HK");
      const brKg = ambil("Brondolan", " (Kg)"), brPct = ambil("Brondolan", " (%)").map((x) => x * 100);
      const restan = rs.map((x, i) => (prod[i] ? (x / prod[i]) * 100 : 0));
      const kosong = rs.every((x) => Math.abs(x) < 1e-9);   // restan 0 semua bulan = tanpa data
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

  function baca(tab) {
    TAB.forEach((nama) => { if (!tab[nama]) throw new Error(`Tab "${nama}" tidak ditemukan`); });
    const n = hitungBulan(tab["Produksi TBS"]);
    if (n < 2) throw new Error("Data bulanan belum cukup");
    return { wilayah: bacaWilayah(tab["Produksi TBS"], n), indikator: bacaIndikator(tab, n) };
  }

  return { baca, TAB };
})();
if (typeof module !== "undefined") module.exports = ExcelLoader;