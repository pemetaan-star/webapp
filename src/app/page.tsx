"use client";

import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { addDoc, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, startAfter, updateDoc, where, type DocumentData, type QueryDocumentSnapshot } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRef } from "react";
import type { Map as LeafletMap } from "leaflet";
import { auth, db, firebaseConfigured } from "@/lib/firebase";
import { Kpi, PanelHeading, Risk } from "@/app/components/dashboard";
import { EnumeratorFormFields } from "@/app/components/enumerator-form";
import { DashboardOverview } from "@/app/components/dashboard-overview";
import { ReviewDetailModal, ReviewQcModal } from "@/app/components/review-modals";

type Hotspot = {
  id: string;
  date: string;
  name: string;
  area: string;
  population: string;
  status: "Aktif" | "Baru" | "Tidak aktif" | "Perlu verifikasi";
  qc: "Valid" | "Pending" | "Perlu perbaikan";
  workflowStage: "submitted" | "supervisor_review" | "coordinator_review" | "analyst_review" | "finalized" | "needs_revision";
  workflowHistory?: Array<{ stage: Hotspot["workflowStage"]; role: string; uid: string; at: string; note?: string }>;
  hotspotCode?: string;
  verificationStatus?: string;
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
  hivPositive?: number;
  hivTests?: number;
  notes?: string;
  informationSource?: string;
  informantPhone?: string;
  activityDescription?: string;
  mappingCondition?: string;
  documentName?: string;
  documentFileId?: string;
  documentUrl?: string;
  qcNote?: string;
  qcInspector?: string;
  qcDate?: string;
};

type SubmissionCursor = QueryDocumentSnapshot<DocumentData> | null;

type UserProfile = {
  id?: string;
  email?: string;
  username?: string;
  name?: string;
  nama?: string;
  role?: string;
};

function normalizeUserProfile(id: string, data: Record<string, unknown>) {
  const profile = { id, ...data } as UserProfile;
  const name = profile.name?.trim() || "Nama belum diatur";
  return { ...profile, name, nama: name };
}

function normalizeRole(role?: string) {
  return (role || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

const statusClass: Record<Hotspot["status"], string> = { Aktif: "status-good", Baru: "status-new", "Tidak aktif": "status-off", "Perlu verifikasi": "status-off" };
const qcClass: Record<Hotspot["qc"], string> = { Valid: "qc-valid", Pending: "qc-pending", "Perlu perbaikan": "qc-repair" };
const workflowStageLabels: Record<Hotspot["workflowStage"], string> = {
  submitted: "Terkirim",
  supervisor_review: "Review Supervisor",
  coordinator_review: "Review Koordinator",
  analyst_review: "Review Data Analis",
  finalized: "Final",
  needs_revision: "Perlu perbaikan",
};
const locationSubtypes: Record<string, Array<[string, string]>> = {
  ruang_publik: [["jalanan_mangkal", "Jalanan / Titik Mangkal"], ["taman_kota", "Taman Kota / Alun-Alun / Halaman"], ["stasiun_terminal", "Stasiun / Terminal / Halte"], ["bangunan_kosong", "Bangunan Kosong / Mangkrak"], ["ruang_publik_lainnya", "Lainnya"]],
  tempat_makan_hiburan: [["warung_makan", "Warung Kopi / Warung Makan"], ["kafe_restoran", "Kafe / Restoran"], ["bar_club", "Bar / Club / Diskotik"], ["karaoke", "Karaoke (Hall / Room)"], ["tempat_makan_lainnya", "Lainnya"]],
  akomodasi_private: [["kos_apartemen", "Kos / Apartemen"], ["rumah_tinggal", "Rumah Tinggal / Kontrakan"], ["penginapan_hotel", "Penginapan / Hotel / Losmen"], ["akomodasi_lainnya", "Lainnya"]],
  perawatan_kebugaran: [["salon", "Salon"], ["spa_gym", "Spa / Sauna / Gym"], ["panti_pijat", "Panti Pijat"], ["perawatan_lainnya", "Lainnya"]],
  platform_virtual: [["aplikasi_kencan", "Aplikasi Kencan"], ["media_sosial", "Media Sosial & Grup Chat"], ["virtual_lainnya", "Lainnya"]],
  lainnya: [["lainnya", "Lainnya"]],
};

async function mapSubmissionSnapshot(snapshot: { docs: QueryDocumentSnapshot<DocumentData>[] }, firestore: NonNullable<typeof db>) {
  return Promise.all(snapshot.docs.map(async (item) => {
    const data = item.data();
    const enumeratorUid = String(data.enumeratorUid || "");
    const storedName = String(data.enumeratorName || "").trim();
    const profileSnapshot = !storedName && enumeratorUid ? await getDoc(doc(firestore, "user", enumeratorUid)) : null;
    const profileName = profileSnapshot?.exists() ? String(profileSnapshot.data().name || profileSnapshot.data().nama || "").trim() : "";
    const enumeratorName = profileName || (storedName && !storedName.includes("@") ? storedName : "Nama belum diatur");
    const status = String(data.statusHotspot || "").toLowerCase();
    const qc = String(data.qcStatus || "pending").toLowerCase();
    const workflowStage = String(data.workflowStage || "submitted") as Hotspot["workflowStage"];
    const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(String(data.createdAt || ""));
    return {
      id: item.id,
      date: Number.isNaN(createdAt.getTime()) ? "-" : createdAt.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }),
      name: String(data.namaHotspot || "Tanpa nama"),
      area: `${String(data.kecamatan || "-")} / ${String(data.kelurahan || "-")}`,
      population: Array.isArray(data.populasiKunci) ? data.populasiKunci.join(", ") : String(data.populasiKunci || "-"),
      status: status === "baru" ? "Baru" : status === "tidak_aktif" ? "Tidak aktif" : status === "perlu_verifikasi" || status === "perlu_klarifikasi" ? "Perlu verifikasi" : "Aktif",
      qc: qc === "valid" ? "Valid" : qc === "perlu_perbaikan" ? "Perlu perbaikan" : "Pending",
      workflowStage: workflowStageLabels[workflowStage] ? workflowStage : "submitted",
      workflowHistory: Array.isArray(data.workflowHistory) ? data.workflowHistory : [],
      hotspotCode: String(data.kodeHotspot || ""),
      verificationStatus: String(data.statusVerifikasi || ""),
      coordinates: String(data.koordinat || ""),
      enumeratorName,
      enumeratorUsername: String(data.enumeratorUsername || ""),
      enumeratorUid,
      organisasi: String(data.organisasi || ""),
      address: String(data.alamat || ""),
      locationType: String(data.tipeLokasi || ""),
      locationSubtype: String(data.subTipeLokasi || ""),
      activityTime: Array.isArray(data.waktuAktivitas) ? data.waktuAktivitas.join(", ") : String(data.waktuAktivitas || ""),
      populationEstimate: Number(data.estimasiJumlahPopulasi || 0),
      educated: Number(data.jumlahDiedukasi || 0),
      hivPositive: Number(data.jumlahHivPositif || 0),
      hivTests: Number(data.jumlahTesHiv || 0),
      notes: String(data.catatan || ""),
      informationSource: String(data.sumberInformasi || ""),
      informantPhone: String(data.noHpInforman || ""),
      activityDescription: String(data.keteranganAktivitas || ""),
      mappingCondition: String(data.kondisiSaatPemetaan || ""),
      documentName: String(data.document?.name || ""),
      documentFileId: String(data.document?.fileId || ""),
      documentUrl: String(data.document?.url || ""),
      qcNote: String(data.qcNote || ""),
      qcInspector: String(data.qcNamaPemeriksa || ""),
      qcDate: String(data.qcTanggalPemeriksaan || ""),
    } as Hotspot & { enumeratorUid: string };
  }));
}

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(!firebaseConfigured);
  const [loginError, setLoginError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"Semua" | Hotspot["qc"]>("Semua");
  const [lastUpdated, setLastUpdated] = useState("baru saja");
  const [hotspotRows, setHotspotRows] = useState<Hotspot[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const [submissionCursor, setSubmissionCursor] = useState<SubmissionCursor>(null);
  const [loadingMoreSubmissions, setLoadingMoreSubmissions] = useState(false);
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [managedUsers, setManagedUsers] = useState<UserProfile[]>([]);
  const [userManagementLoading, setUserManagementLoading] = useState(false);
  const [userManagementError, setUserManagementError] = useState("");
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [showEnumeratorForm, setShowEnumeratorForm] = useState(false);
  const [showSupervisionForm, setShowSupervisionForm] = useState(false);
  const [selectedHotspot, setSelectedHotspot] = useState<Hotspot | null>(null);
  const [showQcModal, setShowQcModal] = useState(false);
  const qcUploadKeys = useRef<Record<string, string>>({});
  const filteredHotspots = useMemo(() => hotspotRows.filter((hotspot) => {
    const matchesQuery = Object.values(hotspot).join(" ").toLowerCase().includes(searchQuery.toLowerCase());
    return matchesQuery && (filter === "Semua" || hotspot.qc === filter);
  }), [filter, hotspotRows, searchQuery]);
  const totalHotspots = hotspotRows.length;
  const activeHotspots = hotspotRows.filter((item) => item.status === "Aktif" || item.status === "Baru").length;
  const pendingQc = hotspotRows.filter((item) => item.qc !== "Valid").length;
  const hivPositive = 0;
  const hivTests = 0;
  const roleKey = normalizeRole(userProfile?.role);
  const isEnumerator = roleKey === "enumerator";
  const isSupervisor = roleKey.includes("supervisor") || roleKey.includes("supervisi");
  const isCoordinator = roleKey.includes("koordinator") || roleKey.includes("kordinator") || roleKey.includes("koor");
  const isAnalyst = roleKey.includes("dataanalis") || roleKey.includes("dataanalyst");
  const isReviewer = isCoordinator || isAnalyst || roleKey === "admin";
  const canSupervise = !isEnumerator && (isReviewer || isSupervisor);
  const roleTitle = isEnumerator ? "Dashboard Enumerator" : isReviewer ? "Dashboard Koordinator & Data Analis" : roleKey.includes("super") ? "Dashboard Supervisor" : "Dashboard Pendataan Hotspot";
  const roleSubtitle = isEnumerator ? "Kelola input dan pantau data hotspot yang Anda kirim." : "Ringkasan data survei lapangan dan status validasi kualitas secara real-time.";

  useEffect(() => {
    if (!auth) {
      return;
    }
    return onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      setIsLoggedIn(Boolean(user));
      if (user && db) {
        const profileSnapshot = await getDoc(doc(db, "user", user.uid));
        if (profileSnapshot.exists()) {
          setUserProfile(normalizeUserProfile(profileSnapshot.id, profileSnapshot.data()));
        } else if (user.email) {
          const profileQuery = query(collection(db, "user"), where("email", "==", user.email), limit(1));
          const profileByEmail = await getDocs(profileQuery);
          const profile = profileByEmail.docs[0];
          setUserProfile(profile ? normalizeUserProfile(profile.id, profile.data()) : null);
          if (profile && profile.id !== user.uid) {
            setDataError("Profil ditemukan berdasarkan email, tetapi ID dokumen harus sama dengan UID Firebase agar dashboard dapat membaca submissions.");
          }
        } else {
          setUserProfile(null);
          setDataLoading(false);
          setDataError("Profil user belum ditemukan. Buat dokumen user dengan ID UID Firebase dan field role.");
        }
      } else {
        setUserProfile(null);
        setDataLoading(false);
      }
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    if (!db || !authUser || !userProfile) return;
    const firestore = db;
    const submissionsQuery = (isEnumerator ? query(collection(firestore, "submissions"), where("enumeratorUid", "==", authUser.uid), orderBy("createdAt", "desc"), limit(25)) : query(collection(firestore, "submissions"), orderBy("createdAt", "desc"), limit(25)));
    const unsubscribe = onSnapshot(submissionsQuery, async (snapshot) => {
      try {
        const rows = await mapSubmissionSnapshot(snapshot, firestore);
        setHotspotRows(rows);
        setSubmissionCursor(snapshot.docs.at(-1) || null);
      } catch {
        setDataError("Data Firestore tidak dapat dipetakan ke format dashboard.");
      } finally {
        setDataLoading(false);
      }
    }, (error) => {
      const code = error instanceof Error && "code" in error ? String(error.code) : "";
      setDataError(code === "permission-denied"
        ? "Akses Firestore ditolak (permission-denied). Pastikan dokumen user/{UID Firebase} tersedia dan role sesuai."
        : code === "failed-precondition"
          ? "Query Firestore memerlukan index. Buka tautan index dari Console Firebase atau periksa index submissions."
          : `Data Firestore tidak dapat dimuat${code ? ` (${code})` : ""}. Periksa konfigurasi Firebase dan Rules.`);
      setDataLoading(false);
    });
    return unsubscribe;
  }, [authUser, isEnumerator, userProfile]);

  const loadMoreSubmissions = useCallback(async () => {
    if (!db || !authUser || !userProfile || !submissionCursor || loadingMoreSubmissions) return;
    setLoadingMoreSubmissions(true);
    try {
      const role = normalizeRole(userProfile.role);
      const nextQuery = role === "enumerator"
        ? query(collection(db, "submissions"), where("enumeratorUid", "==", authUser.uid), orderBy("createdAt", "desc"), startAfter(submissionCursor), limit(25))
        : query(collection(db, "submissions"), orderBy("createdAt", "desc"), startAfter(submissionCursor), limit(25));
      const snapshot = await getDocs(nextQuery);
      const rows = await mapSubmissionSnapshot(snapshot, db);
      setHotspotRows((current) => [...current, ...rows]);
      setSubmissionCursor(snapshot.docs.at(-1) || submissionCursor);
    } catch {
      setDataError("Halaman data berikutnya tidak dapat dimuat.");
    } finally {
      setLoadingMoreSubmissions(false);
    }
  }, [authUser, loadingMoreSubmissions, submissionCursor, userProfile]);

  useEffect(() => {
    const handleLoadMore = () => { void loadMoreSubmissions(); };
    window.addEventListener("load-more-submissions", handleLoadMore);
    return () => window.removeEventListener("load-more-submissions", handleLoadMore);
  }, [loadMoreSubmissions]);

  useEffect(() => {
    document.querySelectorAll<HTMLElement>(".role-action-count").forEach((element) => {
      element.textContent = String(pendingQc);
    });
  }, [pendingQc]);

  useEffect(() => {
    document.querySelectorAll<HTMLElement>("label, .detail-item small").forEach((element) => {
      if (element.textContent?.trim() === "Keterangan Aktivitas" || element.textContent?.trim() === "Keterangan aktivitas") {
        const textNode = Array.from(element.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
        if (textNode) textNode.textContent = "Keterangan Informan";
      }
    });
    const form = document.querySelector<HTMLFormElement>(".enumerator-form");
    const firstPhoto = form?.querySelector<HTMLInputElement>('input[name="document"]');
    if (form && firstPhoto && !form.dataset.photoCount) {
      form.dataset.photoCount = "3";
      firstPhoto.required = true;
      const firstLabel = firstPhoto.closest("label");
      if (firstLabel) {
        const firstText = Array.from(firstLabel.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
        if (firstText) firstText.textContent = "Foto Dokumentasi 1";
      }
      [2, 3].forEach((number) => {
        const label = document.createElement("label");
        label.className = "form-wide";
        label.textContent = `Foto Dokumentasi ${number}`;
        const input = document.createElement("input");
        input.name = `document${number}`;
        input.type = "file";
        input.accept = "image/*";
        input.setAttribute("capture", "environment");
        input.required = true;
        label.appendChild(input);
        form.insertBefore(label, form.querySelector("button[type=submit]")?.parentElement || null);
      });
    }
  }, [selectedHotspot, showEnumeratorForm]);

  async function handleLogout() {
    if (auth) await signOut(auth);
  }

  async function saveQcStatus(payload: { status: Hotspot["qc"]; note: string; kelengkapan: string; duplikasi: string; kroscek: string; pemeriksa: string; tanggal: string; document?: File }) {
    if (!db || !selectedHotspot || !isReviewer) return;
    let approvalDocument: { name: string; fileId: string; url: string } | null = null;
    if (payload.document?.size) {
      const idempotencyKey = qcUploadKeys.current[selectedHotspot.id] || crypto.randomUUID();
      qcUploadKeys.current[selectedHotspot.id] = idempotencyKey;
      const response = await fetch("/api/documents/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileData: await toBase64(payload.document), fileName: payload.document.name, fileMime: payload.document.type || "application/octet-stream", folderName: "Persetujuan QC", idempotencyKey }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Dokumen persetujuan gagal diunggah.");
      approvalDocument = { name: result.fileName, fileId: result.fileId, url: result.fileUrl };
    }
    const workflowStage: Hotspot["workflowStage"] = payload.status === "Perlu perbaikan"
      ? "needs_revision"
      : payload.status === "Valid"
        ? (isAnalyst || roleKey === "admin" ? "finalized" : "analyst_review")
        : (isCoordinator ? "coordinator_review" : "analyst_review");
    await updateDoc(doc(db, "submissions", selectedHotspot.id), {
      qcStatus: payload.status === "Valid" ? "valid" : payload.status === "Perlu perbaikan" ? "perlu_perbaikan" : "pending",
      qcKelengkapan: payload.kelengkapan,
      qcDuplikasi: payload.duplikasi,
      qcKroscek: payload.kroscek,
      qcNote: payload.note,
      qcNamaPemeriksa: payload.pemeriksa,
      qcTanggalPemeriksaan: payload.tanggal,
      ...(approvalDocument ? { qcDokumenPersetujuan: approvalDocument } : {}),
      qcReviewerUid: authUser?.uid || "",
      qcReviewedAt: new Date().toISOString(),
      workflowStage,
      workflowUpdatedByRole: userProfile?.role || "",
      workflowHistory: arrayUnion({ stage: workflowStage, role: userProfile?.role || "", uid: authUser?.uid || "", at: new Date().toISOString(), note: payload.note }),
    });
    setHotspotRows((rows) => rows.map((row) => row.id === selectedHotspot.id ? { ...row, qc: payload.status } : row));
    setShowQcModal(false);
    setSelectedHotspot(null);
  }

  async function openUserManagement() {
    if (userProfile?.role?.toLowerCase() !== "admin" || !db) return;
    setShowUserManagement(true);
    setUserManagementLoading(true);
    setUserManagementError("");
    try {
      const snapshot = await getDocs(collection(db, "user"));
      setManagedUsers(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as UserProfile));
    } catch {
      setUserManagementError("Daftar user tidak dapat dimuat. Periksa Firestore Rules.");
    } finally {
      setUserManagementLoading(false);
    }
  }

  async function saveUserProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db || !editingUser?.id) return;
    const formData = new FormData(event.currentTarget);
    try {
      await updateDoc(doc(db, "user", editingUser.id), {
        username: String(formData.get("username") || "").trim(),
        email: String(formData.get("email") || "").trim(),
        name: String(formData.get("name") || formData.get("nama") || "").trim(),
        role: String(formData.get("role") || "enumerator").trim(),
      });
      setManagedUsers((users) => users.map((user) => user.id === editingUser.id ? {
        ...user,
        username: String(formData.get("username") || "").trim(),
        email: String(formData.get("email") || "").trim(),
        name: String(formData.get("name") || formData.get("nama") || "").trim(),
        role: String(formData.get("role") || "enumerator").trim(),
      } : user));
      setEditingUser(null);
    } catch {
      setUserManagementError("Profil user gagal disimpan.");
    }
  }

  async function removeUserProfile(user: UserProfile) {
    if (!db || !user.id || user.id === authUser?.uid || user.id === userProfile?.id) return;
    if (!window.confirm(`Hapus profil ${user.nama || user.username || "user ini"}?`)) return;
    try {
      await deleteDoc(doc(db, "user", user.id));
      setManagedUsers((users) => users.filter((item) => item.id !== user.id));
    } catch {
      setUserManagementError("Profil user gagal dihapus.");
    }
  }

  if (!authReady || !isLoggedIn) {
    return <LoginScreen onLogin={(user) => { setAuthUser(user); setIsLoggedIn(true); }} loginError={loginError} setLoginError={setLoginError} />;
  }

  return (
    <div className={`dashboard-page ${isReviewer ? "can-review" : "read-only"} ${isEnumerator ? "enumerator-dashboard" : "reviewer-dashboard"}`}>
      {dataLoading && authUser && userProfile && <DashboardLoading />}
      <nav className="topbar"><div className="brand"><span className="brand-mark">+</span><span>Pemetaan Hotspot<br /><small>Kota Malang 2026</small></span></div><div className="topbar-actions"><span className="user-chip"><span className="avatar">{(userProfile?.nama?.[0] || authUser?.email?.[0] || "A").toUpperCase()}</span><span><strong>{userProfile?.nama || authUser?.email || "Pengguna"}</strong><small>{userProfile?.role || "Firebase User"}</small></span></span>{userProfile?.role?.toLowerCase() === "admin" && <button className="button button-ghost" onClick={openUserManagement}>♙ <span>Manajemen User</span></button>}{isEnumerator && <button className="button button-accent" onClick={() => setShowEnumeratorForm(true)}>＋ <span>Input Data</span></button>}<button className="icon-button" onClick={handleLogout} aria-label="Keluar">↪</button></div></nav>
      <main className="dashboard-content">
        <section className="intro-row"><div><p className="eyebrow">{isEnumerator ? "Pendataan Lapangan" : "Monitoring &amp; Quality Control"}</p><h1>{roleTitle}</h1><p className="subtitle">{roleSubtitle}</p></div><div className="sync-note"><span className="live-dot" /> Data tersinkronisasi <strong>{lastUpdated}</strong></div></section>
        {isEnumerator && <section className="role-actions"><article><span className="role-action-icon">＋</span><div><strong>Input data hotspot</strong><p>Tambahkan hasil pemetaan baru dari lapangan.</p></div><button className="button button-accent" onClick={() => setShowEnumeratorForm(true)}>Mulai input →</button></article><article><span className="role-action-icon role-action-blue">◷</span><div><strong>Data menunggu QC</strong><p>Pantau status data yang sudah dikirim.</p></div><strong className="role-action-count">3</strong></article></section>}
        <section className="kpi-grid" aria-label="Ringkasan data"><Kpi tone="blue" label={isEnumerator ? "DATA SAYA TERCATAT" : "TOTAL HOTSPOT TERCATAT"} value={String(totalHotspots)} note={dataError || (dataLoading ? "Memuat Firestore..." : "Data aktual Firestore")} icon="▦" /><Kpi tone="teal" label={isEnumerator ? "DATA TERKIRIM" : "HOTSPOT BARU & AKTIF"} value={String(activeHotspots)} note="Status aktif dan baru" icon="⌁" /><Kpi tone="amber" label={isEnumerator ? "MENUNGGU QC" : "PERLU VALIDASI QC"} value={String(pendingQc)} note="Menunggu pemeriksaan" icon="!" /><Kpi tone="coral" label="HIV+ / JUMLAH TES" value={String(hivPositive)} suffix={`/ ${hivTests} Tes`} note="Dari data Firestore" icon="♥" /></section>
        <section className="panel table-panel"><div className="table-toolbar"><div><PanelHeading icon="≡" title={isEnumerator ? "Data Pendataan Saya" : "Data Survei & Quality Control"} subtitle={isEnumerator ? "Pantau status validasi dan catatan tindak lanjut data yang Anda kirim." : "Pilih data untuk melihat detail atau melakukan validasi analis"} /></div><div className="table-controls"><div className="search-box"><span>⌕</span><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Cari nama / kelurahan..." /></div><select value={filter} onChange={(event) => setFilter(event.target.value as "Semua" | Hotspot["qc"])} aria-label="Filter status QC"><option>Semua</option><option>Valid</option><option>Pending</option><option>Perlu perbaikan</option></select></div></div><div className="table-wrap"><table><thead><tr><th>ID DATA</th><th>TANGGAL</th><th>NAMA HOTSPOT</th><th>WILAYAH</th><th>POPULASI KUNCI</th><th>STATUS FISIK</th><th>STATUS VALIDASI QC</th><th>AKSI</th></tr></thead><tbody>{filteredHotspots.map((hotspot) => <tr key={hotspot.id}><td className="mono">{hotspot.id}</td><td>{hotspot.date}</td><td><strong>{hotspot.name}</strong></td><td>{hotspot.area}</td><td>{hotspot.population}</td><td><span className={`status-badge ${statusClass[hotspot.status]}`}><i />{hotspot.status}</span></td><td><span className={`qc-badge ${qcClass[hotspot.qc]}`}>{hotspot.qc}</span></td><td><button className="row-action" onClick={() => { setSelectedHotspot(hotspot); setShowQcModal(false); }} aria-label={`Lihat detail ${hotspot.name}`}>→</button></td></tr>)}{filteredHotspots.length === 0 && <tr><td colSpan={8} className="empty-state">{dataLoading ? "Memuat data Firestore..." : "Data tidak ditemukan."}</td></tr>}</tbody></table></div><div className="table-footer">Menampilkan <strong>{filteredHotspots.length}</strong> dari {totalHotspots} data <button className="button button-link">Lihat semua data →</button></div></section>
        <DashboardOverview rows={hotspotRows} />
      </main>
      {showUserManagement && <UserManagementModal users={managedUsers} loading={userManagementLoading} error={userManagementError} editingUser={editingUser} onClose={() => { setShowUserManagement(false); setEditingUser(null); }} onEdit={setEditingUser} onSave={saveUserProfile} onDelete={removeUserProfile} />}
      {showEnumeratorForm && authUser && <EnumeratorForm user={authUser} profile={userProfile} existingHotspots={hotspotRows} onClose={() => setShowEnumeratorForm(false)} onSaved={() => { setShowEnumeratorForm(false); setLastUpdated("sekarang"); }} />}
      {canSupervise && authUser && <SupervisorForm open={showSupervisionForm} user={authUser} profile={userProfile} rows={hotspotRows} onOpen={() => setShowSupervisionForm(true)} onClose={() => setShowSupervisionForm(false)} onSaved={() => { setShowSupervisionForm(false); setLastUpdated("sekarang"); }} />}
      {selectedHotspot && !showQcModal && <ReviewDetailModal hotspot={selectedHotspot} canReview={isReviewer} onClose={() => setSelectedHotspot(null)} onReview={() => setShowQcModal(true)} />}
      {selectedHotspot && showQcModal && <ReviewQcModal hotspot={selectedHotspot} onClose={() => setShowQcModal(false)} onSave={saveQcStatus} />}
    </div>
  );
}

function DashboardLoading() { return <div className="dashboard-loading" role="status" aria-live="polite" aria-busy="true"><div className="dashboard-loading-card"><div className="dashboard-loading-brand"><span>+</span></div><p className="dashboard-loading-kicker">Data intelligence platform</p><h2>Menyiapkan dashboard</h2><p>Mengambil data terbaru dari Firestore...</p><div className="dashboard-loading-track" /></div></div>; }

// Legacy renderers retained for backwards-compatible references; active UI uses dashboard-overview.tsx.
/* eslint-disable @typescript-eslint/no-unused-vars */
function RealDataOverview({ rows }: { rows: Hotspot[] }) {
  const areaCounts = rows.reduce<Record<string, number>>((counts, row) => {
    const area = row.area.split("/")[0].trim() || "Lainnya";
    counts[area] = (counts[area] || 0) + 1;
    return counts;
  }, {});
  const areas = Object.entries(areaCounts).sort((first, second) => second[1] - first[1]);
  const maxArea = areas[0]?.[1] || 1;
  const risks = [
    ["HOTSPOT BARU", rows.filter((row) => row.status === "Baru").length, "teal"],
    ["TIDAK AKTIF", rows.filter((row) => row.status === "Tidak aktif").length, "coral"],
    ["PENDING QC", rows.filter((row) => row.qc === "Pending").length, "amber"],
    ["PERLU PERBAIKAN", rows.filter((row) => row.qc === "Perlu perbaikan").length, "blue"],
  ] as const;
  const coordinates = rows.map((row) => {
    const [latitude, longitude] = (row.coordinates || "").split(/[\s,]+/).map(Number);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { row, left: Math.max(5, Math.min(92, ((longitude - 112.55) / .16) * 100)), top: Math.max(8, Math.min(88, ((-latitude - 7.88) / .16) * 100)) };
  }).filter((item): item is { row: Hotspot; left: number; top: number } => item !== null);

  return <section className="real-overview"><div className="real-overview-grid"><article className="panel map-panel"><PanelHeading icon="⌖" title="Peta Persebaran Hotspot" subtitle={`${coordinates.length} dari ${rows.length} data memiliki koordinat`} tag="REAL DATA" /><RealLeafletMap rows={rows} /></article><article className="panel distribution-panel"><PanelHeading icon="◔" title="Distribusi Kecamatan" subtitle="Dihitung dari data Firestore" /><div className="real-bars">{areas.length === 0 ? <div className="real-empty">Belum ada data wilayah.</div> : areas.slice(0, 6).map(([area, count], index) => <div className="real-bar-row" key={area}><div><span>{area}</span><strong>{count}</strong></div><i className={`real-bar real-bar-${index % 4}`} style={{ width: `${Math.max(8, (count / maxArea) * 100)}%` }} /></div>)}</div></article></div><article className="panel real-risk-panel"><PanelHeading icon="!" title="Risiko Otomatis" subtitle="Ringkasan status yang dihitung dari data aktual" tag="REAL DATA" /><div className="risk-grid">{risks.map(([label, value, tone]) => <Risk key={label} label={label} value={String(value)} tone={tone} />)}</div></article>{rows.length >= 25 && <button type="button" className="button button-secondary" onClick={() => window.dispatchEvent(new Event("load-more-submissions"))}>Muat data berikutnya</button>}</section>;
}

function RealLeafletMap({ rows }: { rows: Hotspot[] }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<LeafletMap | null>(null);
  const points = useMemo(() => rows.map((row) => {
    const [lat, lng] = (row.coordinates || "").split(/[\s,]+/).map(Number);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { row, lat, lng } : null;
  }).filter((point): point is { row: Hotspot; lat: number; lng: number } => point !== null), [rows]);

  useEffect(() => {
    let active = true;
    const container = mapRef.current;
    let map: LeafletMap | null = null;
    import("leaflet").then((leaflet) => {
      if (!active || !container || instanceRef.current || points.length === 0 || container.dataset.leafletReady === "true") return;
      container.dataset.leafletReady = "true";
      const currentMap = leaflet.map(container, { zoomControl: true }).setView([-7.9666, 112.6326], 12);
      map = currentMap;
      instanceRef.current = currentMap;
      leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap" }).addTo(currentMap);
      points.forEach(({ row, lat, lng }) => {
        const popup = document.createElement("div");
        const name = document.createElement("strong");
        name.textContent = row.name;
        popup.append(name, document.createElement("br"), document.createTextNode(row.area), document.createElement("br"), document.createTextNode(`Status QC: ${row.qc}`));
        leaflet.circleMarker([lat, lng], { radius: 8, color: "#ffffff", weight: 3, fillColor: row.qc === "Valid" ? "#0f9f94" : row.qc === "Perlu perbaikan" ? "#ec765d" : "#e5ad44", fillOpacity: 1 }).addTo(currentMap).bindPopup(popup);
      });
      if (points.length === 1) currentMap.setView([points[0].lat, points[0].lng], 14);
      if (points.length > 1) currentMap.fitBounds(points.map((point) => [point.lat, point.lng] as [number, number]), { padding: [24, 24], maxZoom: 15 });
    });
    return () => {
      active = false;
      if (map) {
        map.remove();
        if (instanceRef.current === map) instanceRef.current = null;
      }
      if (container) container.dataset.leafletReady = "false";
    };
  }, [points]);

  return <div className="leaflet-map-wrap"><div ref={mapRef} className="leaflet-map" />{points.length === 0 && <div className="real-empty">Belum ada koordinat GPS pada data Firestore.</div>}</div>;
}
/* eslint-enable @typescript-eslint/no-unused-vars */

/* eslint-disable @typescript-eslint/no-unused-vars */
// Legacy modal retained for backwards-compatible references; active UI uses review-modals.tsx.
function DetailModal({ hotspot, canReview, onClose, onReview }: { hotspot: Hotspot; canReview: boolean; onClose: () => void; onReview: () => void }) {
  const isImage = /\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(hotspot.documentName || "");
  const previewUrl = hotspot.documentFileId ? `/api/documents/preview?fileId=${encodeURIComponent(hotspot.documentFileId)}` : "";
  return <div className="user-modal-backdrop"><section className="user-modal detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-modal-title"><div className="user-modal-header"><div><p className="eyebrow">Detail pendataan</p><h2 id="detail-modal-title">{hotspot.name}</h2><p>{hotspot.id} · {hotspot.area}</p></div><button className="modal-close" onClick={onClose} aria-label="Tutup">×</button></div><div className="detail-section"><p className="form-section-title">Informasi pendataan</p><div className="detail-grid"><DetailItem label="Enumerator" value={hotspot.enumeratorName || hotspot.enumeratorUsername} /><DetailItem label="Organisasi" value={hotspot.organisasi} /><DetailItem label="Status hotspot" value={hotspot.status} /><DetailItem label="Koordinat GPS" value={hotspot.coordinates} /><DetailItem label="Kecamatan / Kelurahan" value={hotspot.area} /><DetailItem label="Alamat" value={hotspot.address} /><DetailItem label="Populasi kunci" value={hotspot.population} /><DetailItem label="Tipe lokasi" value={[hotspot.locationType, hotspot.locationSubtype].filter(Boolean).join(" / ")} /><DetailItem label="Waktu aktivitas" value={hotspot.activityTime} /><DetailItem label="Estimasi populasi" value={String(hotspot.populationEstimate || 0)} /><DetailItem label="Jumlah diedukasi" value={String(hotspot.educated || 0)} /><DetailItem label="Tes HIV / HIV+" value={`${hotspot.hivTests || 0} / ${hotspot.hivPositive || 0}`} /></div><DetailItem label="Alamat atau deskripsi lokasi" value={hotspot.address} wide /><DetailItem label="Keterangan aktivitas" value={hotspot.activityDescription} wide /><DetailItem label="Kondisi saat pemetaan" value={hotspot.mappingCondition} wide /><DetailItem label="Sumber informasi" value={hotspot.informationSource} /><DetailItem label="Nomor HP informan" value={hotspot.informantPhone} /><DetailItem label="Catatan Enumerator" value={hotspot.notes} wide /></div><div className="detail-section"><p className="form-section-title">Dokumen dan hasil QC</p>{isImage && previewUrl && <a className="document-preview" href={previewUrl} target="_blank" rel="noreferrer"><img src={previewUrl} alt={`Dokumentasi ${hotspot.name}`} /></a>}<div className="detail-grid"><DetailItem label="Dokumentasi" value={hotspot.documentName || "Tidak ada dokumen"} link={hotspot.documentUrl} /><DetailItem label="Status QC" value={hotspot.qc} /><DetailItem label="Pemeriksa" value={hotspot.qcInspector} /><DetailItem label="Tanggal pemeriksaan" value={hotspot.qcDate} /></div><DetailItem label="Catatan QC" value={hotspot.qcNote} wide /></div><div className="user-modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Tutup</button>{canReview && <button type="button" className="button button-primary" onClick={onReview}>Buka validasi QC</button>}</div></section></div>;
}

function DetailItem({ label, value, link, wide }: { label: string; value?: string; link?: string; wide?: boolean }) {
  const displayValue = value?.trim() || "-";
  return <div className={`detail-item ${wide ? "detail-item-wide" : ""}`}><small>{label}</small>{link ? <a href={link} target="_blank" rel="noreferrer">{displayValue}</a> : <strong>{displayValue}</strong>}</div>;
}

// Legacy modal retained temporarily; active UI uses review-modals.tsx.
function QcModal({ hotspot, onClose, onSave }: { hotspot: Hotspot; onClose: () => void; onSave: (payload: { status: Hotspot["qc"]; note: string; kelengkapan: string; duplikasi: string; kroscek: string; pemeriksa: string; tanggal: string; document?: File }) => Promise<void> }) {
  const [status, setStatus] = useState<Hotspot["qc"]>(hotspot.qc);
  const [kelengkapan, setKelengkapan] = useState("lengkap");
  const [duplikasi, setDuplikasi] = useState("tidak_ada");
  const [note, setNote] = useState("");
  const [kroscek, setKroscek] = useState("sesuai");
  const [pemeriksa, setPemeriksa] = useState("");
  const [tanggal, setTanggal] = useState(new Date().toISOString().slice(0, 10));
  const [document, setDocument] = useState<File>();
  const [saving, setSaving] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try { await onSave({ status, note, kelengkapan, duplikasi, kroscek, pemeriksa, tanggal, document }); } finally { setSaving(false); }
  }
  return <div className="user-modal-backdrop"><section className="user-modal qc-modal" role="dialog" aria-modal="true"><div className="user-modal-header"><div><p className="eyebrow">Quality control</p><h2>Review Data Hotspot</h2><p>{hotspot.name} · {hotspot.area}</p></div><button className="modal-close" onClick={onClose} aria-label="Tutup">×</button></div><div className="qc-detail-grid"><div><small>ID Data</small><strong>{hotspot.id}</strong></div><div><small>Status fisik</small><strong>{hotspot.status}</strong></div><div><small>Populasi kunci</small><strong>{hotspot.population}</strong></div><div><small>Koordinat</small><strong>{hotspot.coordinates || "-"}</strong></div></div><form onSubmit={submit} className="qc-form"><label>Pemeriksaan kelengkapan<select value={kelengkapan} onChange={(event) => setKelengkapan(event.target.value)}><option value="lengkap">Lengkap &amp; Sesuai Standar</option><option value="perlu_perbaikan">Perlu Perbaikan / Isian Belum Lengkap</option></select></label><label>Indikasi duplikasi<select value={duplikasi} onChange={(event) => setDuplikasi(event.target.value)}><option value="tidak_ada">Tidak Ada Indikasi Duplikasi</option><option value="ada">Ada Indikasi Duplikasi</option></select></label><label>Kroscek antar enumerator<select value={kroscek} onChange={(event) => setKroscek(event.target.value)}><option value="sesuai">Sesuai Hasil Kroscek</option><option value="perlu_klarifikasi">Perlu Klarifikasi Ulang</option></select></label><label>Status data akhir<select value={status} onChange={(event) => setStatus(event.target.value as Hotspot["qc"])}><option value="Valid">Valid - Masuk Database Utama</option><option value="Pending">Perlu Tindak Lanjut</option><option value="Perlu perbaikan">Tidak Valid - Perlu Perbaikan</option></select></label><label>Catatan analis<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} /></label><label>Dokumentasi persetujuan QC<input type="file" accept="image/*,.pdf,.doc,.docx" onChange={(event) => setDocument(event.target.files?.[0])} /></label><div className="qc-form-grid"><label>Nama pemeriksa<input value={pemeriksa} onChange={(event) => setPemeriksa(event.target.value)} required /></label><label>Tanggal pemeriksaan<input type="date" value={tanggal} onChange={(event) => setTanggal(event.target.value)} required /></label></div><div className="user-modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Batal</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? "Menyimpan..." : "Simpan hasil QC"}</button></div></form></section></div>;
}
/* eslint-enable @typescript-eslint/no-unused-vars */
function UserManagementModal({ users, loading, error, editingUser, onClose, onEdit, onSave, onDelete }: { users: UserProfile[]; loading: boolean; error: string; editingUser: UserProfile | null; onClose: () => void; onEdit: (user: UserProfile) => void; onSave: (event: React.FormEvent<HTMLFormElement>) => void; onDelete: (user: UserProfile) => void }) {
  return <div className="user-modal-backdrop" role="presentation"><section className="user-modal" role="dialog" aria-modal="true" aria-labelledby="user-management-title"><div className="user-modal-header"><div><p className="eyebrow">Admin control</p><h2 id="user-management-title">Manajemen User</h2><p>Kelola profil, username, email, dan role pengguna.</p></div><button className="modal-close" onClick={onClose} aria-label="Tutup">×</button></div>{error && <p className="login-error user-modal-error">{error}</p>}{editingUser ? <form className="user-edit-form" onSubmit={onSave}><label>Username<input name="username" defaultValue={editingUser.username || ""} required /></label><label>Email Firebase<input name="email" type="email" defaultValue={editingUser.email || ""} required /></label><label>Nama<input name="nama" defaultValue={editingUser.nama || ""} required /></label><label>Role<select name="role" defaultValue={editingUser.role || "enumerator"}><option value="admin">Admin</option><option value="data analis">Data Analis</option><option value="supervisor">Supervisor</option><option value="enumerator">Enumerator</option></select></label><div className="user-modal-actions"><button type="button" className="button button-secondary" onClick={() => onEdit(null as unknown as UserProfile)}>Batal</button><button type="submit" className="button button-primary">Simpan profil</button></div></form> : <div className="user-table-wrap">{loading ? <p className="user-empty">Memuat daftar user...</p> : users.length === 0 ? <p className="user-empty">Belum ada profil user.</p> : <table><thead><tr><th>USERNAME</th><th>NAMA</th><th>EMAIL</th><th>ROLE</th><th>AKSI</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td className="mono">{user.username || "-"}</td><td><strong>{user.nama || "-"}</strong></td><td>{user.email || "-"}</td><td><span className="user-role">{user.role || "-"}</span></td><td><button className="row-action" onClick={() => onEdit(user)} aria-label={`Edit ${user.username || "user"}`}>✎</button><button className="row-action row-action-danger" onClick={() => onDelete(user)} disabled={user.id === undefined} aria-label={`Hapus ${user.username || "user"}`}>×</button></td></tr>)}</tbody></table>}</div>}</section></div>;
}

function createGpsDialog(onCancel: () => void) {
  const dialog = document.createElement("dialog");
  dialog.className = "gps-confirm-dialog gps-live-dialog";
  let elapsed = 0;
  const timer = window.setInterval(() => {
    elapsed += 0.1;
    const elapsedNode = dialog.querySelector("[data-gps-elapsed]");
    if (elapsedNode) elapsedNode.textContent = `Waktu berlalu: ${elapsed.toFixed(2)} detik`;
  }, 100);
  const close = () => {
    window.clearInterval(timer);
    dialog.close();
    dialog.remove();
  };
  const showResult = (result: { latitude: string; longitude: string; accuracy: number }, onAccept: () => void, onRetry: () => void) => {
    const warning = result.accuracy > 100;
    dialog.innerHTML = `<div class="gps-confirm-card"><div class="gps-confirm-icon ${warning ? "gps-confirm-icon-warning" : ""}">⌖</div><p class="eyebrow">Hasil lokasi</p><h2>Lokasi berhasil ditemukan</h2><p class="gps-confirm-copy">Periksa akurasi sebelum menyimpan titik ini ke formulir.</p><div class="gps-confirm-accuracy ${warning ? "gps-accuracy-poor" : ""}"><span class="gps-confirm-check">${warning ? "!" : "✓"}</span><div><small>Akurasi GPS</small><strong>Sekitar ${result.accuracy} meter</strong>${warning ? "<em>Akurasi kurang baik. Ambil ulang di area terbuka.</em>" : ""}</div></div><div class="gps-confirm-coordinates"><div><small>Latitude</small><strong>${result.latitude}</strong></div><div><small>Longitude</small><strong>${result.longitude}</strong></div></div><div class="gps-confirm-actions"><button type="button" class="button button-secondary" data-gps-retry>Ambil ulang</button><button type="button" class="button button-primary" data-gps-accept>Gunakan lokasi</button></div></div>`;
    dialog.querySelector("[data-gps-retry]")?.addEventListener("click", () => { close(); onRetry(); });
    dialog.querySelector("[data-gps-accept]")?.addEventListener("click", () => { close(); onAccept(); });
  };
  dialog.innerHTML = `<div class="gps-confirm-card gps-searching-card"><p class="eyebrow">Mendapatkan lokasi</p><h2>Mencoba mendapatkan lokasi</h2><p class="gps-confirm-copy">Pastikan GPS aktif dan perangkat berada di area terbuka.</p><div class="gps-progress-track"><i /></div><div class="gps-search-stats"><span>● Mencari sinyal GPS</span><strong data-gps-elapsed>Waktu berlalu: 0.00 detik</strong></div><div class="gps-confirm-actions"><button type="button" class="button button-secondary" data-gps-cancel>Batal</button></div></div>`;
  dialog.querySelector("[data-gps-cancel]")?.addEventListener("click", () => { close(); onCancel(); });
  dialog.addEventListener("cancel", () => { close(); onCancel(); }, { once: true });
  document.body.appendChild(dialog);
  dialog.showModal();
  return { showResult, close };
}

const supervisionImplementationChecks = [
  "Enumerator memahami tujuan dan metode pemetaan",
  "Enumerator menggunakan instrumen pemetaan yang telah ditetapkan",
  "Enumerator melakukan pengumpulan data sesuai wilayah tugas",
  "Enumerator melakukan pencatatan lokasi hotspot secara lengkap",
  "Titik koordinat/GPS tercatat dengan benar",
  "Informasi hotspot sesuai dengan kondisi lapangan",
  "Dokumentasi pendukung tersedia sesuai kebutuhan",
];

const supervisionQualityChecks = [
  "Data identitas hotspot terisi lengkap",
  "Status hotspot telah ditentukan",
  "Tidak ditemukan duplikasi data hotspot",
  "Data telah melalui proses kroscek antar Enumerator",
  "Data sesuai dengan definisi operasional yang ditetapkan",
];

function SupervisorForm({ open, user, profile, rows, onOpen, onClose, onSaved }: { open: boolean; user: User; profile: UserProfile | null; rows: Hotspot[]; onOpen: () => void; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const enumerators = Array.from(new Set(rows.map((row) => row.enumeratorName).filter(Boolean)));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db) return setError("Firestore belum siap.");
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const supervisedSubmissionIds = rows.filter((row) => row.enumeratorName === String(form.get("namaEnumerator") || "").trim()).map((row) => row.id);
    const checks = [...supervisionImplementationChecks, ...supervisionQualityChecks].reduce<Record<string, string>>((values, _, index) => {
      const section = index < supervisionImplementationChecks.length ? "pelaksanaan" : "kualitas";
      const number = index < supervisionImplementationChecks.length ? index + 1 : index - supervisionImplementationChecks.length + 1;
      values[`${section}_${number}`] = String(form.get(`${section}_${number}`) || "");
      return values;
    }, {});
    try {
      await addDoc(collection(db, "supervisions"), {
        checks,
        kesimpulanSupervisi: form.getAll("kesimpulanSupervisi"),
        pengesahanNamaEnumerator: String(form.get("pengesahanNamaEnumerator") || "").trim(),
        pengesahanNamaSupervisor: String(form.get("pengesahanNamaSupervisor") || "").trim(),
        pengesahanTanggalEnumerator: String(form.get("pengesahanTanggalEnumerator") || ""),
        pengesahanTanggalSupervisor: String(form.get("pengesahanTanggalSupervisor") || ""),
        pengesahanTandaTanganEnumerator: String(form.get("pengesahanTandaTanganEnumerator") || "").trim(),
        pengesahanTandaTanganSupervisor: String(form.get("pengesahanTandaTanganSupervisor") || "").trim(),
        supervisorUid: user.uid,
        submissionIds: supervisedSubmissionIds,
        workflowStage: "supervisor_review",
        workflowStatus: "submitted",
        createdAt: new Date().toISOString(),
      });
      onSaved();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Supervisi gagal disimpan.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return <button type="button" className="supervision-launch button button-ghost" onClick={onOpen} aria-label="Buka form supervisi">☑ <span>Form Supervisi</span></button>;
  return <div className="user-modal-backdrop"><section className="user-modal supervision-modal" role="dialog" aria-modal="true" aria-labelledby="supervision-form-title"><div className="user-modal-header"><div><p className="eyebrow">Supervisi lapangan</p><h2 id="supervision-form-title">Format Supervisi Pemetaan Hotspot</h2><p>Kota Malang 2026 · Lengkapi pemeriksaan dan pengesahan supervisor.</p></div><button className="modal-close" onClick={onClose} aria-label="Tutup">×</button></div>{error && <p className="login-error user-modal-error">{error}</p>}<form className="supervision-form" onSubmit={submit}><p className="form-section-title">A. Identitas Supervisi</p><div className="supervision-grid"><label>Tanggal supervisi<input name="tanggalSupervisi" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></label><label>Lokasi / wilayah<input name="lokasiWilayah" required /></label><label>Nama supervisor<input name="namaSupervisor" defaultValue={profile?.nama || user.email || ""} required /></label><label>Enumerator yang disupervisi<select name="namaEnumerator" required defaultValue=""><option value="">Pilih Enumerator</option>{enumerators.map((name) => <option key={name} value={name}>{name}</option>)}</select></label><label>Komunitas / organisasi<select name="komunitasOrganisasi" required defaultValue=""><option value="">Pilih organisasi</option><option value="lgi">Yayasan Lingkar Gagasan Indonesia (LGI)</option><option value="igama">Yayasan IGAMA</option><option value="wamarapa">Wamarapa</option><option value="fatayat_nu">SSR Fatayat NU Jawa Timur (PENASUN)</option></select></label><label>Jumlah hotspot dipantau<input name="jumlahHotspot" type="number" min="0" defaultValue="0" /></label></div><SupervisionChecks title="B. Pemeriksaan Pelaksanaan Lapangan" name="pelaksanaan" items={supervisionImplementationChecks} /><SupervisionChecks title="C. Pemeriksaan Kualitas Data" name="kualitas" items={supervisionQualityChecks} /><p className="form-section-title">D. Hasil Supervisi</p><div className="supervision-text-grid"><label>Temuan supervisi<textarea name="temuanSupervisi" rows={2} /></label><label>Kendala lapangan<textarea name="kendalaLapangan" rows={2} /></label><label>Perbaikan yang dibutuhkan<textarea name="perbaikanYangDibutuhkan" rows={2} /></label><label>Tindak lanjut<textarea name="tindakLanjut" rows={2} /></label></div><p className="form-section-title">E. Kesimpulan Supervisi</p><div className="supervision-options"><label><input type="checkbox" name="kesimpulanSupervisi" value="pelaksanaan_sesuai_standar_dan_dapat_dilanjutkan" /> Pelaksanaan sesuai standar dan dapat dilanjutkan.</label><label><input type="checkbox" name="kesimpulanSupervisi" value="diperlukan_perbaikan_sebelum_proses_dilanjutkan" /> Diperlukan perbaikan sebelum proses dilanjutkan.</label><label><input type="checkbox" name="kesimpulanSupervisi" value="diperlukan_tindak_lanjut_khusus" /> Diperlukan tindak lanjut khusus.</label></div><p className="form-section-title">F. Pengesahan</p><div className="supervision-sign-grid"><div><strong>Enumerator</strong><label>Nama<input name="pengesahanNamaEnumerator" readOnly /></label><label>Tanggal<input name="pengesahanTanggalEnumerator" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></label><label>Tanda tangan<input name="pengesahanTandaTanganEnumerator" placeholder="Nama / tanda tangan" /></label></div><div><strong>Supervisor</strong><label>Nama<input name="pengesahanNamaSupervisor" defaultValue={profile?.nama || user.email || ""} readOnly /></label><label>Tanggal<input name="pengesahanTanggalSupervisor" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></label><label>Tanda tangan<input name="pengesahanTandaTanganSupervisor" placeholder="Nama / tanda tangan" /></label></div></div><div className="user-modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Batal</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? "Menyimpan..." : "Simpan supervisi"}</button></div></form></section></div>;
}

function SupervisionChecks({ title, name, items }: { title: string; name: string; items: string[] }) {
  return <div className="supervision-check-section"><p className="form-section-title">{title}</p><div className="supervision-check-table"><div className="supervision-check-head"><span>No</span><span>Komponen pemeriksaan</span><span>Ya</span><span>Tidak</span></div>{items.map((item, index) => <div className="supervision-check-row" key={item}><span>{index + 1}</span><span>{item}</span><label><input type="radio" name={`${name}_${index + 1}`} value="ya" required /> Ya</label><label><input type="radio" name={`${name}_${index + 1}`} value="tidak" required /> Tidak</label></div>)}</div></div>;
}

function EnumeratorForm({ user, profile, existingHotspots, onClose, onSaved }: { user: User; profile: UserProfile | null; existingHotspots: Hotspot[]; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submissionIdempotencyKey = useRef<string | null>(null);
  const [locationType, setLocationType] = useState("");
  const [locationSubtype, setLocationSubtype] = useState("");
  const [statusHotspot, setStatusHotspot] = useState("");
  const [hotspotCode, setHotspotCode] = useState("");
  const [gps, setGps] = useState("");
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const gpsDialogRef = useRef<{ showResult: (result: { latitude: string; longitude: string; accuracy: number }, onAccept: () => void, onRetry: () => void) => void; close: () => void } | null>(null);
  const [gpsCandidate, setGpsCandidate] = useState<{ location: string; latitude: string; longitude: string; accuracy: number } | null>(null);
  const gpsWatchRef = useRef<number | null>(null);
  const gpsTimeoutRef = useRef<number | null>(null);
  const bestPositionRef = useRef<GeolocationPosition | null>(null);

  useEffect(() => () => {
    if (gpsWatchRef.current !== null) navigator.geolocation?.clearWatch(gpsWatchRef.current);
    if (gpsTimeoutRef.current !== null) window.clearTimeout(gpsTimeoutRef.current);
    gpsDialogRef.current?.close();
  }, []);

  return <EnumeratorFormFields user={user} profile={profile} error={error} saving={saving} gps={gps} onUseCurrentLocation={useCurrentLocation} onClose={onClose} onSubmit={submit} locationType={locationType} setLocationType={setLocationType} locationSubtype={locationSubtype} setLocationSubtype={setLocationSubtype} statusHotspot={statusHotspot} setStatusHotspot={setStatusHotspot} hotspotCode={hotspotCode} setHotspotCode={setHotspotCode} locationSubtypes={locationSubtypes} />;

  function startGpsCapture() {
    if (gpsLoading) return;
    if (!navigator.geolocation) {
      setError("Perangkat tidak mendukung GPS.");
      return;
    }
    setGpsLoading(true);
    setError("");
    gpsDialogRef.current?.close();
    gpsDialogRef.current = createGpsDialog(cancelGps);
    bestPositionRef.current = null;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (gpsWatchRef.current !== null) navigator.geolocation.clearWatch(gpsWatchRef.current);
      if (!bestPositionRef.current) {
        setError("GPS belum mendapatkan lokasi. Coba lagi di area terbuka.");
        setGpsLoading(false);
        return;
      }
      const position = bestPositionRef.current;
      const result = { location: `${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`, latitude: position.coords.latitude.toFixed(6), longitude: position.coords.longitude.toFixed(6), accuracy: Math.round(position.coords.accuracy) };
      setGpsCandidate(result);
      setGpsLoading(false);
      gpsDialogRef.current?.showResult(result, acceptGps, retryGps);
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
        gpsDialogRef.current?.close();
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  function useCurrentLocation() {
    startGpsCapture();
  }

  function cancelGps() {
    if (gpsWatchRef.current !== null) navigator.geolocation.clearWatch(gpsWatchRef.current);
    if (gpsTimeoutRef.current !== null) window.clearTimeout(gpsTimeoutRef.current);
    bestPositionRef.current = null;
    setGpsLoading(false);
  }

  function acceptGps() {
    if (!gpsCandidate) return;
    setGps(gpsCandidate.location);
    setGpsAccuracy(gpsCandidate.accuracy);
    setGpsCandidate(null);
  }

  function retryGps() {
    setGpsCandidate(null);
    startGpsCapture();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db) return setError("Firestore belum siap.");
    if (gpsLoading) return setError("Tunggu sampai GPS selesai mengambil lokasi.");
    if (gpsAccuracy !== null && gpsAccuracy > 100) return setError("Akurasi GPS masih rendah. Ambil lokasi ulang di area terbuka.");
    const form = new FormData(event.currentTarget);
    const documents = [1, 2, 3].map((number) => form.get(number === 1 ? "document" : `document${number}`) as File);
    if (documents.some((file) => !file || !file.size)) return setError("Tiga foto dokumentasi wajib dipilih.");
    if (!gps) return setError("Titik koordinat GPS wajib diambil dari perangkat.");
    const educated = Number(form.get("jumlahDiedukasi") || 0);
    setSaving(true);
    setError("");
    try {
      submissionIdempotencyKey.current ||= crypto.randomUUID();
      const uploadResults = await Promise.all(documents.map(async (document, index) => {
        const fileData = await toBase64(document);
        const uploadResponse = await fetch("/api/documents/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileData, fileName: document.name, fileMime: document.type || "application/octet-stream", username: profile?.username || user.email, idempotencyKey: `${submissionIdempotencyKey.current}-${index + 1}` }),
        });
        const uploadResult = await uploadResponse.json();
        if (!uploadResponse.ok || !uploadResult.success) throw new Error(uploadResult.message || `Upload foto ${index + 1} gagal.`);
        return uploadResult;
      }));
      const normalizedHotspotCode = String(form.get("kodeHotspot") || "").trim().toUpperCase();
      const relatedVisits = existingHotspots.filter((hotspot) => hotspot.hotspotCode?.trim().toUpperCase() === normalizedHotspotCode);
      const previousVisit = relatedVisits[0];
      const visitType = previousVisit ? "follow_up" : "initial";
      await addDoc(collection(db, "submissions"), {
        enumeratorUid: user.uid,
        enumeratorUsername: profile?.username || "",
        enumeratorName: profile?.nama || user.email || "",
        organisasi: String(form.get("organisasi") || "").trim(),
        kodeHotspot: String(form.get("kodeHotspot") || "").trim(),
        hotspotKey: normalizedHotspotCode,
        visitType,
        visitNumber: visitType === "follow_up" ? relatedVisits.length + 1 : 1,
        previousVisitId: previousVisit?.id || "",
        visitReason: visitType === "follow_up" ? "Kunjungan ulang berdasarkan kode hotspot yang sama" : "",
        visitedAt: new Date().toISOString(),
        namaHotspot: String(form.get("namaHotspot") || "").trim(),
        kecamatan: String(form.get("kecamatan") || "").trim(),
        kelurahan: String(form.get("kelurahan") || "").trim(),
        alamat: String(form.get("alamat") || "").trim(),
        koordinat: gps,
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

  return <div className="user-modal-backdrop"><section className="user-modal enumerator-modal" role="dialog" aria-modal="true" aria-labelledby="enumerator-form-title"><div className="user-modal-header"><div><p className="eyebrow">Pendataan lapangan</p><h2 id="enumerator-form-title">Input Data Pemetaan</h2><p>Field mengikuti instrumen pemetaan. Data masuk Firestore, dokumen masuk Google Drive.</p></div><button className="modal-close" onClick={onClose} aria-label="Tutup">×</button></div>{error && <p className="login-error user-modal-error">{error}</p>}<form className="user-edit-form enumerator-form" onSubmit={submit}><p className="form-section-title form-wide">A. Informasi Pelaksanaan</p><label>Nama Enumerator<input value={profile?.nama || user.email || ""} readOnly /></label><label>Organisasi / Komunitas Pelaksana<select name="organisasi" defaultValue="" required><option value="">Pilih organisasi</option><option value="lgi">Yayasan Lingkar Gagasan Indonesia (LGI)</option><option value="igama">Yayasan IGAMA</option><option value="wamarapa">Wamarapa</option><option value="fatayat_nu">SSR Fatayat NU Jawa Timur (PENASUN)</option></select></label><p className="form-section-title form-wide">B. Identitas Hotspot</p><label>Nama Hotspot<input name="namaHotspot" required /></label><label>Kecamatan<input name="kecamatan" required /></label><label>Kelurahan<input name="kelurahan" required /></label><label className="form-wide">Alamat atau Deskripsi Lokasi<textarea name="alamat" rows={2} required /></label><label className="form-wide">Titik Koordinat GPS<div className="gps-input"><input value={gps} placeholder="Tekan Gunakan GPS" readOnly required /><button type="button" className="button button-secondary" onClick={useCurrentLocation}>⌖ Gunakan GPS</button></div><small>Koordinat diambil dari lokasi perangkat.</small></label><label className="form-wide">Foto Dokumentasi Lokasi<input name="document" type="file" accept="image/*" capture="environment" required /></label><p className="form-section-title form-wide">C. Karakteristik Hotspot</p><label>Status Hotspot<select name="statusHotspot" defaultValue="" required><option value="">Pilih status</option><option value="aktif">Aktif</option><option value="baru">Baru</option><option value="tidak_aktif">Tidak Aktif</option><option value="perlu_klarifikasi">Perlu Klarifikasi</option><option value="lama">Lama</option></select></label><fieldset><legend>Kategori Populasi Kunci *</legend><div className="checkbox-grid">{[["lsl", "LSL"], ["transgender", "Transgender"], ["idu", "IDU / PWID"], ["pspl___tl__pekerja_seks_perempuan", "PSPL / TL"]].map(([value, label]) => <label key={value}><input type="checkbox" name="populasiKunci" value={value} /> {label}</label>)}</div></fieldset><label>Tipe Lokasi Utama<select name="tipeLokasi" defaultValue="" required><option value="">Pilih tipe lokasi</option><option value="ruang_publik">Ruang Publik / Area Terbuka / Jalanan</option><option value="tempat_makan_hiburan">Tempat Makan / Nongkrong / Hiburan</option><option value="akomodasi_private">Akomodasi / Private Venue</option><option value="perawatan_kebugaran">Perawatan & Kebugaran</option><option value="platform_virtual">Platform Virtual / Online</option><option value="lainnya">Lainnya</option></select></label><label>Detail Sub-Tipe Lokasi<input name="subTipeLokasi" placeholder="Isi sub-tipe lokasi" required /></label><label>Tipe Lokasi Lainnya<input name="tipeLokasiLainnya" /></label><fieldset><legend>Waktu Aktivitas Dominan *</legend><div className="checkbox-grid">{[["pagi", "Pagi"], ["siang", "Siang"], ["sore", "Sore"], ["malam", "Malam"]].map(([value, label]) => <label key={value}><input type="checkbox" name="waktuAktivitas" value={value} /> {label}</label>)}</div></fieldset><label>Jumlah Populasi<input name="estimasiJumlahPopulasi" type="number" min="0" defaultValue="0" /></label><label>Jumlah Diedukasi<input name="jumlahDiedukasi" type="number" min="0" defaultValue="0" /></label><label>Jumlah Tes HIV<input name="jumlahTesHiv" type="number" min="0" defaultValue="0" /></label><label>Jumlah HIV+<input name="jumlahHivPositif" type="number" min="0" defaultValue="0" /></label><label className="form-wide">Catatan Tambahan Temuan Lapangan<textarea name="catatan" rows={2} /></label><p className="form-section-title form-wide">D. Informasi Hasil Pemetaan</p><label>Sumber Informasi<select name="sumberInformasi" defaultValue="" required><option value="">Pilih sumber</option><option value="populasi_kunci">Populasi kunci</option><option value="tokoh_kunci">Tokoh kunci</option><option value="observasi">Observasi Lapangan Langsung</option><option value="lainnya">Lainnya</option></select></label><label>No. HP Informan<input name="noHpInforman" type="tel" pattern="[0-9+]{9,15}" required /></label><label>Keterangan Aktivitas<input name="keteranganAktivitas" required /></label><label className="form-wide">Kondisi Hotspot Saat Pemetaan<textarea name="kondisiSaatPemetaan" rows={2} required /></label><div className="user-modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Batal</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? "Menyimpan..." : "Simpan Data Pemetaan"}</button></div></form></section></div>;
}

function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("File tidak dapat dibaca."));
    reader.readAsDataURL(file);
  });
}

function LoginScreen({ onLogin, loginError, setLoginError }: { onLogin: (user: User) => void; loginError: string; setLoginError: (value: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  async function submitLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!username.trim() || !password.trim()) {
      setLoginError("Username dan sandi wajib diisi.");
      return;
    }
    if (!firebaseConfigured) {
      setLoginError("Firebase belum dikonfigurasi. Isi file .env.local terlebih dahulu.");
      return;
    }
    if (!auth) {
      setLoginError("Firebase belum siap. Periksa konfigurasi .env.local.");
      return;
    }
    try {
      if (!db) {
        setLoginError("Firestore belum siap. Periksa konfigurasi Firebase.");
        return;
      }
      const userQuery = query(collection(db, "user"), where("username", "==", username.trim()), limit(1));
      const userSnapshot = await getDocs(userQuery);
      if (userSnapshot.empty) {
        setLoginError(`Username "${username.trim()}" tidak ditemukan di collection user.`);
        return;
      }
      const profile = userSnapshot.docs[0]?.data() as { email?: string } | undefined;
      if (!profile?.email) {
        setLoginError("Profil username ditemukan, tetapi field email belum diisi di Firestore.");
        return;
      }
      const result = await signInWithEmailAndPassword(auth, profile.email, password);
      onLogin(result.user);
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String(error.code) : "";
      if (code === "permission-denied") {
        setLoginError("Firestore menolak akses. Periksa Firestore Rules untuk pembacaan collection user.");
      } else if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
        setLoginError("Password Firebase tidak cocok untuk username ini.");
      } else {
        setLoginError(`Login gagal${code ? ` (${code})` : ""}. Periksa username, field email, dan Firebase Authentication.`);
      }
    }
  }

  return <main className="login-page"><div className="login-layout"><section className="login-intro"><div className="login-brand-mark">+</div><p className="eyebrow login-eyebrow">Data Intelligence Platform</p><h1>Pemetaan Hotspot Malang</h1><p className="login-description">Kelola data lapangan, pantau persebaran, dan pastikan setiap pendataan melewati proses quality control yang terukur.</p><div className="login-features"><div><span>✓</span>Dashboard monitoring terpusat</div><div><span>✓</span>Validasi QC berbasis data</div><div><span>✓</span>Sinkronisasi dengan KoboToolbox</div></div><div className="login-orbit login-orbit-one" /><div className="login-orbit login-orbit-two" /></section><section className="login-form"><p className="eyebrow">Secure access</p><h2>Masuk ke dashboard</h2><p className="login-form-copy">Gunakan username dan sandi yang terdaftar untuk melanjutkan.</p><form onSubmit={submitLogin}><label htmlFor="username">Username</label><div className="login-input"><span>◉</span><input id="username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="Masukkan username" /></div><label htmlFor="password">Sandi</label><div className="login-input"><span>▣</span><input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="Masukkan sandi" /></div>{loginError && <p className="login-error" role="alert">{loginError}</p>}<button className="login-submit" type="submit">Masuk ke dashboard <span>→</span></button></form><p className="login-footer">Lingga Indonesia <span>•</span> Pemetaan Kota Malang 2026</p></section></div></main>;
}
