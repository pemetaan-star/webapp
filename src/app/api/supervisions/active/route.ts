import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

function stringOrEmpty(value: unknown) {
  return typeof value === "string" ? value : "";
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stringMap(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function signature(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const data = value as Record<string, unknown>;
  if (typeof data.fileId !== "string" || !data.fileId) return undefined;
  return {
    fileId: data.fileId,
    fileName: stringOrEmpty(data.fileName),
    fileUrl: stringOrEmpty(data.fileUrl),
    signerUid: stringOrEmpty(data.signerUid),
    signerName: stringOrEmpty(data.signerName),
    signedAt: stringOrEmpty(data.signedAt),
  };
}

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const [scheme, token] = authorization.split(" ");
  if (scheme !== "Bearer" || !token) {
    return Response.json({ error: "Autentikasi diperlukan." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  let uid: string;
  try {
    uid = (await getAdminAuth().verifyIdToken(token)).uid;
  } catch {
    return Response.json({ error: "Sesi tidak valid atau sudah kedaluwarsa." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const adminDb = getAdminDb();
  try {
    const profile = await adminDb.collection("user").doc(uid).get();
    const role = String(profile.get("role") || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (role !== "enumerator") {
      return Response.json({ error: "Daftar sesi supervisi ini hanya tersedia untuk Enumerator." }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }

    const snapshot = await adminDb.collection("supervisions")
      .where("enumeratorUid", "==", uid)
      .get();
    const sessions = snapshot.docs
      .map((document) => {
        const data = document.data();
        return {
          id: document.id,
          enumeratorUid: stringOrEmpty(data.enumeratorUid),
          enumeratorName: stringOrEmpty(data.pengesahanNamaEnumerator),
          coordinatorUid: stringOrEmpty(data.coordinatorUid),
          coordinatorName: stringOrEmpty(data.namaKoordinator),
          workflowStatus: stringOrEmpty(data.workflowStatus),
          submissionIds: stringArray(data.submissionIds),
          hotspotNames: stringArray(data.hotspotNames),
          kesimpulanSupervisi: data.kesimpulanSupervisi === "pending" || data.kesimpulanSupervisi === "needs_revision"
            ? data.kesimpulanSupervisi
            : "valid",
          checks: stringMap(data.checks),
          coordinatorReviewNote: stringOrEmpty(data.coordinatorReviewNote),
          temuanSupervisi: stringOrEmpty(data.temuanSupervisi),
          kendalaLapangan: stringOrEmpty(data.kendalaLapangan),
          perbaikanYangDibutuhkan: stringOrEmpty(data.perbaikanYangDibutuhkan),
          tindakLanjut: stringOrEmpty(data.tindakLanjut),
          reviewDate: stringOrEmpty(data.pengesahanTanggalKoordinator),
          pengesahanTanggalEnumerator: stringOrEmpty(data.pengesahanTanggalEnumerator),
          pengesahanTanggalKoordinator: stringOrEmpty(data.pengesahanTanggalKoordinator),
          pengesahanTandaTanganEnumerator: signature(data.pengesahanTandaTanganEnumerator),
          pengesahanTandaTanganKoordinator: signature(data.pengesahanTandaTanganKoordinator),
        };
      })
      .filter((session) =>
        session.workflowStatus === "awaiting_enumerator_signature"
        || session.workflowStatus === "awaiting_coordinator_completion",
      );

    return Response.json({ sessions }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      { error: "Sesi supervisi tidak dapat dimuat. Silakan coba lagi." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
