import type { User } from "firebase/auth";
import { addDoc, arrayUnion, collection, doc, updateDoc } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import { DashboardIcon } from "@/app/components/dashboard-icon";
import { EnumeratorFormFields } from "@/app/components/enumerator-form";
import { normalizeOrganization } from "@/lib/organizations";
import { FormSubmissionLoading } from "@/app/components/dashboard-loading";
import type { Hotspot, PreviousHotspot, UserProfile } from "@/app/components/dashboard-types";
import { db } from "@/lib/firebase";
import type { WorkflowStage } from "@/lib/dashboard-summary";

export const locationSubtypes: Record<string, Array<[string, string]>> = {
  ruang_publik: [["jalanan_mangkal", "Jalanan / Titik Mangkal"], ["taman_kota", "Taman Kota / Alun-Alun / Halaman"], ["stasiun_terminal", "Stasiun / Terminal / Halte"], ["mall", "Mall"], ["makam", "Makam"], ["bangunan_kosong", "Bangunan Kosong / Mangkrak"], ["ruang_publik_lainnya", "Lainnya"]],
  tempat_makan_hiburan: [["warung_makan", "Warung Kopi / Warung Makan"], ["kafe_restoran", "Kafe / Restoran"], ["bar_club", "Bar / Club / Diskotik"], ["karaoke", "Karaoke (Hall / Room)"], ["tempat_makan_lainnya", "Lainnya"]],
  akomodasi_private: [["kos_apartemen", "Kos / Apartemen"], ["rumah_tinggal", "Rumah Tinggal / Kontrakan"], ["penginapan_hotel", "Penginapan / Hotel / Losmen"], ["akomodasi_lainnya", "Lainnya"]],
  perawatan_kebugaran: [["salon", "Salon"], ["spa_gym", "Spa / Sauna / Gym"], ["panti_pijat", "Panti Pijat"], ["perawatan_lainnya", "Lainnya"]],
  platform_virtual: [["aplikasi_kencan", "Aplikasi Kencan"], ["media_sosial", "Media Sosial & Grup Chat"], ["virtual_lainnya", "Lainnya"]],
  lainnya: [["lainnya", "Lainnya"]],
};

export const malangKelurahan: Record<string, string[]> = {
  Blimbing: ["Arjosari", "Balearjosari", "Blimbing", "Bunulrejo", "Jodipan", "Kesatrian", "Pandanwangi", "Polehan", "Polowijen", "Purwantoro", "Purwodadi"],
  Kedungkandang: ["Arjowinangun", "Bumiayu", "Buring", "Cemorokandang", "Kedungkandang", "Kotalama", "Lesanpuro", "Madyopuro", "Mergosono", "Sawojajar", "Tlogowaru", "Wonokoyo"],
  Klojen: ["Bareng", "Gadingkasri", "Kasin", "Kauman", "Kiduldalem", "Klojen", "Oro-Oro Dowo", "Penanggungan", "Rampal Celaket", "Samaan", "Sukoharjo"],
  Lowokwaru: ["Dinoyo", "Jatimulyo", "Ketawanggede", "Lowokwaru", "Merjosari", "Mojolangu", "Sumbersari", "Tasikmadu", "Tlogomas", "Tulusrejo", "Tunjungsekar"],
  Sukun: ["Bakalan Krajan", "Bandulan", "Bandungrejosari", "Ciptomulyo", "Gadang", "Karangbesuki", "Kebonsari", "Mulyorejo", "Pisangcandi", "Sukun", "Tanjungrejo"],
};

export function GpsConfirmationDialog({ mode, result, startedAt, onCancel, onAccept, onRetry }: {
  mode: "searching" | "result" | null;
  result: { latitude: string; longitude: string; accuracy: number } | null;
  startedAt: number;
  onCancel: () => void;
  onAccept: () => void;
  onRetry: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (mode && !dialog.open) dialog.showModal();
    if (!mode && dialog.open) dialog.close();
  }, [mode]);

  useEffect(() => {
    if (mode !== "searching") return;
    const timer = window.setInterval(() => setElapsed((Date.now() - startedAt) / 1000), 100);
    return () => window.clearInterval(timer);
  }, [mode, startedAt]);

  if (!mode) return null;
  const warning = result ? result.accuracy > 100 : false;

  return <dialog ref={dialogRef} className="gps-confirm-dialog gps-live-dialog" onCancel={(event) => { event.preventDefault(); onCancel(); }}>
    {mode === "searching" ? <div className="gps-confirm-card gps-searching-card"><p className="eyebrow">Mendapatkan lokasi</p><h2>Mencoba mendapatkan lokasi</h2><p className="gps-confirm-copy">Pastikan GPS aktif dan perangkat berada di area terbuka.</p><div className="gps-progress-track"><i /></div><div className="gps-search-stats"><span>● Mencari sinyal GPS</span><strong>Waktu berlalu: {elapsed.toFixed(2)} detik</strong></div><div className="gps-confirm-actions"><button type="button" className="button button-secondary" onClick={onCancel}>Batal</button></div></div>
      : result && <div className="gps-confirm-card"><div className={`gps-confirm-icon ${warning ? "gps-confirm-icon-warning" : ""}`}><DashboardIcon name="mapPin" /></div><p className="eyebrow">Hasil lokasi</p><h2>Lokasi berhasil ditemukan</h2><p className="gps-confirm-copy">Periksa akurasi sebelum menyimpan titik ini ke formulir.</p><div className={`gps-confirm-accuracy ${warning ? "gps-accuracy-poor" : ""}`}><span className="gps-confirm-check">{warning ? "!" : <DashboardIcon name="check" />}</span><div><small>Akurasi GPS</small><strong>Sekitar {result.accuracy} meter</strong>{warning && <em>Akurasi kurang baik. Ambil ulang di area terbuka.</em>}</div></div><div className="gps-confirm-coordinates"><div><small>Latitude</small><strong>{result.latitude}</strong></div><div><small>Longitude</small><strong>{result.longitude}</strong></div></div><div className="gps-confirm-actions"><button type="button" className="button button-secondary" onClick={onRetry}>Ambil ulang</button><button type="button" className="button button-primary" onClick={onAccept}>Gunakan lokasi</button></div></div>}
  </dialog>;
}

export function EnumeratorForm({ user, profile, existingHotspots, revision, onClose, onSaved }: { user: User; profile: UserProfile | null; existingHotspots: Hotspot[]; revision: Hotspot | null; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [previousVisits, setPreviousVisits] = useState<PreviousHotspot[]>(existingHotspots);
  const [previousVisitsLoading, setPreviousVisitsLoading] = useState(true);
  const submissionIdempotencyKey = useRef<string | null>(null);
  const [locationType, setLocationType] = useState(revision?.locationType || "");
  const [locationSubtype, setLocationSubtype] = useState(revision?.locationSubtype || "");
  const [statusHotspot, setStatusHotspot] = useState(revision?.statusHotspotValue || "");
  const [hotspotCode, setHotspotCode] = useState(revision?.hotspotCode || "");
  const [hotspotCodeIdentity, setHotspotCodeIdentity] = useState("");
  const [hotspotCodeLoading, setHotspotCodeLoading] = useState(false);
  const [hotspotName, setHotspotName] = useState(revision?.name || "");
  const [district, setDistrict] = useState(revision?.area.split("/")[0]?.trim() || "");
  const [village, setVillage] = useState(revision?.area.split("/")[1]?.trim() || "");
  const [address, setAddress] = useState(revision?.address || "");
  const [visitMode, setVisitMode] = useState<"initial" | "follow_up">(revision?.visitType || "initial");
  const [previousHotspotId, setPreviousHotspotId] = useState(revision?.previousVisitId || "");
  const [gps, setGps] = useState(revision?.coordinates || "");
  const [manualGps, setManualGps] = useState(Boolean(revision?.koordinatManual && profile?.manualGpsEnabled));
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsCandidate, setGpsCandidate] = useState<{ location: string; latitude: string; longitude: string; accuracy: number } | null>(null);
  const [gpsDialogMode, setGpsDialogMode] = useState<"searching" | "result" | null>(null);
  const [gpsStartedAt, setGpsStartedAt] = useState(0);
  const gpsWatchRef = useRef<number | null>(null);
  const gpsTimeoutRef = useRef<number | null>(null);
  const bestPositionRef = useRef<GeolocationPosition | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      setPreviousVisitsLoading(true);
      try {
        const token = await user.getIdToken();
        const response = await fetch("/api/submissions/visit", {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        const result = await response.json().catch(() => null) as { error?: string; visits?: PreviousHotspot[] } | null;
        if (!response.ok || !result?.visits) {
          throw new Error(result?.error || "Riwayat hotspot tidak dapat dimuat.");
        }
        setPreviousVisits(result.visits);
      } catch (historyError) {
        if (!controller.signal.aborted) {
          setError(historyError instanceof Error ? historyError.message : "Riwayat hotspot tidak dapat dimuat.");
        }
      } finally {
        if (!controller.signal.aborted) setPreviousVisitsLoading(false);
      }
    })();
    return () => controller.abort();
  }, [user]);

  useEffect(() => {
    const root = document.documentElement;
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    root.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    return () => {
      root.style.overflow = previousRootOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  useEffect(() => () => {
    if (gpsWatchRef.current !== null) navigator.geolocation?.clearWatch(gpsWatchRef.current);
    if (gpsTimeoutRef.current !== null) window.clearTimeout(gpsTimeoutRef.current);
  }, []);

  useEffect(() => {
    if (revision) return;
    const namaHotspot = hotspotName.trim();
    const kelurahan = village.trim();
    const alamat = address.trim();
    const identity = JSON.stringify([namaHotspot, kelurahan, alamat]);
    if (!namaHotspot || !kelurahan || !alamat) {
      const timer = window.setTimeout(() => setHotspotCodeLoading(false), 0);
      return () => window.clearTimeout(timer);
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setHotspotCodeLoading(true);
      setError("");
      try {
        const token = await user.getIdToken();
        const response = await fetch("/api/hotspots/code", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ namaHotspot, kelurahan, alamat }),
          signal: controller.signal,
        });
        const responseText = await response.text();
        let result: { error?: string; kodeHotspot?: string };
        try {
          result = JSON.parse(responseText) as { error?: string; kodeHotspot?: string };
        } catch {
          throw new Error("Layanan belum dapat memproses permintaan. Silakan coba lagi atau hubungi administrator.");
        }
        if (!response.ok) throw new Error(result.error || "Kode hotspot gagal dibuat.");
        if (!result.kodeHotspot) throw new Error("Server tidak mengembalikan kode hotspot.");
        setHotspotCode(String(result.kodeHotspot));
        setHotspotCodeIdentity(identity);
      } catch (requestError) {
        if (controller.signal.aborted) return;
        setError(requestError instanceof Error ? requestError.message : "Kode hotspot gagal dibuat.");
      } finally {
        if (!controller.signal.aborted) setHotspotCodeLoading(false);
      }
    }, 450);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [hotspotName, village, address, revision, user]);

  const selectPreviousHotspot = (id: string) => {
    const hotspot = previousVisits.find((item) => item.id === id);
    setPreviousHotspotId(id);
    if (!hotspot) return;
    setHotspotName(hotspot.name);
    const [nextDistrict, nextVillage] = hotspot.area.split("/").map((part) => part.trim());
    setDistrict(nextDistrict || "");
    setVillage(nextVillage || "");
    setAddress(hotspot.address || "");
  };
  const changeVisitMode = (mode: "initial" | "follow_up") => {
    if (revision) return;
    setVisitMode(mode);
    if (mode === "initial") setPreviousHotspotId("");
  };
  const hotspotIdentity = JSON.stringify([hotspotName.trim(), village.trim(), address.trim()]);
  const activeHotspotCode = revision?.hotspotCode || (hotspotCodeIdentity === hotspotIdentity ? hotspotCode : "");
  return <>
    <EnumeratorFormFields user={user} profile={profile} error={error} saving={saving} gps={gps} manualGps={manualGps} onChangeGps={setGps} onManualGpsChange={changeManualGps} onUseCurrentLocation={useCurrentLocation} onClose={onClose} onSubmit={submit} locationType={locationType} setLocationType={setLocationType} locationSubtype={locationSubtype} setLocationSubtype={setLocationSubtype} statusHotspot={statusHotspot} setStatusHotspot={setStatusHotspot} hotspotCode={activeHotspotCode} hotspotCodeLoading={hotspotCodeLoading} hotspotName={hotspotName} setHotspotName={setHotspotName} district={district} setDistrict={setDistrict} village={village} setVillage={setVillage} address={address} setAddress={setAddress} districts={malangKelurahan} visitMode={visitMode} setVisitMode={changeVisitMode} previousHotspotId={previousHotspotId} setPreviousHotspotId={(id) => { if (!revision) setPreviousHotspotId(id); }} previousHotspots={previousVisits} previousVisitsLoading={previousVisitsLoading} onSelectPreviousHotspot={(id) => { if (!revision) selectPreviousHotspot(id); }} locationSubtypes={locationSubtypes} revision={revision} />
    {saving && <FormSubmissionLoading />}
    <GpsConfirmationDialog key={gpsStartedAt} mode={gpsDialogMode} result={gpsCandidate} startedAt={gpsStartedAt} onCancel={cancelGps} onAccept={acceptGps} onRetry={retryGps} />
  </>;
  function startGpsCapture() {
    if (gpsLoading) return;
    if (!navigator.geolocation) {
      setError("Perangkat tidak mendukung GPS.");
      return;
    }
    setGpsLoading(true);
    setError("");
    setGpsDialogMode("searching");
    setGpsStartedAt(Date.now());
    setGpsCandidate(null);
    bestPositionRef.current = null;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (gpsWatchRef.current !== null) navigator.geolocation.clearWatch(gpsWatchRef.current);
      if (!bestPositionRef.current) {
        setError("GPS belum mendapatkan lokasi. Coba lagi di area terbuka.");
        setGpsLoading(false);
        setGpsDialogMode(null);
        return;
      }
      const position = bestPositionRef.current;
      const result = { location: `${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`, latitude: position.coords.latitude.toFixed(6), longitude: position.coords.longitude.toFixed(6), accuracy: Math.round(position.coords.accuracy) };
      setGpsCandidate(result);
      setGpsLoading(false);
      setGpsDialogMode("result");
    };
    gpsTimeoutRef.current = window.setTimeout(finish, 15000);
    gpsWatchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        if (!bestPositionRef.current || position.coords.accuracy < bestPositionRef.current.coords.accuracy) bestPositionRef.current = position;
        if (position.coords.accuracy <= 30) {
          if (gpsTimeoutRef.current !== null) window.clearTimeout(gpsTimeoutRef.current);
          finish();
        }
      },
      (positionError) => {
        if (gpsTimeoutRef.current !== null) window.clearTimeout(gpsTimeoutRef.current);
        if (finished) return;
        finished = true;
        if (gpsWatchRef.current !== null) navigator.geolocation.clearWatch(gpsWatchRef.current);
        const message = positionError.code === positionError.PERMISSION_DENIED
          ? "Izin lokasi ditolak. Aktifkan izin lokasi untuk browser ini."
          : positionError.code === positionError.TIMEOUT
            ? "GPS belum mendapatkan lokasi. Coba tekan tombol lagi di area terbuka."
            : "Lokasi tidak dapat diambil. Pastikan GPS perangkat aktif.";
        setError(message);
        setGpsLoading(false);
        setGpsDialogMode(null);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  function useCurrentLocation() {
    startGpsCapture();
  }

  function changeManualGps(enabled: boolean) {
    setManualGps(enabled);
    if (!enabled) setGps("");
  }

  function cancelGps() {
    if (gpsWatchRef.current !== null) navigator.geolocation.clearWatch(gpsWatchRef.current);
    if (gpsTimeoutRef.current !== null) window.clearTimeout(gpsTimeoutRef.current);
    bestPositionRef.current = null;
    setGpsDialogMode(null);
    setGpsLoading(false);
  }

  function acceptGps() {
    if (!gpsCandidate) return;
    setGps(gpsCandidate.location);
    setManualGps(false);
    setGpsCandidate(null);
    setGpsDialogMode(null);
  }

  function retryGps() {
    setGpsCandidate(null);
    setGpsDialogMode(null);
    startGpsCapture();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db) return setError("Sistem data belum siap.");
    if (gpsLoading) return setError("Tunggu sampai GPS selesai mengambil lokasi.");
    if (!revision && !normalizeOrganization(profile?.organisasi)) return setError("Organisasi pada profil Anda belum diatur. Hubungi admin sebelum mengirim data.");
    if (hotspotCodeLoading) return setError("Tunggu sampai kode hotspot selesai dibuat.");
    if (!activeHotspotCode) return setError("Lengkapi nama hotspot, kelurahan, dan alamat untuk membuat kode hotspot.");
    const form = new FormData(event.currentTarget);
    if (!form.getAll("populasiKunci").some((value) => typeof value === "string" && value.trim())) {
      return setError("Pilih minimal satu populasi kunci.");
    }
    const selectedDocuments = [1, 2, 3].map((number) => {
      const file = form.get(number === 1 ? "document" : `document${number}`);
      return file instanceof File && file.size ? file : null;
    });
    if (!revision && selectedDocuments.slice(0, 2).some((file) => !file)) return setError("Dua foto dokumentasi wajib dipilih.");
    if (manualGps && !profile?.manualGpsEnabled) return setError("Input GPS manual tidak diizinkan untuk akun ini.");
    if (!gps) return setError(manualGps ? "Lintang dan bujur GPS wajib diisi." : "Titik koordinat GPS wajib diambil dari perangkat.");
    if (manualGps) {
      const coordinates = gps.split(",").map((part) => part.trim());
      const [latitudeText, longitudeText] = coordinates;
      const coordinatePattern = /^-?\d{1,3}(?:\.\d{1,8})?$/;
      const latitude = Number(latitudeText);
      const longitude = Number(longitudeText);
      if (
        coordinates.length !== 2
        || !coordinatePattern.test(latitudeText || "")
        || !coordinatePattern.test(longitudeText || "")
        || !Number.isFinite(latitude)
        || !Number.isFinite(longitude)
        || latitude < -90 || latitude > 90
        || longitude < -180 || longitude > 180
      ) {
        return setError("Koordinat GPS tidak valid. Periksa lintang (-90 sampai 90) dan bujur (-180 sampai 180), maksimal 8 angka desimal.");
      }
    }
    const educated = Number(form.get("jumlahDiedukasi") || 0);
    setSaving(true);
    setError("");
    try {
      submissionIdempotencyKey.current ||= crypto.randomUUID();
      const uploadResults: Array<{ index: number; fileName: string; fileId: string; fileUrl: string }> = [];
      for (const [index, document] of selectedDocuments.entries()) {
        if (!document) continue;
        const uploadFile = await prepareImageForUpload(document);
        if (uploadFile.size > MAX_UPLOAD_FILE_BYTES) {
          throw new Error(`Foto "${document.name}" masih terlalu besar setelah diperkecil. Pilih foto lain dengan ukuran di bawah 2 MB.`);
        }
        const fileData = await toBase64(uploadFile);
        const uploadResponse = await fetch("/api/documents/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileData,
            fileName: uploadFile.name,
            fileMime: uploadFile.type || "application/octet-stream",
            enumeratorName: profile?.nama || user.email || "Tanpa Enumerator",
            hotspotCode: activeHotspotCode,
            idempotencyKey: `${submissionIdempotencyKey.current}-${index + 1}`,
          }),
        });
        const responseText = await uploadResponse.text();
        let uploadResult: { success?: boolean; message?: string; fileName?: string; fileId?: string; fileUrl?: string };
        try {
          uploadResult = JSON.parse(responseText) as typeof uploadResult;
        } catch {
          if (uploadResponse.status === 413) {
            throw new Error(`Foto "${document.name}" terlalu besar untuk diunggah. Pilih foto yang lebih kecil.`);
          }
          throw new Error(`Upload foto ${index + 1} gagal (HTTP ${uploadResponse.status}). Coba lagi.`);
        }
        if (!uploadResponse.ok || !uploadResult.success) throw new Error(uploadResult.message || `Upload foto ${index + 1} gagal.`);
        if (!uploadResult.fileName || !uploadResult.fileId || !uploadResult.fileUrl) {
          throw new Error(`Upload foto ${index + 1} berhasil tetapi respons penyimpanan tidak lengkap. Coba kirim ulang.`);
        }
        uploadResults.push({ index, fileName: uploadResult.fileName, fileId: uploadResult.fileId, fileUrl: uploadResult.fileUrl });
      }
      if (revision) {
        const legacyCoordinatorRevision = revision.workflowStage === "awaiting_enumerator_signature"
          && revision.coordinatorReviewStatus === "Perlu perbaikan";
        if ((revision.workflowStage !== "needs_revision" && !legacyCoordinatorRevision) || revision.enumeratorUid !== user.uid) {
          throw new Error("Data ini tidak lagi tersedia untuk direvisi.");
        }
        const revisedDocuments: Array<{ name: string; fileId?: string; url?: string; idempotencyKey?: string }> = [...(revision.documents || [])];
        uploadResults.forEach((uploadResult) => {
          revisedDocuments[uploadResult.index] = {
            name: uploadResult.fileName,
            fileId: uploadResult.fileId,
            url: uploadResult.fileUrl,
            idempotencyKey: `${submissionIdempotencyKey.current}-${uploadResult.index + 1}`,
          };
        });
        if (revisedDocuments.length < 2) throw new Error("Dua foto dokumentasi harus tersedia. Pilih foto pengganti yang belum tersimpan.");
        const revisedAt = new Date().toISOString();
        const returnedByAnalyst = revision.coordinatorReviewStatus === "Valid" && revision.qc === "Perlu perbaikan";
        const revisionStage: WorkflowStage = returnedByAnalyst ? "analyst_review" : "coordinator_review";
        await updateDoc(doc(db, "submissions", revision.id), {
          namaHotspot: String(form.get("namaHotspot") || "").trim(),
          kecamatan: String(form.get("kecamatan") || "").trim(),
          kelurahan: String(form.get("kelurahan") || "").trim(),
          alamat: String(form.get("alamat") || "").trim(),
          koordinat: gps,
          koordinatManual: manualGps,
          statusHotspot: String(form.get("statusHotspot") || "").trim(),
          statusVerifikasi: String(form.get("statusHotspot") || "").trim() === "perlu_verifikasi" ? "perlu_verifikasi" : "terverifikasi_lapangan",
          populasiKunci: form.getAll("populasiKunci"),
          tipeLokasi: String(form.get("tipeLokasi") || "").trim(),
          subTipeLokasi: String(form.get("subTipeLokasi") || "").trim(),
          tipeLokasiLainnya: String(form.get("tipeLokasiLainnya") || "").trim(),
          waktuAktivitas: form.getAll("waktuAktivitas"),
          estimasiJumlahPopulasi: Number(form.get("estimasiJumlahPopulasi") || 0),
          jumlahDiedukasi: educated,
          catatan: String(form.get("catatan") || "").trim(),
          sumberInformasi: String(form.get("sumberInformasi") || "").trim(),
          noHpInforman: String(form.get("noHpInforman") || "").trim(),
          keteranganAktivitas: String(form.get("keteranganAktivitas") || "").trim(),
          kondisiSaatPemetaan: String(form.get("kondisiSaatPemetaan") || "").trim(),
          document: revisedDocuments[0],
          documents: revisedDocuments,
          ...(returnedByAnalyst ? { qcStatus: "pending" } : { coordinatorReviewStatus: "Pending" }),
          workflowStage: revisionStage,
          workflowUpdatedByRole: "enumerator",
          workflowHistory: arrayUnion({
            stage: revisionStage,
            role: "enumerator",
            uid: user.uid,
            actorName: profile?.nama || user.displayName || "",
            at: revisedAt,
            note: returnedByAnalyst
              ? "Enumerator mengirim revisi untuk diperiksa kembali oleh Data Analis."
              : "Enumerator mengirim revisi untuk ditinjau kembali oleh Koordinator.",
          }),
        });
        onSaved();
        return;
      }
      const normalizedHotspotCode = String(form.get("kodeHotspot") || "").trim().toUpperCase();
      const selectedVisitMode = String(form.get("visitMode") || "");
      const selectedPreviousVisitId = String(form.get("previousHotspotId") || "").trim();
      if (selectedVisitMode !== "initial" && selectedVisitMode !== "follow_up") {
        throw new Error("Pilih jenis kunjungan yang valid.");
      }
      if (selectedVisitMode === "follow_up" && !selectedPreviousVisitId) {
        throw new Error("Pilih hotspot dan kunjungan sebelumnya untuk Kunjungan 2.");
      }
      const token = await user.getIdToken();
      const visitResponse = await fetch("/api/submissions/visit", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: selectedVisitMode,
          hotspotCode: normalizedHotspotCode,
          previousVisitId: selectedPreviousVisitId,
        }),
      });
      const visitResult = await visitResponse.json().catch(() => null) as {
        error?: string;
        visitType?: "initial" | "follow_up";
        visitNumber?: number;
        previousVisitId?: string;
        visitReason?: string;
      } | null;
      if (!visitResponse.ok || !visitResult?.visitType || !visitResult.visitNumber) {
        throw new Error(visitResult?.error || "Riwayat kunjungan gagal diverifikasi.");
      }
      await addDoc(collection(db, "submissions"), {
        enumeratorUid: user.uid,
        enumeratorUsername: profile?.username || "",
        enumeratorName: profile?.nama || user.email || "",
        organisasi: String(form.get("organisasi") || "").trim(),
        kodeHotspot: String(form.get("kodeHotspot") || "").trim(),
        hotspotKey: normalizedHotspotCode,
        visitType: visitResult.visitType,
        visitNumber: visitResult.visitNumber,
        previousVisitId: visitResult.previousVisitId || "",
        visitReason: visitResult.visitReason || "",
        visitedAt: new Date().toISOString(),
        namaHotspot: String(form.get("namaHotspot") || "").trim(),
        kecamatan: String(form.get("kecamatan") || "").trim(),
        kelurahan: String(form.get("kelurahan") || "").trim(),
        alamat: String(form.get("alamat") || "").trim(),
        koordinat: gps,
        koordinatManual: manualGps,
        statusHotspot: String(form.get("statusHotspot") || "").trim(),
        statusVerifikasi: String(form.get("statusHotspot") || "").trim() === "perlu_verifikasi" ? "perlu_verifikasi" : "terverifikasi_lapangan",
        populasiKunci: form.getAll("populasiKunci"),
        tipeLokasi: String(form.get("tipeLokasi") || "").trim(),
        subTipeLokasi: String(form.get("subTipeLokasi") || "").trim(),
        tipeLokasiLainnya: String(form.get("tipeLokasiLainnya") || "").trim(),
        waktuAktivitas: form.getAll("waktuAktivitas"),
        estimasiJumlahPopulasi: Number(form.get("estimasiJumlahPopulasi") || 0),
        jumlahDiedukasi: educated,
        catatan: String(form.get("catatan") || "").trim(),
        sumberInformasi: String(form.get("sumberInformasi") || "").trim(),
        noHpInforman: String(form.get("noHpInforman") || "").trim(),
        keteranganAktivitas: String(form.get("keteranganAktivitas") || "").trim(),
        kondisiSaatPemetaan: String(form.get("kondisiSaatPemetaan") || "").trim(),
        document: { name: uploadResults[0].fileName, fileId: uploadResults[0].fileId, url: uploadResults[0].fileUrl, idempotencyKey: `${submissionIdempotencyKey.current}-1` },
        documents: uploadResults.map((uploadResult, index) => ({ name: uploadResult.fileName, fileId: uploadResult.fileId, url: uploadResult.fileUrl, idempotencyKey: `${submissionIdempotencyKey.current}-${index + 1}` })),
        qcStatus: "pending",
        workflowStage: "submitted",
        createdAt: new Date().toISOString(),
      });
      onSaved();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Data gagal disimpan.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="user-modal-backdrop"><section className="user-modal enumerator-modal" role="dialog" aria-modal="true" aria-labelledby="enumerator-form-title"><div className="user-modal-header"><div><p className="eyebrow">Pendataan lapangan</p><h2 id="enumerator-form-title">Input Data Pemetaan</h2><p>Field mengikuti instrumen pemetaan agar data tetap konsisten dan mudah dipantau.</p></div><button className="modal-close" onClick={onClose} aria-label="Tutup">×</button></div>{error && <p className="login-error user-modal-error">{error}</p>}<form className="user-edit-form enumerator-form" onSubmit={submit}><p className="form-section-title form-wide">A. Informasi Pelaksanaan</p><label>Nama Enumerator<input value={profile?.nama || user.email || ""} readOnly /></label><label>Organisasi / Komunitas Pelaksana<select name="organisasi" defaultValue="" required><option value="">Pilih organisasi</option><option value="lgi">Yayasan Lingkar Gagasan Indonesia (LGI)</option><option value="igama">Yayasan IGAMA</option><option value="wamarapa">Wamarapa</option><option value="fatayat_nu">SSR Fatayat NU Jawa Timur (PENASUN)</option></select></label><p className="form-section-title form-wide">B. Identitas Hotspot</p><label>Nama Hotspot<input name="namaHotspot" required /></label><label>Kecamatan<input name="kecamatan" required /></label><label>Kelurahan<input name="kelurahan" required /></label><label className="form-wide">Alamat atau Deskripsi Lokasi<textarea name="alamat" rows={2} required /></label><label className="form-wide">Titik Koordinat GPS<div className="gps-input"><input value={gps} placeholder="Tekan Gunakan GPS" readOnly required /><button type="button" className="button button-secondary" onClick={useCurrentLocation}><DashboardIcon name="mapPin" className="button-icon" /> Gunakan GPS</button></div><small>Koordinat diambil dari lokasi perangkat.</small></label><label className="form-wide">Foto Dokumentasi Lokasi<input name="document" type="file" accept="image/*" capture="environment" required /></label><p className="form-section-title form-wide">C. Karakteristik Hotspot</p><label>Status Hotspot<select name="statusHotspot" defaultValue="" required><option value="">Pilih status</option><option value="aktif">Aktif</option><option value="baru">Baru</option><option value="tidak_aktif">Tidak Aktif</option><option value="perlu_klarifikasi">Perlu Klarifikasi</option><option value="lama">Lama</option></select></label><fieldset><legend>Kategori Populasi Kunci *</legend><div className="checkbox-grid">{[["lsl", "LSL"], ["transgender", "Transgender"], ["idu", "IDU / PWID"], ["pspl___tl__pekerja_seks_perempuan", "PSPL / TL"]].map(([value, label]) => <label key={value}><input type="checkbox" name="populasiKunci" value={value} /> {label}</label>)}</div></fieldset><label>Tipe Lokasi Utama<select name="tipeLokasi" defaultValue="" required><option value="">Pilih tipe lokasi</option><option value="ruang_publik">Ruang Publik / Area Terbuka / Jalanan</option><option value="tempat_makan_hiburan">Tempat Makan / Nongkrong / Hiburan</option><option value="akomodasi_private">Akomodasi / Private Venue</option><option value="perawatan_kebugaran">Perawatan & Kebugaran</option><option value="platform_virtual">Platform Virtual / Online</option><option value="lainnya">Lainnya</option></select></label><label>Detail Sub-Tipe Lokasi<input name="subTipeLokasi" placeholder="Isi sub-tipe lokasi" required /></label><label>Tipe Lokasi Lainnya<input name="tipeLokasiLainnya" /></label><fieldset><legend>Waktu Aktivitas Dominan *</legend><div className="checkbox-grid">{[["pagi", "Pagi"], ["siang", "Siang"], ["sore", "Sore"], ["malam", "Malam"]].map(([value, label]) => <label key={value}><input type="checkbox" name="waktuAktivitas" value={value} /> {label}</label>)}</div></fieldset><label>Jumlah Populasi<input name="estimasiJumlahPopulasi" type="number" min="0" defaultValue="0" /></label><label>Jumlah Diedukasi<input name="jumlahDiedukasi" type="number" min="0" defaultValue="0" /></label><label className="form-wide">Catatan Tambahan Temuan Lapangan<textarea name="catatan" rows={2} /></label><p className="form-section-title form-wide">D. Informasi Hasil Pemetaan</p><label>Sumber Informasi<select name="sumberInformasi" defaultValue="" required><option value="">Pilih sumber</option><option value="populasi_kunci">Populasi kunci</option><option value="tokoh_kunci">Tokoh kunci</option><option value="observasi">Observasi Lapangan Langsung</option><option value="lainnya">Lainnya</option></select></label><label>No. HP Informan<input name="noHpInforman" type="tel" pattern="[0-9+]{9,15}" required /></label><label>Keterangan Informan<input name="keteranganAktivitas" required /></label><label className="form-wide">Kondisi Hotspot Saat Pemetaan<textarea name="kondisiSaatPemetaan" rows={2} required /></label><div className="user-modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Batal</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? "Menyimpan..." : "Simpan Data Pemetaan"}</button></div></form></section></div>;
}

export const MAX_UPLOAD_FILE_BYTES = 2_000_000;

export function readFileWithFileReader(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error("Pembacaan file tidak menghasilkan data biner."));
    };
    reader.onerror = () => reject(reader.error || new Error("Pembacaan file gagal."));
    reader.onabort = () => reject(new Error("Pembacaan file dibatalkan."));
    reader.readAsArrayBuffer(file);
  });
}

export async function toBase64(file: File) {
  let buffer: ArrayBuffer;
  try {
    if (typeof file.arrayBuffer === "function") {
      try {
        buffer = await file.arrayBuffer();
        if (buffer.byteLength !== file.size) throw new Error("Ukuran hasil baca file tidak sesuai.");
      } catch {
        buffer = await readFileWithFileReader(file);
      }
    } else {
      buffer = await readFileWithFileReader(file);
    }
    if (buffer.byteLength !== file.size) throw new Error("Ukuran hasil baca file tidak sesuai.");
  } catch {
    throw new Error(`Browser gagal membaca foto "${file.name}" meskipun sudah mencoba metode alternatif. Coba pilih foto lagi dari Galeri atau ambil ulang dengan kamera.`);
  }

  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export async function prepareImageForUpload(file: File): Promise<File> {
  const supportedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
  const needsCompression = file.size > MAX_UPLOAD_FILE_BYTES || !supportedMimeTypes.has(file.type.toLowerCase());
  if (!needsCompression) return file;

  let image: CanvasImageSource;
  let width: number;
  let height: number;
  let cleanup = () => {};
  let objectUrl: string | null = null;
  try {
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(file);
      image = bitmap;
      width = bitmap.width;
      height = bitmap.height;
      cleanup = () => bitmap.close();
    } else {
      objectUrl = URL.createObjectURL(file);
      const element = new Image();
      await new Promise<void>((resolve, reject) => {
        element.onload = () => resolve();
        element.onerror = () => reject(new Error("Image decode failed."));
        element.src = objectUrl as string;
      });
      image = element;
      width = element.naturalWidth;
      height = element.naturalHeight;
    }

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable.");
    let scale = Math.min(1, 1600 / Math.max(width, height));
    let compressed: Blob | null = null;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const quality = Math.max(0.4, 0.82 - (attempt % 4) * 0.14);
      compressed = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", quality);
      });
      if (!compressed) throw new Error("Image encoding failed.");
      if (compressed.size <= MAX_UPLOAD_FILE_BYTES) break;
      if ((attempt + 1) % 4 === 0) scale *= 0.8;
    }
    if (!compressed || compressed.size > MAX_UPLOAD_FILE_BYTES) {
      throw new Error("Image remains too large after compression.");
    }
    const baseName = file.name.replace(/\.[^.]+$/, "") || "foto-dokumentasi";
    return new File([compressed], `${baseName}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    throw new Error(`Foto "${file.name}" tidak dapat diproses oleh browser. Pilih foto JPG/PNG yang lebih kecil atau ambil foto langsung dari kamera.`);
  } finally {
    cleanup();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
