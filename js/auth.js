/* =====================================================================
   auth.js — login sisi-browser untuk Dashboard Produksi TBS
   CATATAN KEAMANAN: login ini hanya pembatas tampilan. Semua file (termasuk
   data) tetap bisa dibuka orang yang mengakses folder/servernya. Untuk
   perlindungan sungguhan, pasang login di sisi server (hosting).
   ===================================================================== */
const Auth = (() => {
  const HALAMAN_LOGIN = "login.html";
  const HALAMAN_UTAMA = "index.html";
  const KUNCI = "tbs_login";
  const MASA_INGAT_MS = 7 * 24 * 60 * 60 * 1000;   // "Ingat saya" berlaku 7 hari

  // Daftar pengguna: nama -> hash SHA-256 dari "nama:kata-sandi".
  // Akun awal:  Produksi2026 /  Tanaman@2026  (SEGERA GANTI)
  // Cara membuat hash baru: buka login.html, tekan F12 > Console, lalu ketik:
  //   Auth.buatHash("namaAnda", "sandiBaru").then(console.log)
  const PENGGUNA = {
    admin: "067c12c56cabade81b49a248849af30d3e5a494eeb29faccdf7dd87bfc0904b2",
  };

  async function buatHash(nama, sandi) {
    const data = new TextEncoder().encode(nama.trim().toLowerCase() + ":" + sandi);
    const buf = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function sesi() {
    try {
      const mentah = sessionStorage.getItem(KUNCI) || localStorage.getItem(KUNCI);
      const s = JSON.parse(mentah || "null");
      return s && Date.now() - s.waktu < MASA_INGAT_MS ? s : null;
    } catch (e) { return null; }
  }

  async function masuk(nama, sandi, ingat) {
    const n = nama.trim().toLowerCase();
    const cocok = Object.prototype.hasOwnProperty.call(PENGGUNA, n) && PENGGUNA[n] === (await buatHash(n, sandi));
    if (!cocok) return false;
    const data = JSON.stringify({ nama: n, waktu: Date.now() });
    try { (ingat ? localStorage : sessionStorage).setItem(KUNCI, data); } catch (e) { /* abaikan */ }
    return true;
  }

  function keluar() {
    try { sessionStorage.removeItem(KUNCI); localStorage.removeItem(KUNCI); } catch (e) { /* abaikan */ }
    location.replace(HALAMAN_LOGIN);
  }

  // Dipanggil di <head> halaman yang dilindungi
  function lindungi() {
    if (!sesi()) location.replace(HALAMAN_LOGIN);
  }

  return { masuk, keluar, lindungi, buatHash, sudahMasuk: () => !!sesi(), HALAMAN_UTAMA };
})();