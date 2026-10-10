"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";

type ReviewHotspot = {
  id: string;
  name: string;
  hotspotCode?: string;
  area: string;
  status: string;
  population: string;
  coordinates?: string;
  enumeratorName?: string;
  enumeratorUsername?: string;
  organisasi?: string;
  address?: string;
  locationType?: string;
  locationSubtype?: string;
  activityTime?: string;
  populationEstimate?: number;
  educated?: number;
  notes?: string;
  informationSource?: string;
  informantPhone?: string;
  activityDescription?: string;
  mappingCondition?: string;
  documents?: Array<{ name: string; fileId?: string; url?: string }>;
  documentName?: string;
  documentFileId?: string;
  qc?: string;
  workflowStage?: string;
  qcKelengkapan?: string;
  qcDuplikasi?: string;
  qcKroscek?: string;
  qcNote?: string;
  qcInspector?: string;
  qcDate?: string;
  coordinatorReviewStatus?: string;
  coordinatorReviewNote?: string;
  coordinatorReviewKelengkapan?: string;
  coordinatorReviewDuplikasi?: string;
  coordinatorReviewKroscek?: string;
  coordinatorReviewerName?: string;
  coordinatorReviewDate?: string;
  createdAt?: string;
  workflowHistory?: Array<{
    stage: string;
    role: string;
    uid: string;
    actorName?: string;
    at: string;
    note?: string;
  }>;
};

type QcPayload = {
  status: "Valid" | "Pending" | "Perlu perbaikan";
  note: string;
  kelengkapan: string;
  duplikasi: string;
  kroscek: string;
  pemeriksa: string;
  tanggal: string;
  document?: File;
};

export type AiQcSuggestion = {
  status: QcPayload["status"];
  kelengkapan: "lengkap" | "perlu_perbaikan";
  duplikasi: "tidak_ada" | "ada";
  kroscek: "sesuai" | "perlu_klarifikasi";
  note: string;
  alasan: string;
  pemeriksaanSop: Array<{
    kriteria: string;
    hasil: "sesuai" | "perlu_perbaikan" | "perlu_verifikasi";
    bukti: string;
  }>;
};

const workflowStageLabels: Record<string, string> = {
  submitted: "Menunggu supervisi Koordinator",
  coordinator_review: "Supervisi Koordinator",
  awaiting_enumerator_signature: "Menunggu tanda tangan Enumerator",
  awaiting_coordinator_completion: "Menunggu penyelesaian Koordinator",
  analyst_review: "Pemeriksaan data analis",
  finalized: "Database final",
  needs_revision: "Perlu perbaikan",
};
const suggestionResultLabels: Record<AiQcSuggestion["pemeriksaanSop"][number]["hasil"], string> = {
  sesuai: "Sesuai",
  perlu_perbaikan: "Perlu perbaikan",
  perlu_verifikasi: "Perlu verifikasi",
};
const populationLabels: Record<string, string> = {
  lsl: "LSL",
  transgender: "Transgender",
  idu: "IDU / PWID",
  pspl___tl__pekerja_seks_perempuan: "PSPL / TL",
};
const locationTypeLabels: Record<string, string> = {
  ruang_publik: "Ruang Publik / Area Terbuka / Jalanan",
  tempat_makan_hiburan: "Tempat Makan / Nongkrong / Hiburan",
  akomodasi_private: "Akomodasi / Private Venue",
  perawatan_kebugaran: "Perawatan & Kebugaran",
  platform_virtual: "Platform Virtual / Online",
  lainnya: "Lainnya",
};
const locationSubtypeLabels: Record<string, string> = {
  jalanan_mangkal: "Jalanan / Titik Mangkal",
  taman_kota: "Taman Kota / Alun-Alun / Halaman",
  stasiun_terminal: "Stasiun / Terminal / Halte",
  mall: "Mall",
  makam: "Makam",
  bangunan_kosong: "Bangunan Kosong / Mangkrak",
  ruang_publik_lainnya: "Lainnya",
  warung_makan: "Warung Kopi / Warung Makan",
  kafe_restoran: "Kafe / Restoran",
  bar_club: "Bar / Club / Diskotik",
  karaoke: "Karaoke (Hall / Room)",
  tempat_makan_lainnya: "Lainnya",
  kos_apartemen: "Kos / Apartemen",
  rumah_tinggal: "Rumah Tinggal / Kontrakan",
  penginapan_hotel: "Penginapan / Hotel / Losmen",
  akomodasi_lainnya: "Lainnya",
  salon: "Salon",
  spa_gym: "Spa / Sauna / Gym",
  panti_pijat: "Panti Pijat",
  perawatan_lainnya: "Lainnya",
  aplikasi_kencan: "Aplikasi Kencan",
  media_sosial: "Media Sosial & Grup Chat",
  virtual_lainnya: "Lainnya",
};
const informationSourceLabels: Record<string, string> = {
  populasi_kunci: "Populasi kunci",
  tokoh_kunci: "Tokoh kunci",
  observasi: "Observasi lapangan langsung",
  lainnya: "Lainnya",
};

function formatStoredLabel(value: string) {
  return value.trim().replace(/_+/g, " ").replace(/\s+/g, " ");
}

export function displayPopulation(value?: string) {
  return value?.split(",").map((category) => {
    const trimmed = category.trim();
    return populationLabels[trimmed.toLowerCase()] || formatStoredLabel(trimmed);
  }).join(", ");
}

function WorkflowTimeline({ hotspot }: { hotspot: ReviewHotspot }) {
  const events = [
    ...(hotspot.createdAt ? [{
      stage: "submitted",
      role: "Enumerator",
      uid: "",
      actorName: hotspot.enumeratorName || hotspot.enumeratorUsername || "",
      at: hotspot.createdAt,
      note: "Data pemetaan dikirim.",
    }] : []),
    ...(hotspot.workflowHistory || []),
  ].sort((first, second) => {
    const firstTime = Date.parse(first.at);
    const secondTime = Date.parse(second.at);
    return (Number.isFinite(secondTime) ? secondTime : 0) - (Number.isFinite(firstTime) ? firstTime : 0);
  });

  if (!events.length) return <p className="enumerator-progress-empty">Riwayat tahapan belum tersedia.</p>;

  return <ol className="workflow-timeline">
    {events.map((event, index) => {
      const time = Date.parse(event.at);
      const actor = event.actorName || [formatStoredLabel(event.role), event.uid && `ID ${event.uid}`].filter(Boolean).join(" · ") || "Pengguna";
      return <li key={`${event.at}-${event.uid}-${index}`}>
        <span className="workflow-timeline-marker" aria-hidden="true" />
        <div className="workflow-timeline-content">
          <strong>{workflowStageLabels[event.stage] || formatStoredLabel(event.stage)}</strong>
          <small>{Number.isFinite(time) ? new Date(time).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "Waktu tidak tercatat"} · {actor}</small>
          {event.note && <p>{event.note}</p>}
        </div>
      </li>;
    })}
  </ol>;
}

function displayLocation(value?: string, labels: Record<string, string> = {}) {
  if (!value) return value;
  const trimmed = value.trim();
  return labels[trimmed.toLowerCase()] || formatStoredLabel(trimmed);
}

function displayReviewValue(label: string, value?: string) {
  if (!value) return value;
  if (label === "Tahapan proses") return workflowStageLabels[value] || formatStoredLabel(value);
  if (label === "Status pemeriksaan" && value === "Pending") return "Menunggu";
  if (label === "Kelengkapan") return value === "lengkap" ? "Lengkap" : value === "perlu_perbaikan" ? "Perlu perbaikan" : formatStoredLabel(value);
  if (label === "Duplikasi") return value === "tidak_ada" ? "Tidak ditemukan" : value === "ada" ? "Terindikasi" : formatStoredLabel(value);
  if (label === "Kroscek") return value === "sesuai" ? "Sesuai" : value === "perlu_klarifikasi" ? "Perlu klarifikasi" : formatStoredLabel(value);
  return formatStoredLabel(value);
}

export function ReviewDetailModal({ hotspot, canReview, canSupervise, onClose, onReview, onSupervise }: { hotspot: ReviewHotspot; canReview: boolean; canSupervise: boolean; onClose: () => void; onReview: () => void; onSupervise: () => void }) {
  const documents = hotspot.documents?.length ? hotspot.documents : hotspot.documentName ? [{ name: hotspot.documentName, fileId: hotspot.documentFileId }] : [];
  const qcValues: Array<[string, string | undefined]> = [["Tahapan proses", hotspot.workflowStage], ["Hasil supervisi Koordinator", hotspot.coordinatorReviewStatus], ["Kelengkapan instrumen", hotspot.coordinatorReviewKelengkapan], ["Duplikasi (supervisi)", hotspot.coordinatorReviewDuplikasi], ["Validasi lokasi / kroscek", hotspot.coordinatorReviewKroscek], ["Pemeriksa Koordinator", hotspot.coordinatorReviewerName], ["Tanggal supervisi", hotspot.coordinatorReviewDate], ["Catatan Koordinator", hotspot.coordinatorReviewNote], ["Status pemeriksaan Analis", hotspot.qc], ["Kelengkapan (Analis)", hotspot.qcKelengkapan], ["Duplikasi (Analis)", hotspot.qcDuplikasi], ["Kroscek (Analis)", hotspot.qcKroscek], ["Pemeriksa Analis", hotspot.qcInspector], ["Tanggal pemeriksaan Analis", hotspot.qcDate]];
  return <div className="user-modal-backdrop"><section className="user-modal detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-modal-title"><div className="user-modal-header"><div><p className="eyebrow">Detail pendataan</p><h2 id="detail-modal-title">{hotspot.name}</h2><p>{hotspot.id} · {hotspot.area}</p></div><button className="modal-close" type="button" onClick={onClose} aria-label="Tutup">x</button></div><div className="detail-section"><p className="form-section-title">Informasi pendataan</p><div className="detail-grid"><DetailItem label="Enumerator" value={hotspot.enumeratorName || hotspot.enumeratorUsername} /><DetailItem label="Kode Hotspot" value={hotspot.hotspotCode} /><DetailItem label="Organisasi" value={hotspot.organisasi} /><DetailItem label="Status hotspot" value={hotspot.status} /><DetailItem label="Koordinat GPS" value={hotspot.coordinates} /><DetailItem label="Kecamatan / Kelurahan" value={hotspot.area} /><DetailItem label="Alamat" value={hotspot.address} /><DetailItem label="Populasi kunci" value={displayPopulation(hotspot.population)} /><DetailItem label="Tipe lokasi" value={[displayLocation(hotspot.locationType, locationTypeLabels), displayLocation(hotspot.locationSubtype, locationSubtypeLabels)].filter(Boolean).join(" / ")} /><DetailItem label="Waktu aktivitas" value={hotspot.activityTime} /><DetailItem label="Estimasi populasi" value={String(hotspot.populationEstimate || 0)} /><DetailItem label="Jumlah diedukasi" value={String(hotspot.educated || 0)} /></div><DetailItem label="Keterangan Informan" value={hotspot.activityDescription} wide /><DetailItem label="Kondisi saat pemetaan" value={hotspot.mappingCondition} wide /><DetailItem label="Sumber informasi" value={displayLocation(hotspot.informationSource, informationSourceLabels)} /><DetailItem label="Nomor HP informan" value={hotspot.informantPhone} /><DetailItem label="Catatan Enumerator" value={hotspot.notes} wide /></div><div className="detail-section"><p className="form-section-title">Dokumen pendukung</p>{documents.length ? <div className="document-preview-grid">{documents.map((document, index) => { const previewUrl = document.fileId ? `/api/documents/preview?fileId=${encodeURIComponent(document.fileId)}` : ""; const documentUrl = previewUrl || document.url; const isImage = /\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(document.name); return <div className="document-preview-card" key={`${document.fileId || document.url || document.name}-${index}`}><p className="document-preview-title">Dokumentasi {index + 1}</p>{isImage && documentUrl ? <a className="document-preview" href={documentUrl} target="_blank" rel="noreferrer"><Image src={documentUrl} alt={`Dokumentasi ${index + 1} - ${hotspot.name}`} width={800} height={600} unoptimized /></a> : documentUrl ? <a className="document-file-link" href={documentUrl} target="_blank" rel="noreferrer">Buka dokumen</a> : <p className="document-file-unavailable">Pratinjau tidak tersedia</p>}</div>; })}</div> : <DetailItem label="Dokumentasi" value="Tidak ada dokumen" />}</div><div className="detail-section"><p className="form-section-title">Riwayat tahapan dan pemeriksaan</p><WorkflowTimeline hotspot={hotspot} /></div><div className="detail-section qc-result-section"><p className="form-section-title">Hasil supervisi dan pemeriksaan kualitas</p><div className="detail-grid">{qcValues.map(([label, value]) => <DetailItem key={label} label={label} value={displayReviewValue(label, value)} />)}</div><DetailItem label="Catatan pemeriksaan Data Analis" value={hotspot.qcNote} wide /></div>{(canSupervise || canReview) && <div className="user-modal-actions">{canSupervise && <button type="button" className="button button-primary" onClick={onSupervise}>Mulai supervisi</button>}{canReview && <button type="button" className="button button-primary" onClick={onReview}>Buka tugas tahap ini</button>}</div>}</section></div>;
}

export function ReviewQcModal({ hotspot, reviewerRole, onClose, onSave, onAiReview, reviewerName }: { hotspot: ReviewHotspot; reviewerRole: "coordinator" | "analyst"; onClose: () => void; onSave: (payload: QcPayload) => Promise<void>; onAiReview: (submissionId: string) => Promise<AiQcSuggestion>; reviewerName: string }) {
  const [status, setStatus] = useState<QcPayload["status"]>("Pending");
  const [note, setNote] = useState("");
  const [kelengkapan, setKelengkapan] = useState("lengkap");
  const [duplikasi, setDuplikasi] = useState("tidak_ada");
  const [kroscek, setKroscek] = useState("sesuai");
  const [pemeriksa, setPemeriksa] = useState(reviewerName);
  const [tanggal, setTanggal] = useState(new Date().toISOString().slice(0, 10));
  const [document, setDocument] = useState<File>();
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiReason, setAiReason] = useState("");
  const [aiChecks, setAiChecks] = useState<AiQcSuggestion["pemeriksaanSop"]>([]);

  async function applyAiSuggestion() {
    setAiLoading(true);
    setAiError("");
    setAiReason("");
    setAiChecks([]);
    try {
      const suggestion = await onAiReview(hotspot.id);
      setStatus(suggestion.status);
      setKelengkapan(suggestion.kelengkapan);
      setDuplikasi(suggestion.duplikasi);
      setKroscek(suggestion.kroscek);
      setNote(suggestion.note);
      setAiReason(suggestion.alasan);
      setAiChecks(suggestion.pemeriksaanSop);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "Saran pemeriksaan gagal dibuat. Silakan coba lagi.");
    } finally {
      setAiLoading(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try { await onSave({ status, note, kelengkapan, duplikasi, kroscek, pemeriksa, tanggal, document }); } finally { setSaving(false); }
  }
  return (
    <div className="user-modal-backdrop">
      <section className="user-modal qc-modal" role="dialog" aria-modal="true">
        <div className="user-modal-header">
          <div><p className="eyebrow">{reviewerRole === "coordinator" ? "Supervisi dan verifikasi lapangan" : "Pemeriksaan dan analisis data"}</p><h2>{reviewerRole === "coordinator" ? "Hasil Supervisi Koordinator" : "Pemeriksaan Data Analis"}</h2><p>{hotspot.name} · {hotspot.area}</p></div>
          <button className="modal-close" type="button" onClick={onClose} aria-label="Tutup">x</button>
        </div>
        <form onSubmit={submit} className="qc-form">
          {reviewerRole === "analyst" && <div className="qc-ai-assist">
            <div className="qc-ai-toolbar">
              <div className="qc-ai-heading"><span className="qc-ai-mark" aria-hidden="true">✦</span><div><strong>Asisten pemeriksaan</strong><small>Panduan mengacu pada SOP pemetaan</small></div></div>
              <button type="button" className="qc-ai-button" onClick={applyAiSuggestion} disabled={aiLoading || saving} aria-busy={aiLoading}>
                {aiLoading ? <span className="qc-ai-spinner" aria-hidden="true" /> : <span className="qc-ai-button-mark" aria-hidden="true">✦</span>}
                <span>{aiLoading ? "Menganalisis..." : "Buat saran"}</span>
              </button>
            </div>
            {aiLoading && <p className="qc-ai-status" role="status" aria-live="polite">Saran pemeriksaan sedang disiapkan berdasarkan data hotspot dan kriteria SOP.</p>}
            {aiError && <p className="login-error user-modal-error" role="alert">{aiError}</p>}
            {aiReason && <div className="qc-ai-reason"><strong>Saran otomatis · tinjau sebelum menyimpan</strong><p>{aiReason}</p></div>}
            {aiChecks.length > 0 && <ul className="qc-ai-checks">{aiChecks.map((check) => (
              <li className={`qc-ai-check qc-ai-check-${check.hasil}`} key={check.kriteria}>
                <div><strong>{check.kriteria}</strong><span>{suggestionResultLabels[check.hasil]}</span></div>
                <p>{check.bukti}</p>
              </li>
            ))}</ul>}
          </div>}
          <p className="role-review-guidance">{reviewerRole === "coordinator"
            ? "Isi kelengkapan instrumen, indikasi duplikasi, hasil validasi lokasi, serta catatan temuan. Pilih Valid untuk meneruskan hotspot ke Data Analis; Pending untuk menahannya di antrean Koordinator; atau Perlu perbaikan disertai catatan."
            : "Bandingkan isian hotspot dengan dokumen pendukung, lalu isi kelengkapan, indikasi duplikasi, dan hasil kroscek. Pilih Valid untuk memfinalkan data; Pending untuk menahannya di antrean Analis; atau Perlu perbaikan disertai catatan. Dokumen persetujuan dapat dilampirkan."}</p>
          <label>{reviewerRole === "coordinator" ? "Kelengkapan instrumen supervisi" : "Pemeriksaan kelengkapan data"}<select value={kelengkapan} onChange={(event) => setKelengkapan(event.target.value)}><option value="lengkap">Lengkap dan sesuai standar</option><option value="perlu_perbaikan">Perlu perbaikan atau isian belum lengkap</option></select></label>
          <label>{reviewerRole === "coordinator" ? "Indikasi duplikasi hotspot" : "Identifikasi data ganda"}<select value={duplikasi} onChange={(event) => setDuplikasi(event.target.value)}><option value="tidak_ada">Tidak ada indikasi duplikasi</option><option value="ada">Ada indikasi duplikasi</option></select></label>
          <label>{reviewerRole === "coordinator" ? "Validasi lokasi / kroscek lapangan" : "Konsistensi / kroscek data"}<select value={kroscek} onChange={(event) => setKroscek(event.target.value)}><option value="sesuai">Sesuai hasil pemeriksaan</option><option value="perlu_klarifikasi">Perlu klarifikasi ulang</option></select></label>
          <label>{reviewerRole === "coordinator" ? "Kesimpulan supervisi" : "Hasil pemeriksaan dan pengolahan"}<select value={status} onChange={(event) => setStatus(event.target.value as QcPayload["status"])}><option value="Valid">{reviewerRole === "coordinator" ? "Lolos supervisi - teruskan ke Data Analis" : "Valid - database siap difinalkan"}</option><option value="Pending">{reviewerRole === "coordinator" ? "Tetap dalam antrean supervisi" : "Menunggu klarifikasi / tindak lanjut"}</option><option value="Perlu perbaikan">Perlu perbaikan</option></select></label>
          <label>{reviewerRole === "coordinator" ? "Temuan dan umpan balik supervisi" : "Catatan pemeriksaan Data Analis"}<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} required={status === "Perlu perbaikan"} /></label>
          {reviewerRole === "analyst" && <label>Dokumen pendukung persetujuan<input type="file" accept="image/*,.pdf,.doc,.docx" onChange={(event) => setDocument(event.target.files?.[0])} /></label>}
          <label>Nama pemeriksa<input type="text" value={pemeriksa} onChange={(event) => setPemeriksa(event.target.value)} required /></label>
          <label>Tanggal pemeriksaan<input type="date" value={tanggal} onChange={(event) => setTanggal(event.target.value)} required /></label>
          <div className="user-modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Batal</button><button type="submit" className="button button-primary" disabled={saving || aiLoading}>{saving ? "Menyimpan..." : reviewerRole === "coordinator" ? "Simpan hasil supervisi" : "Simpan hasil pemeriksaan"}</button></div>
        </form>
      </section>
    </div>
  );
}

function DetailItem({ label, value, link, wide }: { label: string; value?: string; link?: string; wide?: boolean }) {
  const displayValue = value?.trim() || "-";
  return <div className={`detail-item ${wide ? "detail-item-wide" : ""}`}><small>{label}</small>{link ? <a href={link} target="_blank" rel="noreferrer">{displayValue}</a> : <strong>{displayValue}</strong>}</div>;
}
