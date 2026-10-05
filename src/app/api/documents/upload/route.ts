import { NextResponse } from "next/server";

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
    const allowedMime = /^(image\/(jpeg|png|gif|webp)|application\/(pdf|msword)|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/i;
    if (fileData.length > 2_700_000) {
      return NextResponse.json({ message: "Foto terlalu besar. Pilih foto yang lebih kecil." }, { status: 413 });
    }
    if (!fileData || !fileName || !idempotencyKey || !allowedMime.test(fileMime)) {
      return NextResponse.json({ message: "Dokumen tidak valid atau melebihi batas ukuran." }, { status: 400 });
    }
    const response = await fetch(gasUploadUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, secret: (process.env.GAS_UPLOAD_SECRET || "").trim().replace(/^['"]|['"]$/g, "") }),
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