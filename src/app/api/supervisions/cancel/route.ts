import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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
  if (!/^[a-zA-Z0-9_-]{8,160}$/.test(sessionId)) {
    return Response.json({ error: "ID sesi supervisi tidak valid." }, { status: 400 });
  }

  const adminDb = getAdminDb();
  try {
    const profile = await adminDb.collection("user").doc(uid).get();
    const role = String(profile.get("role") || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    const isAdmin = role === "admin";
    if (!isAdmin && role !== "koordinator" && role !== "kordinator") {
      return Response.json({ error: "Hanya Koordinator atau Admin yang dapat membatalkan pengiriman supervisi." }, { status: 403 });
    }

    const sessionRef = adminDb.collection("supervisions").doc(sessionId);
    const cancelledAt = new Date().toISOString();
    await adminDb.runTransaction(async (transaction) => {
      const session = await transaction.get(sessionRef);
      if (!session.exists) throw new Error("SUPERVISION_NOT_FOUND");
      const sessionData = session.data() || {};
      if (!isAdmin && sessionData.coordinatorUid !== uid) throw new Error("SUPERVISION_NOT_ASSIGNED");
      if (sessionData.workflowStatus !== "awaiting_enumerator_signature") {
        throw new Error(sessionData.workflowStatus === "awaiting_coordinator_completion"
          ? "SUPERVISION_ALREADY_SIGNED"
          : "SUPERVISION_NOT_PENDING");
      }
      if (sessionData.pengesahanTandaTanganEnumerator) throw new Error("SUPERVISION_ALREADY_SIGNED");

      const submissionIds = sessionData.submissionIds;
      if (
        !Array.isArray(submissionIds)
        || submissionIds.length === 0
        || submissionIds.length > 499
        || submissionIds.some((id) => typeof id !== "string" || !id || id.includes("/"))
        || new Set(submissionIds).size !== submissionIds.length
      ) {
        throw new Error("SUPERVISION_SUBMISSIONS_INVALID");
      }

      const previousStates = Array.isArray(sessionData.previousSubmissionStates)
        ? sessionData.previousSubmissionStates.filter(isRecord)
        : [];
      const previousById = new Map(previousStates
        .filter((state) => typeof state.submissionId === "string")
        .map((state) => [state.submissionId as string, state]));
      const submissionRefs = submissionIds.map((id: string) => adminDb.collection("submissions").doc(id));
      const submissions = await transaction.getAll(...submissionRefs);
      for (const submission of submissions) {
        if (!submission.exists) throw new Error("SUPERVISION_SUBMISSION_NOT_FOUND");
        const data = submission.data() || {};
        if (data.enumeratorUid !== sessionData.enumeratorUid) throw new Error("SUPERVISION_SUBMISSION_NOT_ASSIGNED");
        if (data.workflowStage !== "awaiting_enumerator_signature") throw new Error("SUPERVISION_SUBMISSION_STAGE_INVALID");
      }

      submissions.forEach((submission, index) => {
        const previous = previousById.get(submissionIds[index]);
        const restoredStage = typeof previous?.workflowStage === "string"
          ? previous.workflowStage
          : "coordinator_review";
        const restoredRole = typeof previous?.workflowUpdatedByRole === "string"
          ? previous.workflowUpdatedByRole
          : "koordinator";
        const restoredFields: Record<string, unknown> = {};
        for (const field of [
          "coordinatorReviewStatus",
          "coordinatorReviewNote",
          "coordinatorReviewKelengkapan",
          "coordinatorReviewDuplikasi",
          "coordinatorReviewKroscek",
          "coordinatorReviewerName",
          "coordinatorReviewDate",
          "coordinatorReviewerUid",
          "coordinatorReviewedAt",
        ]) {
          if (previous && field in previous) {
            restoredFields[field] = previous[field] === null ? FieldValue.delete() : previous[field];
          } else if (!previous && field === "coordinatorReviewStatus") {
            restoredFields[field] = "Pending";
          } else if (!previous && field === "coordinatorReviewNote") {
            restoredFields[field] = "";
          }
        }
        transaction.update(submissionRefs[index], {
          ...restoredFields,
          workflowStage: restoredStage,
          workflowUpdatedByRole: restoredRole,
          workflowHistory: FieldValue.arrayUnion({
            stage: restoredStage,
            role: isAdmin ? "admin" : "koordinator",
            uid,
            actorName: String(profile.get("nama") || profile.get("name") || ""),
            at: cancelledAt,
            note: "Koordinator membatalkan pengiriman hasil supervisi sebelum Enumerator menandatangani.",
          }),
        });
      });

      transaction.update(sessionRef, {
        workflowStatus: "cancelled",
        cancelledAt,
        cancelledByUid: uid,
        cancelledByRole: isAdmin ? "admin" : "koordinator",
      });
    });

    return Response.json({ success: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const messages: Record<string, string> = {
      SUPERVISION_NOT_FOUND: "Sesi supervisi tidak ditemukan.",
      SUPERVISION_NOT_ASSIGNED: "Sesi supervisi ini bukan dibuat oleh akun Koordinator Anda.",
      SUPERVISION_NOT_PENDING: "Sesi supervisi ini tidak lagi menunggu tanda tangan Enumerator.",
      SUPERVISION_ALREADY_SIGNED: "Sesi sudah ditandatangani Enumerator dan tidak dapat dibatalkan.",
      SUPERVISION_SUBMISSIONS_INVALID: "Daftar hotspot dalam sesi supervisi tidak valid.",
      SUPERVISION_SUBMISSION_NOT_FOUND: "Salah satu data hotspot dalam sesi tidak ditemukan.",
      SUPERVISION_SUBMISSION_NOT_ASSIGNED: "Salah satu hotspot bukan milik Enumerator sesi ini.",
      SUPERVISION_SUBMISSION_STAGE_INVALID: "Tahap salah satu hotspot sudah berubah. Muat ulang dashboard sebelum mencoba lagi.",
    };
    if (messages[code]) {
      return Response.json({ error: messages[code] }, { status: code === "SUPERVISION_NOT_FOUND" ? 404 : 409 });
    }
    console.error("[supervisions/cancel] Failed to cancel supervision:", error instanceof Error ? error.message : "Unknown error");
    return Response.json({ error: "Sesi supervisi gagal dibatalkan. Silakan coba lagi." }, { status: 500 });
  }
}
