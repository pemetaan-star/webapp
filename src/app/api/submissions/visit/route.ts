import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

async function verifyEnumerator(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const [scheme, token] = authorization.split(" ");
  if (scheme !== "Bearer" || !token) {
    return { response: Response.json({ error: "Autentikasi diperlukan." }, { status: 401 }) };
  }

  let uid: string;
  try {
    uid = (await getAdminAuth().verifyIdToken(token)).uid;
  } catch {
    return { response: Response.json({ error: "Sesi login tidak valid atau sudah kedaluwarsa." }, { status: 401 }) };
  }

  try {
    const profile = await getAdminDb().collection("user").doc(uid).get();
    const role = String(profile.get("role") || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (role !== "enumerator") {
      return { response: Response.json({ error: "Pencatatan kunjungan hanya tersedia untuk Enumerator." }, { status: 403 }) };
    }
  } catch (error) {
    console.error("[submissions/visit] Failed to verify Enumerator profile:", error instanceof Error ? error.message : "Unknown error");
    return { response: Response.json({ error: "Profil Enumerator tidak dapat diverifikasi." }, { status: 500 }) };
  }

  return { uid };
}

export async function GET(request: Request) {
  const authorization = await verifyEnumerator(request);
  if ("response" in authorization) return authorization.response;

  try {
    const snapshot = await getAdminDb().collection("submissions")
      .where("enumeratorUid", "==", authorization.uid)
      .get();
    const visits = snapshot.docs
      .map((document) => {
        const data = document.data();
        const rawDate = data.visitedAt || data.createdAt;
        const date = rawDate && typeof rawDate === "object" && "toDate" in rawDate
          ? (rawDate as { toDate: () => Date }).toDate()
          : new Date(String(rawDate || ""));
        return {
          id: document.id,
          hotspotCode: String(data.kodeHotspot || ""),
          name: String(data.namaHotspot || "Tanpa nama"),
          area: `${String(data.kecamatan || "-")} / ${String(data.kelurahan || "-")}`,
          address: String(data.alamat || ""),
          visitNumber: Number.isInteger(Number(data.visitNumber)) && Number(data.visitNumber) > 0 ? Number(data.visitNumber) : 1,
          date: Number.isNaN(date.getTime()) ? "tanggal tidak tercatat" : date.toLocaleDateString("id-ID"),
        };
      })
      .filter((visit) => visit.hotspotCode);
    return Response.json({ visits }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[submissions/visit] Failed to load Enumerator visit history:", error instanceof Error ? error.message : "Unknown error");
    return Response.json({ error: "Riwayat hotspot tidak dapat dimuat. Silakan coba lagi." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authorization = await verifyEnumerator(request);
  if ("response" in authorization) return authorization.response;
  const { uid } = authorization;

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const mode = body?.mode;
  const hotspotCode = typeof body?.hotspotCode === "string" ? body.hotspotCode.trim().toUpperCase() : "";
  const previousVisitId = typeof body?.previousVisitId === "string" ? body.previousVisitId.trim() : "";
  if (
    (mode !== "initial" && mode !== "follow_up")
    || !hotspotCode
    || (mode === "follow_up" && (!previousVisitId || previousVisitId.includes("/")))
  ) {
    return Response.json({ error: "Jenis atau identitas kunjungan tidak valid." }, { status: 400 });
  }

  try {
    const adminDb = getAdminDb();
    const visitsQuery = adminDb.collection("submissions").where("kodeHotspot", "==", hotspotCode);
    const visits = await visitsQuery.get();
    if (mode === "initial") {
      if (!visits.empty) {
        return Response.json(
          { error: "Hotspot ini sudah memiliki riwayat. Pilih Kunjungan 2 dan tentukan kunjungan sebelumnya." },
          { status: 409 },
        );
      }
      return Response.json({ visitType: "initial", visitNumber: 1, previousVisitId: "", visitReason: "" });
    }

    const previousVisit = visits.docs.find((visit) => visit.id === previousVisitId);
    if (!previousVisit) {
      return Response.json({ error: "Kunjungan sebelumnya tidak ditemukan untuk kode hotspot ini." }, { status: 409 });
    }
    if (previousVisit.get("enumeratorUid") !== uid) {
      return Response.json({ error: "Kunjungan sebelumnya bukan milik akun Enumerator Anda." }, { status: 403 });
    }

    const latestVisitNumber = visits.docs.reduce((highest, visit) => {
      const visitNumber = Number(visit.get("visitNumber"));
      return Number.isInteger(visitNumber) && visitNumber > highest ? visitNumber : highest;
    }, 0);
    return Response.json({
      visitType: "follow_up",
      visitNumber: Math.max(visits.size + 1, latestVisitNumber + 1),
      previousVisitId,
      visitReason: "Kunjungan ulang berdasarkan kode hotspot yang sama",
    });
  } catch (error) {
    console.error("[submissions/visit] Failed to resolve visit sequence:", error instanceof Error ? error.message : "Unknown error");
    return Response.json({ error: "Riwayat kunjungan tidak dapat diverifikasi. Silakan coba lagi." }, { status: 500 });
  }
}
