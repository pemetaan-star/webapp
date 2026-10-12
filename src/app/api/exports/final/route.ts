import { makeCsv, makeSav, makeXlsx, type FinalExportRecord } from "@/lib/final-export-formats";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

const exportColumns = [
  { key: "id_data", label: "ID Data", source: "__id", type: "string" },
  { key: "tanggal_pendataan", label: "Tanggal pendataan", source: "createdAt", type: "string" },
  { key: "nama_enumerator", label: "Nama Enumerator", source: "enumeratorName", type: "string" },
  { key: "username_enumerator", label: "Username Enumerator", source: "enumeratorUsername", type: "string" },
  { key: "organisasi", label: "Organisasi", source: "organisasi", type: "string" },
  { key: "kode_hotspot", label: "Kode hotspot", source: "kodeHotspot", type: "string" },
  { key: "jenis_kunjungan", label: "Jenis kunjungan", source: "visitType", type: "string" },
  { key: "nomor_kunjungan", label: "Nomor kunjungan", source: "visitNumber", type: "number" },
  { key: "kunjungan_sebelumnya", label: "ID kunjungan sebelumnya", source: "previousVisitId", type: "string" },
  { key: "alasan_kunjungan", label: "Alasan kunjungan", source: "visitReason", type: "string" },
  { key: "tanggal_kunjungan", label: "Tanggal kunjungan", source: "visitedAt", type: "string" },
  { key: "nama_hotspot", label: "Nama hotspot", source: "namaHotspot", type: "string" },
  { key: "kecamatan", label: "Kecamatan", source: "kecamatan", type: "string" },
  { key: "kelurahan", label: "Kelurahan", source: "kelurahan", type: "string" },
  { key: "alamat", label: "Alamat", source: "alamat", type: "string" },
  { key: "koordinat_gps", label: "Koordinat GPS", source: "koordinat", type: "string" },
  { key: "status_hotspot", label: "Status hotspot", source: "statusHotspot", type: "string" },
  { key: "status_verifikasi", label: "Status verifikasi", source: "statusVerifikasi", type: "string" },
  { key: "populasi_kunci", label: "Populasi kunci", source: "populasiKunci", type: "string" },
  { key: "tipe_lokasi", label: "Tipe lokasi", source: "tipeLokasi", type: "string" },
  { key: "subtipe_lokasi", label: "Subtipe lokasi", source: "subTipeLokasi", type: "string" },
  { key: "tipe_lokasi_lainnya", label: "Tipe lokasi lainnya", source: "tipeLokasiLainnya", type: "string" },
  { key: "waktu_aktivitas", label: "Waktu aktivitas", source: "waktuAktivitas", type: "string" },
  { key: "estimasi_populasi", label: "Estimasi jumlah populasi", source: "estimasiJumlahPopulasi", type: "number" },
  { key: "jumlah_diedukasi", label: "Jumlah diedukasi", source: "jumlahDiedukasi", type: "number" },
  { key: "jumlah_hiv_positif", label: "Jumlah HIV positif", source: "jumlahHivPositif", type: "number" },
  { key: "jumlah_tes_hiv", label: "Jumlah tes HIV", source: "jumlahTesHiv", type: "number" },
  { key: "sumber_informasi", label: "Sumber informasi", source: "sumberInformasi", type: "string" },
  { key: "nomor_hp_informan", label: "Nomor HP informan", source: "noHpInforman", type: "string" },
  { key: "keterangan_informan", label: "Keterangan informan", source: "keteranganAktivitas", type: "string" },
  { key: "kondisi_pemetaan", label: "Kondisi hotspot saat pemetaan", source: "kondisiSaatPemetaan", type: "string" },
  { key: "catatan_enumerator", label: "Catatan Enumerator", source: "catatan", type: "string" },
  { key: "hasil_supervisi", label: "Hasil supervisi Koordinator", source: "coordinatorReviewStatus", type: "string" },
  { key: "catatan_koordinator", label: "Catatan Koordinator", source: "coordinatorReviewNote", type: "string" },
  { key: "kelengkapan_supervisi", label: "Kelengkapan supervisi", source: "coordinatorReviewKelengkapan", type: "string" },
  { key: "duplikasi_supervisi", label: "Duplikasi supervisi", source: "coordinatorReviewDuplikasi", type: "string" },
  { key: "kroscek_supervisi", label: "Kroscek supervisi", source: "coordinatorReviewKroscek", type: "string" },
  { key: "nama_koordinator", label: "Nama Koordinator", source: "coordinatorReviewerName", type: "string" },
  { key: "tanggal_supervisi", label: "Tanggal supervisi", source: "coordinatorReviewDate", type: "string" },
  { key: "status_qc_analis", label: "Status QC Data Analis", source: "qcStatus", type: "string" },
  { key: "kelengkapan_data", label: "Kelengkapan data", source: "qcKelengkapan", type: "string" },
  { key: "duplikasi_data", label: "Duplikasi data", source: "qcDuplikasi", type: "string" },
  { key: "kroscek_data", label: "Kroscek data", source: "qcKroscek", type: "string" },
  { key: "catatan_data_analis", label: "Catatan Data Analis", source: "qcNote", type: "string" },
  { key: "nama_analis", label: "Nama pemeriksa Data Analis", source: "qcNamaPemeriksa", type: "string" },
  { key: "tanggal_pemeriksaan", label: "Tanggal pemeriksaan", source: "qcTanggalPemeriksaan", type: "string" },
  { key: "tahap_alur_kerja", label: "Tahap alur kerja", source: "workflowStage", type: "string" },
  { key: "nama_dokumen", label: "Nama file dokumentasi", source: "__documentNames", type: "string" },
  { key: "tautan_drive_1", label: "Link Google Drive dokumentasi 1", source: "__documentUrl1", type: "string" },
  { key: "tautan_drive_2", label: "Link Google Drive dokumentasi 2", source: "__documentUrl2", type: "string" },
  { key: "tautan_drive_3", label: "Link Google Drive dokumentasi 3", source: "__documentUrl3", type: "string" },
  { key: "jumlah_dokumen", label: "Jumlah dokumentasi", source: "__documents", type: "number" },
] as const;

const codedValueSources = new Set([
  "visitType",
  "organisasi",
  "statusHotspot",
  "statusVerifikasi",
  "populasiKunci",
  "tipeLokasi",
  "subTipeLokasi",
  "waktuAktivitas",
  "sumberInformasi",
  "coordinatorReviewKelengkapan",
  "coordinatorReviewDuplikasi",
  "coordinatorReviewKroscek",
  "qcStatus",
  "qcKelengkapan",
  "qcDuplikasi",
  "qcKroscek",
  "workflowStage",
]);

const codedValueLabels: Record<string, string> = {
  initial: "Kunjungan 1",
  follow_up: "Kunjungan 2",
  lgi: "Yayasan Lingkar Gagasan Indonesia (LGI)",
  igama: "Yayasan IGAMA",
  wamarapa: "Wamarapa",
  fatayat_nu: "SSR Fatayat NU Jawa Timur (PENASUN)",
  pspl___tl__pekerja_seks_perempuan: "PSPL / TL",
  ruang_publik: "Ruang Publik / Area Terbuka / Jalanan",
  tempat_makan_hiburan: "Tempat Makan / Nongkrong / Hiburan",
  akomodasi_private: "Akomodasi / Private Venue",
  perawatan_kebugaran: "Perawatan dan Kebugaran",
  platform_virtual: "Platform Virtual / Online",
  aktif: "Aktif",
  baru: "Baru",
  tidak_aktif: "Tidak aktif",
  perlu_verifikasi: "Perlu verifikasi",
  perlu_klarifikasi: "Perlu klarifikasi",
  terverifikasi_lapangan: "Terverifikasi lapangan",
  populasi_kunci: "Populasi kunci",
  tokoh_kunci: "Tokoh kunci",
  observasi: "Observasi lapangan langsung",
  lengkap: "Lengkap",
  perlu_perbaikan: "Perlu perbaikan",
  tidak_ada: "Tidak ada",
  sesuai: "Sesuai",
  submitted: "Menunggu supervisi Koordinator",
  coordinator_review: "Supervisi Koordinator",
  awaiting_enumerator_signature: "Menunggu tanda tangan Enumerator",
  awaiting_coordinator_completion: "Menunggu penyelesaian Koordinator",
  analyst_review: "Pemeriksaan Data Analis",
  finalized: "Database final",
  needs_revision: "Perlu perbaikan",
};

function stringValue(value: unknown): string {
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string").join(", ");
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date && Number.isFinite(date.getTime()) ? date.toISOString() : "";
  }
  return "";
}

function displayCodedValue(value: string): string {
  return value.split(", ").map((item) => {
    const trimmed = item.trim();
    return codedValueLabels[trimmed] || trimmed.replace(/_+/g, " ");
  }).join(", ");
}

function submissionDocuments(data: Record<string, unknown>): Record<string, unknown>[] {
  const values = Array.isArray(data.documents) && data.documents.length > 0
    ? data.documents
    : data.document ? [data.document] : [];
  return values.filter((value): value is Record<string, unknown> => typeof value === "object" && value !== null);
}

function googleDriveUrl(document: Record<string, unknown> | undefined): string {
  if (!document) return "";
  if (typeof document.url === "string") {
    try {
      const url = new URL(document.url);
      if (url.protocol === "https:" && url.hostname === "drive.google.com") return url.toString();
    } catch {
      // Use the file ID when legacy records contain an invalid URL.
    }
  }
  const fileId = typeof document.fileId === "string" ? document.fileId.trim() : "";
  return /^[a-zA-Z0-9_-]{10,200}$/.test(fileId)
    ? `https://drive.google.com/open?id=${encodeURIComponent(fileId)}`
    : "";
}

function mapExportRecord(id: string, data: Record<string, unknown>): ExportRecord {
  const documents = submissionDocuments(data);
  return Object.fromEntries(exportColumns.map((column) => {
    const value = column.source === "__id"
      ? id
      : column.source === "__documents"
        ? documents.length
        : column.source === "__documentNames"
          ? documents
            .map((document) => document.name)
            .filter((name): name is string => typeof name === "string" && name.length > 0)
            .map((name) => name.replace(/_+/g, " "))
            .join(", ")
        : column.source.startsWith("__documentUrl")
          ? googleDriveUrl(documents[Number(column.source.slice("__documentUrl".length)) - 1])
        : data[column.source];
    if (column.type === "number") {
      const number = typeof value === "number" ? value : Number(value);
      return [column.key, Number.isFinite(number) ? number : null];
    }
    const text = stringValue(value);
    return [column.key, codedValueSources.has(column.source) ? displayCodedValue(text) : text];
  }));
}

type ExportRecord = FinalExportRecord;

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

  const format = new URL(request.url).searchParams.get("format");
  if (format !== "csv" && format !== "xlsx" && format !== "sav") {
    return Response.json({ error: "Pilih format unduhan CSV, Excel, atau SPSS." }, { status: 400 });
  }

  try {
    const adminDb = getAdminDb();
    const profile = await adminDb.collection("user").doc(uid).get();
    const role = String(profile.get("role") || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    const isEnumerator = role === "enumerator";
    const canViewAll = role === "admin" || role === "supervisor" || role.includes("koor") || role.includes("dataanalis") || role.includes("dataanalyst");
    if (!isEnumerator && !canViewAll) {
      return Response.json({ error: "Anda tidak memiliki akses untuk mengunduh data rekapitulasi." }, { status: 403 });
    }

    const baseQuery = adminDb.collection("submissions")
      .where(isEnumerator ? "enumeratorUid" : "workflowStage", "==", isEnumerator ? uid : "finalized");
    const submissions: ExportRecord[] = [];
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    do {
      let pageQuery = baseQuery.limit(500);
      if (cursor) pageQuery = pageQuery.startAfter(cursor);
      const page = await pageQuery.get();
      page.docs.forEach((document) => {
        const data = document.data();
        if (!isEnumerator || data.workflowStage === "finalized") {
          submissions.push(mapExportRecord(document.id, data));
        }
      });
      cursor = page.docs.length === 500 ? page.docs.at(-1) : undefined;
    } while (cursor);

    const bytes = format === "csv"
      ? makeCsv(exportColumns, submissions)
      : format === "xlsx" ? makeXlsx(exportColumns, submissions) : makeSav(exportColumns, submissions);
    const contentType = format === "csv"
      ? "text/csv; charset=utf-8"
      : format === "xlsx"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "application/x-spss-sav";
    const date = new Date().toISOString().slice(0, 10);
    const body = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(body).set(bytes);
    return new Response(body, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="lingga-database-final-${date}.${format}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[exports/final] Failed to export finalized submissions:", error instanceof Error ? error.message : "Unknown error");
    return Response.json({ error: "Data rekapitulasi gagal dibuat. Silakan coba lagi." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
