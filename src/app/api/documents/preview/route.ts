import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const gasUploadUrl = process.env.GAS_UPLOAD_URL;
  const gasUploadSecret = process.env.GAS_UPLOAD_SECRET;
  const fileId = new URL(request.url).searchParams.get("fileId");

  if (!gasUploadUrl || !gasUploadSecret || !fileId) {
    return NextResponse.json({ message: "Konfigurasi preview dokumen belum lengkap." }, { status: 400 });
  }

  try {
    const previewUrl = new URL(gasUploadUrl);
    previewUrl.searchParams.set("fileId", fileId);
    previewUrl.searchParams.set("secret", gasUploadSecret);
    const response = await fetch(previewUrl, { cache: "no-store" });
    const result = await response.json() as { success?: boolean; message?: string; mimeType?: string; fileData?: string };

    if (!response.ok || !result.success || !result.fileData) {
      return NextResponse.json({ message: result.message || "Preview dokumen tidak tersedia." }, { status: response.ok ? 404 : response.status });
    }

    return new Response(Buffer.from(result.fileData, "base64"), {
      headers: {
        "Content-Type": result.mimeType || "application/octet-stream",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return NextResponse.json({ message: "Server gagal mengambil preview dokumen." }, { status: 502 });
  }
}
