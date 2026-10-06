"use client";

import { PanelHeading } from "@/app/components/dashboard";

type AnalyticsRow = {
  id: string;
  area: string;
  population: string;
  status: string;
  qc: string;
  locationType?: string;
  locationSubtype?: string;
};

const categoryLabels: Record<string, string> = {
  aktif: "Aktif",
  baru: "Baru",
  tidak_aktif: "Tidak aktif",
  perlu_verifikasi: "Perlu verifikasi",
  valid: "Valid",
  pending: "Menunggu pemeriksaan",
  perlu_perbaikan: "Perlu perbaikan",
  lsl: "LSL",
  transgender: "Transgender",
  idu: "IDU / PWID",
  pspl___tl__pekerja_seks_perempuan: "PSPL / TL",
  ruang_publik: "Ruang publik",
  tempat_makan_hiburan: "Tempat makan / hiburan",
  akomodasi_private: "Akomodasi / private venue",
  perawatan_kebugaran: "Perawatan / kebugaran",
  platform_virtual: "Platform virtual",
};

function formatCategory(value: string) {
  return value.replace(/_+/g, " ").replace(/\s+/g, " ").trim();
}

function summarize(rows: AnalyticsRow[], getCategory: (row: AnalyticsRow) => string[]) {
  const counts = new Map<string, number>();
  rows.forEach((row) => getCategory(row).forEach((category) => {
    const label = categoryLabels[category.toLowerCase()] || formatCategory(category);
    if (label) counts.set(label, (counts.get(label) || 0) + 1);
  }));
  return [...counts.entries()].sort((first, second) => second[1] - first[1]);
}

function DistributionPanel({ title, subtitle, icon, items, total }: { title: string; subtitle: string; icon: string; items: Array<[string, number]>; total: number }) {
  const max = Math.max(1, ...items.map(([, count]) => count));
  return <article className="panel analytics-panel">
    <PanelHeading icon={icon} title={title} subtitle={subtitle} />
    {items.length ? <div className="analytics-bars">{items.slice(0, 6).map(([label, count], index) => <div className="analytics-bar-row" key={label}>
      <div><span>{label}</span><strong>{count}<small>{total ? ` · ${Math.round((count / total) * 100)}%` : ""}</small></strong></div>
      <i className={`analytics-bar analytics-bar-${index % 4}`} style={{ width: `${Math.max(4, (count / max) * 100)}%` }} />
    </div>)}</div> : <p className="analytics-empty">Belum ada data untuk ditampilkan.</p>}
  </article>;
}

export function DashboardAnalytics({ rows, canLoadMore, onLoadMore }: { rows: AnalyticsRow[]; canLoadMore: boolean; onLoadMore: () => void }) {
  const statusItems = summarize(rows, (row) => [row.status]);
  const qcItems = summarize(rows, (row) => [row.qc]);
  const areas = summarize(rows, (row) => [row.area.split("/")[0].trim()]);
  const populations = summarize(rows, (row) => row.population.split(",").map((value) => value.trim()).filter(Boolean));
  const locations = summarize(rows, (row) => [row.locationType || row.locationSubtype || "Belum diisi"]);

  return <section className="analytics-view" aria-label="Analitik data hotspot">
    <div className="analytics-intro">
      <div><p className="eyebrow">Analitik data lapangan</p><h2>Ringkasan dan sebaran hotspot</h2><p>Distribusi status, kualitas data, wilayah, populasi kunci, dan tipe lokasi.</p></div>
      <span className="analytics-scope">{rows.length} data dimuat</span>
    </div>
    <div className="analytics-grid">
      <DistributionPanel icon="◉" title="Status hotspot" subtitle="Komposisi status pendataan" items={statusItems} total={rows.length} />
      <DistributionPanel icon="✓" title="Kualitas data" subtitle="Status pemeriksaan kualitas" items={qcItems} total={rows.length} />
      <DistributionPanel icon="⌖" title="Sebaran wilayah" subtitle="Jumlah data per kecamatan" items={areas} total={rows.length} />
      <DistributionPanel icon="◎" title="Populasi kunci" subtitle="Kategori yang tercatat pada data" items={populations} total={rows.length} />
      <DistributionPanel icon="▦" title="Tipe lokasi" subtitle="Lokasi hotspot yang dipetakan" items={locations} total={rows.length} />
    </div>
    {canLoadMore && <div className="analytics-load-more"><p>Analitik menggunakan data yang sudah dimuat. Muat halaman data berikutnya untuk memperluas cakupan.</p><button type="button" className="button button-secondary" onClick={onLoadMore}>Muat data berikutnya</button></div>}
  </section>;
}
