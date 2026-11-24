import { doc, getDoc, type DocumentData, type DocumentSnapshot, type Firestore, type QueryDocumentSnapshot } from "firebase/firestore";
import type { Hotspot } from "@/app/components/dashboard-types";
import type { StoredSupervisionSignature, SupervisionSession } from "@/app/components/supervision-workflow";
import { normalizeWorkflowStage, workflowStageLabels } from "@/lib/dashboard-summary";

export async function mapSubmissionSnapshot(snapshot: { docs: DocumentSnapshot<DocumentData>[] }, firestore: Firestore) {
  return Promise.all(snapshot.docs.map(async (item) => {
    const data = item.data() || {};
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
      workflowUpdatedByRole: String(data.workflowUpdatedByRole || ""),
      coordinatorReviewStatus: data.coordinatorReviewStatus === "Valid" || data.coordinatorReviewStatus === "Perlu perbaikan" ? data.coordinatorReviewStatus : data.coordinatorReviewStatus === "Pending" ? "Pending" : undefined,
      coordinatorReviewNote: String(data.coordinatorReviewNote || ""),
      coordinatorReviewKelengkapan: String(data.coordinatorReviewKelengkapan || ""),
      coordinatorReviewDuplikasi: String(data.coordinatorReviewDuplikasi || ""),
      coordinatorReviewKroscek: String(data.coordinatorReviewKroscek || ""),
      coordinatorReviewerName: String(data.coordinatorReviewerName || ""),
      coordinatorReviewDate: String(data.coordinatorReviewDate || ""),
      coordinatorReviewerUid: String(data.coordinatorReviewerUid || ""),
      coordinatorReviewedAt: String(data.coordinatorReviewedAt || ""),
      hotspotCode: String(data.kodeHotspot || ""),
      visitType: data.visitType === "follow_up" ? "follow_up" : "initial",
      visitNumber: Number.isInteger(Number(data.visitNumber)) && Number(data.visitNumber) > 0 ? Number(data.visitNumber) : undefined,
      previousVisitId: String(data.previousVisitId || ""),
      verificationStatus: String(data.statusVerifikasi || ""),
      coordinates: String(data.koordinat || ""),
      koordinatManual: data.koordinatManual === true,
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

export function mapSupervisionSnapshot(snapshot: { docs: QueryDocumentSnapshot<DocumentData>[] }): SupervisionSession[] {
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
      createdAt: String(data.createdAt || ""),
      pengesahanTanggalEnumerator: String(data.pengesahanTanggalEnumerator || ""),
      pengesahanTanggalKoordinator: String(data.pengesahanTanggalKoordinator || ""),
      ...(enumeratorSignature?.fileId ? { pengesahanTandaTanganEnumerator: enumeratorSignature } : {}),
      ...(coordinatorSignature?.fileId ? { pengesahanTandaTanganKoordinator: coordinatorSignature } : {}),
    };
  });
}
