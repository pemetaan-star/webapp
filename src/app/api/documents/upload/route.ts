import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const gasUploadUrl = process.env.GAS_UPLOAD_URL;
  if (!gasUploadUrl) return NextResponse.json({ message: "GAS_UPLOAD_URL belum dikonfigurasi." }, { status: 500 });

  try {
    const payload = await request.json();
    const fileData = typeof payload.fileData === "string" ? payload.fileData : "";
    const fileName = typeof payload.fileName === "string" ? payload.fileName.trim() : "";
    const fileMime = typeof payload.fileMime === "string" ? payload.fileMime : "application/octet-stream";
    const idempotencyKey = typeof payload.idempotencyKey === "string" ? payload.idempotencyKey.trim() : "";
    const allowedMime = /^(image\/(jpeg|png|gif|webp)|application\/(pdf|msword)|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/i;
    if (!fileData || !fileName || !idempotencyKey || !allowedMime.test(fileMime) || fileData.length > 14_000_000) {
      return NextResponse.json({ message: "Dokumen tidak valid atau melebihi batas ukuran." }, { status: 400 });
    }
    const response = await fetch(gasUploadUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, secret: (process.env.GAS_UPLOAD_SECRET || "").trim().replace(/^['"]|['"]$/g, "") }),
    });
    const result = await response.json();
    return NextResponse.json(result, { status: response.ok && result.success ? 200 : 400 });
  } catch {
    return NextResponse.json({ message: "Server gagal meneruskan upload ke Apps Script." }, { status: 502 });
  }
}