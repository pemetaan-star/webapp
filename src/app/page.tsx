"use client";

import dynamic from "next/dynamic";
import NextImage from "next/image";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { arrayUnion, collection, doc, getDoc, getDocs, limit, query, updateDoc, where, writeBatch } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRef } from "react";
import { auth, db, firebaseConfigured } from "@/lib/firebase";
import { Kpi, PanelHeading } from "@/app/components/dashboard";
import { DashboardLoading } from "@/app/components/dashboard-loading";
import { LoginScreen } from "@/app/components/login-screen";
import { SubmissionTable } from "@/app/components/submission-table";
import { ActionConfirmationDialog } from "@/app/components/action-confirmation-dialog";
import { MaintenanceNoticeDialog } from "@/app/components/maintenance-notice-dialog";
import { ReviewDetailModal, ReviewQcModal, type AiQcSuggestion } from "@/app/components/review-modals";
import { mapSubmissionSnapshot } from "@/app/components/dashboard-data-mappers";
import type { Hotspot, UserProfile } from "@/app/components/dashboard-types";
import { displayRole, normalizeRole } from "@/app/components/dashboard-roles";
import type { SupervisionSession } from "@/app/components/supervision-workflow";
import { useDashboardSummary } from "@/app/hooks/use-dashboard-summary";
import { useSubmissionFeed } from "@/app/hooks/use-submission-feed";
import { useSupervisionSessions } from "@/app/hooks/use-supervision-sessions";
import { normalizeOrganization } from "@/lib/organizations";
import { canReviewWorkflowStage, workflowStages, type WorkflowStage } from "@/lib/dashboard-summary";

const DashboardOverview = dynamic(() => import("@/app/components/dashboard-overview").then((module) => module.DashboardOverview));
const DashboardAnalytics = dynamic(() => import("@/app/components/dashboard-analytics").then((module) => module.DashboardAnalytics));
const FinalDataExport = dynamic(() => import("@/app/components/final-data-export").then((module) => module.FinalDataExport));
const EnumeratorProgress = dynamic(() => import("@/app/components/enumerator-progress").then((module) => module.EnumeratorProgress));
const EnumeratorAiAssistant = dynamic(() => import("@/app/components/enumerator-ai-assistant").then((module) => module.EnumeratorAiAssistant));
const EnumeratorForm = dynamic(() => import("@/app/components/enumerator-form-modal").then((module) => module.EnumeratorForm));
const CoordinatorSupervisionForm = dynamic(() => import("@/app/components/supervision-workflow").then((module) => module.CoordinatorSupervisionForm));
const EnumeratorSignatureCard = dynamic(() => import("@/app/components/supervision-workflow").then((module) => module.EnumeratorSignatureCard));
const UserManagementModal = dynamic(() => import("@/app/components/user-management-modal").then((module) => module.UserManagementModal));

type PendingConfirmation =
  | { kind: "hotspot-delete"; hotspot: Hotspot }
  | { kind: "user-delete"; user: UserProfile }
  | { kind: "supervision-cancel"; session: SupervisionSession };

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













export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(!firebaseConfigured);
  const [loginError, setLoginError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("baru saja");
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [showMaintenanceNotice, setShowMaintenanceNotice] = useState(false);
  const [managedUsers, setManagedUsers] = useState<UserProfile[]>([]);
  const [userManagementLoading, setUserManagementLoading] = useState(false);
  const [userManagementError, setUserManagementError] = useState("");
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [creatingUser, setCreatingUser] = useState(false);
  const [showEnumeratorForm, setShowEnumeratorForm] = useState(false);
  const [revisionSubmission, setRevisionSubmission] = useState<Hotspot | null>(null);
  const [showSupervisionForm, setShowSupervisionForm] = useState(false);
  const [initialSupervisionSubmissionId, setInitialSupervisionSubmissionId] = useState<string | null>(null);
  const [completingSupervisionId, setCompletingSupervisionId] = useState<string | null>(null);
  const [cancelingSupervisionId, setCancelingSupervisionId] = useState<string | null>(null);
  const [activeDashboardTab, setActiveDashboardTab] = useState<"data" | "progress" | "analytics" | "supervision">("data");
  const [selectedHotspot, setSelectedHotspot] = useState<Hotspot | null>(null);
  const [selectedSignatureSession, setSelectedSignatureSession] = useState<SupervisionSession | null>(null);
  const [showQcModal, setShowQcModal] = useState(false);
  const [deletingHotspotId, setDeletingHotspotId] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [confirmationError, setConfirmationError] = useState("");
  const deletingHotspotRef = useRef(false);
  const deletingUserRef = useRef(false);
  const cancelingSupervisionRef = useRef(false);
  const qcUploadKeys = useRef<Record<string, string>>({});
  const roleKey = normalizeRole(userProfile?.role);
  const isEnumerator = roleKey === "enumerator";

  useEffect(() => {
    if (!authReady || !isLoggedIn || !roleKey || isEnumerator) return;
    const timer = window.setTimeout(() => setShowMaintenanceNotice(true), 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [authReady, isLoggedIn, isEnumerator, roleKey]);
  const {
    rows: hotspotRows,
    setRows: setHotspotRows,
    loading: dataLoading,
    setLoading: setDataLoading,
    error: dataError,
    setError: setDataError,
    cursor: submissionCursor,
    loadingMore: loadingMoreSubmissions,
    loadMore: loadMoreSubmissions,
  } = useSubmissionFeed(authUser, userProfile, isEnumerator);
  const {
    sessions: supervisionSessions,
    setSessions: setSupervisionSessions,
    loading: supervisionLoading,
    error: supervisionError,
    setError: setSupervisionError,
    refresh: refreshSupervisionSessions,
  } = useSupervisionSessions(authUser, userProfile, isEnumerator);
  const {
    summary: dashboardSummary,
    setSummary: setDashboardSummary,
    loading: dashboardSummaryLoading,
    setLoading: setDashboardSummaryLoading,
    error: dashboardSummaryError,
    setError: setDashboardSummaryError,
    refresh: refreshDashboardSummary,
  } = useDashboardSummary();
  const displayedHotspotRows = useMemo(() => {
    const sessionStages = new Map<string, WorkflowStage>();
    const stagePriority: Record<string, number> = {
      coordinator_review: 0,
      awaiting_enumerator_signature: 1,
      awaiting_coordinator_completion: 2,
      needs_revision: 3,
    };
    for (const session of supervisionSessions) {
      const stage = session.kesimpulanSupervisi === "needs_revision" && session.workflowStatus === "awaiting_enumerator_signature"
        ? "needs_revision"
        : session.kesimpulanSupervisi === "pending" && (
            session.workflowStatus === "awaiting_enumerator_signature"
            || session.workflowStatus === "pending_coordinator_action"
          )
          ? "coordinator_review"
          : session.workflowStatus === "awaiting_enumerator_signature"
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
  const pendingSupervisionSubmissionIds = useMemo(
    () => supervisionSessions
      .filter((session) => (
        session.kesimpulanSupervisi === "valid"
        && (session.workflowStatus === "awaiting_enumerator_signature" || session.workflowStatus === "awaiting_coordinator_completion")
      ))
      .flatMap((session) => session.submissionIds),
    [supervisionSessions],
  );
  const totalVisits = dashboardSummary?.total;
  const activeNewVisits = dashboardSummary?.active;
  const pendingQc = dashboardSummary?.pendingQc;
  const hivPositive = dashboardSummary?.hivPositive;
  const hivTests = dashboardSummary?.hivTests;
  const isLegacySupervisor = roleKey === "supervisor";
  const isCoordinator = roleKey.includes("koordinator") || roleKey.includes("kordinator") || roleKey.includes("koor");
  const isAnalyst = roleKey.includes("dataanalis") || roleKey.includes("dataanalyst");
  const isReviewer = isCoordinator || isAnalyst || roleKey === "admin";
  const reviewerKind = roleKey === "admin" ? "admin" : isCoordinator ? "coordinator" : isAnalyst ? "analyst" : "other";
  const workflowQueueCount = dashboardSummary
    ? dashboardSummary.enumerators.reduce((total, enumerator) => total + workflowStages.reduce(
      (stageTotal, stage) => stageTotal + (canReviewWorkflowStage(reviewerKind, stage) ? enumerator.stages[stage] : 0),
      0,
    ), 0)
    : undefined;
  const visitCompositionNote = dashboardSummary
    ? `${dashboardSummary.analytics.visits.visit1.total.toLocaleString("id-ID")} kunjungan pertama · ${(dashboardSummary.analytics.visits.visit2.total + dashboardSummary.analytics.visits.later.total).toLocaleString("id-ID")} kunjungan ulang`
    : dashboardSummaryLoading
      ? "Memuat komposisi kunjungan..."
      : dashboardSummaryError
        ? "Komposisi kunjungan tidak tersedia"
        : undefined;
  const hivDataEmpty = hivPositive === 0 && hivTests === 0;
  const hivValue = hivPositive === undefined || hivDataEmpty ? "—" : String(hivPositive);
  const hivSuffix = hivTests === undefined || hivDataEmpty ? "" : `/ ${hivTests} Tes`;
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
    || session.workflowStatus === "pending_coordinator_action"
    || (session.workflowStatus === "awaiting_enumerator_signature" && session.kesimpulanSupervisi === "pending")
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
  }, [
    refreshDashboardSummary,
    setDashboardSummary,
    setDashboardSummaryError,
    setDashboardSummaryLoading,
    setDataError,
    setDataLoading,
  ]);

  const handleViewHotspot = useCallback((hotspot: Hotspot) => {
    const relatedSessions = supervisionSessions
      .filter((session) => session.submissionIds.includes(hotspot.id))
      .sort((first, second) => Date.parse(second.createdAt || "") - Date.parse(first.createdAt || ""));
    const latestSession = relatedSessions[0];
    const finalizedCoordinatorStatus = latestSession
      ? latestSession.kesimpulanSupervisi === "valid"
        ? "Valid"
        : latestSession.kesimpulanSupervisi === "needs_revision" ? "Perlu perbaikan" : "Pending"
      : undefined;
    setSelectedHotspot({
      ...hotspot,
      ...(latestSession ? {
        coordinatorReviewStatus: finalizedCoordinatorStatus || hotspot.coordinatorReviewStatus,
        coordinatorReviewNote: hotspot.coordinatorReviewNote || latestSession.coordinatorReviewNote,
        coordinatorReviewKelengkapan: hotspot.coordinatorReviewKelengkapan || latestSession.checks.kualitas_1 || "",
        coordinatorReviewDuplikasi: hotspot.coordinatorReviewDuplikasi || latestSession.checks.kualitas_3 || "",
        coordinatorReviewKroscek: hotspot.coordinatorReviewKroscek || latestSession.checks.kualitas_4 || "",
        coordinatorReviewerName: hotspot.coordinatorReviewerName || latestSession.coordinatorName,
        coordinatorReviewDate: hotspot.coordinatorReviewDate || latestSession.reviewDate,
      } : {}),
    });
    setShowQcModal(false);
  }, [supervisionSessions]);

  const handleReviseHotspot = useCallback((hotspot: Hotspot) => {
    setRevisionSubmission(hotspot);
    setShowEnumeratorForm(true);
  }, []);

  const handleDeleteHotspot = useCallback((hotspot: Hotspot) => {
    setConfirmationError("");
    setDataError("");
    setPendingConfirmation({ kind: "hotspot-delete", hotspot });
  }, [setDataError]);
  const handleLoadMoreSubmissions = useCallback(() => {
    void loadMoreSubmissions();
  }, [loadMoreSubmissions]);

  async function handleLogout() {
    if (auth) await signOut(auth);
  }

  async function removeHotspotData(hotspot: Hotspot) {
    if (!db || !authUser || roleKey !== "admin" || deletingHotspotRef.current) return;

    deletingHotspotRef.current = true;
    setDeletingHotspotId(hotspot.id);
    setConfirmationError("");
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
      setPendingConfirmation(null);
      setLastUpdated("sekarang");
      void refreshDashboardSummary(authUser, userProfile);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Data hotspot dan dokumen gagal dihapus.";
      setConfirmationError(message);
      setDataError(message);
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

  async function cancelSupervisionSession(session: SupervisionSession) {
    if (!authUser || session.workflowStatus !== "awaiting_enumerator_signature" || cancelingSupervisionId || cancelingSupervisionRef.current) return;

    cancelingSupervisionRef.current = true;
    setCancelingSupervisionId(session.id);
    setConfirmationError("");
    setSupervisionError("");
    try {
      const token = await authUser.getIdToken();
      const response = await fetch("/api/supervisions/cancel", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Sesi supervisi gagal dibatalkan.");
      setSupervisionSessions((sessions) => sessions.map((item) => item.id === session.id
        ? { ...item, workflowStatus: "cancelled" }
        : item));
      setPendingConfirmation(null);
      setLastUpdated("sekarang");
      void refreshDashboardSummary(authUser, userProfile);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sesi supervisi gagal dibatalkan.";
      setConfirmationError(message);
      setSupervisionError(message);
    } finally {
      cancelingSupervisionRef.current = false;
      setCancelingSupervisionId(null);
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
      const { toBase64 } = await import("@/app/components/enumerator-form-modal");
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
      manualGpsEnabled: formData.get("manualGpsEnabled") === "on",
    };
    const newPassword = String(formData.get("newPassword") || "");
    try {
      const token = await authUser.getIdToken();
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ uid: editingUser.id, ...profile, ...(newPassword ? { password: newPassword } : {}) }),
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
      manualGpsEnabled: formData.get("manualGpsEnabled") === "on",
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
    if (!authUser || !user.id || user.id === authUser.uid || user.id === userProfile?.id || deletingUserRef.current) return;
    const userId = user.id;
    deletingUserRef.current = true;
    setDeletingUserId(userId);
    setConfirmationError("");
    setUserManagementError("");
    try {
      const token = await authUser.getIdToken();
      const response = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ uid: userId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Profil user gagal dihapus.");
      setManagedUsers((users) => users.filter((item) => item.id !== userId));
      setPendingConfirmation(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Profil user gagal dihapus.";
      setConfirmationError(message);
      setUserManagementError(message);
    } finally {
      deletingUserRef.current = false;
      setDeletingUserId(null);
    }
  }

  function confirmPendingAction() {
    if (!pendingConfirmation) return;
    if (pendingConfirmation.kind === "hotspot-delete") {
      void removeHotspotData(pendingConfirmation.hotspot);
    } else if (pendingConfirmation.kind === "user-delete") {
      void removeUserProfile(pendingConfirmation.user);
    } else {
      void cancelSupervisionSession(pendingConfirmation.session);
    }
  }

  const confirmationDetails = pendingConfirmation?.kind === "hotspot-delete"
    ? {
      title: "Hapus data hotspot?",
      description: `Data ${pendingConfirmation.hotspot.name} beserta dokumen pendukung akan dihapus. File Drive akan dipindahkan ke Sampah. Tindakan ini tidak dapat dibatalkan.`,
      confirmLabel: "Hapus data",
      busyLabel: "Menghapus...",
      busy: deletingHotspotId === pendingConfirmation.hotspot.id,
    }
    : pendingConfirmation?.kind === "user-delete"
      ? {
        title: "Hapus profil user?",
        description: `Profil ${pendingConfirmation.user.nama || pendingConfirmation.user.username || "user ini"} akan dihapus. Tindakan ini tidak dapat dibatalkan.`,
        confirmLabel: "Hapus profil",
        busyLabel: "Menghapus...",
        busy: deletingUserId === pendingConfirmation.user.id,
      }
      : pendingConfirmation
        ? {
          title: "Batalkan supervisi?",
          description: `Batalkan pengiriman hasil supervisi untuk ${pendingConfirmation.session.enumeratorName || "Enumerator"}? Enumerator tidak bisa menandatangani sesi ini dan data akan dikembalikan ke antrean Koordinator.`,
          confirmLabel: "Batalkan supervisi",
          busyLabel: "Membatalkan...",
          busy: cancelingSupervisionId === pendingConfirmation.session.id,
        }
        : null;

  if (!authReady || !isLoggedIn) {
    return <LoginScreen onLogin={(user) => { setAuthUser(user); setIsLoggedIn(true); }} loginError={loginError} setLoginError={setLoginError} />;
  }

  return (
    <div className={`dashboard-page ${isReviewer ? "can-review" : "read-only"} ${isEnumerator ? "enumerator-dashboard" : "reviewer-dashboard"}`}>
      {dataLoading && authUser && userProfile && <DashboardLoading />}
      <nav className="topbar"><div className="brand"><span className="brand-mark"><NextImage src="/icons/lingga-512.png" alt="Lingga Indonesia" width={30} height={30} loading="eager" /></span><span>Pemetaan Hotspot<br /><small>Kota Malang 2026</small></span></div><div className="topbar-actions"><span className="user-chip"><span className="avatar">{(userProfile?.nama?.[0] || authUser?.email?.[0] || "A").toUpperCase()}</span><span><strong>{userProfile?.nama || authUser?.email || "Pengguna"}</strong><small>{displayRole(userProfile?.role)}</small></span></span>{userProfile?.role?.toLowerCase() === "admin" && <button className="button button-ghost" onClick={openUserManagement}>♙ <span>Manajemen User</span></button>}{isEnumerator && <button className="button button-accent" onClick={() => setShowEnumeratorForm(true)}>＋ <span>Input Data</span></button>}<button className="icon-button" onClick={handleLogout} aria-label="Keluar">↪</button></div></nav>
      <main className="dashboard-content">
        <section className="intro-row"><div><p className="eyebrow">{isEnumerator ? "Pendataan Lapangan" : "Pemantauan & Pemeriksaan Kualitas"}</p><h1>{roleTitle}</h1><p className="subtitle">{roleSubtitle}</p></div><div className="sync-note"><span className="live-dot" /> Pembaruan data <strong>{lastUpdated}</strong></div></section>
        <section className="dashboard-data-scope" aria-label="Cakupan data" role="status">
          <strong>Menampilkan {hotspotRows.length.toLocaleString("id-ID")}{dashboardSummary ? ` dari ${dashboardSummary.total.toLocaleString("id-ID")}` : ""} catatan kunjungan</strong>
          <span>{dashboardSummary ? "Jumlah mengikuti data yang dapat diakses akun ini." : dashboardSummaryLoading ? "Total keseluruhan sedang dimuat." : "Total keseluruhan belum tersedia."}</span>
        </section>
        {isLegacySupervisor && <p className="dashboard-summary-error" role="status">Role Supervisor tidak digunakan dalam proposal kegiatan. Hubungi Admin untuk mengubah role akun menjadi Koordinator Kegiatan.</p>}
        {isEnumerator && <section className="role-actions"><article><span className="role-action-icon">＋</span><div><strong>Input data hotspot</strong><p>Tambahkan hasil pemetaan baru dari lapangan.</p></div><button className="button button-accent" onClick={() => setShowEnumeratorForm(true)}>Mulai input →</button></article><article><span className="role-action-icon role-action-blue">◷</span><div><strong>Menunggu pemeriksaan</strong><p>Pantau status data yang sudah Anda kirim.</p></div>        <strong className="role-action-count">{pendingQc ?? "—"}</strong></article></section>}
        {(isCoordinator || isAnalyst) && <details className="panel role-workflow-guide" aria-label={`Panduan tugas ${isCoordinator ? "Koordinator" : "Data Analis"}`}>
          <summary className="role-workflow-summary">
            <div>
            <p className="eyebrow">Panduan teknis dashboard</p>
            <h2>{isCoordinator ? "Proses supervisi hotspot" : "Proses pemeriksaan data"}</h2>
            </div>
            <span className="role-workflow-summary-meta">
              <span className="role-workflow-count">{workflowQueueCount === undefined ? "—" : workflowQueueCount.toLocaleString("id-ID")}<small>siap ditangani<br />pada tahap Anda</small></span>
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
                    "Simpan hasil supervisi. Setelah Enumerator menandatangani, sistem otomatis menerapkan kesimpulan tanpa penyelesaian manual Koordinator.",
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
              ? "Hasil supervisi Perlu perbaikan langsung dikirim ke Enumerator tanpa tanda tangan; kesimpulan lain menunggu pengesahan Enumerator."
              : "Pemeriksaan dilakukan per hotspot yang sudah lolos supervisi Koordinator."}</strong>
          </div>
        </details>}
        {dataError && <p className="dashboard-summary-error" role="alert">{dataError}</p>}
        {dashboardSummaryError && <p className="dashboard-summary-error" role="alert">{dashboardSummaryError} <button type="button" onClick={() => void refreshDashboardSummary(authUser, userProfile)}>Coba lagi</button></p>}
        {supervisionError && <p className="dashboard-summary-error" role="alert">{supervisionError}</p>}
        {isEnumerator && authUser && <section className="panel table-panel signature-inbox" aria-label="Tindakan supervisi Enumerator">
          <div className="table-toolbar">
            <PanelHeading icon="clipboardCheck" title="Tindakan supervisi" subtitle="Lihat hasil Koordinator; tanda tangan hanya diperlukan jika diminta." />
          </div>
          <div className="table-wrap">
            <table className="signature-inbox-table">
              <thead><tr><th>TANGGAL SUPERVISI</th><th>HOTSPOT</th><th>KOORDINATOR</th><th>KESIMPULAN</th><th>AKSI</th></tr></thead>
              <tbody>
                {supervisionSessions.filter((session) => session.workflowStatus === "awaiting_enumerator_signature" || session.workflowStatus === "needs_revision").map((session) => (
                  <tr key={session.id}>
                    <td>{session.pengesahanTanggalKoordinator || "—"}</td>
                    <td><strong>{session.hotspotNames.join(", ") || `${session.submissionIds.length} hotspot`}</strong></td>
                    <td>{session.coordinatorName || "—"}</td>
                    <td>{session.kesimpulanSupervisi === "needs_revision" ? "Perlu Perbaikan" : session.kesimpulanSupervisi === "valid" ? "Lolos supervisi" : "Perlu tindak lanjut"}</td>
                    <td><button type="button" className="button button-primary" onClick={() => setSelectedSignatureSession(session)}>{session.kesimpulanSupervisi === "needs_revision" ? "Lihat catatan" : "Lihat hasil & tanda tangan"}</button></td>
                  </tr>
                ))}
                {!supervisionSessions.some((session) => session.workflowStatus === "awaiting_enumerator_signature" || session.workflowStatus === "needs_revision") && (
                  <tr>
                    <td colSpan={5} className="empty-state signature-inbox-message">
                      {supervisionLoading
                        ? "Memuat tindakan supervisi..."
                        : supervisionError
                          ? <>{supervisionError} <button type="button" className="button-link" onClick={refreshSupervisionSessions}>Coba lagi</button></>
                          : "Belum ada tindakan supervisi untuk akun Enumerator ini."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>}
        <nav className="dashboard-tabs" role="tablist" aria-label="Tampilan dashboard"><button type="button" role="tab" id="dashboard-data-tab" aria-selected={activeDashboardTab === "data"} aria-controls="dashboard-data-panel" className={activeDashboardTab === "data" ? "dashboard-tab is-active" : "dashboard-tab"} onClick={() => setActiveDashboardTab("data")}>{isEnumerator ? "Data saya" : "Data & pemeriksaan"}</button>{!isEnumerator && <button type="button" role="tab" id="dashboard-progress-tab" aria-selected={activeDashboardTab === "progress"} aria-controls="dashboard-active-panel" className={activeDashboardTab === "progress" ? "dashboard-tab is-active" : "dashboard-tab"} onClick={() => { setActiveDashboardTab("progress"); void refreshDashboardSummary(authUser, userProfile); }}>Progres Enumerator</button>}<button type="button" role="tab" id="dashboard-analytics-tab" aria-selected={activeDashboardTab === "analytics"} aria-controls="dashboard-active-panel" className={activeDashboardTab === "analytics" ? "dashboard-tab is-active" : "dashboard-tab"} onClick={() => setActiveDashboardTab("analytics")}>Analitik</button>{canSupervise && <button type="button" role="tab" id="dashboard-supervision-tab" aria-selected={activeDashboardTab === "supervision"} aria-controls="dashboard-active-panel" className={activeDashboardTab === "supervision" ? "dashboard-tab is-active" : "dashboard-tab"} onClick={() => setActiveDashboardTab("supervision")}>Supervisi</button>}</nav>
        <div id="dashboard-data-panel" role="tabpanel" tabIndex={0} aria-labelledby="dashboard-data-tab" hidden={activeDashboardTab !== "data"}>
          <SubmissionTable
            rows={displayedHotspotRows}
            isEnumerator={isEnumerator}
            isAdmin={roleKey === "admin"}
            loading={dataLoading}
            canLoadMore={submissionCursor !== null}
            loadingMore={loadingMoreSubmissions}
            onLoadMore={handleLoadMoreSubmissions}
            deletingHotspotId={deletingHotspotId}
            onView={handleViewHotspot}
            onRevise={handleReviseHotspot}
            onDelete={handleDeleteHotspot}
          />
        </div>
        <div id="dashboard-active-panel" role="tabpanel" tabIndex={0} aria-labelledby={`dashboard-${activeDashboardTab}-tab`} hidden={activeDashboardTab === "data"}>
          {activeDashboardTab !== "data" ? (
            activeDashboardTab === "progress"
              ? <EnumeratorProgress summary={dashboardSummary} loading={dashboardSummaryLoading} error={dashboardSummaryError} onRefresh={() => void refreshDashboardSummary(authUser, userProfile)} />
              : activeDashboardTab === "analytics"
                ? <>
                  <section className="kpi-grid" aria-label="Ringkasan data">
                    <Kpi tone="blue" label={isEnumerator ? "TOTAL CATATAN KUNJUNGAN SAYA" : "TOTAL CATATAN KUNJUNGAN"} value={totalVisits === undefined ? "—" : String(totalVisits)} note={visitCompositionNote} icon="database" />
                    <Kpi tone="teal" label={isEnumerator ? "KUNJUNGAN AKTIF / BARU SAYA" : "KUNJUNGAN HOTSPOT AKTIF / BARU"} value={activeNewVisits === undefined ? "—" : String(activeNewVisits)} icon="activity" />
                    <Kpi tone="amber" label={isEnumerator ? "MENUNGGU PEMERIKSAAN" : "PERLU PEMERIKSAAN"} value={pendingQc === undefined ? "—" : String(pendingQc)} icon="clock" />
                    <Kpi tone="coral" label="HIV+ / JUMLAH TES" value={hivValue} suffix={hivSuffix} icon="heartPulse" />
                  </section>
                  <FinalDataExport user={authUser} />
                  <DashboardAnalytics summary={dashboardSummary} canLoadMore={submissionCursor !== null} onLoadMore={() => void loadMoreSubmissions()} loading={dashboardSummaryLoading} />
                  <DashboardOverview rows={hotspotRows} />
                </>
                : <section className="supervision-dashboard">
                  <div className="panel supervision-dashboard-heading"><div><p className="eyebrow">Supervisi lapangan</p><h2>Kelola dan pantau sesi supervisi</h2><p>Buat sesi supervisi baru atau lihat riwayat sesi yang pernah dibuat.</p></div><button type="button" className="button button-primary" onClick={() => { setInitialSupervisionSubmissionId(null); setShowSupervisionForm(true); }}>＋ Buat supervisi</button></div>
                  {supervisionError && <p className="dashboard-summary-error" role="alert">{supervisionError}</p>}
                  <section className="panel coordinator-supervision-queue">
                    <div><p className="eyebrow">Antrean supervisi</p><h2>Tindakan sesi supervisi</h2></div>
                    {pendingCoordinatorSupervisionSessions.map((session) => <article className="coordinator-supervision-item" key={session.id}>
                      <div><strong>{session.enumeratorName || "Enumerator"} · {session.hotspotNames.join(", ") || `${session.submissionIds.length} hotspot`}</strong><small>{session.kesimpulanSupervisi === "pending" || session.workflowStatus === "pending_coordinator_action" ? "Perlu tindak lanjut Koordinator; data tetap di antrean Koordinator." : session.workflowStatus === "awaiting_enumerator_signature" ? "Menunggu Enumerator menandatangani." : `Sesi lama ditandatangani ${session.pengesahanTandaTanganEnumerator?.signerName || "Enumerator"} · ${session.pengesahanTanggalEnumerator || "tanggal tidak tercatat"} dan masih memerlukan penyelarasan.`}</small>{session.pengesahanTandaTanganEnumerator?.fileId && <NextImage className="coordinator-signature-preview" src={`/api/documents/preview?fileId=${encodeURIComponent(session.pengesahanTandaTanganEnumerator.fileId)}`} alt={`Tanda tangan ${session.enumeratorName || "Enumerator"}`} width={460} height={130} unoptimized />}</div>
                      {session.workflowStatus === "awaiting_coordinator_completion" && <button type="button" className="button button-primary" disabled={completingSupervisionId === session.id} onClick={() => void completeSupervisionSession(session)}>{completingSupervisionId === session.id ? "Menyelaraskan..." : "Selesaikan sesi lama"}</button>}
                      {session.workflowStatus === "awaiting_enumerator_signature" && session.kesimpulanSupervisi === "valid" && <button type="button" className="button-link" disabled={cancelingSupervisionId === session.id} onClick={() => { setConfirmationError(""); setSupervisionError(""); setPendingConfirmation({ kind: "supervision-cancel", session }); }}>{cancelingSupervisionId === session.id ? "Membatalkan..." : "Batalkan"}</button>}
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
                        <td>{session.kesimpulanSupervisi === "pending" && session.workflowStatus === "awaiting_enumerator_signature" ? "Tindak lanjut Koordinator" : session.kesimpulanSupervisi === "needs_revision" && session.workflowStatus === "awaiting_enumerator_signature" ? "Perlu Perbaikan" : session.workflowStatus === "completed" ? "Selesai" : session.workflowStatus === "needs_revision" ? "Perlu Perbaikan" : session.workflowStatus === "pending_coordinator_action" ? "Tindak lanjut Koordinator" : session.workflowStatus === "cancelled" ? "Dibatalkan Koordinator" : session.workflowStatus === "awaiting_enumerator_signature" ? "Menunggu tanda tangan Enumerator" : session.workflowStatus === "awaiting_coordinator_completion" ? "Sesi lama menunggu penyelarasan" : session.workflowStatus || "—"}</td>
                      </tr>)}
                      {!supervisionHistory.length && <tr><td colSpan={5} className="empty-state">{supervisionLoading ? "Memuat riwayat supervisi..." : supervisionError ? "Riwayat supervisi tidak dapat dimuat." : "Belum ada riwayat supervisi."}</td></tr>}
                    </tbody></table></div>
                  </section>
                </section>
          ) : null}
        </div>
      </main>
      <MaintenanceNoticeDialog
        open={showMaintenanceNotice}
        onClose={() => setShowMaintenanceNotice(false)}
      />
      <ActionConfirmationDialog
        open={pendingConfirmation !== null}
        title={confirmationDetails?.title || ""}
        description={confirmationDetails?.description || ""}
        confirmLabel={confirmationDetails?.confirmLabel || ""}
        busyLabel={confirmationDetails?.busyLabel || ""}
        busy={confirmationDetails?.busy || false}
        error={confirmationError}
        onCancel={() => { setPendingConfirmation(null); setConfirmationError(""); }}
        onConfirm={confirmPendingAction}
      />
      {isEnumerator && authUser && <EnumeratorAiAssistant user={authUser} hidden={showEnumeratorForm || showUserManagement || showSupervisionForm || Boolean(selectedSignatureSession) || Boolean(selectedHotspot)} />}
      {showUserManagement && <UserManagementModal users={managedUsers} loading={userManagementLoading} error={userManagementError} editingUser={editingUser} creatingUser={creatingUser} currentUserIds={[authUser?.uid, userProfile?.id]} onClose={() => { setShowUserManagement(false); setEditingUser(null); setCreatingUser(false); }} onAdd={() => { setEditingUser(null); setCreatingUser(true); setUserManagementError(""); }} onCancelEdit={() => { setEditingUser(null); setCreatingUser(false); }} onEdit={(user) => { setEditingUser(user); setCreatingUser(false); }} onSave={saveUserProfile} onCreate={createUserProfile} onDelete={(user) => { setConfirmationError(""); setUserManagementError(""); setPendingConfirmation({ kind: "user-delete", user }); }} />}
      {showEnumeratorForm && authUser && <EnumeratorForm key={revisionSubmission?.id || "new"} user={authUser} profile={userProfile} existingHotspots={hotspotRows} revision={revisionSubmission} onClose={() => { setShowEnumeratorForm(false); setRevisionSubmission(null); }} onSaved={() => { setShowEnumeratorForm(false); setRevisionSubmission(null); setLastUpdated("sekarang"); refreshSupervisionSessions(); void refreshDashboardSummary(authUser, userProfile); }} />}
      {canSupervise && authUser && <CoordinatorSupervisionForm key={initialSupervisionSubmissionId || "default"} open={showSupervisionForm} initialSubmissionId={initialSupervisionSubmissionId} user={authUser} profile={userProfile} rows={hotspotRows} pendingSubmissionIds={pendingSupervisionSubmissionIds} onClose={() => { setInitialSupervisionSubmissionId(null); setShowSupervisionForm(false); }} onSaved={() => {
        setInitialSupervisionSubmissionId(null);
        setShowSupervisionForm(false);
        setLastUpdated("sekarang");
        refreshSupervisionSessions();
      }} />}
      {selectedSignatureSession && authUser && <EnumeratorSignatureCard
        session={selectedSignatureSession}
        user={authUser}
        profile={userProfile}
        onClose={() => setSelectedSignatureSession(null)}
        onRevise={async (submissionId) => {
          if (!db) throw new Error("Sistem data belum siap.");
          const token = await authUser.getIdToken();
          const response = await fetch("/api/supervisions/revision", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId: selectedSignatureSession.id, submissionId }),
          });
          const result = await response.json() as { error?: string };
          if (!response.ok) throw new Error(result.error || "Data gagal disiapkan untuk perbaikan.");
          const submission = await getDoc(doc(db, "submissions", submissionId));
          if (!submission.exists()) throw new Error("Data hotspot tidak ditemukan.");
          const [revision] = await mapSubmissionSnapshot({ docs: [submission] }, db);
          if (!revision) throw new Error("Data hotspot tidak dapat dimuat.");
          if (revision.enumeratorUid !== authUser.uid) throw new Error("Data ini bukan milik akun Enumerator Anda.");
          if (revision.workflowStage !== "needs_revision") {
            throw new Error("Data ini tidak lagi menunggu perbaikan. Muat ulang dashboard.");
          }
          setSelectedSignatureSession(null);
          setRevisionSubmission(revision);
          setShowEnumeratorForm(true);
        }}
        onSigned={() => {
          setSelectedSignatureSession(null);
          setLastUpdated("sekarang");
          refreshSupervisionSessions();
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
