import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const [scheme, token] = authorization.split(" ");
  if (scheme !== "Bearer" || !token) {
    return Response.json({ error: "Autentikasi diperlukan." }, { status: 401 });
  }

  let uid: string;
  try {
    uid = (await getAdminAuth().verifyIdToken(token)).uid;
  } catch {
    return Response.json({ error: "Sesi login tidak valid atau sudah kedaluwarsa." }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : "";
  const submissionId = typeof body?.submissionId === "string" ? body.submissionId.trim() : "";
  if (!/^[a-zA-Z0-9_-]{8,160}$/.test(sessionId) || !/^[a-zA-Z0-9_-]{8,160}$/.test(submissionId)) {
    return Response.json({ error: "ID sesi atau hotspot tidak valid." }, { status: 400 });
  }

  const adminDb = getAdminDb();
  try {
    const profile = await adminDb.collection("user").doc(uid).get();
    const role = String(profile.get("role") || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (role !== "enumerator") {
      return Response.json({ error: "Tindakan ini hanya tersedia untuk Enumerator." }, { status: 403 });
    }

    const sessionRef = adminDb.collection("supervisions").doc(sessionId);
    const submissionRef = adminDb.collection("submissions").doc(submissionId);
    const updatedAt = new Date().toISOString();
    await adminDb.runTransaction(async (transaction) => {
      const session = await transaction.get(sessionRef);
      const submission = await transaction.get(submissionRef);
      if (!session.exists) throw new Error("SUPERVISION_NOT_FOUND");
      if (!submission.exists) throw new Error("SUPERVISION_SUBMISSION_NOT_FOUND");

      const sessionData = session.data() || {};
      const submissionData = submission.data() || {};
      if (sessionData.enumeratorUid !== uid || submissionData.enumeratorUid !== uid) {
        throw new Error("SUPERVISION_NOT_ASSIGNED");
      }
      if (sessionData.kesimpulanSupervisi !== "needs_revision") {
        throw new Error("SUPERVISION_DECISION_INVALID");
      }
      if (!Array.isArray(sessionData.submissionIds) || !sessionData.submissionIds.includes(submissionId)) {
        throw new Error("SUPERVISION_SUBMISSION_NOT_IN_SESSION");
      }

      const stage = String(submissionData.workflowStage || "");
      if (stage === "needs_revision") {
        transaction.update(sessionRef, {
          workflowStage: "needs_revision",
          workflowStatus: "needs_revision",
        });
        return;
      }
      if (stage !== "awaiting_enumerator_signature" && stage !== "awaiting_coordinator_completion") {
        throw new Error("SUPERVISION_SUBMISSION_STAGE_INVALID");
      }

      const coordinatorName = String(sessionData.namaKoordinator || "");
      const coordinatorUid = String(sessionData.coordinatorUid || "");
      const note = String(sessionData.coordinatorReviewNote || "");
      transaction.update(submissionRef, {
        coordinatorReviewStatus: "Perlu perbaikan",
        coordinatorReviewNote: note,
        coordinatorReviewerName: coordinatorName,
        coordinatorReviewDate: String(sessionData.pengesahanTanggalKoordinator || ""),
        coordinatorReviewerUid: coordinatorUid,
        coordinatorReviewedAt: updatedAt,
        workflowStage: "needs_revision",
        workflowUpdatedByRole: "koordinator",
        workflowHistory: FieldValue.arrayUnion({
          stage: "needs_revision",
          role: "koordinator",
          uid: coordinatorUid,
          actorName: coordinatorName,
          at: updatedAt,
          note,
        }),
      });
      transaction.update(sessionRef, {
        workflowStage: "needs_revision",
        workflowStatus: "needs_revision",
      });
    });

    return Response.json({ success: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const messages: Record<string, string> = {
      SUPERVISION_NOT_FOUND: "Sesi supervisi tidak ditemukan.",
      SUPERVISION_SUBMISSION_NOT_FOUND: "Data hotspot tidak ditemukan.",
      SUPERVISION_NOT_ASSIGNED: "Sesi atau hotspot ini bukan milik akun Enumerator Anda.",
      SUPERVISION_DECISION_INVALID: "Sesi ini tidak meminta perbaikan Enumerator.",
      SUPERVISION_SUBMISSION_NOT_IN_SESSION: "Hotspot tidak termasuk dalam sesi supervisi ini.",
      SUPERVISION_SUBMISSION_STAGE_INVALID: "Tahap hotspot sudah berubah. Muat ulang dashboard sebelum mencoba lagi.",
    };
    if (messages[code]) {
      return Response.json({ error: messages[code] }, { status: code === "SUPERVISION_NOT_FOUND" ? 404 : 409 });
    }
    console.error("[supervisions/revision] Failed to prepare supervision revision:", error instanceof Error ? error.message : "Unknown error");
    return Response.json({ error: "Data gagal disiapkan untuk perbaikan. Silakan coba lagi." }, { status: 500 });
  }
}
