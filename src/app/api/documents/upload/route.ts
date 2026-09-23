import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const gasUploadUrl = process.env.GAS_UPLOAD_URL;
  if (!gasUploadUrl) return NextResponse.json({ message: "GAS_UPLOAD_URL belum dikonfigurasi." }, { status: 500 });

  try {
    const payload = await request.json();
    const response = await fetch(gasUploadUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, secret: process.env.GAS_UPLOAD_SECRET || "" }),
    });
    const result = await response.json();
    return NextResponse.json(result, { status: response.ok && result.success ? 200 : 400 });
  } catch {
    return NextResponse.json({ message: "Server gagal meneruskan upload ke Apps Script." }, { status: 502 });
  }
}