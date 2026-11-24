import NextImage from "next/image";
import type { User } from "firebase/auth";
import { arrayUnion, collection, doc, writeBatch } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import { normalizeOrganization, organizationOptions } from "@/lib/organizations";
import type { Hotspot, UserProfile } from "@/app/components/dashboard-types";
import { db } from "@/lib/firebase";
import { canReviewWorkflowStage, type WorkflowStage } from "@/lib/dashboard-summary";

export const supervisionImplementationChecks = [
  "Enumerator memahami tujuan dan metode pemetaan",
  "Enumerator menggunakan instrumen pemetaan yang telah ditetapkan",
  "Enumerator melakukan pengumpulan data sesuai wilayah tugas",
  "Enumerator melakukan pencatatan lokasi hotspot secara lengkap",
  "Titik koordinat/GPS tercatat dengan benar",
  "Informasi hotspot sesuai dengan kondisi lapangan",
  "Dokumentasi pendukung tersedia sesuai kebutuhan",
];

export const supervisionQualityChecks = [
  "Data identitas hotspot terisi lengkap",
  "Status hotspot telah ditentukan",
  "Tidak ditemukan duplikasi data hotspot",
  "Data telah melalui proses kroscek antar Enumerator",
  "Data sesuai dengan definisi operasional yang ditetapkan",
];

export type SupervisionDecision = "valid" | "pending" | "needs_revision";

export type SupervisionSignature = {
  dataUrl: string;
  signedAt: string;
  idempotencyKey: string;
};

export type StoredSupervisionSignature = {
  fileId: string;
  fileName: string;
  fileUrl: string;
  signerUid: string;
  signerName: string;
  signedAt: string;
};

export type SupervisionSession = {
  id: string;
  enumeratorUid: string;
  enumeratorName: string;
  coordinatorUid: string;
  coordinatorName: string;
  workflowStatus: string;
  submissionIds: string[];
  hotspotNames: string[];
  kesimpulanSupervisi: SupervisionDecision;
  checks: Record<string, string>;
  coordinatorReviewNote: string;
  temuanSupervisi: string;
  kendalaLapangan: string;
  perbaikanYangDibutuhkan: string;
  tindakLanjut: string;
  reviewDate: string;
  createdAt?: string;
  pengesahanTanggalEnumerator: string;
  pengesahanTanggalKoordinator: string;
  pengesahanTandaTanganEnumerator?: StoredSupervisionSignature;
  pengesahanTandaTanganKoordinator?: StoredSupervisionSignature;
};

export async function uploadSupervisionSignature(user: User, signerName: string, sessionId: string, signature: SupervisionSignature, signer: "enumerator" | "koordinator") {
  const token = await user.getIdToken();
  const response = await fetch("/api/documents/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      fileData: signature.dataUrl.split(",")[1],
      fileName: `supervisi-${sessionId}-${signer}.png`,
      fileMime: "image/png",
      folderName: "Tanda Tangan Supervisi",
      idempotencyKey: signature.idempotencyKey,
      sessionId,
      signatureRole: signer,
    }),
  });
  const result = await response.json() as { success?: boolean; message?: string; fileId?: string; fileName?: string; fileUrl?: string };
  if (!response.ok || !result.success || !result.fileId || !result.fileName || !result.fileUrl) {
    throw new Error(result.message || `Tanda tangan ${signer} gagal diunggah.`);
  }
  return {
    fileId: result.fileId,
    fileName: result.fileName,
    fileUrl: result.fileUrl,
    signerUid: user.uid,
    signerName: signerName || user.displayName || user.email || "",
    signedAt: signature.signedAt,
  } satisfies StoredSupervisionSignature;
}

export function SupervisionSignatureCanvas({ label, signature, onChange }: {
  label: string;
  signature: SupervisionSignature | null;
  onChange: (signature: SupervisionSignature | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect();
      if (!width || !height) return;
      const previous = document.createElement("canvas");
      previous.width = canvas.width;
      previous.height = canvas.height;
      previous.getContext("2d")?.drawImage(canvas, 0, 0);
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.lineWidth = 2.5;
      context.lineCap = "round";
      context.lineJoin = "round";
      if (previous.width && previous.height) context.drawImage(previous, 0, 0, width, height);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (signature) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const { width, height } = canvas.getBoundingClientRect();
    context.clearRect(0, 0, width, height);
    hasInk.current = false;
  }, [signature]);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  function startDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const canvas = event.currentTarget;
    const context = canvas.getContext("2d");
    if (!context) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    drawing.current = true;
    const { x, y } = point(event);
    context.beginPath();
    context.arc(x, y, 1.25, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.moveTo(x, y);
    hasInk.current = true;
  }

  function draw(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    event.preventDefault();
    const { x, y } = point(event);
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    context.lineTo(x, y);
    context.stroke();
  }

  function finishDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = event.currentTarget;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (hasInk.current) {
      onChange({
        dataUrl: canvas.toDataURL("image/png"),
        signedAt: new Date().toISOString(),
        idempotencyKey: crypto.randomUUID(),
      });
    }
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) {
      const { width, height } = canvas.getBoundingClientRect();
      context.clearRect(0, 0, width, height);
    }
    drawing.current = false;
    hasInk.current = false;
    onChange(null);
  }

  return <div className="signature-field">
    <div className="signature-field-heading"><strong>{label}</strong><button type="button" className="signature-clear-button" onClick={clearSignature} aria-label={`Hapus tanda tangan ${label}`}>Hapus coretan</button></div>
    <canvas
      ref={canvasRef}
      className="signature-canvas"
      aria-label={`Area tanda tangan ${label}`}
      onPointerDown={startDrawing}
      onPointerMove={draw}
      onPointerUp={finishDrawing}
      onPointerCancel={finishDrawing}
    />
    <small>{signature ? "Tanda tangan sudah dibubuhkan. Tekan Hapus untuk menggambar ulang." : "Tanda tangan langsung pada area ini menggunakan jari atau mouse."}</small>
  </div>;
}

export function EnumeratorSignatureCard({ session, user, profile, onClose, onSigned, onRevise }: {
  session: SupervisionSession;
  user: User;
  profile: UserProfile | null;
  onClose: () => void;
  onSigned: () => void;
  onRevise: (submissionId: string) => Promise<void>;
}) {
  const [signature, setSignature] = useState<SupervisionSignature | null>(null);
  const [attested, setAttested] = useState(false);
  const [signedDate, setSignedDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [revisionLoadingId, setRevisionLoadingId] = useState<string | null>(null);
  const [revisionError, setRevisionError] = useState("");
  const needsRevision = session.kesimpulanSupervisi === "needs_revision" || session.workflowStatus === "needs_revision";

  async function revise(submissionId: string) {
    setRevisionLoadingId(submissionId);
    setRevisionError("");
    try {
      await onRevise(submissionId);
    } catch (reviseError) {
      setRevisionError(reviseError instanceof Error ? reviseError.message : "Form perbaikan tidak dapat dibuka.");
      setRevisionLoadingId(null);
    }
  }

  async function sign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!signature || !attested) return;
    setSaving(true);
    setError("");
    try {
      const signerName = profile?.nama || profile?.name || user.displayName || user.email || "";
      const storedSignature = await uploadSupervisionSignature(user, signerName, session.id, signature, "enumerator");
      const token = await user.getIdToken();
      const response = await fetch("/api/supervisions/sign", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, signerName, signedDate, signature: storedSignature }),
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(result?.error || "Tanda tangan gagal disimpan.");
      }
      setSubmitted(true);
      onSigned();
    } catch (signError) {
      setError(signError instanceof Error ? signError.message : "Tanda tangan gagal disimpan.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="user-modal-backdrop">
    <section className="user-modal signature-result-modal" role="dialog" aria-modal="true" aria-labelledby="signature-result-title">
      <div className="user-modal-header">
        <div><p className="eyebrow">Hasil supervisi Koordinator</p><h2 id="signature-result-title">{session.hotspotNames.join(", ") || `${session.submissionIds.length} hotspot`}</h2><p>{session.coordinatorName || "Koordinator"} · {session.pengesahanTanggalKoordinator || "Tanggal tidak tercatat"}</p></div>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Tutup">×</button>
      </div>
      <div className="signature-result-content">
        {needsRevision ? (
          <>
            <div className="signature-result-note">
              <strong>Catatan perbaikan Koordinator</strong>
              <p>{session.perbaikanYangDibutuhkan || session.coordinatorReviewNote || "Koordinator belum menambahkan catatan."}</p>
            </div>
            <div className="signature-session-form">
              <h3>Data yang perlu diperbaiki</h3>
              {session.submissionIds.map((submissionId, index) => (
                <div className="coordinator-supervision-item" key={submissionId}>
                  <strong>{session.hotspotNames[index] || `Hotspot ${index + 1}`}</strong>
                  <button type="button" className="button button-primary" onClick={() => void revise(submissionId)} disabled={revisionLoadingId !== null}>
                    {revisionLoadingId === submissionId ? "Membuka form..." : "Perbaiki"}
                  </button>
                </div>
              ))}
              {revisionError && <p className="login-error user-modal-error" role="alert">{revisionError}</p>}
              <div className="user-modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Tutup</button></div>
            </div>
          </>
        ) : (
          <>
            <div className="signature-result-summary">
              <strong>Kesimpulan</strong>
              <span>{session.kesimpulanSupervisi === "valid" ? "Lolos supervisi, diteruskan ke Data Analis" : "Perlu tindak lanjut Koordinator"}</span>
            </div>
            {[
              ["Temuan supervisi", session.temuanSupervisi],
              ["Kendala lapangan", session.kendalaLapangan],
              ["Perbaikan yang dibutuhkan", session.perbaikanYangDibutuhkan],
              ["Tindak lanjut", session.tindakLanjut],
            ].filter(([, value]) => value).map(([label, value]) => (
              <div className="signature-result-note" key={label}><strong>{label}</strong><p>{value}</p></div>
            ))}
            <div className="signature-result-checks">
              <h3>Pemeriksaan supervisi</h3>
              {[["Pelaksanaan lapangan", supervisionImplementationChecks, "pelaksanaan"], ["Kualitas data", supervisionQualityChecks, "kualitas"]].map(([title, items, section]) => (
                <div key={title as string}>
                  <strong>{title as string}</strong>
                  <ul>{(items as string[]).map((item, index) => {
                    const key = `${section}_${index + 1}`;
                    const answer = session.checks[key];
                    return <li key={key}><span>{item}</span><b>{answer === "ya" ? "Ya" : answer === "tidak" ? "Tidak" : "—"}</b></li>;
                  })}</ul>
                </div>
              ))}
            </div>
            {session.pengesahanTandaTanganKoordinator?.fileId && (
              <div className="signature-result-coordinator-signature">
                <strong>Tanda tangan Koordinator</strong>
                <NextImage
                  src={`/api/documents/preview?fileId=${encodeURIComponent(session.pengesahanTandaTanganKoordinator.fileId)}`}
                  alt={`Tanda tangan ${session.coordinatorName || "Koordinator"}`}
                  width={460}
                  height={130}
                  unoptimized
                />
              </div>
            )}
            {submitted ? (
              <p className="signature-submitted-message" role="status">Tanda tangan berhasil dikirim kepada Koordinator untuk menyelesaikan sesi supervisi.</p>
            ) : (
          <form className="signature-session-form" onSubmit={sign}>
            <h3>Pengesahan Enumerator</h3>
            <label>Tanggal tanda tangan<input type="date" value={signedDate} onChange={(event) => setSignedDate(event.target.value)} required /></label>
            <SupervisionSignatureCanvas label={`Tanda tangan ${profile?.nama || profile?.name || "Enumerator"}`} signature={signature} onChange={setSignature} />
            <label className="signature-attendance"><input type="checkbox" checked={attested} onChange={(event) => setAttested(event.target.checked)} required /> Saya sudah membaca hasil supervisi dan membubuhkan tanda tangan sendiri pada akun ini.</label>
            {error && <p className="login-error user-modal-error" role="alert">{error}</p>}
            <div className="user-modal-actions">
              <button type="button" className="button button-secondary" onClick={onClose}>Tutup</button>
              <button className="button button-primary" type="submit" disabled={!signature || !attested || saving}>{saving ? "Menyimpan tanda tangan..." : "Kirim tanda tangan"}</button>
            </div>
          </form>
            )}
          </>
        )}
      </div>
    </section>
  </div>;
}

export function CoordinatorSupervisionForm({ open, initialSubmissionId, user, profile, rows, pendingSubmissionIds, onClose, onSaved }: { open: boolean; initialSubmissionId: string | null; user: User; profile: UserProfile | null; rows: Hotspot[]; pendingSubmissionIds: string[]; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const initialSubmission = initialSubmissionId ? rows.find((row) => row.id === initialSubmissionId) : undefined;
  const initialSubmissionEligible = Boolean(
    initialSubmission?.enumeratorUid
    && canReviewWorkflowStage("coordinator", initialSubmission.workflowStage)
    && !pendingSubmissionIds.includes(initialSubmission.id),
  );
  const [selectedEnumerator, setSelectedEnumerator] = useState(initialSubmissionEligible ? initialSubmission?.enumeratorUid || "" : "");
  const [selectedSubmissionIds, setSelectedSubmissionIds] = useState<string[]>(initialSubmissionEligible && initialSubmission ? [initialSubmission.id] : []);
  const [decision, setDecision] = useState<SupervisionDecision>("valid");
  const [coordinatorSignature, setCoordinatorSignature] = useState<SupervisionSignature | null>(null);
  const enumerators = Array.from(new Map(rows.filter((row) => row.enumeratorUid).map((row) => [row.enumeratorUid!, row.enumeratorName || "Nama belum diatur"])).entries());
  const enumeratorRows = rows.filter((row) => row.enumeratorUid === selectedEnumerator);
  const selectedEnumeratorName = enumerators.find(([uid]) => uid === selectedEnumerator)?.[1] || "";
  const pendingSubmissionIdSet = new Set(pendingSubmissionIds);
  const eligibleRows = enumeratorRows.filter((row) => (
    (!initialSubmissionId || row.id === initialSubmissionId)
    && canReviewWorkflowStage("coordinator", row.workflowStage)
    && !pendingSubmissionIdSet.has(row.id)
  ));
  const selectedRows = eligibleRows.filter((row) => selectedSubmissionIds.includes(row.id));
  const selectedOrganization = selectedRows.map((row) => normalizeOrganization(row.organisasi)).find(Boolean) || "";
  const selectedOrganizationLabel = organizationOptions.find(([value]) => value === selectedOrganization)?.[1] || "";
  const selectedLocations = Array.from(new Set(selectedRows.map((row) => row.area).filter(Boolean))).join(", ");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db) return setError("Sistem data belum siap.");
    setError("");
    const form = new FormData(event.currentTarget);
    if (!selectedRows.length) return setError("Pilih minimal satu hotspot yang benar-benar diperiksa dalam sesi supervisi ini.");
    if (selectedRows.length > 499) return setError("Sesi supervisi maksimal 499 hotspot. Bagi sesi menjadi beberapa form.");
    const note = [
      String(form.get("temuanSupervisi") || "").trim() && `Temuan: ${String(form.get("temuanSupervisi")).trim()}`,
      String(form.get("kendalaLapangan") || "").trim() && `Kendala: ${String(form.get("kendalaLapangan")).trim()}`,
      String(form.get("perbaikanYangDibutuhkan") || "").trim() && `Perbaikan: ${String(form.get("perbaikanYangDibutuhkan")).trim()}`,
      String(form.get("tindakLanjut") || "").trim() && `Tindak lanjut: ${String(form.get("tindakLanjut")).trim()}`,
    ].filter(Boolean).join("\n");
    if (decision === "needs_revision" && !String(form.get("perbaikanYangDibutuhkan") || "").trim()) {
      return setError("Isi perbaikan yang dibutuhkan sebelum mengembalikan data.");
    }
    if (decision === "valid" && !coordinatorSignature) {
      return setError("Tanda tangan Koordinator wajib dibubuhkan sebelum membuat sesi supervisi.");
    }
    setSaving(true);
    const checks = [...supervisionImplementationChecks, ...supervisionQualityChecks].reduce<Record<string, string>>((values, _, index) => {
      const section = index < supervisionImplementationChecks.length ? "pelaksanaan" : "kualitas";
      const number = index < supervisionImplementationChecks.length ? index + 1 : index - supervisionImplementationChecks.length + 1;
      values[`${section}_${number}`] = String(form.get(`${section}_${number}`) || "");
      return values;
    }, {});
    const reviewedAt = new Date().toISOString();
    const submissionIds = selectedRows.map((row) => row.id);
    const supervisionRef = doc(collection(db, "supervisions"));
    const batch = writeBatch(db);
    const coordinatorSignatureForUpload = coordinatorSignature;
    const workflowStage: WorkflowStage = decision === "needs_revision"
      ? "needs_revision"
      : decision === "valid" ? "awaiting_enumerator_signature" : "coordinator_review";
    const coordinatorReviewStatus: Hotspot["coordinatorReviewStatus"] = decision === "needs_revision" ? "Perlu perbaikan" : "Pending";
    const workflowStatus = decision === "needs_revision"
      ? "needs_revision"
      : decision === "valid" ? "awaiting_enumerator_signature" : "pending_coordinator_action";
    try {
      const coordinatorSignatureFile = decision === "valid" && coordinatorSignatureForUpload
        ? await uploadSupervisionSignature(
            user,
            profile?.nama || profile?.name || user.displayName || user.email || "",
            supervisionRef.id,
            coordinatorSignatureForUpload,
            "koordinator",
          )
        : undefined;
      batch.set(supervisionRef, {
        checks,
        kesimpulanSupervisi: decision,
        komunitasOrganisasi: selectedRows.map((row) => normalizeOrganization(row.organisasi)).find(Boolean) || "",
        namaKoordinator: String(form.get("namaKoordinator") || "").trim(),
        pengesahanNamaEnumerator: selectedEnumeratorName,
        pengesahanNamaKoordinator: String(form.get("pengesahanNamaKoordinator") || "").trim(),
        pengesahanTanggalEnumerator: "",
        pengesahanTanggalKoordinator: String(form.get("pengesahanTanggalKoordinator") || ""),
        ...(coordinatorSignatureFile ? { pengesahanTandaTanganKoordinator: coordinatorSignatureFile } : {}),
        coordinatorUid: user.uid,
        enumeratorUid: selectedEnumerator,
        submissionIds,
        previousSubmissionStates: selectedRows.map((row) => ({
          submissionId: row.id,
          workflowStage: row.workflowStage,
          workflowUpdatedByRole: row.workflowUpdatedByRole || "",
          coordinatorReviewStatus: row.coordinatorReviewStatus ?? null,
          coordinatorReviewNote: row.coordinatorReviewNote || "",
          coordinatorReviewKelengkapan: row.coordinatorReviewKelengkapan || "",
          coordinatorReviewDuplikasi: row.coordinatorReviewDuplikasi || "",
          coordinatorReviewKroscek: row.coordinatorReviewKroscek || "",
          coordinatorReviewerName: row.coordinatorReviewerName || "",
          coordinatorReviewDate: row.coordinatorReviewDate || "",
          coordinatorReviewerUid: row.coordinatorReviewerUid || "",
          coordinatorReviewedAt: row.coordinatorReviewedAt || "",
        })),
        hotspotNames: selectedRows.map((row) => row.name),
        workflowStage: decision === "needs_revision" ? "needs_revision" : "coordinator_review",
        workflowStatus,
        coordinatorReviewNote: note,
        coordinatorReviewerName: String(form.get("namaKoordinator") || "").trim(),
        temuanSupervisi: String(form.get("temuanSupervisi") || "").trim(),
        kendalaLapangan: String(form.get("kendalaLapangan") || "").trim(),
        perbaikanYangDibutuhkan: String(form.get("perbaikanYangDibutuhkan") || "").trim(),
        tindakLanjut: String(form.get("tindakLanjut") || "").trim(),
        pengesahanEnumeratorHadir: false,
        createdAt: reviewedAt,
      });
      for (const submission of selectedRows) {
        batch.update(doc(db, "submissions", submission.id), {
          coordinatorReviewStatus,
          coordinatorReviewNote: note,
          coordinatorReviewKelengkapan: checks.kualitas_1 || "",
          coordinatorReviewDuplikasi: checks.kualitas_3 || "",
          coordinatorReviewKroscek: checks.kualitas_4 || "",
          coordinatorReviewerName: String(form.get("namaKoordinator") || "").trim(),
          coordinatorReviewDate: String(form.get("tanggalSupervisi") || ""),
          coordinatorReviewerUid: user.uid,
          coordinatorReviewedAt: reviewedAt,
          workflowStage,
          workflowUpdatedByRole: "koordinator",
          workflowHistory: arrayUnion({
            stage: workflowStage,
            role: profile?.role || "koordinator",
            uid: user.uid,
            actorName: profile?.nama || user.displayName || "",
            at: reviewedAt,
            note: decision === "needs_revision"
              ? note
              : decision === "valid" ? "Hasil supervisi dikirim kepada Enumerator untuk ditandatangani." : note,
          }),
        });
      }
      await batch.commit();
      setCoordinatorSignature(null);
      onSaved();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Supervisi gagal disimpan.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;
  return (
    <div className="user-modal-backdrop">
      <section className="user-modal supervision-modal" role="dialog" aria-modal="true" aria-labelledby="supervision-form-title">
        <div className="user-modal-header">
          <div><p className="eyebrow">Supervisi lapangan oleh Koordinator Kegiatan</p><h2 id="supervision-form-title">Format Supervisi Pemetaan Hotspot</h2><p>Kota Malang 2026 · Satu sesi dapat mencakup beberapa hotspot yang benar-benar diperiksa.</p></div>
          <button className="modal-close" type="button" onClick={onClose} aria-label="Tutup">×</button>
        </div>
        {error && <p className="login-error user-modal-error" role="alert">{error}</p>}
        <form className="supervision-form" onSubmit={submit}>
          <p className="form-section-title">A. Identitas Supervisi</p>
          <div className="supervision-grid">
            <label>Tanggal supervisi<input name="tanggalSupervisi" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></label>
            <label>Nama Koordinator<input name="namaKoordinator" defaultValue={profile?.nama || user.email || ""} required /></label>
            <label>Enumerator yang disupervisi<select name="namaEnumerator" value={selectedEnumerator} onChange={(event) => { setSelectedEnumerator(event.target.value); setSelectedSubmissionIds([]); setCoordinatorSignature(null); }} required><option value="">Pilih Enumerator</option>{enumerators.map(([uid, name]) => <option key={uid} value={uid}>{name}</option>)}</select></label>
            <label>Komunitas / organisasi<input value={selectedOrganizationLabel || "Pilih hotspot untuk melihat organisasi"} readOnly /></label>
            <label>Wilayah hotspot terpilih<input value={selectedLocations} readOnly placeholder="Pilih hotspot yang diperiksa" /></label>
            <label>Jumlah hotspot terpilih<input type="number" min="0" value={selectedRows.length} readOnly /></label>
          </div>
          <fieldset className="supervision-hotspot-select">
            <legend>Hotspot yang benar-benar diperiksa dalam sesi ini</legend>
            {!selectedEnumerator ? <p>Pilih enumerator untuk menampilkan data yang dapat disupervisi.</p> : eligibleRows.length ? eligibleRows.map((row) => (
              <label key={row.id}>
                <input type="checkbox" checked={selectedSubmissionIds.includes(row.id)} disabled={Boolean(initialSubmissionId)} onChange={(event) => { setSelectedSubmissionIds((ids) => event.target.checked ? [...ids, row.id] : ids.filter((id) => id !== row.id)); setCoordinatorSignature(null); }} />
                <span><strong>{row.name}</strong><small>{row.id} · {row.area} · {row.workflowStage === "needs_revision" ? "Perlu tindak lanjut" : "Menunggu supervisi Koordinator"}</small></span>
              </label>
            )) : <p>Tidak ada hotspot enumerator ini pada antrean supervisi.</p>}
            <small>Hanya data yang dipilih di atas yang akan menerima hasil supervisi. Daftar ini mencakup data yang sedang dimuat pada dashboard.</small>
          </fieldset>
          <SupervisionChecks title="B. Pemeriksaan Pelaksanaan Lapangan" name="pelaksanaan" items={supervisionImplementationChecks} />
          <SupervisionChecks title="C. Pemeriksaan Kualitas Data" name="kualitas" items={supervisionQualityChecks} />
          <p className="form-section-title">D. Hasil Supervisi</p>
          <div className="supervision-text-grid">
            <label>Temuan supervisi<textarea name="temuanSupervisi" rows={2} /></label>
            <label>Kendala lapangan<textarea name="kendalaLapangan" rows={2} /></label>
            <label>Perbaikan yang dibutuhkan<textarea name="perbaikanYangDibutuhkan" rows={2} required={decision === "needs_revision"} /></label>
            <label>Tindak lanjut<textarea name="tindakLanjut" rows={2} /></label>
          </div>
          <p className="form-section-title">E. Kesimpulan Supervisi untuk data terpilih</p>
          <div className="supervision-options">
            <label><input type="radio" name="kesimpulanSupervisi" value="valid" checked={decision === "valid"} onChange={() => { setDecision("valid"); setCoordinatorSignature(null); }} /> Lolos supervisi, teruskan ke Data Analis.</label>
            <label><input type="radio" name="kesimpulanSupervisi" value="pending" checked={decision === "pending"} onChange={() => { setDecision("pending"); setCoordinatorSignature(null); }} /> Perlu tindak lanjut Koordinator sebelum diteruskan.</label>
            <label><input type="radio" name="kesimpulanSupervisi" value="needs_revision" checked={decision === "needs_revision"} onChange={() => { setDecision("needs_revision"); setCoordinatorSignature(null); }} /> Perlu perbaikan oleh enumerator.</label>
          </div>
          <p className="form-section-title">{decision === "valid" ? "F. Pengesahan" : "F. Pencatatan Koordinator"}</p>
          <div className="supervision-sign-grid">
            <div><strong>Koordinator</strong><label>Nama<input name="pengesahanNamaKoordinator" defaultValue={profile?.nama || user.email || ""} readOnly /></label><label>Tanggal<input name="pengesahanTanggalKoordinator" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></label>{decision === "valid" && <SupervisionSignatureCanvas label="Tanda tangan Koordinator" signature={coordinatorSignature} onChange={setCoordinatorSignature} />}</div>
            <div className="signature-pending-note"><strong>{decision === "valid" ? "Enumerator" : "Tindak lanjut"}</strong><p>{decision === "valid"
              ? `${selectedEnumeratorName || "Enumerator"} meninjau dan menandatangani hasil melalui akunnya sendiri.`
              : decision === "needs_revision"
                ? "Hasil dikirim kepada Enumerator untuk diperbaiki tanpa tanda tangan."
                : "Data tetap berada di antrean Koordinator dan tidak memerlukan tanda tangan."}</p></div>
          </div>
          <div className="user-modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Batal</button><button type="submit" className="button button-primary" disabled={saving || selectedRows.length === 0 || (decision === "valid" && !coordinatorSignature)}>{saving ? "Menyimpan..." : `Simpan hasil untuk ${selectedRows.length} hotspot`}</button></div>
        </form>
      </section>
    </div>
  );
}

export function SupervisionChecks({ title, name, items }: { title: string; name: string; items: string[] }) {
  return <div className="supervision-check-section"><p className="form-section-title">{title}</p><div className="supervision-check-table"><div className="supervision-check-head"><span>No</span><span>Komponen pemeriksaan</span><span>Ya</span><span>Tidak</span></div>{items.map((item, index) => <div className="supervision-check-row" key={item}><span>{index + 1}</span><span>{item}</span><label><input type="radio" name={`${name}_${index + 1}`} value="ya" required /> Ya</label><label><input type="radio" name={`${name}_${index + 1}`} value="tidak" required /> Tidak</label></div>)}</div></div>;
}
