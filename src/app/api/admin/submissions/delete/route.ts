import { requireAdmin, getAdminDb } from "@/lib/firebase-admin";

function collectFileIds(data: Record<string, unknown>) {
  const fileIds = new Set<string>();
  const addFileId = (document: unknown) => {
    if (!document || typeof document !== "object" || !("fileId" in document)) return;
    const fileId = document.fileId;
    if (typeof fileId === "string" && fileId.trim()) fileIds.add(fileId.trim());
  };

  addFileId(data.document);
  if (Array.isArray(data.documents)) data.documents.forEach(addFileId);
  addFileId(data.qcDokumenPersetujuan);

  return [...fileIds];
}

export async function POST(request: Request) {
  const authorization = await requireAdmin(request);
  if ("response" in authorization) return authorization.response;

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const submissionId = typeof body?.submissionId === "string" ? body.submissionId.trim() : "";
  if (!submissionId || submissionId.includes("/")) {
    return Response.json({ error: "ID data hotspot tidak valid." }, { status: 400 });
  }

  const adminDb = getAdminDb();
  const submissionRef = adminDb.collection("submissions").doc(submissionId);
  try {
    const submission = await submissionRef.get();
    if (!submission.exists) return Response.json({ error: "Data hotspot tidak ditemukan." }, { status: 404 });

    const fileIds = collectFileIds(submission.data() || {});
    if (fileIds.length) {
      const gasUploadUrl = process.env.GAS_UPLOAD_URL;
      const gasUploadSecret = (process.env.GAS_UPLOAD_SECRET || "").trim().replace(/^['"]|['"]$/g, "");
      if (!gasUploadUrl || !gasUploadSecret) {
        return Response.json({ error: "Konfigurasi penghapusan dokumen belum tersedia. Data tidak dihapus." }, { status: 500 });
      }

      const response = await fetch(gasUploadUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deleteFiles", fileIds, secret: gasUploadSecret }),
      });
      const result = await response.json().catch(() => null) as { success?: boolean } | null;
      if (!response.ok || !result?.success) {
        return Response.json({ error: "Dokumen Drive gagal dipindahkan ke Sampah. Data hotspot tidak dihapus." }, { status: 502 });
      }
    }

    await submissionRef.delete();
    return Response.json({ success: true, deletedFiles: fileIds.length });
  } catch {
    return Response.json({ error: "Data hotspot gagal dihapus. Silakan coba lagi." }, { status: 500 });
  }
}
