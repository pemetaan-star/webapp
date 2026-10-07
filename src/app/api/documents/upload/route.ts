import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

export async function POST(request: Request) {
  const gasUploadUrl = process.env.GAS_UPLOAD_URL;
  if (!gasUploadUrl) return NextResponse.json({ message: "Layanan dokumen belum siap. Silakan hubungi administrator." }, { status: 500 });

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 3_000_000) {
    return NextResponse.json({ message: "Foto terlalu besar. Pilih foto yang lebih kecil." }, { status: 413 });
  }

  try {
    const payload = await request.json();
    const fileData = typeof payload.fileData === "string" ? payload.fileData : "";
    const fileName = typeof payload.fileName === "string" ? payload.fileName.trim() : "";
    const fileMime = typeof payload.fileMime === "string" ? payload.fileMime : "application/octet-stream";
    const idempotencyKey = typeof payload.idempotencyKey === "string" ? payload.idempotencyKey.trim() : "";
    const folderName = typeof payload.folderName === "string" ? payload.folderName.trim() : "";
    const signatureRole = typeof payload.signatureRole === "string" ? payload.signatureRole : "";
    const sessionId = typeof payload.sessionId === "string" ? payload.sessionId.trim() : "";
    const enumeratorName = typeof payload.enumeratorName === "string" ? payload.enumeratorName.trim() : "";
    const hotspotCode = typeof payload.hotspotCode === "string" ? payload.hotspotCode.trim() : "";
    const dedicatedFolder = folderName === "Persetujuan QC" || folderName === "Tanda Tangan Supervisi";
    const allowedMime = /^(image\/(jpeg|png|gif|webp)|application\/(pdf|msword)|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/i;
    if (fileData.length > 2_700_000) {
      return NextResponse.json({ message: "Foto terlalu besar. Pilih foto yang lebih kecil." }, { status: 413 });
    }
    if (!fileData || !fileName || !idempotencyKey || !allowedMime.test(fileMime)) {
      return NextResponse.json({ message: "Dokumen tidak valid atau melebihi batas ukuran." }, { status: 400 });
    }
    if (folderName === "Tanda Tangan Supervisi" && (fileMime !== "image/png" || !/^supervisi-[a-zA-Z0-9_-]+-(enumerator|koordinator)\.png$/.test(fileName))) {
      return NextResponse.json({ message: "File tanda tangan supervisi tidak valid." }, { status: 400 });
    }
    if (folderName === "Tanda Tangan Supervisi") {
      const authorization = request.headers.get("authorization") || "";
      const [scheme, token] = authorization.split(" ");
      if (scheme !== "Bearer" || !token || !sessionId || !/^[a-zA-Z0-9_-]{8,160}$/.test(sessionId)) {
        return NextResponse.json({ message: "Autentikasi tanda tangan tidak valid." }, { status: 401 });
      }
      if (!["enumerator", "koordinator"].includes(signatureRole) || fileName !== `supervisi-${sessionId}-${signatureRole}.png`) {
        return NextResponse.json({ message: "Nama file tanda tangan tidak sesuai dengan sesi dan penanda tangan." }, { status: 400 });
      }
      let uid: string;
      try {
        uid = (await getAdminAuth().verifyIdToken(token)).uid;
      } catch {
        return NextResponse.json({ message: "Sesi login tidak valid atau sudah kedaluwarsa." }, { status: 401 });
      }
      let role: string;
      try {
        const profile = await getAdminDb().collection("user").doc(uid).get();
        role = String(profile.get("role") || "").trim().toLowerCase();
      } catch {
        return NextResponse.json({ message: "Profil penanda tangan tidak dapat diverifikasi." }, { status: 500 });
      }
      if (signatureRole === "koordinator" && role !== "koordinator" && role !== "admin") {
        return NextResponse.json({ message: "Hanya Koordinator yang dapat mengunggah tanda tangan Koordinator." }, { status: 403 });
      }
      if (signatureRole === "enumerator") {
        if (role !== "enumerator") {
          return NextResponse.json({ message: "Tanda tangan ini hanya dapat diunggah dari akun Enumerator." }, { status: 403 });
        }
        try {
          const session = await getAdminDb().collection("supervisions").doc(sessionId).get();
          if (!session.exists || session.get("enumeratorUid") !== uid || session.get("workflowStatus") !== "awaiting_enumerator_signature") {
            return NextResponse.json({ message: "Sesi supervisi ini tidak tersedia untuk akun Enumerator Anda." }, { status: 403 });
          }
        } catch {
          return NextResponse.json({ message: "Sesi supervisi tidak dapat diverifikasi." }, { status: 500 });
        }
      }
    }
    if (!dedicatedFolder && (!enumeratorName || !hotspotCode)) {
      return NextResponse.json({ message: "Nama enumerator dan kode hotspot wajib diisi." }, { status: 400 });
    }
    const response = await fetch(gasUploadUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        enumeratorName,
        hotspotCode,
        secret: (process.env.GAS_UPLOAD_SECRET || "").trim().replace(/^['"]|['"]$/g, ""),
      }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      return NextResponse.json({ success: false, message: "Dokumen gagal disimpan. Silakan coba lagi atau hubungi administrator." }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ message: "Dokumen gagal disimpan. Silakan coba lagi atau hubungi administrator." }, { status: 502 });
  }
}