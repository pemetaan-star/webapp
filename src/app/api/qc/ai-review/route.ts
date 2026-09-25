import { createGoogle } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { z } from "zod";

const qcCriteria = [
  "Pemeriksaan kelengkapan data",
  "Konsistensi pengisian instrumen",
  "Identifikasi duplikasi hotspot",
  "Validasi lokasi melalui supervisi atau kroscek silang",
  "Kelayakan finalisasi database",
] as const;

const qcSuggestionSchema = z.object({
  status: z.enum(["Valid", "Pending", "Perlu perbaikan"]),
  kelengkapan: z.enum(["lengkap", "perlu_perbaikan"]),
  duplikasi: z.enum(["tidak_ada", "ada"]),
  kroscek: z.enum(["sesuai", "perlu_klarifikasi"]),
  note: z.string().max(1200),
  alasan: z.string().max(1200),
  pemeriksaanSop: z.array(z.object({
    kriteria: z.enum(qcCriteria),
    hasil: z.enum(["sesuai", "perlu_perbaikan", "perlu_verifikasi"]),
    bukti: z.string().max(400),
  })).length(5),
});

function normalizeText(value: unknown) {
  return String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
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
    const role = String(profile.get("role") || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    const canReview = role === "admin" || role.includes("koor") || role.includes("dataanalis") || role.includes("dataanalyst");
    if (!canReview) return Response.json({ error: "Fitur AI QC hanya untuk Koordinator, Data Analis, dan Admin." }, { status: 403 });
  } catch {
    return Response.json({ error: "Profil reviewer tidak dapat diverifikasi." }, { status: 500 });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const submissionId = typeof body?.submissionId === "string" ? body.submissionId.trim() : "";
  if (!submissionId || submissionId.length > 150) {
    return Response.json({ error: "ID data hotspot tidak valid." }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const modelId = process.env.GEMINI_MODEL;
  if (!apiKey || !modelId) {
    return Response.json({ error: "Konfigurasi Gemini belum tersedia di server." }, { status: 503 });
  }

  try {
    const snapshot = await adminDb.collection("submissions").doc(submissionId).get();
    if (!snapshot.exists) return Response.json({ error: "Data hotspot tidak ditemukan." }, { status: 404 });
    const data = snapshot.data() || {};

    const candidateSnapshot = await adminDb.collection("submissions")
      .where("kelurahan", "==", String(data.kelurahan || ""))
      .get();
    const duplicateCount = candidateSnapshot.docs.filter((candidate) =>
      candidate.id !== snapshot.id
      && normalizeText(candidate.get("namaHotspot")) === normalizeText(data.namaHotspot)
      && normalizeText(candidate.get("kelurahan")) === normalizeText(data.kelurahan)
      && normalizeText(candidate.get("alamat")) === normalizeText(data.alamat),
    ).length;
    const workflowHistory = Array.isArray(data.workflowHistory) ? data.workflowHistory : [];
    const supervisorReviewRecorded = workflowHistory.some((item) => item?.stage === "supervisor_review");
    const crossCheckRecorded = String(data.qcKroscek || "") === "sesuai";
    const requiredFields = [
      ["Kode hotspot", data.kodeHotspot],
      ["Nama hotspot", data.namaHotspot],
      ["Kecamatan", data.kecamatan],
      ["Kelurahan", data.kelurahan],
      ["Alamat/deskripsi lokasi", data.alamat],
      ["Koordinat", data.koordinat],
      ["Status hotspot", data.statusHotspot],
      ["Populasi kunci", Array.isArray(data.populasiKunci) ? data.populasiKunci.join("") : ""],
      ["Tipe lokasi", data.tipeLokasi],
      ["Dokumentasi lapangan", Array.isArray(data.documents) ? data.documents.length : data.document ? 1 : 0],
      ["Sumber informasi", data.sumberInformasi],
      ["Keterangan aktivitas", data.keteranganAktivitas],
    ] as const;
    const missingFields = requiredFields
      .filter(([, value]) => value === null || value === undefined || String(value).trim() === "" || value === 0)
      .map(([label]) => label);
    const coordinateText = String(data.koordinat || "").trim();
    const coordinateFormatValid = /^-?[0-9]{1,2}(\.[0-9]{1,8})?,[ ]?-?[0-9]{1,3}(\.[0-9]{1,8})?$/.test(coordinateText);

    const reviewData = {
      kodeHotspot: String(data.kodeHotspot || ""),
      namaHotspot: String(data.namaHotspot || ""),
      kecamatan: String(data.kecamatan || ""),
      kelurahan: String(data.kelurahan || ""),
      alamat: String(data.alamat || ""),
      statusHotspot: String(data.statusHotspot || ""),
      populasiKunci: Array.isArray(data.populasiKunci) ? data.populasiKunci : [],
      tipeLokasi: String(data.tipeLokasi || ""),
      subTipeLokasi: String(data.subTipeLokasi || ""),
      waktuAktivitas: Array.isArray(data.waktuAktivitas) ? data.waktuAktivitas : [],
      estimasiJumlahPopulasi: Number(data.estimasiJumlahPopulasi || 0),
      jumlahDiedukasi: Number(data.jumlahDiedukasi || 0),
      jumlahTesHiv: Number(data.jumlahTesHiv || 0),
      jumlahHivPositif: Number(data.jumlahHivPositif || 0),
      catatan: String(data.catatan || ""),
      sumberInformasi: String(data.sumberInformasi || ""),
      keteranganAktivitas: String(data.keteranganAktivitas || ""),
      kondisiSaatPemetaan: String(data.kondisiSaatPemetaan || ""),
      koordinat: coordinateText,
      formatKoordinatValid: coordinateFormatValid,
      dokumentasiTersedia: Array.isArray(data.documents) ? data.documents.length > 0 : Boolean(data.document),
      fieldWajibKosong: missingFields,
      validasiLapangan: { supervisiTercatat: supervisorReviewRecorded, kroscekSebelumnyaSesuai: crossCheckRecorded },
      kandidatDuplikatDenganNamaKelurahanAlamatSama: duplicateCount,
      definisiStatusSop: {
        aktif: "Masih digunakan atau masih terdapat aktivitas populasi kunci dalam periode tertentu.",
        baru: "Ditemukan saat pemetaan dan belum tercatat sebelumnya.",
        tidakAktif: "Sebelumnya tercatat, tetapi hasil verifikasi menunjukkan tidak ada aktivitas populasi kunci.",
        perluVerifikasi: "Informasi atau keberadaan hotspot masih perlu dikonfirmasi di lapangan.",
      },
    };

    const google = createGoogle({ apiKey });
    const { output } = await generateText({
      model: google(modelId),
      output: Output.object({ schema: qcSuggestionSchema }),
      system: [
        "Anda membantu reviewer melakukan QC data Pemetaan Hotspot Populasi Kunci Kota Malang 2026 berdasarkan SOP proposal kegiatan.",
        "SOP mewajibkan: pemeriksaan kelengkapan data; konsistensi pengisian instrumen; identifikasi data ganda; validasi lokasi berdasarkan pemetaan lapangan dengan supervisi atau kroscek silang; dan finalisasi database hotspot.",
        "Instrumen minimal memuat identitas hotspot, wilayah administrasi, alamat/deskripsi, titik koordinat GPS, karakteristik lokasi, kategori populasi kunci, perkiraan aktivitas/populasi, informasi pendukung, status hotspot, dan dokumentasi/catatan lapangan.",
        "Gunakan definisi operasional yang disertakan untuk membedakan hotspot aktif, baru, tidak aktif, dan perlu verifikasi. Jangan mengubah status hanya dari dugaan.",
        "FieldWajibKosong dan formatKoordinatValid dihitung server; jangan menyangkal hasil pemeriksaan deterministik tersebut.",
        "Set duplikasi=ada hanya bila kandidatDuplikatDenganNamaKelurahanAlamatSama lebih dari nol. Duplikasi memerlukan pemeriksaan manual, bukan bukti otomatis bahwa dua catatan adalah lokasi yang sama.",
        "Untuk validasi lokasi, hasil sesuai hanya jika ada bukti supervisi atau kroscek dalam data. Jika bukti tidak tersedia, hasil harus perlu_klarifikasi; jangan menganggap bukti ada.",
        "Finalisasi database hanya layak disarankan jika seluruh kriteria SOP terpenuhi. Gunakan Perlu perbaikan untuk kekurangan/inconsistency nyata, Pending untuk bukti supervisi atau kroscek yang belum tersedia.",
        "Berikan satu hasil untuk setiap kriteria SOP, sebutkan bukti dari field yang tersedia, dan jangan mengarang fakta atau menyimpulkan kondisi kesehatan individu.",
        "Semua keluaran adalah saran untuk ditinjau reviewer manusia, bukan keputusan atau perubahan data otomatis. Tulis Bahasa Indonesia singkat dan spesifik.",
      ].join(" "),
      prompt: `Tinjau data terhadap lima kriteria SOP di atas. Jangan menambah standar yang tidak disebutkan. Hasilkan saran QC terstruktur dan checklist lima kriteria.\n${JSON.stringify(reviewData)}`,
    });

    return Response.json({ suggestion: output });
  } catch {
    return Response.json({ error: "AI QC gagal meninjau data. Coba lagi." }, { status: 502 });
  }
}