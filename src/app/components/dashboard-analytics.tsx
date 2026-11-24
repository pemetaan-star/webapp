"use client";

import { useState } from "react";
import { PanelHeading } from "@/app/components/dashboard";
import { DashboardIcon, type DashboardIconName } from "@/app/components/dashboard-icon";
import type { AnalyticsDistributionItem, AnalyticsVisitGroup, DashboardAnalyticsSummary, DashboardSummary } from "@/lib/dashboard-summary";

const categoryLabels: Record<string, string> = {
  aktif: "Aktif",
  baru: "Baru",
  tidak_aktif: "Tidak aktif",
  perlu_verifikasi: "Perlu verifikasi",
  valid: "Valid",
  pending: "Menunggu pemeriksaan",
  perlu_perbaikan: "Perlu perbaikan",
  perlu_klarifikasi: "Perlu klarifikasi",
  lama: "Lama",
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
  const formatted = value.replace(/_+/g, " ").replace(/\s+/g, " ").trim();
  return formatted ? `${formatted[0].toLocaleUpperCase("id-ID")}${formatted.slice(1)}` : "";
}

function normalizeDistribution(items: AnalyticsDistributionItem[]) {
  const counts = new Map<string, number>();
  items.forEach(({ label: rawLabel, count }) => {
    const label = categoryLabels[rawLabel.toLowerCase()] || formatCategory(rawLabel);
    if (label) counts.set(label, (counts.get(label) || 0) + count);
  });
  return [...counts.entries()].sort((first, second) => second[1] - first[1]);
}

const chartColors = ["#0b8f83", "#3e83df", "#e5ad44", "#e16c5b", "#8064c8", "#75869a"];
const visitLabels: Record<AnalyticsVisitGroup, string> = {
  visit1: "Kunjungan 1",
  visit2: "Kunjungan 2",
  later: "Kunjungan 3+",
};
const visitGroups: AnalyticsVisitGroup[] = ["visit1", "visit2", "later"];
const numberFormatter = new Intl.NumberFormat("id-ID");

function populationMetricClass(groupIndex: number, value: number) {
  const classes: string[] = [];
  if (groupIndex > 0) classes.push("analytics-visit-group-start");
  if (value === 0) classes.push("analytics-value-zero");
  return classes.join(" ") || undefined;
}

function DistributionPanel({ title, subtitle, icon, items, hotspotCount }: {
  title: string;
  subtitle: string;
  icon: DashboardIconName;
  items: Array<[string, number]>;
  hotspotCount: number;
}) {
  const chartItems = items.slice(0, 5);
  const remaining = items.slice(5).reduce((sum, [, count]) => sum + count, 0);
  if (remaining) chartItems.push(["Lainnya", remaining]);
  const maximumCount = Math.max(0, ...chartItems.map(([, count]) => count));
  const hasData = chartItems.some(([, count]) => count > 0);

  return <article className="panel analytics-panel min-w-0">
    <PanelHeading icon={icon} title={title} subtitle={subtitle} />
    {hasData ? <ul className="grid gap-3.5 py-0.5">
      {chartItems.map(([label, count], index) => {
        const share = hotspotCount ? Math.round((count / hotspotCount) * 100) : 0;
        const barWidth = maximumCount ? Math.max((count / maximumCount) * 100, count > 0 ? 2 : 0) : 0;
        const color = chartColors[index % chartColors.length];
        return <li key={`${label}-${index}`} className="grid min-w-0 gap-1.5">
          <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 truncate text-xs font-semibold text-slate-700">
              <i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
              {label}
            </span>
            <span className="flex shrink-0 items-baseline gap-2 text-xs">
              <strong className="font-semibold text-slate-800">{numberFormatter.format(count)}</strong>
              <small className="text-[11px] text-slate-500">{share}%</small>
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
            <span className="block h-full rounded-full transition-[width] duration-300" style={{ width: `${barWidth}%`, backgroundColor: color }} />
          </div>
        </li>;
      })}
    </ul> : <p className="analytics-empty">Belum ada data untuk ditampilkan.</p>}
  </article>;
}

function DistributionTable({ title, icon, items }: { title: string; icon: DashboardIconName; items: AnalyticsDistributionItem[] }) {
  const [showAll, setShowAll] = useState(false);
  const headingId = `analytics-table-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const visibleItems = title.startsWith("Kelurahan") && !showAll ? items.slice(0, 10) : items;

  return <article className="panel analytics-panel analytics-breakdown-panel">
    <PanelHeading icon={icon} title={title} subtitle={`${numberFormatter.format(items.reduce((total, item) => total + item.count, 0))} catatan`} level={4} headingId={headingId} />
    {items.length > 0 ? <div className="analytics-table-scroll">
      <table className="analytics-breakdown-table" aria-labelledby={headingId}>
        <caption className="visually-hidden">{title}</caption>
        <thead><tr><th scope="col">Kategori</th><th scope="col">Jumlah</th></tr></thead>
        <tbody>{visibleItems.map((item) => {
          const label = categoryLabels[item.label.toLowerCase()] || formatCategory(item.label);
          return <tr key={item.label}><th scope="row">{title.startsWith("Kelurahan") ? `Kel. ${label}` : label}</th><td>{numberFormatter.format(item.count)}</td></tr>;
        })}</tbody>
      </table>
      {title.startsWith("Kelurahan") && items.length > 10 && <button type="button" className="analytics-show-all" aria-expanded={showAll} onClick={() => setShowAll((value) => !value)}>{showAll ? "Tampilkan 10 teratas" : `Lihat semua (${items.length})`}</button>}
    </div> : <p className="analytics-empty">Belum ada data untuk kunjungan ini.</p>}
  </article>;
}

function PopulationKeyTable({ analytics }: { analytics: DashboardAnalyticsSummary }) {
  const groups = analytics.visits.later.total > 0 ? visitGroups : visitGroups.slice(0, 2);

  return <article className="panel analytics-panel analytics-population-panel">
    <PanelHeading icon="people" title="Populasi kunci per kunjungan" subtitle="Jumlah KD, estimasi populasi, dan jumlah populasi yang diedukasi" level={3} headingId="population-key-table-heading" />
    {analytics.populationKeys.length > 0 ? <>
      <div className="analytics-table-scroll">
        <table className="analytics-population-table" aria-labelledby="population-key-table-heading">
          <caption className="visually-hidden">Jumlah KD, estimasi populasi, dan jumlah diedukasi per populasi kunci dan kunjungan</caption>
          <colgroup><col /></colgroup>{groups.map((group) => <colgroup key={group}><col span={3} /></colgroup>)}
          <thead>
            <tr>
              <th scope="col" rowSpan={2}>Populasi kunci</th>
              {groups.map((group, groupIndex) => <th key={group} scope="colgroup" colSpan={3} className={groupIndex > 0 ? "analytics-visit-group-start" : undefined}>{visitLabels[group]}</th>)}
            </tr>
            <tr>{groups.flatMap((group, groupIndex) => [
              <th key={`${group}-kd`} scope="col" className={groupIndex > 0 ? "analytics-visit-group-start" : undefined}>Jumlah KD</th>,
              <th key={`${group}-estimate`} scope="col">Estimasi populasi</th>,
              <th key={`${group}-educated`} scope="col">Diedukasi</th>,
            ])}</tr>
          </thead>
          <tbody>{analytics.populationKeys.map(({ key, visits }) => <tr key={key}>
            <th scope="row">{categoryLabels[key.toLowerCase()] || formatCategory(key)}</th>
            {groups.flatMap((group, groupIndex) => {
              const metrics = visits[group];
              return [
                <td key={`${group}-kd`} className={populationMetricClass(groupIndex, metrics.kdCount)}>{numberFormatter.format(metrics.kdCount)}</td>,
                <td key={`${group}-estimate`} className={populationMetricClass(groupIndex, metrics.estimatedPopulation)}>{numberFormatter.format(metrics.estimatedPopulation)}</td>,
                <td key={`${group}-educated`} className={populationMetricClass(groupIndex, metrics.educated)}>{numberFormatter.format(metrics.educated)}</td>,
              ];
            })}
          </tr>)}</tbody>
        </table>
      </div>
      <p className="analytics-table-note">Jumlah KD dihitung dari catatan kunjungan. Jika satu catatan memilih beberapa populasi kunci, catatan dan estimasinya masuk ke setiap kategori tersebut.</p>
    </> : <p className="analytics-empty">Belum ada data populasi kunci.</p>}
  </article>;
}

export function DashboardAnalytics({ summary, canLoadMore, onLoadMore, loading }: {
  summary: DashboardSummary | null;
  canLoadMore: boolean;
  onLoadMore: () => void;
  loading: boolean;
}) {
  const [selectedVisit, setSelectedVisit] = useState<AnalyticsVisitGroup>("visit1");
  const analytics = summary?.analytics;
  const hotspotSummary = analytics?.hotspots;
  const hotspotCount = hotspotSummary?.total || 0;
  const statusItems = hotspotSummary ? normalizeDistribution(hotspotSummary.hotspotStatuses) : [];
  const areas = hotspotSummary ? normalizeDistribution(hotspotSummary.kecamatans) : [];
  const locations = hotspotSummary ? normalizeDistribution(hotspotSummary.locationTypes) : [];
  const populations = hotspotSummary ? normalizeDistribution(hotspotSummary.populationKeys) : [];
  const qcItems = hotspotSummary ? normalizeDistribution(hotspotSummary.qcStatuses) : [];
  const visitFrequencyItems: Array<[string, number]> = hotspotSummary ? [
    ["1 kali", hotspotSummary.visitFrequency.once],
    ["Tepat 2 kali", hotspotSummary.visitFrequency.twice],
    ["3 kali atau lebih", hotspotSummary.visitFrequency.threeOrMore],
  ] : [];
  const activeVisit = selectedVisit === "later" && analytics?.visits.later.total === 0 ? "visit1" : selectedVisit;
  const selectedVisitSummary = analytics?.visits[activeVisit];

  return <section className="grid gap-4" aria-label="Analitik data hotspot">
    <div className="flex flex-col gap-3 rounded-2xl border border-teal-100 bg-gradient-to-r from-teal-50/80 to-white px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="eyebrow">Analitik data lapangan</p>
        <h2 className="mb-1.5 text-lg font-bold text-slate-900">Ringkasan dan sebaran hotspot</h2>
        <p className="max-w-3xl text-xs leading-relaxed text-slate-600">Grafik umum menghitung hotspot unik berdasarkan kode dan memakai data kunjungan terbaru. Analitik per kunjungan tetap membandingkan setiap catatan; peta hanya menampilkan catatan yang dimuat.</p>
      </div>
    </div>
    {hotspotSummary && <section className="grid gap-3 md:grid-cols-2" aria-label="Ringkasan hotspot unik">
      <article className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 px-4 py-4 shadow-sm">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700"><DashboardIcon name="mapPin" className="h-5 w-5" /></span>
        <div className="grid gap-0.5"><small className="text-[.59rem] font-bold tracking-[.12em] text-slate-500">HOTSPOT UNIK</small><strong className="text-2xl leading-none font-bold text-slate-900">{numberFormatter.format(hotspotCount)}</strong><span className="text-xs text-slate-500">Dihitung satu kali per kode hotspot</span></div>
      </article>
      <article className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-gradient-to-br from-white to-blue-50/60 px-4 py-4 shadow-sm">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><DashboardIcon name="activity" className="h-5 w-5" /></span>
        <div className="grid gap-0.5"><small className="text-[.59rem] font-bold tracking-[.12em] text-slate-500">KUNJUNGAN ULANG</small><strong className="text-2xl leading-none font-bold text-slate-900">{numberFormatter.format(hotspotSummary.visitFrequency.repeated)}</strong><span className="text-xs text-slate-500">Hotspot dengan 2 kunjungan atau lebih</span></div>
      </article>
    </section>}
    {hotspotSummary && hotspotSummary.missingCodeVisits > 0 && <p className="dashboard-summary-error" role="status">
      {numberFormatter.format(hotspotSummary.missingCodeVisits)} catatan kunjungan tanpa kode hotspot belum dapat dihitung sebagai hotspot unik. Lengkapi atau tautkan kodenya untuk hasil yang akurat.
    </p>}
    {summary ? <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <DistributionPanel icon="status" title="Status hotspot unik" subtitle="Status pada kunjungan terbaru" items={statusItems} hotspotCount={hotspotCount} />
      <DistributionPanel icon="shieldCheck" title="Kualitas data hotspot unik" subtitle="Status QC pada kunjungan terbaru" items={qcItems} hotspotCount={hotspotCount} />
      <DistributionPanel icon="mapPin" title="Sebaran kecamatan hotspot unik" subtitle="Kecamatan pada kunjungan terbaru" items={areas} hotspotCount={hotspotCount} />
      <DistributionPanel icon="people" title="Populasi kunci hotspot unik" subtitle="Kategori dapat tumpang tindih; persentase berdasarkan total hotspot" items={populations} hotspotCount={hotspotCount} />
      <DistributionPanel icon="building" title="Tipe lokasi hotspot unik" subtitle="Tipe lokasi pada kunjungan terbaru" items={locations} hotspotCount={hotspotCount} />
      <DistributionPanel
        icon="activity"
        title="Frekuensi kunjungan per hotspot"
        subtitle="Jumlah hotspot menurut frekuensi kunjungan"
        items={visitFrequencyItems}
        hotspotCount={hotspotCount}
      />
    </div> : <p className="analytics-empty" role="status">{loading ? "Memuat grafik seluruh data…" : "Grafik seluruh data tidak tersedia."}</p>}
    {analytics ? <section className="analytics-details" aria-label="Analitik lengkap seluruh kunjungan">
      <PopulationKeyTable analytics={analytics} />
      <article className="panel analytics-panel">
        <div className="analytics-detail-heading"><div><p className="eyebrow">Perbandingan wilayah dan hotspot</p><h3>Analitik per kunjungan</h3></div></div>
        <div className="analytics-visit-selector" role="group" aria-label="Pilih jenis kunjungan">
          {visitGroups.filter((group) => group !== "later" || analytics.visits.later.total > 0).map((group) => <button key={group} type="button" aria-pressed={activeVisit === group} className={activeVisit === group ? "is-active" : ""} onClick={() => setSelectedVisit(group)}>{visitLabels[group]} <span>{numberFormatter.format(analytics.visits[group].total)} catatan</span></button>)}
        </div>
        {selectedVisitSummary && <div className="analytics-breakdown-grid">
          <DistributionTable icon="status" title="Status hotspot per kunjungan" items={selectedVisitSummary.hotspotStatuses} />
          <DistributionTable icon="building" title="Tipe lokasi utama per kunjungan" items={selectedVisitSummary.locationTypes} />
          <DistributionTable icon="tag" title="Sub-tipe lokasi per kunjungan" items={selectedVisitSummary.locationSubtypes} />
          <DistributionTable icon="district" title="Kecamatan per kunjungan" items={selectedVisitSummary.kecamatans} />
          <DistributionTable icon="neighborhood" title="Kelurahan per kunjungan" items={selectedVisitSummary.kelurahans} />
        </div>}
      </article>
    </section> : <p className="analytics-empty" role="status">{loading ? "Memuat ringkasan seluruh data…" : "Ringkasan analitik belum tersedia."}</p>}
    {canLoadMore && <div className="analytics-load-more"><p>Grafik sudah mencakup seluruh data. Muat halaman berikutnya untuk menambah titik pada peta.</p><button type="button" className="button button-secondary" onClick={onLoadMore}>Muat titik peta berikutnya</button></div>}
  </section>;
}
