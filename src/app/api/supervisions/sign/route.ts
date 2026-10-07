import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

const allowedPreviousStages = new Set([
  "submitted",
  "supervisor_review",
  "coordinator_review",
  "awaiting_enumerator_signature",
  "analyst_review",
  "needs_revision",
]);

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
  const signerName = typeof body?.signerName === "string" ? body.signerName.trim() : "";
  const signedDate = typeof body?.signedDate === "string" ? body.signedDate : "";
  const signature = body?.signature;
  if (
    !/^[a-zA-Z0-9_-]{8,160}$/.test(sessionId)
    || !signerName
    || !/^\d{4}-\d{2}-\d{2}$/.test(signedDate)
    || !isRecord(signature)
    || typeof signature.fileId !== "string"
    || !signature.fileId.trim()
    || signature.fileName !== `supervisi-${sessionId}-enumerator.png`
    || typeof signature.fileUrl !== "string"
    || !signature.fileUrl.startsWith("https://")
    || signature.signerName !== signerName
  ) {
    return Response.json({ error: "Data pengesahan Enumerator tidak valid." }, { status: 400 });
  }

  const adminDb = getAdminDb();
  try {
    const profile = await adminDb.collection("user").doc(uid).get();
    const role = String(profile.get("role") || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (role !== "enumerator") {
      return Response.json({ error: "Pengesahan ini hanya dapat dikirim dari akun Enumerator." }, { status: 403 });
    }

    const sessionRef = adminDb.collection("supervisions").doc(sessionId);
    const signedAt = new Date().toISOString();
    await adminDb.runTransaction(async (transaction) => {
      const session = await transaction.get(sessionRef);
      if (!session.exists) throw new Error("SUPERVISION_NOT_FOUND");
      const sessionData = session.data() || {};
      if (sessionData.enumeratorUid !== uid) throw new Error("SUPERVISION_NOT_ASSIGNED");
      if (sessionData.workflowStatus !== "awaiting_enumerator_signature") throw new Error("SUPERVISION_NOT_AWAITING_SIGNATURE");

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

      const submissionRefs = submissionIds.map((id: string) => adminDb.collection("submissions").doc(id));
      const submissions = await transaction.getAll(...submissionRefs);
      for (const submission of submissions) {
        if (!submission.exists) throw new Error("SUPERVISION_SUBMISSION_NOT_FOUND");
        const data = submission.data() || {};
        if (data.enumeratorUid !== uid) throw new Error("SUPERVISION_SUBMISSION_NOT_ASSIGNED");
        if (!allowedPreviousStages.has(String(data.workflowStage || ""))) {
          throw new Error("SUPERVISION_SUBMISSION_STAGE_INVALID");
        }
      }

      transaction.update(sessionRef, {
        pengesahanNamaEnumerator: signerName,
        pengesahanTanggalEnumerator: signedDate,
        pengesahanEnumeratorHadir: true,
        pengesahanTandaTanganEnumerator: {
          ...signature,
          signerUid: uid,
          signerName,
          signedAt,
        },
        workflowStatus: "awaiting_coordinator_completion",
      });
      submissions.forEach((submission, index) => {
        const currentStage = String(submission.get("workflowStage") || "submitted");
        const history = currentStage === "awaiting_enumerator_signature"
          ? []
          : [{
              stage: "awaiting_enumerator_signature",
              role: "koordinator",
              uid: String(sessionData.coordinatorUid || ""),
              actorName: String(sessionData.namaKoordinator || ""),
              at: String(sessionData.createdAt || signedAt),
              note: "Hasil supervisi dikirim kepada Enumerator untuk ditandatangani.",
            }];
        transaction.update(submissionRefs[index], {
          workflowStage: "awaiting_coordinator_completion",
          workflowUpdatedByRole: "enumerator",
          workflowHistory: FieldValue.arrayUnion(
            ...history,
            {
              stage: "awaiting_coordinator_completion",
              role: "enumerator",
              uid,
              actorName: signerName,
              at: signedAt,
              note: "Enumerator telah menandatangani hasil supervisi.",
            },
          ),
        });
      });
    });

    return Response.json({ success: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const messages: Record<string, string> = {
      SUPERVISION_NOT_FOUND: "Sesi supervisi tidak ditemukan.",
      SUPERVISION_NOT_ASSIGNED: "Sesi supervisi ini bukan untuk akun Enumerator Anda.",
      SUPERVISION_NOT_AWAITING_SIGNATURE: "Sesi supervisi ini sudah tidak menunggu tanda tangan.",
      SUPERVISION_SUBMISSIONS_INVALID: "Daftar hotspot dalam sesi supervisi tidak valid.",
      SUPERVISION_SUBMISSION_NOT_FOUND: "Salah satu data hotspot dalam sesi tidak ditemukan.",
      SUPERVISION_SUBMISSION_NOT_ASSIGNED: "Salah satu hotspot bukan milik akun Enumerator Anda.",
      SUPERVISION_SUBMISSION_STAGE_INVALID: "Tahap salah satu hotspot sudah berubah. Muat ulang dashboard sebelum mencoba lagi.",
    };
    if (messages[code]) {
      return Response.json({ error: messages[code] }, { status: code === "SUPERVISION_NOT_FOUND" ? 404 : 409 });
    }
    console.error("[supervisions/sign] Failed to save Enumerator signature:", error instanceof Error ? error.message : "Unknown error");
    return Response.json({ error: "Tanda tangan gagal disimpan. Silakan coba lagi." }, { status: 500 });
  }
}
