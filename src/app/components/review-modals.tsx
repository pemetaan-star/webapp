"use client";

import { useEffect, useState, type FormEvent } from "react";

type ReviewHotspot = {
  id: string;
  name: string;
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
  hivTests?: number;
  hivPositive?: number;
  notes?: string;
  informationSource?: string;
  informantPhone?: string;
  activityDescription?: string;
  mappingCondition?: string;
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

export function ReviewDetailModal({ hotspot, canReview, onClose, onReview }: { hotspot: ReviewHotspot; canReview: boolean; onClose: () => void; onReview: () => void }) {
  const isImage = /\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(hotspot.documentName || "");
  const previewUrl = hotspot.documentFileId ? `/api/documents/preview?fileId=${encodeURIComponent(hotspot.documentFileId)}` : "";
  useEffect(() => {
    const modal = document.querySelector<HTMLElement>(".detail-modal");
    if (!modal || modal.querySelector(".qc-result-section")) return;
    const section = document.createElement("div");
    section.className = "detail-section qc-result-section";
    const title = document.createElement("p");
    title.className = "form-section-title";
    title.textContent = "Hasil Validasi QC";
    const grid = document.createElement("div");
    grid.className = "detail-grid";
    const values: Array<[string, string | undefined]> = [["Status QC", hotspot.qc], ["Tahap workflow", hotspot.workflowStage], ["Kelengkapan", hotspot.qcKelengkapan], ["Duplikasi", hotspot.qcDuplikasi], ["Kroscek", hotspot.qcKroscek], ["Pemeriksa", hotspot.qcInspector], ["Tanggal pemeriksaan", hotspot.qcDate]];
    values.forEach(([label, value]) => {
      const item = document.createElement("div");
      item.className = "detail-item";
      const labelNode = document.createElement("small");
      labelNode.textContent = label;
      const valueNode = document.createElement("strong");
      valueNode.textContent = value || "-";
      item.append(labelNode, valueNode);
      grid.appendChild(item);
    });
    const note = document.createElement("div");
    note.className = "detail-item detail-item-wide";
    const noteLabel = document.createElement("small");
    noteLabel.textContent = "Catatan QC";
    const noteValue = document.createElement("strong");
    noteValue.textContent = hotspot.qcNote || "-";
    note.append(noteLabel, noteValue);
    section.append(title, grid, note);
    const actions = modal.querySelector(".user-modal-actions");
    modal.insertBefore(section, actions || null);
    return () => section.remove();
  }, [hotspot]);
  return <div className="user-modal-backdrop"><section className="user-modal detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-modal-title"><div className="user-modal-header"><div><p className="eyebrow">Detail pendataan</p><h2 id="detail-modal-title">{hotspot.name}</h2><p>{hotspot.id} · {hotspot.area}</p></div><button className="modal-close" type="button" onClick={onClose} aria-label="Tutup">x</button></div><div className="detail-section"><p className="form-section-title">Informasi pendataan</p><div className="detail-grid"><DetailItem label="Enumerator" value={hotspot.enumeratorName || hotspot.enumeratorUsername} /><DetailItem label="Organisasi" value={hotspot.organisasi} /><DetailItem label="Status hotspot" value={hotspot.status} /><DetailItem label="Koordinat GPS" value={hotspot.coordinates} /><DetailItem label="Kecamatan / Kelurahan" value={hotspot.area} /><DetailItem label="Alamat" value={hotspot.address} /><DetailItem label="Populasi kunci" value={hotspot.population} /><DetailItem label="Tipe lokasi" value={[hotspot.locationType, hotspot.locationSubtype].filter(Boolean).join(" / ")} /><DetailItem label="Waktu aktivitas" value={hotspot.activityTime} /><DetailItem label="Estimasi populasi" value={String(hotspot.populationEstimate || 0)} /><DetailItem label="Jumlah diedukasi" value={String(hotspot.educated || 0)} /><DetailItem label="Tes HIV / HIV+" value={`${hotspot.hivTests || 0} / ${hotspot.hivPositive || 0}`} /></div><DetailItem label="Keterangan aktivitas" value={hotspot.activityDescription} wide /><DetailItem label="Kondisi saat pemetaan" value={hotspot.mappingCondition} wide /><DetailItem label="Sumber informasi" value={hotspot.informationSource} /><DetailItem label="Nomor HP informan" value={hotspot.informantPhone} /><DetailItem label="Catatan Enumerator" value={hotspot.notes} wide /></div><div className="detail-section"><p className="form-section-title">Dokumen</p>{isImage && previewUrl && <a className="document-preview" href={previewUrl} target="_blank" rel="noreferrer"><img src={previewUrl} alt={`Dokumentasi ${hotspot.name}`} /></a>}{hotspot.documentName && <DetailItem label="Nama dokumen" value={hotspot.documentName} link={hotspot.documentFileId ? previewUrl : undefined} />}</div>{canReview && <div className="user-modal-actions"><button type="button" className="button button-primary" onClick={onReview}>Review QC</button></div>}</section></div>;
}

export function ReviewQcModal({ hotspot, onClose, onSave, onAiReview, reviewerName }: { hotspot: ReviewHotspot; onClose: () => void; onSave: (payload: QcPayload) => Promise<void>; onAiReview: (submissionId: string) => Promise<AiQcSuggestion>; reviewerName: string }) {
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
      setAiError(error instanceof Error ? error.message : "AI gagal meninjau data.");
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
          <div><p className="eyebrow">Quality control</p><h2>Review Data Hotspot</h2><p>{hotspot.name} · {hotspot.area}</p></div>
          <button className="modal-close" type="button" onClick={onClose} aria-label="Tutup">x</button>
        </div>
        <form onSubmit={submit} className="qc-form">
          <div className="qc-ai-assist">
            <div className="qc-ai-toolbar">
              <div className="qc-ai-heading"><span className="qc-ai-mark" aria-hidden="true">✦</span><div><strong>Asisten QC</strong><small>Review berbasis SOP pemetaan</small></div></div>
              <button type="button" className="qc-ai-button" onClick={applyAiSuggestion} disabled={aiLoading || saving} aria-busy={aiLoading}>
                {aiLoading ? <span className="qc-ai-spinner" aria-hidden="true" /> : <span className="qc-ai-button-mark" aria-hidden="true">✦</span>}
                <span>{aiLoading ? "Menganalisis..." : "Pakai AI"}</span>
              </button>
            </div>
            {aiLoading && <p className="qc-ai-status" role="status" aria-live="polite">AI sedang meninjau data hotspot dan kriteria SOP.</p>}
            {aiError && <p className="login-error user-modal-error" role="alert">{aiError}</p>}
            {aiReason && <div className="qc-ai-reason"><strong>Saran AI · periksa sebelum menyimpan</strong><p>{aiReason}</p></div>}
            {aiChecks.length > 0 && <ul className="qc-ai-checks">{aiChecks.map((check) => (
              <li className={`qc-ai-check qc-ai-check-${check.hasil}`} key={check.kriteria}>
                <div><strong>{check.kriteria}</strong><span>{check.hasil.replaceAll("_", " ")}</span></div>
                <p>{check.bukti}</p>
              </li>
            ))}</ul>}
          </div>
          <label>Pemeriksaan kelengkapan<select value={kelengkapan} onChange={(event) => setKelengkapan(event.target.value)}><option value="lengkap">Lengkap &amp; Sesuai Standar</option><option value="perlu_perbaikan">Perlu Perbaikan / Isian Belum Lengkap</option></select></label>
          <label>Indikasi duplikasi<select value={duplikasi} onChange={(event) => setDuplikasi(event.target.value)}><option value="tidak_ada">Tidak Ada Indikasi Duplikasi</option><option value="ada">Ada Indikasi Duplikasi</option></select></label>
          <label>Kroscek antar enumerator<select value={kroscek} onChange={(event) => setKroscek(event.target.value)}><option value="sesuai">Sesuai Hasil Kroscek</option><option value="perlu_klarifikasi">Perlu Klarifikasi Ulang</option></select></label>
          <label>Status data akhir<select value={status} onChange={(event) => setStatus(event.target.value as QcPayload["status"])}><option value="Valid">Valid - Masuk Database Utama</option><option value="Pending">Perlu Tindak Lanjut</option><option value="Perlu perbaikan">Tidak Valid - Perlu Perbaikan</option></select></label>
          <label>Catatan analis<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} /></label>
          <label>Dokumentasi persetujuan QC<input type="file" accept="image/*,.pdf,.doc,.docx" onChange={(event) => setDocument(event.target.files?.[0])} /></label>
          <label>Nama pemeriksa<input type="text" value={pemeriksa} onChange={(event) => setPemeriksa(event.target.value)} required /></label>
          <label>Tanggal pemeriksaan<input type="date" value={tanggal} onChange={(event) => setTanggal(event.target.value)} required /></label>
          <div className="user-modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Batal</button><button type="submit" className="button button-primary" disabled={saving || aiLoading}>{saving ? "Menyimpan..." : "Simpan hasil QC"}</button></div>
        </form>
      </section>
    </div>
  );
}

function DetailItem({ label, value, link, wide }: { label: string; value?: string; link?: string; wide?: boolean }) {
  const displayValue = value?.trim() || "-";
  return <div className={`detail-item ${wide ? "detail-item-wide" : ""}`}><small>{label}</small>{link ? <a href={link} target="_blank" rel="noreferrer">{displayValue}</a> : <strong>{displayValue}</strong>}</div>;
}
