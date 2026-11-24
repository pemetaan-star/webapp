import { memo, useMemo, useState } from "react";
import { PanelHeading } from "@/app/components/dashboard";
import { displayPopulation } from "@/app/components/review-modals";
import type { Hotspot } from "@/app/components/dashboard-types";
import { workflowStageLabels, type WorkflowStage } from "@/lib/dashboard-summary";

const statusClass: Record<Hotspot["status"], string> = { Aktif: "status-good", Baru: "status-new", "Tidak aktif": "status-off", "Perlu verifikasi": "status-off" };

export const SubmissionTable = memo(function SubmissionTable({
  rows,
  isEnumerator,
  isAdmin,
  loading,
  canLoadMore,
  loadingMore,
  onLoadMore,
  deletingHotspotId,
  onView,
  onRevise,
  onDelete,
}: {
  rows: Hotspot[];
  isEnumerator: boolean;
  isAdmin: boolean;
  loading: boolean;
  canLoadMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  deletingHotspotId: string | null;
  onView: (hotspot: Hotspot) => void;
  onRevise: (hotspot: Hotspot) => void;
  onDelete: (hotspot: Hotspot) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"Semua" | WorkflowStage>("Semua");
  const filteredRows = useMemo(() => rows.filter((hotspot) => {
    const matchesQuery = Object.values(hotspot).join(" ").toLowerCase().includes(searchQuery.toLowerCase());
    return matchesQuery && (filter === "Semua" || hotspot.workflowStage === filter);
  }), [filter, rows, searchQuery]);
  const title = isEnumerator ? "Data Pendataan Saya" : "Data Survei & Pemeriksaan Kualitas";
  const subtitle = isEnumerator
    ? "Pantau hasil pemeriksaan dan catatan tindak lanjut data yang Anda kirim."
    : "Pilih data untuk melihat detail atau memeriksa kualitas data.";

  return <section className="panel table-panel">
    <div className="table-toolbar">
      <div><PanelHeading icon="list" title={title} subtitle={subtitle} /></div>
      <div className="table-controls">
        <div className="search-box"><span>⌕</span><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Cari nama / kelurahan..." /></div>
        <select value={filter} onChange={(event) => setFilter(event.target.value as "Semua" | WorkflowStage)} aria-label="Filter tahapan workflow">
          <option value="Semua">Semua tahapan</option>{Object.entries(workflowStageLabels).map(([stage, label]) => <option key={stage} value={stage}>{label}</option>)}
        </select>
      </div>
    </div>
    <div className="table-wrap"><table>
      <thead><tr><th>NAMA ENUMERATOR</th><th>TANGGAL</th><th>NAMA HOTSPOT</th><th>WILAYAH</th><th>POPULASI KUNCI</th><th>STATUS HOTSPOT</th><th>TAHAP WORKFLOW</th><th>AKSI</th></tr></thead>
      <tbody>{filteredRows.map((hotspot) => <tr key={hotspot.id} data-workflow-stage={hotspot.workflowStage} data-follow-up={hotspot.workflowStage === "coordinator_review" && hotspot.coordinatorReviewStatus === "Pending" ? "true" : undefined}>
        <td>{hotspot.enumeratorName || "Nama belum diatur"}</td><td>{hotspot.date}</td><td><strong>{hotspot.name}</strong></td><td>{hotspot.area}</td>
        <td>{displayPopulation(hotspot.population)}</td><td><span className={`status-badge ${statusClass[hotspot.status]}`}><i />{hotspot.status}</span></td>
        <td><span className="workflow-badge" data-stage={hotspot.workflowStage}>{workflowStageLabels[hotspot.workflowStage]}</span></td>
        <td><button className="row-action" onClick={() => onView(hotspot)} aria-label={`Lihat detail ${hotspot.name}`}>→</button>
          {isEnumerator && hotspot.workflowStage === "needs_revision" && <button type="button" className="row-action" onClick={() => onRevise(hotspot)} aria-label={`Perbaiki data ${hotspot.name}`} title="Perbaiki data">Revisi</button>}
          {isAdmin && <button type="button" className="row-action row-action-danger" onClick={() => onDelete(hotspot)} disabled={deletingHotspotId === hotspot.id} aria-label={`Hapus data ${hotspot.name}`}>{deletingHotspotId === hotspot.id ? "…" : "×"}</button>}
        </td>
      </tr>)}{filteredRows.length === 0 && <tr><td colSpan={8} className="empty-state">{loading ? "Memuat data terbaru..." : "Data tidak ditemukan."}</td></tr>}</tbody>
    </table></div>
    <div className="table-footer">
      <span>Menampilkan {filteredRows.length.toLocaleString("id-ID")} hasil</span>
      {canLoadMore
        ? <button type="button" className="button-link" onClick={onLoadMore} disabled={loadingMore}>{loadingMore ? "Memuat..." : "Muat data berikutnya"}</button>
        : null}
    </div>
  </section>;
});
