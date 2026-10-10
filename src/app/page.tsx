"use client";

import NextImage from "next/image";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { addDoc, arrayUnion, collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, startAfter, updateDoc, where, writeBatch, type DocumentData, type QueryDocumentSnapshot } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRef } from "react";
import { auth, db, firebaseConfigured } from "@/lib/firebase";
import { Kpi, PanelHeading } from "@/app/components/dashboard";
import { EnumeratorAiAssistant } from "@/app/components/enumerator-ai-assistant";
import { EnumeratorFormFields, normalizeOrganization, organizationOptions } from "@/app/components/enumerator-form";
import { DashboardOverview } from "@/app/components/dashboard-overview";
import { DashboardAnalytics } from "@/app/components/dashboard-analytics";
import { EnumeratorProgress } from "@/app/components/enumerator-progress";
import { displayPopulation, ReviewDetailModal, ReviewQcModal, type AiQcSuggestion } from "@/app/components/review-modals";
import { canReviewWorkflowStage, normalizeWorkflowStage, type DashboardSummary, type WorkflowStage } from "@/lib/dashboard-summary";

type Hotspot = {
  id: string;
  date: string;
  name: string;
  area: string;
  population: string;
  status: "Aktif" | "Baru" | "Tidak aktif" | "Perlu verifikasi";
  statusHotspotValue?: string;
  qc: "Valid" | "Pending" | "Perlu perbaikan";
  workflowStage: WorkflowStage;
  workflowHistory?: Array<{ stage: WorkflowStage; role: string; uid: string; actorName?: string; at: string; note?: string }>;
  createdAt: string;
  hotspotCode?: string;
  visitType?: "initial" | "follow_up";
  visitNumber?: number;
  verificationStatus?: string;
  coordinates?: string;
  enumeratorName?: string;
  enumeratorUsername?: string;
  enumeratorUid?: string;
  organisasi?: string;
  address?: string;
  locationType?: string;
  locationSubtype?: string;
  activityTime?: string;
  activityTimes?: string[];
  populasiKunci?: string[];
  populationEstimate?: number;
  educated?: number;
  hivPositive?: number;
  hivTests?: number;
  notes?: string;
  informationSource?: string;
  informationSourceValue?: string;
  locationSubtypeOther?: string;
  informantPhone?: string;
  activityDescription?: string;
  mappingCondition?: string;
  documents?: Array<{ name: string; fileId?: string; url?: string }>;
  documentName?: string;
  documentFileId?: string;
  documentUrl?: string;
  qcNote?: string;
  qcInspector?: string;
  qcDate?: string;
  coordinatorReviewStatus?: "Valid" | "Pending" | "Perlu perbaikan";
  coordinatorReviewNote?: string;
  coordinatorReviewKelengkapan?: string;
  coordinatorReviewDuplikasi?: string;
  coordinatorReviewKroscek?: string;
  coordinatorReviewerName?: string;
  coordinatorReviewDate?: string;
};

type SubmissionCursor = QueryDocumentSnapshot<DocumentData> | null;
const SUBMISSIONS_PAGE_SIZE = 25;
type PreviousHotspot = Pick<Hotspot, "id" | "hotspotCode" | "name" | "area" | "address" | "visitNumber" | "date">;

type UserProfile = {
  id?: string;
  email?: string;
  username?: string;
  name?: string;
  nama?: string;
  role?: string;
  organisasi?: string;
};

function normalizeUserProfile(id: string, data: Record<string, unknown>) {
  const profile = { id, ...data } as UserProfile;
  const name = profile.nama?.trim() || profile.name?.trim() || "Nama belum diatur";
  const organization = [
    data.organisasi,
    data.organization,
    data.komunitasOrganisasi,
    data.komunitas_organisasi,
    data.organisasiPelaksana,
    data.organisasi_pelaksana,
  ].find((value): value is string => typeof value === "string" && Boolean(value.trim()));
  return { ...profile, name, nama: name, ...(organization ? { organisasi: organization } : {}) };
}

function normalizeRole(role?: string) {
  return (role || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function displayRole(role?: string) {
  switch (normalizeRole(role)) {
    case "admin": return "Administrator";
    case "dataanalis":
    case "dataanalyst": return "Data Analis";
    case "koordinator":
    case "kordinator": return "Koordinator";
    case "supervisor": return "Supervisor (perlu migrasi)";
    case "enumerator": return "Enumerator";
    default: return "Pengguna";
  }
}

const statusClass: Record<Hotspot["status"], string> = { Aktif: "status-good", Baru: "status-new", "Tidak aktif": "status-off", "Perlu verifikasi": "status-off" };
const workflowStageLabels: Record<Hotspot["workflowStage"], string> = {
  submitted: "Menunggu supervisi Koordinator",
  coordinator_review: "Supervisi Koordinator",
  awaiting_enumerator_signature: "Menunggu tanda tangan Enumerator",
  awaiting_coordinator_completion: "Menunggu penyelesaian Koordinator",
  analyst_review: "Pemeriksaan Data Analis",
  finalized: "Database final",
  needs_revision: "Perlu perbaikan",
};
const locationSubtypes: Record<string, Array<[string, string]>> = {
  ruang_publik: [["jalanan_mangkal", "Jalanan / Titik Mangkal"], ["taman_kota", "Taman Kota / Alun-Alun / Halaman"], ["stasiun_terminal", "Stasiun / Terminal / Halte"], ["mall", "Mall"], ["makam", "Makam"], ["bangunan_kosong", "Bangunan Kosong / Mangkrak"], ["ruang_publik_lainnya", "Lainnya"]],
  tempat_makan_hiburan: [["warung_makan", "Warung Kopi / Warung Makan"], ["kafe_restoran", "Kafe / Restoran"], ["bar_club", "Bar / Club / Diskotik"], ["karaoke", "Karaoke (Hall / Room)"], ["tempat_makan_lainnya", "Lainnya"]],
  akomodasi_private: [["kos_apartemen", "Kos / Apartemen"], ["rumah_tinggal", "Rumah Tinggal / Kontrakan"], ["penginapan_hotel", "Penginapan / Hotel / Losmen"], ["akomodasi_lainnya", "Lainnya"]],
  perawatan_kebugaran: [["salon", "Salon"], ["spa_gym", "Spa / Sauna / Gym"], ["panti_pijat", "Panti Pijat"], ["perawatan_lainnya", "Lainnya"]],
  platform_virtual: [["aplikasi_kencan", "Aplikasi Kencan"], ["media_sosial", "Media Sosial & Grup Chat"], ["virtual_lainnya", "Lainnya"]],
  lainnya: [["lainnya", "Lainnya"]],
};
const malangKelurahan: Record<string, string[]> = {
  Blimbing: ["Arjosari", "Balearjosari", "Blimbing", "Bunulrejo", "Jodipan", "Kesatrian", "Pandanwangi", "Polehan", "Polowijen", "Purwantoro", "Purwodadi"],
  Kedungkandang: ["Arjowinangun", "Bumiayu", "Buring", "Cemorokandang", "Kedungkandang", "Kotalama", "Lesanpuro", "Madyopuro", "Mergosono", "Sawojajar", "Tlogowaru", "Wonokoyo"],
  Klojen: ["Bareng", "Gadingkasri", "Kasin", "Kauman", "Kiduldalem", "Klojen", "Oro-Oro Dowo", "Penanggungan", "Rampal Celaket", "Samaan", "Sukoharjo"],
  Lowokwaru: ["Dinoyo", "Jatimulyo", "Ketawanggede", "Lowokwaru", "Merjosari", "Mojolangu", "Sumbersari", "Tasikmadu", "Tlogomas", "Tulusrejo", "Tunjungsekar"],
  Sukun: ["Bakalan Krajan", "Bandulan", "Bandungrejosari", "Ciptomulyo", "Gadang", "Karangbesuki", "Kebonsari", "Mulyorejo", "Pisangcandi", "Sukun", "Tanjungrejo"],
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
    const workflowStage = normalizeWorkflowStage(data.workflowStage);
    const documents = (Array.isArray(data.documents) ? data.documents : data.document ? [data.document] : [])
      .filter((document): document is Record<string, unknown> => typeof document === "object" && document !== null)
      .map((document) => ({
        name: String(document.name || ""),
        fileId: String(document.fileId || ""),
        url: String(document.url || ""),
      }))
      .filter((document) => document.name || document.fileId || document.url);
    const primaryDocument = documents[0];
    const createdAtValue = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(String(data.createdAt || ""));
    const workflowHistory = Array.isArray(data.workflowHistory)
      ? data.workflowHistory
        .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
        .map((entry) => {
          return {
            stage: normalizeWorkflowStage(entry.stage),
            role: String(entry.role || ""),
            uid: String(entry.uid || ""),
            actorName: String(entry.actorName || ""),
            at: String(entry.at || ""),
            note: String(entry.note || ""),
          };
        })
      : [];
    return {
      id: item.id,
      date: Number.isNaN(createdAtValue.getTime()) ? "-" : createdAtValue.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }),
      name: String(data.namaHotspot || "Tanpa nama"),
      area: `${String(data.kecamatan || "-")} / ${String(data.kelurahan || "-")}`,
      population: Array.isArray(data.populasiKunci) ? data.populasiKunci.join(", ") : String(data.populasiKunci || "-"),
      populasiKunci: Array.isArray(data.populasiKunci) ? data.populasiKunci.filter((value): value is string => typeof value === "string") : String(data.populasiKunci || "").split(",").map((value) => value.trim()).filter(Boolean),
      status: status === "baru" ? "Baru" : status === "tidak_aktif" ? "Tidak aktif" : status === "perlu_verifikasi" || status === "perlu_klarifikasi" ? "Perlu verifikasi" : "Aktif",
      statusHotspotValue: String(data.statusHotspot || ""),
      qc: qc === "valid" ? "Valid" : qc === "perlu_perbaikan" ? "Perlu perbaikan" : "Pending",
      workflowStage: workflowStageLabels[workflowStage] ? workflowStage : "submitted",
      coordinatorReviewStatus: data.coordinatorReviewStatus === "Valid" || data.coordinatorReviewStatus === "Perlu perbaikan" ? data.coordinatorReviewStatus : data.coordinatorReviewStatus === "Pending" ? "Pending" : undefined,
      coordinatorReviewNote: String(data.coordinatorReviewNote || ""),
      coordinatorReviewKelengkapan: String(data.coordinatorReviewKelengkapan || ""),
      coordinatorReviewDuplikasi: String(data.coordinatorReviewDuplikasi || ""),
      coordinatorReviewKroscek: String(data.coordinatorReviewKroscek || ""),
      coordinatorReviewerName: String(data.coordinatorReviewerName || ""),
      coordinatorReviewDate: String(data.coordinatorReviewDate || ""),
      hotspotCode: String(data.kodeHotspot || ""),
      visitType: data.visitType === "follow_up" ? "follow_up" : "initial",
      visitNumber: Number.isInteger(Number(data.visitNumber)) && Number(data.visitNumber) > 0 ? Number(data.visitNumber) : undefined,
      verificationStatus: String(data.statusVerifikasi || ""),
      coordinates: String(data.koordinat || ""),
      enumeratorName,
      enumeratorUsername: String(data.enumeratorUsername || ""),
      enumeratorUid,
      createdAt: Number.isNaN(createdAtValue.getTime()) ? "" : createdAtValue.toISOString(),
      workflowHistory,
      organisasi: String(data.organisasi || ""),
      address: String(data.alamat || ""),
      locationType: String(data.tipeLokasi || ""),
      locationSubtype: String(data.subTipeLokasi || ""),
      activityTime: Array.isArray(data.waktuAktivitas) ? data.waktuAktivitas.join(", ") : String(data.waktuAktivitas || ""),
      activityTimes: Array.isArray(data.waktuAktivitas) ? data.waktuAktivitas.filter((value): value is string => typeof value === "string") : String(data.waktuAktivitas || "").split(",").map((value) => value.trim()).filter(Boolean),
      populationEstimate: Number(data.estimasiJumlahPopulasi || 0),
      educated: Number(data.jumlahDiedukasi || 0),
      hivPositive: Number(data.jumlahHivPositif || 0),
      hivTests: Number(data.jumlahTesHiv || 0),
      notes: String(data.catatan || ""),
      informationSource: String(data.sumberInformasi || ""),
      informationSourceValue: String(data.sumberInformasi || ""),
      locationSubtypeOther: String(data.tipeLokasiLainnya || ""),
      informantPhone: String(data.noHpInforman || ""),
      activityDescription: String(data.keteranganAktivitas || ""),
      mappingCondition: String(data.kondisiSaatPemetaan || ""),
      documents,
      documentName: primaryDocument?.name || "",
      documentFileId: primaryDocument?.fileId || "",
      documentUrl: primaryDocument?.url || "",
      qcNote: String(data.qcNote || ""),
      qcKelengkapan: String(data.qcKelengkapan || ""),
      qcDuplikasi: String(data.qcDuplikasi || ""),
      qcKroscek: String(data.qcKroscek || ""),
      qcInspector: String(data.qcNamaPemeriksa || ""),
      qcDate: String(data.qcTanggalPemeriksaan || ""),
    } as Hotspot & { enumeratorUid: string };
  }));
}

function mapSupervisionSnapshot(snapshot: { docs: QueryDocumentSnapshot<DocumentData>[] }): SupervisionSession[] {
  return snapshot.docs.map((item) => {
    const data = item.data();
    const enumeratorSignature = data.pengesahanTandaTanganEnumerator as StoredSupervisionSignature | undefined;
    const coordinatorSignature = data.pengesahanTandaTanganKoordinator as StoredSupervisionSignature | undefined;
    return {
      id: item.id,
      enumeratorUid: String(data.enumeratorUid || ""),
      enumeratorName: String(data.pengesahanNamaEnumerator || ""),
      coordinatorUid: String(data.coordinatorUid || ""),
      coordinatorName: String(data.namaKoordinator || ""),
      workflowStatus: String(data.workflowStatus || ""),
      submissionIds: Array.isArray(data.submissionIds) ? data.submissionIds.filter((id): id is string => typeof id === "string") : [],
      hotspotNames: Array.isArray(data.hotspotNames) ? data.hotspotNames.filter((name): name is string => typeof name === "string") : [],
      kesimpulanSupervisi: data.kesimpulanSupervisi === "pending" || data.kesimpulanSupervisi === "needs_revision" ? data.kesimpulanSupervisi : "valid",
      checks: typeof data.checks === "object" && data.checks !== null ? data.checks as Record<string, string> : {},
      coordinatorReviewNote: String(data.coordinatorReviewNote || ""),
      temuanSupervisi: String(data.temuanSupervisi || ""),
      kendalaLapangan: String(data.kendalaLapangan || ""),
      perbaikanYangDibutuhkan: String(data.perbaikanYangDibutuhkan || ""),
      tindakLanjut: String(data.tindakLanjut || ""),
      reviewDate: String(data.pengesahanTanggalKoordinator || ""),
      pengesahanTanggalEnumerator: String(data.pengesahanTanggalEnumerator || ""),
      pengesahanTanggalKoordinator: String(data.pengesahanTanggalKoordinator || ""),
      ...(enumeratorSignature?.fileId ? { pengesahanTandaTanganEnumerator: enumeratorSignature } : {}),
      ...(coordinatorSignature?.fileId ? { pengesahanTandaTanganKoordinator: coordinatorSignature } : {}),
    };
  });
}

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(!firebaseConfigured);
  const [loginError, setLoginError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"Semua" | WorkflowStage>("Semua");
  const [lastUpdated, setLastUpdated] = useState("baru saja");
  const [hotspotRows, setHotspotRows] = useState<Hotspot[]>([]);
  const [supervisionSessions, setSupervisionSessions] = useState<SupervisionSession[]>([]);
  const [supervisionLoadedForUid, setSupervisionLoadedForUid] = useState<string | null>(null);
  const [supervisionRefreshKey, setSupervisionRefreshKey] = useState(0);
  const [supervisionError, setSupervisionError] = useState("");
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary | null>(null);
  const [dashboardSummaryLoading, setDashboardSummaryLoading] = useState(true);
  const [dashboardSummaryError, setDashboardSummaryError] = useState("");
  const [submissionCursor, setSubmissionCursor] = useState<SubmissionCursor>(null);
  const [loadingMoreSubmissions, setLoadingMoreSubmissions] = useState(false);
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [managedUsers, setManagedUsers] = useState<UserProfile[]>([]);
  const [userManagementLoading, setUserManagementLoading] = useState(false);
  const [userManagementError, setUserManagementError] = useState("");
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [creatingUser, setCreatingUser] = useState(false);
  const [showEnumeratorForm, setShowEnumeratorForm] = useState(false);
  const [revisionSubmission, setRevisionSubmission] = useState<Hotspot | null>(null);
  const [showSupervisionForm, setShowSupervisionForm] = useState(false);
  const [initialSupervisionSubmissionId, setInitialSupervisionSubmissionId] = useState<string | null>(null);
  const [completingSupervisionId, setCompletingSupervisionId] = useState<string | null>(null);
  const [activeDashboardTab, setActiveDashboardTab] = useState<"data" | "progress" | "analytics" | "supervision">("data");
  const [selectedHotspot, setSelectedHotspot] = useState<Hotspot | null>(null);
  const [selectedSignatureSession, setSelectedSignatureSession] = useState<SupervisionSession | null>(null);
  const [showQcModal, setShowQcModal] = useState(false);
  const [deletingHotspotId, setDeletingHotspotId] = useState<string | null>(null);
  const deletingHotspotRef = useRef(false);
  const qcUploadKeys = useRef<Record<string, string>>({});
  const displayedHotspotRows = useMemo(() => {
    const sessionStages = new Map<string, WorkflowStage>();
    const stagePriority: Record<string, number> = {
      awaiting_enumerator_signature: 1,
      awaiting_coordinator_completion: 2,
    };
    for (const session of supervisionSessions) {
      const stage = session.workflowStatus === "awaiting_enumerator_signature"
        ? "awaiting_enumerator_signature"
        : session.workflowStatus === "awaiting_coordinator_completion"
          ? "awaiting_coordinator_completion"
          : null;
      if (!stage) continue;
      for (const submissionId of session.submissionIds) {
        const existing = sessionStages.get(submissionId);
        if (!existing || stagePriority[stage] > stagePriority[existing]) {
          sessionStages.set(submissionId, stage);
        }
      }
    }
    return hotspotRows.map((hotspot) => {
      const sessionStage = sessionStages.get(hotspot.id);
      return sessionStage && sessionStage !== hotspot.workflowStage
        ? { ...hotspot, workflowStage: sessionStage }
        : hotspot;
    });
  }, [hotspotRows, supervisionSessions]);
  const filteredHotspots = useMemo(() => displayedHotspotRows.filter((hotspot) => {
    const matchesQuery = Object.values(hotspot).join(" ").toLowerCase().includes(searchQuery.toLowerCase());
    return matchesQuery && (filter === "Semua" || hotspot.workflowStage === filter);
  }), [displayedHotspotRows, filter, searchQuery]);
  const pendingSupervisionSubmissionIds = useMemo(
    () => supervisionSessions
      .filter((session) => session.workflowStatus === "awaiting_enumerator_signature" || session.workflowStatus === "awaiting_coordinator_completion")
      .flatMap((session) => session.submissionIds),
    [supervisionSessions],
  );
  const totalHotspots = dashboardSummary?.total;
  const activeHotspots = dashboardSummary?.active;
  const pendingQc = dashboardSummary?.pendingQc;
  const hivPositive = dashboardSummary?.hivPositive;
  const hivTests = dashboardSummary?.hivTests;
  const roleKey = normalizeRole(userProfile?.role);
  const isEnumerator = roleKey === "enumerator";
  const supervisionLoading = Boolean(authUser && supervisionLoadedForUid !== authUser.uid);
  const isLegacySupervisor = roleKey === "supervisor";
  const isCoordinator = roleKey.includes("koordinator") || roleKey.includes("kordinator") || roleKey.includes("koor");
  const isAnalyst = roleKey.includes("dataanalis") || roleKey.includes("dataanalyst");
  const isReviewer = isCoordinator || isAnalyst || roleKey === "admin";
  const reviewerKind = roleKey === "admin" ? "admin" : isCoordinator ? "coordinator" : isAnalyst ? "analyst" : "other";
  const canSupervise = isCoordinator || roleKey === "admin";
  const canSuperviseSelectedHotspot = Boolean(
    canSupervise
    && selectedHotspot
    && selectedHotspot.enumeratorUid
    && canReviewWorkflowStage("coordinator", selectedHotspot.workflowStage)
    && !pendingSupervisionSubmissionIds.includes(selectedHotspot.id),
  );
  const coordinatorSupervisionSessions = supervisionSessions.filter((session) => (
    roleKey === "admin" || session.coordinatorUid === authUser?.uid
  ));
  const pendingCoordinatorSupervisionSessions = coordinatorSupervisionSessions.filter((session) => (
    session.workflowStatus === "awaiting_enumerator_signature"
    || session.workflowStatus === "awaiting_coordinator_completion"
  ));
  const supervisionHistory = [...coordinatorSupervisionSessions].sort((a, b) => (
    b.reviewDate.localeCompare(a.reviewDate)
  ));
  const roleTitle = isEnumerator ? "Ruang Kerja Enumerator" : isCoordinator ? "Dashboard Koordinator" : isAnalyst ? "Dashboard Data Analis" : roleKey === "admin" ? "Dashboard Administrator" : isLegacySupervisor ? "Akun Supervisor lama" : "Dashboard Pendataan Hotspot";
  const roleSubtitle = isEnumerator
    ? "Kelola pendataan dan pantau hasil pemeriksaan hotspot yang Anda kirim."
    : isCoordinator
      ? "Koordinasikan pemetaan, supervisi lapangan, dan tindak lanjut hasil verifikasi."
      : isAnalyst
        ? "Periksa, bersihkan, validasi, dan analisis data hotspot untuk database dan peta final."
        : "Pantau hasil survei lapangan dan proses pemeriksaan kualitas data.";
  const canReviewSelectedHotspot = Boolean(selectedHotspot && reviewerKind !== "coordinator" && canReviewWorkflowStage(reviewerKind, selectedHotspot.workflowStage));

  const refreshDashboardSummary = useCallback(async (requestUser: User | null, requestProfile: UserProfile | null) => {
    if (!requestUser || !requestProfile) return;
    let token: string;
    try {
      token = await requestUser.getIdToken();
    } catch {
      setDashboardSummaryError("Sesi login tidak dapat diperbarui. Silakan login kembali.");
      setDashboardSummaryLoading(false);
      return;
    }
    setDashboardSummaryLoading(true);
    setDashboardSummaryError("");
    try {
      const response = await fetch("/api/dashboard/summary", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const result = await response.json() as DashboardSummary & { error?: string };
      if (!response.ok) throw new Error(result.error || "Ringkasan dashboard gagal dimuat.");
      setDashboardSummary(result);
    } catch (error) {
      setDashboardSummaryError(error instanceof Error ? error.message : "Ringkasan dashboard gagal dimuat.");
    } finally {
      setDashboardSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!auth) {
      return;
    }
    return onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      setIsLoggedIn(Boolean(user));
      setDashboardSummary(null);
      setDashboardSummaryError("");
      if (user && db) {
        const profileSnapshot = await getDoc(doc(db, "user", user.uid));
        if (profileSnapshot.exists()) {
          const ownProfile = normalizeUserProfile(profileSnapshot.id, profileSnapshot.data());
          setUserProfile(ownProfile);
          void refreshDashboardSummary(user, ownProfile);
          if (!normalizeOrganization(ownProfile.organisasi) && user.email) {
            try {
              const profileQuery = query(collection(db, "user"), where("email", "==", user.email), limit(10));
              const profileByEmail = await getDocs(profileQuery);
              const matchingProfile = profileByEmail.docs
                .filter((item) => item.id !== user.uid)
                .map((item) => normalizeUserProfile(item.id, item.data()))
                .find((candidate) => normalizeOrganization(candidate.organisasi));
              const fallbackOrganization = matchingProfile?.organisasi || "";
              if (fallbackOrganization) setUserProfile({ ...ownProfile, organisasi: fallbackOrganization });
            } catch {
              // The UID profile remains usable if an optional email lookup is unavailable.
            }
          }
        } else if (user.email) {
          const profileQuery = query(collection(db, "user"), where("email", "==", user.email), limit(1));
          const profileByEmail = await getDocs(profileQuery);
          const profile = profileByEmail.docs[0];
          setUserProfile(profile ? normalizeUserProfile(profile.id, profile.data()) : null);
          if (profile && profile.id !== user.uid) {
            setDataError("Profil akun belum tersambung dengan benar. Hubungi administrator untuk bantuan.");
            setDashboardSummaryError("Profil akun belum tersambung dengan benar. Hubungi administrator untuk bantuan.");
          }
        } else {
          setUserProfile(null);
          setDataLoading(false);
          setDataError("Profil pengguna belum ditemukan. Pastikan akun Anda sudah terdaftar dan peran telah diatur.");
        }
      } else {
        setUserProfile(null);
        setDashboardSummaryLoading(false);
        setDataLoading(false);
      }
      setAuthReady(true);
    });
  }, [refreshDashboardSummary]);

  useEffect(() => {
    if (!db || !authUser || !userProfile) return;
    const firestore = db;
    const submissionsQuery = (isEnumerator ? query(collection(firestore, "submissions"), where("enumeratorUid", "==", authUser.uid), limit(SUBMISSIONS_PAGE_SIZE)) : query(collection(firestore, "submissions"), orderBy("createdAt", "desc"), limit(SUBMISSIONS_PAGE_SIZE)));
    const unsubscribe = onSnapshot(submissionsQuery, async (snapshot) => {
      try {
        const rows = await mapSubmissionSnapshot(snapshot, firestore);
        setHotspotRows(rows);
        setSubmissionCursor(snapshot.docs.length === SUBMISSIONS_PAGE_SIZE ? snapshot.docs.at(-1) || null : null);
      } catch {
        setDataError("Data tidak dapat ditampilkan pada dashboard saat ini.");
      } finally {
        setDataLoading(false);
      }
    }, (error) => {
      const code = error instanceof Error && "code" in error ? String(error.code) : "";
      setDataError(code === "permission-denied"
        ? "Akses data ditolak. Pastikan profil pengguna sudah lengkap dan memiliki akses yang benar."
        : code === "failed-precondition"
          ? "Data belum dapat dimuat. Silakan hubungi administrator."
          : "Data tidak dapat dimuat. Silakan coba lagi atau hubungi administrator.");
      setDataLoading(false);
    });
    return unsubscribe;
  }, [authUser, isEnumerator, userProfile]);

  useEffect(() => {
    if (!authUser || !userProfile) return;
    if (isEnumerator) {
      let active = true;
      const loadActiveSessions = async () => {
        try {
          const token = await authUser.getIdToken();
          const response = await fetch("/api/supervisions/active", {
            headers: { Authorization: ["Bearer", token].join(" ") },
            cache: "no-store",
          });
          const result = await response.json() as { sessions?: SupervisionSession[]; error?: string };
          if (!response.ok) throw new Error(result.error || "Sesi supervisi belum dapat dimuat.");
          if (!Array.isArray(result.sessions)) throw new Error("Respons daftar sesi supervisi tidak valid.");
          if (!active) return;
          setSupervisionSessions(result.sessions);
          setSupervisionError("");
        } catch (error) {
          if (!active) return;
          setSupervisionError(error instanceof Error ? error.message : "Sesi supervisi belum dapat dimuat.");
        } finally {
          if (active) setSupervisionLoadedForUid(authUser.uid);
        }
      };
      void loadActiveSessions();
      const intervalId = window.setInterval(() => void loadActiveSessions(), 15_000);
      return () => {
        active = false;
        window.clearInterval(intervalId);
      };
    }

    if (!db) return;
    const sessionsQuery = query(collection(db, "supervisions"));
    return onSnapshot(sessionsQuery, (snapshot) => {
      setSupervisionSessions(mapSupervisionSnapshot(snapshot));
      setSupervisionLoadedForUid(authUser.uid);
      setSupervisionError("");
    }, () => {
      setSupervisionError("Sesi supervisi belum dapat dimuat. Silakan muat ulang dashboard.");
      setSupervisionLoadedForUid(authUser.uid);
    });
  }, [authUser, isEnumerator, supervisionRefreshKey, userProfile]);

  const loadMoreSubmissions = useCallback(async () => {
    if (!db || !authUser || !userProfile || !submissionCursor || loadingMoreSubmissions) return;
    setLoadingMoreSubmissions(true);
    try {
      const role = normalizeRole(userProfile.role);
      const nextQuery = role === "enumerator"
        ? query(collection(db, "submissions"), where("enumeratorUid", "==", authUser.uid), startAfter(submissionCursor), limit(SUBMISSIONS_PAGE_SIZE))
        : query(collection(db, "submissions"), orderBy("createdAt", "desc"), startAfter(submissionCursor), limit(SUBMISSIONS_PAGE_SIZE));
      const snapshot = await getDocs(nextQuery);
      const rows = await mapSubmissionSnapshot(snapshot, db);
      setHotspotRows((current) => [...current, ...rows]);
      setSubmissionCursor(snapshot.docs.length === SUBMISSIONS_PAGE_SIZE ? snapshot.docs.at(-1) || null : null);
    } catch {
      setDataError("Halaman data berikutnya tidak dapat dimuat.");
    } finally {
      setLoadingMoreSubmissions(false);
    }
  }, [authUser, loadingMoreSubmissions, submissionCursor, userProfile]);

  async function handleLogout() {
    if (auth) await signOut(auth);
  }

  async function removeHotspotData(hotspot: Hotspot) {
    if (!db || !authUser || roleKey !== "admin" || deletingHotspotRef.current) return;
    const confirmed = window.confirm(`Hapus data hotspot "${hotspot.name}" beserta dokumen pendukungnya? File Drive akan dipindahkan ke Sampah.`);
    if (!confirmed) return;

    deletingHotspotRef.current = true;
    setDeletingHotspotId(hotspot.id);
    setDataError("");
    try {
      const token = await authUser.getIdToken();
      const response = await fetch("/api/admin/submissions/delete", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: hotspot.id }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Data hotspot dan dokumen gagal dihapus.");
      setHotspotRows((rows) => rows.filter((row) => row.id !== hotspot.id));
      if (selectedHotspot?.id === hotspot.id) {
        setSelectedHotspot(null);
        setShowQcModal(false);
      }
      setLastUpdated("sekarang");
      void refreshDashboardSummary(authUser, userProfile);
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "Data hotspot dan dokumen gagal dihapus.");
    } finally {
      deletingHotspotRef.current = false;
      setDeletingHotspotId(null);
    }
  }

  async function completeSupervisionSession(session: SupervisionSession) {
    if (!db || !authUser || !session.pengesahanTandaTanganEnumerator || !session.pengesahanTandaTanganKoordinator) return;
    if (roleKey !== "admin" && session.coordinatorUid !== authUser.uid) return;
    if (session.workflowStatus !== "awaiting_coordinator_completion" || !session.submissionIds.length) return;
    setCompletingSupervisionId(session.id);
    setSupervisionError("");
    const decision = session.kesimpulanSupervisi;
    const workflowStage: WorkflowStage = decision === "valid"
      ? "analyst_review"
      : decision === "needs_revision" ? "needs_revision" : "coordinator_review";
    const coordinatorReviewStatus: Hotspot["coordinatorReviewStatus"] = decision === "valid"
      ? "Valid"
      : decision === "needs_revision" ? "Perlu perbaikan" : "Pending";
    const reviewedAt = new Date().toISOString();
    const batch = writeBatch(db);
    try {
      for (const submissionId of session.submissionIds) {
        batch.update(doc(db, "submissions", submissionId), {
          coordinatorReviewStatus,
          coordinatorReviewNote: session.coordinatorReviewNote,
          coordinatorReviewKelengkapan: session.checks.kualitas_1 || "",
          coordinatorReviewDuplikasi: session.checks.kualitas_3 || "",
          coordinatorReviewKroscek: session.checks.kualitas_4 || "",
          coordinatorReviewerName: session.coordinatorName,
          coordinatorReviewDate: session.reviewDate,
          coordinatorReviewerUid: session.coordinatorUid,
          coordinatorReviewedAt: reviewedAt,
          workflowStage,
          workflowUpdatedByRole: "koordinator",
          workflowHistory: arrayUnion({
            stage: workflowStage,
            role: "koordinator",
            uid: session.coordinatorUid,
            actorName: session.coordinatorName,
            at: reviewedAt,
            note: session.coordinatorReviewNote,
          }),
        });
      }
      batch.update(doc(db, "supervisions", session.id), {
        workflowStatus: "completed",
        completedAt: reviewedAt,
      });
      await batch.commit();
      setLastUpdated("sekarang");
      void refreshDashboardSummary(authUser, userProfile);
    } catch (error) {
      setSupervisionError(error instanceof Error ? error.message : "Sesi supervisi gagal diselesaikan.");
    } finally {
      setCompletingSupervisionId(null);
    }
  }

  async function reviewQcWithAi(submissionId: string): Promise<AiQcSuggestion> {
    if (!authUser) throw new Error("Sesi login tidak ditemukan.");
    const token = await authUser.getIdToken();
    const response = await fetch("/api/qc/ai-review", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ submissionId }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "AI gagal meninjau data.");
    return result.suggestion as AiQcSuggestion;
  }

  async function saveQcStatus(payload: { status: Hotspot["qc"]; note: string; kelengkapan: string; duplikasi: string; kroscek: string; pemeriksa: string; tanggal: string; document?: File }) {
    if (!db || !selectedHotspot || reviewerKind === "coordinator" || !canReviewWorkflowStage(reviewerKind, selectedHotspot.workflowStage)) {
      throw new Error("Data ini tidak berada pada tahap yang dapat Anda tangani.");
    }
    const isCoordinatorReview = (isCoordinator && roleKey !== "admin")
      || (roleKey === "admin" && selectedHotspot.workflowStage !== "analyst_review");
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
        ? (isCoordinatorReview ? "analyst_review" : "finalized")
        : (isCoordinatorReview ? "coordinator_review" : "analyst_review");
    const reviewedAt = new Date().toISOString();
    try {
      await updateDoc(doc(db, "submissions", selectedHotspot.id), {
        ...(isCoordinatorReview ? {
          coordinatorReviewStatus: payload.status,
          coordinatorReviewNote: payload.note,
          coordinatorReviewKelengkapan: payload.kelengkapan,
          coordinatorReviewDuplikasi: payload.duplikasi,
          coordinatorReviewKroscek: payload.kroscek,
          coordinatorReviewerName: payload.pemeriksa,
          coordinatorReviewDate: payload.tanggal,
          coordinatorReviewerUid: authUser?.uid || "",
          coordinatorReviewedAt: reviewedAt,
        } : {
          qcStatus: payload.status === "Valid" ? "valid" : payload.status === "Perlu perbaikan" ? "perlu_perbaikan" : "pending",
          qcKelengkapan: payload.kelengkapan,
          qcDuplikasi: payload.duplikasi,
          qcKroscek: payload.kroscek,
          qcNote: payload.note,
          qcNamaPemeriksa: payload.pemeriksa,
          qcTanggalPemeriksaan: payload.tanggal,
        }),
        ...(!isCoordinatorReview ? {
          ...(approvalDocument ? { qcDokumenPersetujuan: approvalDocument } : {}),
          qcReviewerUid: authUser?.uid || "",
          qcReviewedAt: reviewedAt,
        } : {}),
        workflowStage,
        workflowUpdatedByRole: userProfile?.role || "",
        workflowHistory: arrayUnion({
          stage: workflowStage,
          role: userProfile?.role || "",
          uid: authUser?.uid || "",
          actorName: userProfile?.nama || userProfile?.name || authUser?.displayName || "",
          at: reviewedAt,
          note: payload.note,
        }),
      });
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String(error.code) : "";
      throw new Error(code === "permission-denied" ? "Anda tidak memiliki akses untuk menyimpan hasil pemeriksaan ini." : "Hasil pemeriksaan gagal disimpan. Silakan coba lagi.");
    }
    setHotspotRows((rows) => rows.map((row) => row.id === selectedHotspot.id ? {
      ...row,
      workflowStage,
      ...(isCoordinatorReview ? {
        coordinatorReviewStatus: payload.status,
        coordinatorReviewNote: payload.note,
        coordinatorReviewKelengkapan: payload.kelengkapan,
        coordinatorReviewDuplikasi: payload.duplikasi,
        coordinatorReviewKroscek: payload.kroscek,
        coordinatorReviewerName: payload.pemeriksa,
        coordinatorReviewDate: payload.tanggal,
      } : { qc: payload.status }),
    } : row));
    void refreshDashboardSummary(authUser, userProfile);
    setLastUpdated("sekarang");
    setShowQcModal(false);
    setSelectedHotspot(null);
  }

  async function openUserManagement() {
    if (userProfile?.role?.toLowerCase() !== "admin" || !authUser) return;
    setShowUserManagement(true);
    setUserManagementLoading(true);
    setUserManagementError("");
    try {
      const token = await authUser.getIdToken();
      const response = await fetch("/api/admin/users", { headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Daftar user tidak dapat dimuat.");
      setManagedUsers((result.users as UserProfile[]).map((user) => normalizeUserProfile(user.id || "", user)));
    } catch (error) {
      setUserManagementError(error instanceof Error ? error.message : "Daftar user tidak dapat dimuat.");
    } finally {
      setUserManagementLoading(false);
    }
  }

  async function saveUserProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authUser || !editingUser?.id) return;
    const formData = new FormData(event.currentTarget);
    const profile = {
      username: String(formData.get("username") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      nama: String(formData.get("nama") || "").trim(),
      role: String(formData.get("role") || "enumerator").trim(),
      organisasi: String(formData.get("organisasi") || "").trim(),
    };
    try {
      const token = await authUser.getIdToken();
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ uid: editingUser.id, ...profile }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Profil user gagal disimpan.");
      setManagedUsers((users) => users.map((user) => user.id === editingUser.id ? { ...user, ...profile } : user));
      setEditingUser(null);
    } catch (error) {
      setUserManagementError(error instanceof Error ? error.message : "Profil user gagal disimpan.");
    }
  }

  async function createUserProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authUser) return;
    const formData = new FormData(event.currentTarget);
    const profile = {
      username: String(formData.get("username") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      nama: String(formData.get("nama") || "").trim(),
      role: String(formData.get("role") || "enumerator").trim(),
      organisasi: String(formData.get("organisasi") || "").trim(),
      password: String(formData.get("password") || ""),
    };
    try {
      const token = await authUser.getIdToken();
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Akun user gagal dibuat.");
      setManagedUsers((users) => [...users, normalizeUserProfile(result.user.id, result.user)]);
      setCreatingUser(false);
      setUserManagementError("");
    } catch (error) {
      setUserManagementError(error instanceof Error ? error.message : "Akun user gagal dibuat.");
    }
  }

  async function removeUserProfile(user: UserProfile) {
    if (!authUser || !user.id || user.id === authUser.uid || user.id === userProfile?.id) return;
    if (!window.confirm(`Hapus profil ${user.nama || user.username || "user ini"}?`)) return;
    try {
      const token = await authUser.getIdToken();
      const response = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Profil user gagal dihapus.");
      setManagedUsers((users) => users.filter((item) => item.id !== user.id));
    } catch (error) {
      setUserManagementError(error instanceof Error ? error.message : "Profil user gagal dihapus.");
    }
  }

  if (!authReady || !isLoggedIn) {
    return <LoginScreen onLogin={(user) => { setAuthUser(user); setIsLoggedIn(true); }} loginError={loginError} setLoginError={setLoginError} />;
  }

  return (
    <div className={`dashboard-page ${isReviewer ? "can-review" : "read-only"} ${isEnumerator ? "enumerator-dashboard" : "reviewer-dashboard"}`}>
      {dataLoading && authUser && userProfile && <DashboardLoading />}
      <nav className="topbar"><div className="brand"><span className="brand-mark"><NextImage src="/lingga-indonesia-icon.svg" alt="Lingga Indonesia" width={30} height={30} loading="eager" /></span><span>Pemetaan Hotspot<br /><small>Kota Malang 2026</small></span></div><div className="topbar-actions"><span className="user-chip"><span className="avatar">{(userProfile?.nama?.[0] || authUser?.email?.[0] || "A").toUpperCase()}</span><span><strong>{userProfile?.nama || authUser?.email || "Pengguna"}</strong><small>{displayRole(userProfile?.role)}</small></span></span>{userProfile?.role?.toLowerCase() === "admin" && <button className="button button-ghost" onClick={openUserManagement}>♙ <span>Manajemen User</span></button>}{isEnumerator && <button className="button button-accent" onClick={() => setShowEnumeratorForm(true)}>＋ <span>Input Data</span></button>}<button className="icon-button" onClick={handleLogout} aria-label="Keluar">↪</button></div></nav>
      <main className="dashboard-content">
        <section className="intro-row"><div><p className="eyebrow">{isEnumerator ? "Pendataan Lapangan" : "Pemantauan & Pemeriksaan Kualitas"}</p><h1>{roleTitle}</h1><p className="subtitle">{roleSubtitle}</p></div><div className="sync-note"><span className="live-dot" /> Pembaruan data <strong>{lastUpdated}</strong></div></section>
        {isLegacySupervisor && <p className="dashboard-summary-error" role="status">Role Supervisor tidak digunakan dalam proposal kegiatan. Hubungi Admin untuk mengubah role akun menjadi Koordinator Kegiatan.</p>}
        {isEnumerator && <section className="role-actions"><article><span className="role-action-icon">＋</span><div><strong>Input data hotspot</strong><p>Tambahkan hasil pemetaan baru dari lapangan.</p></div><button className="button button-accent" onClick={() => setShowEnumeratorForm(true)}>Mulai input →</button></article><article><span className="role-action-icon role-action-blue">◷</span><div><strong>Menunggu pemeriksaan</strong><p>Pantau status data yang sudah Anda kirim.</p></div>        <strong className="role-action-count">{pendingQc ?? "—"}</strong></article></section>}
        {(isCoordinator || isAnalyst) && <details className="panel role-workflow-guide" aria-label={`Panduan tugas ${isCoordinator ? "Koordinator" : "Data Analis"}`}>
          <summary className="role-workflow-summary">
            <div>
            <p className="eyebrow">Panduan teknis dashboard</p>
            <h2>{isCoordinator ? "Proses supervisi hotspot" : "Proses pemeriksaan data"}</h2>
            </div>
            <span className="role-workflow-summary-meta">
              <span className="role-workflow-count">{hotspotRows.filter((row) => canReviewWorkflowStage(reviewerKind, row.workflowStage)).length}<small>siap ditangani<br />dari data termuat</small></span>
              <span className="role-workflow-chevron" aria-hidden="true">⌄</span>
            </span>
          </summary>
          <div className="role-workflow-content">
            <ol className="role-workflow-steps">
              {(isCoordinator
                ? [
                    "Buka hotspot berstatus Menunggu supervisi Koordinator atau Perlu perbaikan, lalu periksa detailnya.",
                    "Buka tab Supervisi, klik Buat supervisi, pilih enumerator, dan centang hotspot yang diperiksa pada sesi ini.",
                    "Isi semua checklist, temuan, kendala, dan tindak lanjut.",
                    "Pilih kesimpulan: Lolos meneruskan data ke Data Analis; Pending mempertahankannya di antrean Koordinator; Perlu perbaikan mengirimnya ke tindak lanjut.",
                    "Simpan draft. Enumerator menandatangani melalui akunnya sendiri; setelah itu, pilih Selesaikan supervisi pada antrean Koordinator.",
                  ]
                : [
                    "Buka hotspot berstatus Pemeriksaan Data Analis, lalu periksa detail isian dan dokumen pendukung.",
                    "Isi kelengkapan, indikasi duplikasi, dan hasil kroscek pada form pemeriksaan.",
                    "Pilih hasil: Valid memfinalkan data; Pending mempertahankannya di antrean Analis; Perlu perbaikan mengirimnya ke tindak lanjut.",
                    "Isi catatan bila perlu perbaikan. Tambahkan dokumen persetujuan bila diperlukan, lalu simpan hasil pemeriksaan.",
                  ]
              ).map((step) => <li key={step}>{step}</li>)}
            </ol>
            <strong>{isCoordinator
              ? "Perubahan status hotspot diterapkan setelah Enumerator menandatangani dan Koordinator menyelesaikan sesi."
              : "Pemeriksaan dilakukan per hotspot yang sudah lolos supervisi Koordinator."}</strong>
          </div>
        </details>}
        {dataError && <p className="dashboard-summary-error" role="alert">{dataError}</p>}
        {dashboardSummaryError && <p className="dashboard-summary-error" role="alert">{dashboardSummaryError} <button type="button" onClick={() => void refreshDashboardSummary(authUser, userProfile)}>Coba lagi</button></p>}
        {supervisionError && <p className="dashboard-summary-error" role="alert">{supervisionError}</p>}
        {isEnumerator && authUser && <section className="panel table-panel signature-inbox" aria-label="Sesi supervisi menunggu tanda tangan">
          <div className="table-toolbar">
            <PanelHeading icon="✓" title="Konfirmasi supervisi" subtitle="Baca hasil dari Koordinator, lalu tanda tangani melalui akun Enumerator Anda." />
          </div>
          <div className="table-wrap">
            <table className="signature-inbox-table">
              <thead><tr><th>TANGGAL SUPERVISI</th><th>HOTSPOT</th><th>KOORDINATOR</th><th>KESIMPULAN</th><th>AKSI</th></tr></thead>
              <tbody>
                {supervisionSessions.filter((session) => session.workflowStatus === "awaiting_enumerator_signature").map((session) => (
                  <tr key={session.id}>
                    <td>{session.pengesahanTanggalKoordinator || "—"}</td>
                    <td><strong>{session.hotspotNames.join(", ") || `${session.submissionIds.length} hotspot`}</strong></td>
                    <td>{session.coordinatorName || "—"}</td>
                    <td>{session.kesimpulanSupervisi === "valid" ? "Lolos supervisi" : session.kesimpulanSupervisi === "needs_revision" ? "Perlu perbaikan" : "Perlu tindak lanjut"}</td>
                    <td><button type="button" className="button button-primary" onClick={() => setSelectedSignatureSession(session)}>Lihat hasil &amp; tanda tangan</button></td>
                  </tr>
                ))}
                {!supervisionSessions.some((session) => session.workflowStatus === "awaiting_enumerator_signature") && (
                  <tr>
                    <td colSpan={5} className="empty-state signature-inbox-message">
                      {supervisionLoading
                        ? "Memuat sesi konfirmasi supervisi..."
                        : supervisionError
                          ? <>{supervisionError} <button type="button" className="button-link" onClick={() => setSupervisionRefreshKey((key) => key + 1)}>Coba lagi</button></>
                          : "Belum ada hasil supervisi yang menunggu tanda tangan untuk akun Enumerator ini."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>}
        <nav className="dashboard-tabs" role="tablist" aria-label="Tampilan dashboard"><button type="button" role="tab" id="dashboard-data-tab" aria-selected={activeDashboardTab === "data"} aria-controls="dashboard-active-panel" className={activeDashboardTab === "data" ? "dashboard-tab is-active" : "dashboard-tab"} onClick={() => setActiveDashboardTab("data")}>{isEnumerator ? "Data saya" : "Data & pemeriksaan"}</button>{!isEnumerator && <button type="button" role="tab" id="dashboard-progress-tab" aria-selected={activeDashboardTab === "progress"} aria-controls="dashboard-active-panel" className={activeDashboardTab === "progress" ? "dashboard-tab is-active" : "dashboard-tab"} onClick={() => { setActiveDashboardTab("progress"); void refreshDashboardSummary(authUser, userProfile); }}>Progres Enumerator</button>}<button type="button" role="tab" id="dashboard-analytics-tab" aria-selected={activeDashboardTab === "analytics"} aria-controls="dashboard-active-panel" className={activeDashboardTab === "analytics" ? "dashboard-tab is-active" : "dashboard-tab"} onClick={() => setActiveDashboardTab("analytics")}>Analitik</button>{canSupervise && <button type="button" role="tab" id="dashboard-supervision-tab" aria-selected={activeDashboardTab === "supervision"} aria-controls="dashboard-active-panel" className={activeDashboardTab === "supervision" ? "dashboard-tab is-active" : "dashboard-tab"} onClick={() => setActiveDashboardTab("supervision")}>Supervisi</button>}</nav>
        {activeDashboardTab !== "data"
          ? <div id="dashboard-active-panel" role="tabpanel" tabIndex={0} aria-labelledby={`dashboard-${activeDashboardTab}-tab`}>
            {activeDashboardTab === "progress"
              ? <EnumeratorProgress summary={dashboardSummary} loading={dashboardSummaryLoading} error={dashboardSummaryError} onRefresh={() => void refreshDashboardSummary(authUser, userProfile)} />
              : activeDashboardTab === "analytics"
                ? <>
                  <section className="kpi-grid" aria-label="Ringkasan data"><Kpi tone="blue" label={isEnumerator ? "DATA SAYA TERCATAT" : "TOTAL HOTSPOT TERCATAT"} value={totalHotspots === undefined ? "—" : String(totalHotspots)} note={dashboardSummaryLoading ? "Memuat seluruh data..." : dashboardSummaryError || "Total seluruh data"} icon="▦" /><Kpi tone="teal" label={isEnumerator ? "DATA TERKIRIM" : "HOTSPOT BARU & AKTIF"} value={activeHotspots === undefined ? "—" : String(activeHotspots)} note="Status aktif dan baru" icon="⌁" /><Kpi tone="amber" label={isEnumerator ? "MENUNGGU PEMERIKSAAN" : "PERLU PEMERIKSAAN"} value={pendingQc === undefined ? "—" : String(pendingQc)} note="Menunggu tindak lanjut" icon="!" /><Kpi tone="coral" label="HIV+ / JUMLAH TES" value={hivPositive === undefined ? "—" : String(hivPositive)} suffix={hivTests === undefined ? "" : `/ ${hivTests} Tes`} note="Akumulasi seluruh data" icon="♥" /></section>
                  <DashboardAnalytics rows={hotspotRows} canLoadMore={submissionCursor !== null} onLoadMore={() => void loadMoreSubmissions()} />
                  <DashboardOverview rows={hotspotRows} totalRows={totalHotspots ?? hotspotRows.length} />
                </>
                : <section className="supervision-dashboard">
                  <div className="panel supervision-dashboard-heading"><div><p className="eyebrow">Supervisi lapangan</p><h2>Kelola dan pantau sesi supervisi</h2><p>Buat sesi supervisi baru atau lihat riwayat sesi yang pernah dibuat.</p></div><button type="button" className="button button-primary" onClick={() => { setInitialSupervisionSubmissionId(null); setShowSupervisionForm(true); }}>＋ Buat supervisi</button></div>
                  {supervisionError && <p className="dashboard-summary-error" role="alert">{supervisionError}</p>}
                  <section className="panel coordinator-supervision-queue">
                    <div><p className="eyebrow">Antrean supervisi</p><h2>Menunggu tanda tangan atau penyelesaian</h2></div>
                    {pendingCoordinatorSupervisionSessions.map((session) => <article className="coordinator-supervision-item" key={session.id}>
                      <div><strong>{session.enumeratorName || "Enumerator"} · {session.hotspotNames.join(", ") || `${session.submissionIds.length} hotspot`}</strong><small>{session.workflowStatus === "awaiting_enumerator_signature" ? "Menunggu Enumerator menandatangani." : `Ditandatangani ${session.pengesahanTandaTanganEnumerator?.signerName || "Enumerator"} · ${session.pengesahanTanggalEnumerator || "tanggal tidak tercatat"}; sesi siap diselesaikan.`}</small>{session.pengesahanTandaTanganEnumerator?.fileId && <NextImage className="coordinator-signature-preview" src={`/api/documents/preview?fileId=${encodeURIComponent(session.pengesahanTandaTanganEnumerator.fileId)}`} alt={`Tanda tangan ${session.enumeratorName || "Enumerator"}`} width={460} height={130} unoptimized />}</div>
                      <button type="button" className="button button-primary" disabled={session.workflowStatus !== "awaiting_coordinator_completion" || completingSupervisionId === session.id} onClick={() => void completeSupervisionSession(session)}>{completingSupervisionId === session.id ? "Menyelesaikan..." : "Selesaikan supervisi"}</button>
                    </article>)}
                    {!pendingCoordinatorSupervisionSessions.length && <p className="supervision-history-empty">{supervisionLoading ? "Memuat sesi supervisi..." : "Tidak ada sesi yang menunggu tindakan."}</p>}
                  </section>
                  <section className="panel supervision-history">
                    <div><p className="eyebrow">Riwayat</p><h2>Riwayat supervisi</h2></div>
                    <div className="table-wrap"><table><thead><tr><th>TANGGAL</th><th>ENUMERATOR</th><th>HOTSPOT</th><th>KESIMPULAN</th><th>STATUS</th></tr></thead><tbody>
                      {supervisionHistory.map((session) => <tr key={session.id}>
                        <td>{session.reviewDate || "—"}</td>
                        <td>{session.enumeratorName || "—"}</td>
                        <td>{session.hotspotNames.join(", ") || `${session.submissionIds.length} hotspot`}</td>
                        <td>{session.kesimpulanSupervisi === "valid" ? "Lolos supervisi" : session.kesimpulanSupervisi === "needs_revision" ? "Perlu perbaikan" : "Perlu tindak lanjut"}</td>
                        <td>{session.workflowStatus === "completed" ? "Selesai" : session.workflowStatus === "awaiting_enumerator_signature" ? "Menunggu tanda tangan Enumerator" : session.workflowStatus === "awaiting_coordinator_completion" ? "Siap diselesaikan Koordinator" : session.workflowStatus || "—"}</td>
                      </tr>)}
                      {!supervisionHistory.length && <tr><td colSpan={5} className="empty-state">{supervisionLoading ? "Memuat riwayat supervisi..." : supervisionError ? "Riwayat supervisi tidak dapat dimuat." : "Belum ada riwayat supervisi."}</td></tr>}
                    </tbody></table></div>
                  </section>
                </section>}
          </div>
          : <div id="dashboard-active-panel" role="tabpanel" tabIndex={0} aria-labelledby="dashboard-data-tab">
          <SubmissionTable
            rows={filteredHotspots}
            loadedRows={hotspotRows.length}
            totalRows={totalHotspots}
            isEnumerator={isEnumerator}
            isAdmin={roleKey === "admin"}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            filter={filter}
            onFilterChange={setFilter}
            loading={dataLoading}
            canLoadMore={submissionCursor !== null}
            loadingMore={loadingMoreSubmissions}
            onLoadMore={() => void loadMoreSubmissions()}
            deletingHotspotId={deletingHotspotId}
            onView={(hotspot) => { setSelectedHotspot(hotspot); setShowQcModal(false); }}
            onRevise={(hotspot) => { setRevisionSubmission(hotspot); setShowEnumeratorForm(true); }}
            onDelete={(hotspot) => void removeHotspotData(hotspot)}
          />
              </div>}
      </main>
      {isEnumerator && authUser && !showEnumeratorForm && <EnumeratorAiAssistant user={authUser} />}
      {showUserManagement && <UserManagementModal users={managedUsers} loading={userManagementLoading} error={userManagementError} editingUser={editingUser} creatingUser={creatingUser} onClose={() => { setShowUserManagement(false); setEditingUser(null); setCreatingUser(false); }} onAdd={() => { setEditingUser(null); setCreatingUser(true); setUserManagementError(""); }} onCancelEdit={() => { setEditingUser(null); setCreatingUser(false); }} onEdit={(user) => { setEditingUser(user); setCreatingUser(false); }} onSave={saveUserProfile} onCreate={createUserProfile} onDelete={removeUserProfile} />}
      {showEnumeratorForm && authUser && <EnumeratorForm key={revisionSubmission?.id || "new"} user={authUser} profile={userProfile} existingHotspots={hotspotRows} revision={revisionSubmission} onClose={() => { setShowEnumeratorForm(false); setRevisionSubmission(null); }} onSaved={() => { setShowEnumeratorForm(false); setRevisionSubmission(null); setLastUpdated("sekarang"); void refreshDashboardSummary(authUser, userProfile); }} />}
      {canSupervise && authUser && <CoordinatorSupervisionForm key={initialSupervisionSubmissionId || "default"} open={showSupervisionForm} initialSubmissionId={initialSupervisionSubmissionId} user={authUser} profile={userProfile} rows={hotspotRows} pendingSubmissionIds={pendingSupervisionSubmissionIds} onClose={() => { setInitialSupervisionSubmissionId(null); setShowSupervisionForm(false); }} onSaved={() => {
        setInitialSupervisionSubmissionId(null);
        setShowSupervisionForm(false);
        setLastUpdated("sekarang");
      }} />}
      {selectedSignatureSession && authUser && <EnumeratorSignatureCard
        session={selectedSignatureSession}
        user={authUser}
        profile={userProfile}
        onClose={() => setSelectedSignatureSession(null)}
        onSigned={() => {
          setSelectedSignatureSession(null);
          setLastUpdated("sekarang");
        }}
      />}
      {selectedHotspot && !showQcModal && <ReviewDetailModal hotspot={selectedHotspot} canReview={canReviewSelectedHotspot} canSupervise={canSuperviseSelectedHotspot} onClose={() => setSelectedHotspot(null)} onReview={() => setShowQcModal(true)} onSupervise={() => {
        setInitialSupervisionSubmissionId(selectedHotspot.id);
        setSelectedHotspot(null);
        setShowSupervisionForm(true);
      }} />}
      {selectedHotspot && showQcModal && canReviewSelectedHotspot && <ReviewQcModal key={`${selectedHotspot.id}-${authUser?.uid || ""}`} hotspot={selectedHotspot} reviewerRole={isCoordinator && roleKey !== "admin" || roleKey === "admin" && selectedHotspot.workflowStage !== "analyst_review" ? "coordinator" : "analyst"} onClose={() => setShowQcModal(false)} onSave={saveQcStatus} onAiReview={reviewQcWithAi} reviewerName={userProfile?.nama || userProfile?.name || authUser?.displayName || authUser?.email?.split("@")[0] || ""} />}
    </div>
  );
}

function DashboardLoading() { return <div className="dashboard-loading" role="status" aria-live="polite" aria-busy="true"><div className="dashboard-loading-card"><div className="dashboard-loading-brand"><span>+</span></div><p className="dashboard-loading-kicker">Pemetaan Hotspot Malang</p><h2>Menyiapkan dashboard</h2><p>Memuat ringkasan data terbaru...</p><div className="dashboard-loading-track" /></div></div>; }
function FormSubmissionLoading() { return <div className="dashboard-loading" role="status" aria-live="polite" aria-busy="true"><div className="dashboard-loading-card"><div className="dashboard-loading-brand"><span>+</span></div><p className="dashboard-loading-kicker">Lingga · Pendataan lapangan</p><h2>Mengirim data pemetaan</h2><p>Foto dokumentasi sedang diunggah dan data sedang disimpan.</p><div className="dashboard-loading-track" /></div></div>; }



// Legacy modal retained temporarily; active UI uses review-modals.tsx.
function SubmissionTable({
  rows,
  loadedRows,
  totalRows,
  isEnumerator,
  isAdmin,
  searchQuery,
  onSearchChange,
  filter,
  onFilterChange,
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
  loadedRows: number;
  totalRows?: number;
  isEnumerator: boolean;
  isAdmin: boolean;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  filter: "Semua" | WorkflowStage;
  onFilterChange: (value: "Semua" | WorkflowStage) => void;
  loading: boolean;
  canLoadMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  deletingHotspotId: string | null;
  onView: (hotspot: Hotspot) => void;
  onRevise: (hotspot: Hotspot) => void;
  onDelete: (hotspot: Hotspot) => void;
}) {
  const title = isEnumerator ? "Data Pendataan Saya" : "Data Survei & Pemeriksaan Kualitas";
  const subtitle = isEnumerator
    ? "Pantau hasil pemeriksaan dan catatan tindak lanjut data yang Anda kirim."
    : "Pilih data untuk melihat detail atau memeriksa kualitas data.";

  return <section className="panel table-panel">
    <div className="table-toolbar">
      <div><PanelHeading icon="≡" title={title} subtitle={subtitle} /></div>
      <div className="table-controls">
        <div className="search-box"><span>⌕</span><input value={searchQuery} onChange={(event) => onSearchChange(event.target.value)} placeholder="Cari nama / kelurahan..." /></div>
        <select value={filter} onChange={(event) => onFilterChange(event.target.value as "Semua" | WorkflowStage)} aria-label="Filter tahapan workflow">
          <option value="Semua">Semua tahapan</option>{Object.entries(workflowStageLabels).map(([stage, label]) => <option key={stage} value={stage}>{label}</option>)}
        </select>
      </div>
    </div>
    <div className="table-wrap"><table>
      <thead><tr><th>NAMA ENUMERATOR</th><th>TANGGAL</th><th>NAMA HOTSPOT</th><th>WILAYAH</th><th>POPULASI KUNCI</th><th>STATUS HOTSPOT</th><th>TAHAP WORKFLOW</th><th>AKSI</th></tr></thead>
      <tbody>{rows.map((hotspot) => <tr key={hotspot.id}>
        <td>{hotspot.enumeratorName || "Nama belum diatur"}</td><td>{hotspot.date}</td><td><strong>{hotspot.name}</strong></td><td>{hotspot.area}</td>
        <td>{displayPopulation(hotspot.population)}</td><td><span className={`status-badge ${statusClass[hotspot.status]}`}><i />{hotspot.status}</span></td>
        <td><span className="workflow-badge">{workflowStageLabels[hotspot.workflowStage]}</span></td>
        <td><button className="row-action" onClick={() => onView(hotspot)} aria-label={`Lihat detail ${hotspot.name}`}>→</button>
          {isEnumerator && hotspot.workflowStage === "needs_revision" && <button type="button" className="row-action" onClick={() => onRevise(hotspot)} aria-label={`Perbaiki data ${hotspot.name}`} title="Perbaiki data">Revisi</button>}
          {isAdmin && <button type="button" className="row-action row-action-danger" onClick={() => onDelete(hotspot)} disabled={deletingHotspotId === hotspot.id} aria-label={`Hapus data ${hotspot.name}`}>{deletingHotspotId === hotspot.id ? "…" : "×"}</button>}
        </td>
      </tr>)}{rows.length === 0 && <tr><td colSpan={8} className="empty-state">{loading ? "Memuat data terbaru..." : "Data tidak ditemukan."}</td></tr>}</tbody>
    </table></div>
    <div className="table-footer">
      <span>Menampilkan {rows.length} hasil dari {loadedRows} data yang dimuat{totalRows === undefined ? "" : ` · total keseluruhan ${totalRows}`}</span>
      {canLoadMore
        ? <button type="button" className="button-link" onClick={onLoadMore} disabled={loadingMore}>{loadingMore ? "Memuat..." : "Muat data berikutnya"}</button>
        : <span>{totalRows !== undefined && loadedRows >= totalRows ? "Semua data termuat" : ""}</span>}
    </div>
  </section>;
}

/* eslint-disable-next-line @typescript-eslint/no-unused-vars */
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
  return <div className="user-modal-backdrop"><section className="user-modal qc-modal" role="dialog" aria-modal="true"><div className="user-modal-header"><div><p className="eyebrow">Pemeriksaan kualitas</p><h2>Pemeriksaan Data Hotspot</h2><p>{hotspot.name} · {hotspot.area}</p></div><button className="modal-close" onClick={onClose} aria-label="Tutup">×</button></div><div className="qc-detail-grid"><div><small>ID Data</small><strong>{hotspot.id}</strong></div><div><small>Status hotspot</small><strong>{hotspot.status}</strong></div><div><small>Populasi kunci</small><strong>{hotspot.population}</strong></div><div><small>Koordinat</small><strong>{hotspot.coordinates || "-"}</strong></div></div><form onSubmit={submit} className="qc-form"><label>Pemeriksaan kelengkapan<select value={kelengkapan} onChange={(event) => setKelengkapan(event.target.value)}><option value="lengkap">Lengkap &amp; sesuai standar</option><option value="perlu_perbaikan">Perlu perbaikan / isian belum lengkap</option></select></label><label>Indikasi duplikasi<select value={duplikasi} onChange={(event) => setDuplikasi(event.target.value)}><option value="tidak_ada">Tidak ada indikasi duplikasi</option><option value="ada">Ada indikasi duplikasi</option></select></label><label>Kroscek antar enumerator<select value={kroscek} onChange={(event) => setKroscek(event.target.value)}><option value="sesuai">Sesuai hasil kroscek</option><option value="perlu_klarifikasi">Perlu klarifikasi ulang</option></select></label><label>Status akhir data<select value={status} onChange={(event) => setStatus(event.target.value as Hotspot["qc"])}><option value="Valid">Valid - Siap difinalkan</option><option value="Pending">Menunggu tindak lanjut</option><option value="Perlu perbaikan">Perlu perbaikan</option></select></label><label>Catatan pemeriksaan<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} /></label><label>Dokumen pendukung persetujuan<input type="file" accept="image/*,.pdf,.doc,.docx" onChange={(event) => setDocument(event.target.files?.[0])} /></label><div className="qc-form-grid"><label>Nama pemeriksa<input value={pemeriksa} onChange={(event) => setPemeriksa(event.target.value)} required /></label><label>Tanggal pemeriksaan<input type="date" value={tanggal} onChange={(event) => setTanggal(event.target.value)} required /></label></div><div className="user-modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Batal</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? "Menyimpan..." : "Simpan hasil pemeriksaan"}</button></div></form></section></div>;
}
function UserManagementModal({ users, loading, error, editingUser, creatingUser, onClose, onAdd, onCancelEdit, onEdit, onSave, onCreate, onDelete }: { users: UserProfile[]; loading: boolean; error: string; editingUser: UserProfile | null; creatingUser: boolean; onClose: () => void; onAdd: () => void; onCancelEdit: () => void; onEdit: (user: UserProfile | null) => void; onSave: (event: React.FormEvent<HTMLFormElement>) => Promise<void>; onCreate: (event: React.FormEvent<HTMLFormElement>) => Promise<void>; onDelete: (user: UserProfile) => void }) {
  const [roleOverride, setRoleOverride] = useState<{ userId: string | null; role: string } | null>(null);
  const [savingUser, setSavingUser] = useState(false);
  const savingUserRef = useRef(false);
  const isFormOpen = Boolean(editingUser) || creatingUser;
  const storedRole = normalizeRole(editingUser?.role);
  const currentRole = roleOverride?.userId === (editingUser?.id || null)
    ? roleOverride.role
    : storedRole === "supervisor" ? "koordinator" : editingUser?.role || "enumerator";

  async function submitUser(event: React.FormEvent<HTMLFormElement>) {
    if (savingUserRef.current) {
      event.preventDefault();
      return;
    }

    savingUserRef.current = true;
    setSavingUser(true);
    try {
      await (creatingUser ? onCreate(event) : onSave(event));
    } finally {
      savingUserRef.current = false;
      setSavingUser(false);
    }
  }

  return (
    <div className="user-modal-backdrop" role="presentation">
      <section className="user-modal" role="dialog" aria-modal="true" aria-labelledby="user-management-title">
        <div className="user-modal-header">
          <div>
            <p className="eyebrow">Panel administrator</p>
            <h2 id="user-management-title">Manajemen User</h2>
            <p>Kelola profil, username, email, dan role pengguna.</p>
            {!isFormOpen && <button type="button" className="button button-primary" onClick={() => { setRoleOverride(null); onAdd(); }}>＋ Tambah user</button>}
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Tutup" disabled={savingUser}>×</button>
        </div>
        {error && <p className="login-error user-modal-error">{error}</p>}
        {isFormOpen ? (
          <form className="user-edit-form" onSubmit={submitUser} aria-busy={savingUser}>
            <label>Username<input name="username" defaultValue={editingUser?.username || ""} required /></label>
            <label>Email<input name="email" type="email" defaultValue={editingUser?.email || ""} required /></label>
            <label>Nama<input name="nama" defaultValue={editingUser?.nama || ""} required /></label>
            {creatingUser && <label>Password awal<input name="password" type="password" autoComplete="new-password" minLength={6} required /></label>}
            <label>Role<select name="role" value={currentRole} onChange={(event) => setRoleOverride({ userId: editingUser?.id || null, role: event.target.value })}><option value="admin">Admin</option><option value="data analis">Data Analis</option><option value="koordinator">Koordinator</option><option value="enumerator">Enumerator</option></select>{storedRole === "supervisor" && <small>Role lama akan dialihkan ke Koordinator sesuai proposal.</small>}</label>
            {(creatingUser || editingUser) && currentRole === "enumerator" && <label>Organisasi Enumerator<select name="organisasi" defaultValue={editingUser?.organisasi || ""} required><option value="">Pilih organisasi</option>{organizationOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
            {savingUser && <div className="form-saving-indicator form-wide" role="status" aria-live="polite"><span className="form-saving-brand" aria-hidden="true" /><strong>Menyimpan user...</strong><small>{creatingUser ? "Membuat akun dan profil user." : "Memperbarui profil user."}</small><i className="form-saving-track" aria-hidden="true" /></div>}
            <div className="user-modal-actions">
              <button type="button" className="button button-secondary" onClick={() => { setRoleOverride(null); onCancelEdit(); }} disabled={savingUser}>Batal</button>
              <button type="submit" className="button button-primary" disabled={savingUser}>{savingUser ? "Menyimpan..." : creatingUser ? "Buat user" : "Simpan profil"}</button>
            </div>
          </form>
        ) : (
          <div className="user-table-wrap">
            {loading ? <p className="user-empty">Memuat daftar user...</p> : users.length === 0 ? <p className="user-empty">Belum ada profil user.</p> : (
              <table>
                <thead><tr><th>USERNAME</th><th>NAMA</th><th>EMAIL</th><th>ROLE</th><th>AKSI</th></tr></thead>
                <tbody>{users.map((user) => (
                  <tr key={user.id}>
                    <td className="mono">{user.username || "-"}</td>
                    <td><strong>{user.nama || "-"}</strong></td>
                    <td>{user.email || "-"}</td>
                    <td><span className="user-role">{user.role || "-"}</span></td>
                    <td>
                      <button className="row-action" onClick={() => onEdit(user)} aria-label={`Edit ${user.username || "user"}`}>✎</button>
                      <button className="row-action row-action-danger" onClick={() => onDelete(user)} disabled={user.id === undefined} aria-label={`Hapus ${user.username || "user"}`}>×</button>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function GpsConfirmationDialog({ mode, result, startedAt, onCancel, onAccept, onRetry }: {
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
      : result && <div className="gps-confirm-card"><div className={`gps-confirm-icon ${warning ? "gps-confirm-icon-warning" : ""}`}>⌖</div><p className="eyebrow">Hasil lokasi</p><h2>Lokasi berhasil ditemukan</h2><p className="gps-confirm-copy">Periksa akurasi sebelum menyimpan titik ini ke formulir.</p><div className={`gps-confirm-accuracy ${warning ? "gps-accuracy-poor" : ""}`}><span className="gps-confirm-check">{warning ? "!" : "✓"}</span><div><small>Akurasi GPS</small><strong>Sekitar {result.accuracy} meter</strong>{warning && <em>Akurasi kurang baik. Ambil ulang di area terbuka.</em>}</div></div><div className="gps-confirm-coordinates"><div><small>Latitude</small><strong>{result.latitude}</strong></div><div><small>Longitude</small><strong>{result.longitude}</strong></div></div><div className="gps-confirm-actions"><button type="button" className="button button-secondary" onClick={onRetry}>Ambil ulang</button><button type="button" className="button button-primary" onClick={onAccept}>Gunakan lokasi</button></div></div>}
  </dialog>;
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

type SupervisionDecision = "valid" | "pending" | "needs_revision";

type SupervisionSignature = {
  dataUrl: string;
  signedAt: string;
  idempotencyKey: string;
};

type StoredSupervisionSignature = {
  fileId: string;
  fileName: string;
  fileUrl: string;
  signerUid: string;
  signerName: string;
  signedAt: string;
};

type SupervisionSession = {
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
  pengesahanTanggalEnumerator: string;
  pengesahanTanggalKoordinator: string;
  pengesahanTandaTanganEnumerator?: StoredSupervisionSignature;
  pengesahanTandaTanganKoordinator?: StoredSupervisionSignature;
};

async function uploadSupervisionSignature(user: User, signerName: string, sessionId: string, signature: SupervisionSignature, signer: "enumerator" | "koordinator") {
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

function SupervisionSignatureCanvas({ label, signature, onChange }: {
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

function EnumeratorSignatureCard({ session, user, profile, onClose, onSigned }: {
  session: SupervisionSession;
  user: User;
  profile: UserProfile | null;
  onClose: () => void;
  onSigned: () => void;
}) {
  const [signature, setSignature] = useState<SupervisionSignature | null>(null);
  const [attested, setAttested] = useState(false);
  const [signedDate, setSignedDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

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
        <div className="signature-result-summary">
          <strong>Kesimpulan</strong>
          <span>{session.kesimpulanSupervisi === "valid" ? "Lolos supervisi, diteruskan ke Data Analis" : session.kesimpulanSupervisi === "needs_revision" ? "Perlu perbaikan oleh Enumerator" : "Perlu tindak lanjut Koordinator"}</span>
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
      </div>
    </section>
  </div>;
}

function CoordinatorSupervisionForm({ open, initialSubmissionId, user, profile, rows, pendingSubmissionIds, onClose, onSaved }: { open: boolean; initialSubmissionId: string | null; user: User; profile: UserProfile | null; rows: Hotspot[]; pendingSubmissionIds: string[]; onClose: () => void; onSaved: () => void }) {
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
    if (!coordinatorSignature) {
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
    try {
      const coordinatorSignatureFile = await uploadSupervisionSignature(
        user,
        profile?.nama || profile?.name || user.displayName || user.email || "",
        supervisionRef.id,
        coordinatorSignature,
        "koordinator",
      );
      batch.set(supervisionRef, {
        checks,
        kesimpulanSupervisi: decision,
        komunitasOrganisasi: selectedRows.map((row) => normalizeOrganization(row.organisasi)).find(Boolean) || "",
        namaKoordinator: String(form.get("namaKoordinator") || "").trim(),
        pengesahanNamaEnumerator: selectedEnumeratorName,
        pengesahanNamaKoordinator: String(form.get("pengesahanNamaKoordinator") || "").trim(),
        pengesahanTanggalEnumerator: "",
        pengesahanTanggalKoordinator: String(form.get("pengesahanTanggalKoordinator") || ""),
        pengesahanTandaTanganKoordinator: coordinatorSignatureFile,
        coordinatorUid: user.uid,
        enumeratorUid: selectedEnumerator,
        submissionIds,
        hotspotNames: selectedRows.map((row) => row.name),
        workflowStage: "coordinator_review",
        workflowStatus: "awaiting_enumerator_signature",
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
          coordinatorReviewStatus: "Pending",
          coordinatorReviewNote: note,
          coordinatorReviewerName: String(form.get("namaKoordinator") || "").trim(),
          coordinatorReviewDate: String(form.get("tanggalSupervisi") || ""),
          coordinatorReviewerUid: user.uid,
          coordinatorReviewedAt: reviewedAt,
          workflowStage: "awaiting_enumerator_signature",
          workflowUpdatedByRole: "koordinator",
          workflowHistory: arrayUnion({
            stage: "awaiting_enumerator_signature",
            role: profile?.role || "koordinator",
            uid: user.uid,
            actorName: profile?.nama || user.displayName || "",
            at: reviewedAt,
            note: "Hasil supervisi dikirim kepada Enumerator untuk ditandatangani.",
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
            <label><input type="radio" name="kesimpulanSupervisi" value="valid" checked={decision === "valid"} onChange={() => setDecision("valid")} /> Lolos supervisi, teruskan ke Data Analis.</label>
            <label><input type="radio" name="kesimpulanSupervisi" value="pending" checked={decision === "pending"} onChange={() => setDecision("pending")} /> Perlu tindak lanjut Koordinator sebelum diteruskan.</label>
            <label><input type="radio" name="kesimpulanSupervisi" value="needs_revision" checked={decision === "needs_revision"} onChange={() => setDecision("needs_revision")} /> Perlu perbaikan oleh enumerator.</label>
          </div>
          <p className="form-section-title">F. Pengesahan</p>
          <div className="supervision-sign-grid">
            <div><strong>Koordinator</strong><label>Nama<input name="pengesahanNamaKoordinator" defaultValue={profile?.nama || user.email || ""} readOnly /></label><label>Tanggal<input name="pengesahanTanggalKoordinator" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></label><SupervisionSignatureCanvas label="Tanda tangan Koordinator" signature={coordinatorSignature} onChange={setCoordinatorSignature} /></div>
            <div className="signature-pending-note"><strong>Enumerator</strong><p>{selectedEnumeratorName || "Pilih enumerator"} menandatangani sesi ini melalui akunnya sendiri setelah draft supervisi disimpan.</p></div>
          </div>
          <div className="user-modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Batal</button><button type="submit" className="button button-primary" disabled={saving || selectedRows.length === 0 || !coordinatorSignature}>{saving ? "Menyimpan..." : `Simpan draft untuk ${selectedRows.length} hotspot`}</button></div>
        </form>
      </section>
    </div>
  );
}

function SupervisionChecks({ title, name, items }: { title: string; name: string; items: string[] }) {
  return <div className="supervision-check-section"><p className="form-section-title">{title}</p><div className="supervision-check-table"><div className="supervision-check-head"><span>No</span><span>Komponen pemeriksaan</span><span>Ya</span><span>Tidak</span></div>{items.map((item, index) => <div className="supervision-check-row" key={item}><span>{index + 1}</span><span>{item}</span><label><input type="radio" name={`${name}_${index + 1}`} value="ya" required /> Ya</label><label><input type="radio" name={`${name}_${index + 1}`} value="tidak" required /> Tidak</label></div>)}</div></div>;
}

function EnumeratorForm({ user, profile, existingHotspots, revision, onClose, onSaved }: { user: User; profile: UserProfile | null; existingHotspots: Hotspot[]; revision: Hotspot | null; onClose: () => void; onSaved: () => void }) {
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
  const [visitMode, setVisitMode] = useState<"initial" | "follow_up">("initial");
  const [previousHotspotId, setPreviousHotspotId] = useState("");
  const [gps, setGps] = useState(revision?.coordinates || "");
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
    setVisitMode(mode);
    if (mode === "initial") setPreviousHotspotId("");
  };
  const hotspotIdentity = JSON.stringify([hotspotName.trim(), village.trim(), address.trim()]);
  const activeHotspotCode = revision?.hotspotCode || (hotspotCodeIdentity === hotspotIdentity ? hotspotCode : "");
  return <>
    <EnumeratorFormFields user={user} profile={profile} error={error} saving={saving} gps={gps} onUseCurrentLocation={useCurrentLocation} onClose={onClose} onSubmit={submit} locationType={locationType} setLocationType={setLocationType} locationSubtype={locationSubtype} setLocationSubtype={setLocationSubtype} statusHotspot={statusHotspot} setStatusHotspot={setStatusHotspot} hotspotCode={activeHotspotCode} hotspotCodeLoading={hotspotCodeLoading} hotspotName={hotspotName} setHotspotName={setHotspotName} district={district} setDistrict={setDistrict} village={village} setVillage={setVillage} address={address} setAddress={setAddress} districts={malangKelurahan} visitMode={visitMode} setVisitMode={changeVisitMode} previousHotspotId={previousHotspotId} setPreviousHotspotId={setPreviousHotspotId} previousHotspots={previousVisits} previousVisitsLoading={previousVisitsLoading} onSelectPreviousHotspot={selectPreviousHotspot} locationSubtypes={locationSubtypes} revision={revision} />
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
    const selectedDocuments = [1, 2, 3].map((number) => {
      const file = form.get(number === 1 ? "document" : `document${number}`);
      return file instanceof File && file.size ? file : null;
    });
    if (!revision && selectedDocuments.slice(0, 2).some((file) => !file)) return setError("Dua foto dokumentasi wajib dipilih.");
    if (!gps) return setError("Titik koordinat GPS wajib diambil dari perangkat.");
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
        if (revision.workflowStage !== "needs_revision" || revision.enumeratorUid !== user.uid) {
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
        await updateDoc(doc(db, "submissions", revision.id), {
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
          document: revisedDocuments[0],
          documents: revisedDocuments,
          coordinatorReviewStatus: "Pending",
          workflowStage: "coordinator_review",
          workflowUpdatedByRole: "enumerator",
          workflowHistory: arrayUnion({
            stage: "coordinator_review",
            role: "enumerator",
            uid: user.uid,
            actorName: profile?.nama || user.displayName || "",
            at: revisedAt,
            note: "Enumerator mengirim revisi untuk ditinjau kembali oleh Koordinator.",
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

  return <div className="user-modal-backdrop"><section className="user-modal enumerator-modal" role="dialog" aria-modal="true" aria-labelledby="enumerator-form-title"><div className="user-modal-header"><div><p className="eyebrow">Pendataan lapangan</p><h2 id="enumerator-form-title">Input Data Pemetaan</h2><p>Field mengikuti instrumen pemetaan agar data tetap konsisten dan mudah dipantau.</p></div><button className="modal-close" onClick={onClose} aria-label="Tutup">×</button></div>{error && <p className="login-error user-modal-error">{error}</p>}<form className="user-edit-form enumerator-form" onSubmit={submit}><p className="form-section-title form-wide">A. Informasi Pelaksanaan</p><label>Nama Enumerator<input value={profile?.nama || user.email || ""} readOnly /></label><label>Organisasi / Komunitas Pelaksana<select name="organisasi" defaultValue="" required><option value="">Pilih organisasi</option><option value="lgi">Yayasan Lingkar Gagasan Indonesia (LGI)</option><option value="igama">Yayasan IGAMA</option><option value="wamarapa">Wamarapa</option><option value="fatayat_nu">SSR Fatayat NU Jawa Timur (PENASUN)</option></select></label><p className="form-section-title form-wide">B. Identitas Hotspot</p><label>Nama Hotspot<input name="namaHotspot" required /></label><label>Kecamatan<input name="kecamatan" required /></label><label>Kelurahan<input name="kelurahan" required /></label><label className="form-wide">Alamat atau Deskripsi Lokasi<textarea name="alamat" rows={2} required /></label><label className="form-wide">Titik Koordinat GPS<div className="gps-input"><input value={gps} placeholder="Tekan Gunakan GPS" readOnly required /><button type="button" className="button button-secondary" onClick={useCurrentLocation}>⌖ Gunakan GPS</button></div><small>Koordinat diambil dari lokasi perangkat.</small></label><label className="form-wide">Foto Dokumentasi Lokasi<input name="document" type="file" accept="image/*" capture="environment" required /></label><p className="form-section-title form-wide">C. Karakteristik Hotspot</p><label>Status Hotspot<select name="statusHotspot" defaultValue="" required><option value="">Pilih status</option><option value="aktif">Aktif</option><option value="baru">Baru</option><option value="tidak_aktif">Tidak Aktif</option><option value="perlu_klarifikasi">Perlu Klarifikasi</option><option value="lama">Lama</option></select></label><fieldset><legend>Kategori Populasi Kunci *</legend><div className="checkbox-grid">{[["lsl", "LSL"], ["transgender", "Transgender"], ["idu", "IDU / PWID"], ["pspl___tl__pekerja_seks_perempuan", "PSPL / TL"]].map(([value, label]) => <label key={value}><input type="checkbox" name="populasiKunci" value={value} /> {label}</label>)}</div></fieldset><label>Tipe Lokasi Utama<select name="tipeLokasi" defaultValue="" required><option value="">Pilih tipe lokasi</option><option value="ruang_publik">Ruang Publik / Area Terbuka / Jalanan</option><option value="tempat_makan_hiburan">Tempat Makan / Nongkrong / Hiburan</option><option value="akomodasi_private">Akomodasi / Private Venue</option><option value="perawatan_kebugaran">Perawatan & Kebugaran</option><option value="platform_virtual">Platform Virtual / Online</option><option value="lainnya">Lainnya</option></select></label><label>Detail Sub-Tipe Lokasi<input name="subTipeLokasi" placeholder="Isi sub-tipe lokasi" required /></label><label>Tipe Lokasi Lainnya<input name="tipeLokasiLainnya" /></label><fieldset><legend>Waktu Aktivitas Dominan *</legend><div className="checkbox-grid">{[["pagi", "Pagi"], ["siang", "Siang"], ["sore", "Sore"], ["malam", "Malam"]].map(([value, label]) => <label key={value}><input type="checkbox" name="waktuAktivitas" value={value} /> {label}</label>)}</div></fieldset><label>Jumlah Populasi<input name="estimasiJumlahPopulasi" type="number" min="0" defaultValue="0" /></label><label>Jumlah Diedukasi<input name="jumlahDiedukasi" type="number" min="0" defaultValue="0" /></label><label className="form-wide">Catatan Tambahan Temuan Lapangan<textarea name="catatan" rows={2} /></label><p className="form-section-title form-wide">D. Informasi Hasil Pemetaan</p><label>Sumber Informasi<select name="sumberInformasi" defaultValue="" required><option value="">Pilih sumber</option><option value="populasi_kunci">Populasi kunci</option><option value="tokoh_kunci">Tokoh kunci</option><option value="observasi">Observasi Lapangan Langsung</option><option value="lainnya">Lainnya</option></select></label><label>No. HP Informan<input name="noHpInforman" type="tel" pattern="[0-9+]{9,15}" required /></label><label>Keterangan Informan<input name="keteranganAktivitas" required /></label><label className="form-wide">Kondisi Hotspot Saat Pemetaan<textarea name="kondisiSaatPemetaan" rows={2} required /></label><div className="user-modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Batal</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? "Menyimpan..." : "Simpan Data Pemetaan"}</button></div></form></section></div>;
}

const MAX_UPLOAD_FILE_BYTES = 2_000_000;

function readFileWithFileReader(file: File): Promise<ArrayBuffer> {
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

async function toBase64(file: File) {
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

async function prepareImageForUpload(file: File): Promise<File> {
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
      setLoginError("Sistem autentikasi belum dikonfigurasi. Hubungi administrator.");
      return;
    }
    if (!auth) {
      setLoginError("Sistem autentikasi belum siap. Hubungi administrator.");
      return;
    }
    try {
      if (!db) {
        setLoginError("Sistem data belum siap. Periksa konfigurasi aplikasi.");
        return;
      }
      const userQuery = query(collection(db, "user"), where("username", "==", username.trim()), limit(1));
      const userSnapshot = await getDocs(userQuery);
      if (userSnapshot.empty) {
        setLoginError(`Username "${username.trim()}" tidak ditemukan.`);
        return;
      }
      const profile = userSnapshot.docs[0]?.data() as { email?: string } | undefined;
      if (!profile?.email) {
        setLoginError("Profil username ditemukan, tetapi data akun belum lengkap.");
        return;
      }
      const result = await signInWithEmailAndPassword(auth, profile.email, password);
      onLogin(result.user);
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String(error.code) : "";
      if (code === "permission-denied") {
        setLoginError("Akses data ditolak. Periksa status akun Anda atau hubungi administrator.");
      } else if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
        setLoginError("Password tidak cocok untuk username ini.");
      } else {
        setLoginError("Login gagal. Periksa kembali username dan password Anda, atau hubungi administrator.");
      }
    }
  }

  return <main className="login-page"><div className="login-layout"><section className="login-intro"><div className="login-brand-mark">+</div><p className="eyebrow login-eyebrow">Platform Pemetaan Data</p><h1>Pemetaan Hotspot Malang</h1><p className="login-description">Kelola data lapangan, pantau persebaran, dan pastikan setiap pendataan melalui pemeriksaan kualitas yang terukur.</p><div className="login-features"><div><span>✓</span>Pemantauan data terpusat</div><div><span>✓</span>Pemeriksaan kualitas data</div><div><span>✓</span>Pembaruan data lapangan</div></div><div className="login-orbit login-orbit-one" /><div className="login-orbit login-orbit-two" /></section><section className="login-form"><p className="eyebrow">Akses pengguna</p><h2>Masuk ke dashboard</h2><p className="login-form-copy">Gunakan username dan sandi yang terdaftar untuk melanjutkan.</p><form onSubmit={submitLogin}><label htmlFor="username">Username</label><div className="login-input"><span>◉</span><input id="username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="Masukkan username" /></div><label htmlFor="password">Sandi</label><div className="login-input"><span>▣</span><input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="Masukkan sandi" /></div>{loginError && <p className="login-error" role="alert">{loginError}</p>}<button className="login-submit" type="submit">Masuk ke dashboard <span>→</span></button></form><p className="login-footer">Lingga Indonesia <span>•</span> Pemetaan Kota Malang 2026</p></section></div></main>;}
