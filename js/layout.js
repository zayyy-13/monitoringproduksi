/* =====================================================================
   layout.js — perilaku tampilan saja (tidak mengubah data/logika dashboard)
   1. Buka/tutup sidebar   2. Breadcrumb di topbar   3. Header kartu di setiap halaman
   Dimuat PALING AKHIR di Index.html.
   ===================================================================== */
(function () {
  "use strict";

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const simpan = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* abaikan */ } };
  const baca = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };

  /* ---------- 1. Sidebar ---------- */
  const body = document.body;
  const mobile = window.matchMedia("(max-width: 768px)");
  const tombolSidebar = $("#sidebarToggle");
  const latar = $("#sidebarBackdrop");

  function aturSidebar(buka) {
    if (mobile.matches) {
      body.classList.toggle("sidebar-open", buka);
    } else {
      body.classList.toggle("sidebar-collapsed", !buka);
      simpan("tbs_sidebar", buka ? "1" : "0");
    }
    if (tombolSidebar) tombolSidebar.setAttribute("aria-expanded", String(buka));
    setTimeout(() => window.dispatchEvent(new Event("resize")), 300);   // grafik menyesuaikan lebar
  }
  function sidebarTerbuka() {
    return mobile.matches ? body.classList.contains("sidebar-open") : !body.classList.contains("sidebar-collapsed");
  }

  if (!mobile.matches && baca("tbs_sidebar") === "0") body.classList.add("sidebar-collapsed");
  if (tombolSidebar) {
    tombolSidebar.setAttribute("aria-expanded", String(sidebarTerbuka()));
    tombolSidebar.addEventListener("click", () => aturSidebar(!sidebarTerbuka()));
  }
  if (latar) latar.addEventListener("click", () => aturSidebar(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && mobile.matches && sidebarTerbuka()) aturSidebar(false); });
  // Di layar kecil, menu menutup sendiri setelah memilih halaman
  $$(".sub-link[data-target]").forEach((l) => l.addEventListener("click", () => { if (mobile.matches) aturSidebar(false); }));
  mobile.addEventListener("change", () => {
    body.classList.remove("sidebar-open");
    if (tombolSidebar) tombolSidebar.setAttribute("aria-expanded", String(sidebarTerbuka()));
  });

  /* ---------- 2. Breadcrumb ---------- */
  const PETA = {
    halamanMonitoring:            ["Dashboard", "Monitoring Produksi"],
    halamanIndikatorPanen:        ["Dashboard", "Grafik Tren Indikator Panen"],
    halamanPerbarui:              ["Dashboard", "Perbarui Data"],
    halamanLaporanPerRegional:    ["Laporan Produksi", "Laporan Per Regional"],
    halamanGrafikLaporanRegional: ["Laporan Produksi", "Grafik Laporan Per Regional"],
    halamanPerbaruiLaporan:       ["Laporan Produksi", "Perbarui Data"],
    halamanLaporanPerKebun:       ["Laporan Produksi Kebun", "Laporan Per Kebun"],
    halamanGrafikLaporanKebun:    ["Laporan Produksi Kebun", "Grafik Laporan Per Kebun"],
    halamanPerbaruiKebun:         ["Laporan Produksi Kebun", "Perbarui Data"],
    halamanGrafikHistoris:        ["Historis & Proyeksi", "Grafik Laporan"],
    halamanPerbaruiHistoris:      ["Historis & Proyeksi", "Perbarui Data"]
  };
  function perbaruiCrumb() {
    const aktif = $$(".main-content > .page-section").find((s) => !s.hidden);
    const p = aktif && PETA[aktif.id];
    if (!p) return;
    $("#crumbGrup").textContent = p[0];
    $("#crumbHalaman").textContent = p[1];
  }
  const pengamat = new MutationObserver(perbaruiCrumb);
  $$(".page-section").forEach((s) => pengamat.observe(s, { attributes: true, attributeFilter: ["hidden"] }));
  perbaruiCrumb();

  /* ---------- 3. Header kartu di setiap halaman ---------- */
  function buatLayarPenuh() {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "hero-full";
    b.title = "Layar penuh";
    b.setAttribute("aria-label", "Layar penuh");
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
    b.addEventListener("click", () => {
      if (!document.fullscreenEnabled) return;
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => {});
    });
    return b;
  }

  /* Pasang header ke semua halaman */
  $$(".hero").forEach((hero) => {
    const kiri = hero.firstElementChild;
    if (kiri && !$(".hero-logo", hero)) {
      const logo = document.createElement("img");
      logo.className = "hero-logo";
      logo.src = "assets/logoo-.png";
      logo.alt = "";
      kiri.insertBefore(logo, kiri.firstChild);
    }
    const alat = document.createElement("div");
    alat.className = "hero-tools";
    const dropdown = $(".fl", hero);
    if (dropdown) alat.appendChild(dropdown);        // dipindah, bukan disalin: ID & event tetap utuh
    alat.appendChild(buatLayarPenuh());
    hero.appendChild(alat);
  });
})();