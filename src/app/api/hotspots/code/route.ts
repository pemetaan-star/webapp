import { createHash, randomInt } from "node:crypto";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

function normalizeIdentity(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const [scheme, token] = authorization.split(" ");
  if (scheme !== "Bearer" || !token) {
    return Response.json({ error: "Autentikasi diperlukan." }, { status: 401 });
  }

  let uid: string;
  try {
    uid = (await adminAuth.verifyIdToken(token)).uid;
  } catch {
    return Response.json({ error: "Sesi tidak valid atau sudah kedaluwarsa." }, { status: 401 });
  }

  try {
    const profile = await adminDb.collection("user").doc(uid).get();
    if (String(profile.get("role") || "").trim().toLowerCase() !== "enumerator") {
      return Response.json({ error: "Akses hanya untuk enumerator." }, { status: 403 });
    }
  } catch {
    return Response.json({ error: "Profil enumerator tidak dapat diverifikasi." }, { status: 500 });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const namaHotspot = typeof body?.namaHotspot === "string" ? body.namaHotspot.trim() : "";
  const kelurahan = typeof body?.kelurahan === "string" ? body.kelurahan.trim() : "";
  const alamat = typeof body?.alamat === "string" ? body.alamat.trim() : "";
  const normalizedName = normalizeIdentity(namaHotspot);
  const normalizedVillage = normalizeIdentity(kelurahan);
  const normalizedAddress = normalizeIdentity(alamat);

  if (!normalizedName || !normalizedVillage || !normalizedAddress) {
    return Response.json({ error: "Nama hotspot, kelurahan, dan alamat wajib diisi." }, { status: 400 });
  }

  const identityKey = createHash("sha256")
    .update(JSON.stringify([normalizedName, normalizedVillage, normalizedAddress]))
    .digest("hex");
  const identityRef = adminDb.collection("hotspotIdentityCodes").doc(identityKey);
  const codeRefs = adminDb.collection("hotspotCodeIndexes");
  const matchingSubmissions = adminDb.collection("submissions")
    .where("kelurahan", "==", kelurahan)
    .where("alamat", "==", alamat)
    .limit(100);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidateCode = String(randomInt(10000, 100000));
    try {
      const kodeHotspot = await adminDb.runTransaction(async (transaction) => {
        const savedIdentity = await transaction.get(identityRef);
        if (savedIdentity.exists) return String(savedIdentity.get("kodeHotspot"));

        const matches = await transaction.get(matchingSubmissions);
        const duplicate = matches.docs.find((submission) =>
          normalizeIdentity(String(submission.get("namaHotspot") || "")) === normalizedName
          && normalizeIdentity(String(submission.get("kelurahan") || "")) === normalizedVillage
          && normalizeIdentity(String(submission.get("alamat") || "")) === normalizedAddress
          && String(submission.get("kodeHotspot") || "").trim(),
        );
        const existingCode = String(duplicate?.get("kodeHotspot") || "").trim();
        const code = existingCode || candidateCode;
        const codeRef = codeRefs.doc(code);
        const codeIndex = await transaction.get(codeRef);

        if (!existingCode) {
          const usedCodes = await transaction.get(
            adminDb.collection("submissions").where("kodeHotspot", "==", candidateCode).limit(1),
          );
          if (codeIndex.exists || !usedCodes.empty) throw new Error("HOTSPOT_CODE_COLLISION");
        }

        transaction.create(identityRef, {
          namaHotspot: normalizedName,
          kelurahan: normalizedVillage,
          alamat: normalizedAddress,
          kodeHotspot: code,
        });
        if (!codeIndex.exists) transaction.create(codeRef, { identityKey });
        return code;
      });

      return Response.json({ kodeHotspot });
    } catch (error) {
      if (error instanceof Error && error.message === "HOTSPOT_CODE_COLLISION") continue;
      return Response.json({ error: "Kode hotspot gagal dibuat." }, { status: 500 });
    }
  }

  return Response.json({ error: "Gagal membuat kode unik. Coba lagi." }, { status: 503 });
}