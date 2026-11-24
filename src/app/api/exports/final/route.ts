import { makeCsv, makeSav, makeXlsx, type FinalExportColumn, type FinalExportRecord } from "@/lib/final-export-formats";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

type ExportColumn = FinalExportColumn & { source: string };
type ExportOptions = Pick<FinalExportColumn, "wrap" | "omitWhenEmpty">;

function column(
  key: string,
  label: string,
  source: string,
  type: FinalExportColumn["type"],
  group: string,
  width: number,
  options: ExportOptions = {},
): ExportColumn {
  return { key, label, source, type, group, width, ...options };
}

const exportColumns: ExportColumn[] = [
  column("id_data", "ID Data", "__id", "string", "Identitas", 22),
  column("nama_enumerator", "Nama Enumerator", "enumeratorName", "string", "Identitas", 25),
  column("username_enumerator", "Username Enumerator", "enumeratorUsername", "string", "Identitas", 22),
  column("organisasi", "Organisasi", "organisasi", "string", "Identitas", 32),

  column("kode_hotspot", "Kode hotspot", "kodeHotspot", "string", "Lokasi", 20),
  column("jenis_kunjungan", "Jenis kunjungan", "visitType", "string", "Lokasi", 18),
  column("nomor_kunjungan", "Nomor kunjungan", "visitNumber", "number", "Lokasi", 16),
  column("kunjungan_sebelumnya", "ID kunjungan sebelumnya", "previousVisitId", "string", "Lokasi", 25),
  column("alasan_kunjungan", "Alasan kunjungan", "visitReason", "string", "Lokasi", 36, { wrap: true }),
  column("tanggal_kunjungan", "Tanggal kunjungan (WIB)", "__visitDate", "datetime", "Lokasi", 24),
  column("nama_hotspot", "Nama hotspot", "namaHotspot", "string", "Lokasi", 34, { wrap: true }),
  column("kecamatan", "Kecamatan", "kecamatan", "string", "Lokasi", 20),
  column("kelurahan", "Kelurahan", "kelurahan", "string", "Lokasi", 22),
  column("alamat", "Alamat", "__address", "string", "Lokasi", 48, { wrap: true }),
  column("lintang_gps", "Lintang GPS", "__latitude", "coordinate", "Lokasi", 16),
  column("bujur_gps", "Bujur GPS", "__longitude", "coordinate", "Lokasi", 16),

  column("status_hotspot", "Status hotspot", "statusHotspot", "string", "Hasil", 24),
  column("status_verifikasi", "Status verifikasi", "statusVerifikasi", "string", "Hasil", 26),
  column("populasi_kunci", "Populasi kunci", "populasiKunci", "string", "Hasil", 26),
  column("tipe_lokasi", "Tipe lokasi", "tipeLokasi", "string", "Hasil", 34, { wrap: true }),
  column("subtipe_lokasi", "Subtipe lokasi", "subTipeLokasi", "string", "Hasil", 32, { wrap: true }),
  column("tipe_lokasi_lainnya", "Tipe lokasi lainnya", "tipeLokasiLainnya", "string", "Hasil", 36, { wrap: true }),
  column("waktu_aktivitas", "Waktu aktivitas", "waktuAktivitas", "string", "Hasil", 24),
  column("estimasi_populasi", "Estimasi jumlah populasi", "estimasiJumlahPopulasi", "number", "Hasil", 22),
  column("jumlah_diedukasi", "Jumlah diedukasi", "jumlahDiedukasi", "number", "Hasil", 18),
  column("jumlah_hiv_positif", "Jumlah HIV positif", "jumlahHivPositif", "number", "Hasil", 20, { omitWhenEmpty: true }),
  column("jumlah_tes_hiv", "Jumlah tes HIV", "jumlahTesHiv", "number", "Hasil", 18, { omitWhenEmpty: true }),
  column("sumber_informasi", "Sumber informasi", "sumberInformasi", "string", "Hasil", 28, { wrap: true }),
  column("nomor_hp_informan", "Nomor HP informan", "__informantPhone", "string", "Hasil", 22),
  column("keterangan_informan", "Keterangan informan", "keteranganAktivitas", "string", "Hasil", 42, { wrap: true }),
  column("kondisi_pemetaan", "Kondisi hotspot saat pemetaan", "kondisiSaatPemetaan", "string", "Hasil", 48, { wrap: true }),
  column("catatan_enumerator", "Catatan Enumerator", "catatan", "string", "Hasil", 48, { wrap: true }),

  column("hasil_supervisi", "Hasil supervisi Koordinator", "coordinatorReviewStatus", "string", "Supervisi", 30),
  column("catatan_koordinator", "Catatan Koordinator", "coordinatorReviewNote", "string", "Supervisi", 45, { wrap: true }),
  column("kelengkapan_supervisi", "Kelengkapan supervisi", "coordinatorReviewKelengkapan", "string", "Supervisi", 28),
  column("duplikasi_supervisi", "Duplikasi supervisi", "coordinatorReviewDuplikasi", "string", "Supervisi", 25),
  column("kroscek_supervisi", "Kroscek supervisi", "coordinatorReviewKroscek", "string", "Supervisi", 25),
  column("nama_koordinator", "Nama Koordinator", "coordinatorReviewerName", "string", "Supervisi", 26),
  column("tanggal_supervisi", "Tanggal supervisi", "coordinatorReviewDate", "date", "Supervisi", 22),

  column("status_qc_analis", "Status QC Data Analis", "qcStatus", "string", "QC", 26),
  column("kelengkapan_data", "Kelengkapan data", "qcKelengkapan", "string", "QC", 24),
  column("duplikasi_data", "Duplikasi data", "qcDuplikasi", "string", "QC", 22),
  column("kroscek_data", "Kroscek data", "qcKroscek", "string", "QC", 22),
  column("catatan_data_analis", "Catatan Data Analis", "qcNote", "string", "QC", 44, { omitWhenEmpty: true, wrap: true }),
  column("nama_analis", "Nama pemeriksa Data Analis", "qcNamaPemeriksa", "string", "QC", 30),
  column("tanggal_pemeriksaan", "Tanggal pemeriksaan", "qcTanggalPemeriksaan", "date", "QC", 22),
  column("tahap_alur_kerja", "Tahap alur kerja", "workflowStage", "string", "QC", 36),
  column("catatan_kualitas_ekspor", "Catatan kualitas ekspor", "__qualityNotes", "string", "QC", 48, { omitWhenEmpty: true, wrap: true }),

  column("nama_dokumen", "Nama file dokumentasi", "__documentNames", "string", "Dokumentasi", 45, { wrap: true }),
  column("tautan_drive_1", "Link Google Drive dokumentasi 1", "__documentUrl1", "string", "Dokumentasi", 42),
  column("tautan_drive_2", "Link Google Drive dokumentasi 2", "__documentUrl2", "string", "Dokumentasi", 42),
  column("tautan_drive_3", "Link Google Drive dokumentasi 3", "__documentUrl3", "string", "Dokumentasi", 42),
  column("jumlah_dokumen", "Jumlah dokumentasi", "__documents", "number", "Dokumentasi", 20),
];

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
  idu: "IDU / PWID",
  lsl: "LSL",
  transgender: "Transgender",
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
  return value.split(",").map((item) => item.trim()).filter(Boolean).map((trimmed) => {
    return codedValueLabels[trimmed.toLowerCase()] || trimmed.replace(/_+/g, " ");
  }).join(", ");
}

function dateIsoValue(value: unknown): string {
  const date = value instanceof Date
    ? value
    : value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function"
      ? value.toDate()
      : typeof value === "string" || typeof value === "number" ? new Date(value) : null;
  return date instanceof Date && Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCoordinates(value: unknown): [number | null, number | null] {
  let latitude: unknown;
  let longitude: unknown;
  if (typeof value === "string") {
    const parts = value.trim().split(/[,\s]+/);
    if (parts.length === 2) [latitude, longitude] = parts;
  } else if (isRecord(value)) {
    latitude = value.latitude ?? value.lat;
    longitude = value.longitude ?? value.lng;
  }
  const lat = typeof latitude === "number" ? latitude : typeof latitude === "string" ? Number(latitude) : NaN;
  const lng = typeof longitude === "number" ? longitude : typeof longitude === "string" ? Number(longitude) : NaN;
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return [null, null];
  }
  return [Number(lat.toFixed(6)), Number(lng.toFixed(6))];
}

function hasPopulationKey(value: unknown): boolean {
  return Array.isArray(value)
    ? value.some((item) => typeof item === "string" && item.trim())
    : typeof value === "string" && value.split(",").some((item) => item.trim());
}

function isPlaceholderPhone(value: unknown): boolean {
  if (typeof value !== "string" && typeof value !== "number") return false;
  const digits = String(value).replace(/\D/g, "");
  return digits.length > 0 && /^0+$/.test(digits);
}

function hasCoordinateInput(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  return isRecord(value);
}

function qualityNotes(data: Record<string, unknown>, coordinates: [number | null, number | null]): string {
  const notes: string[] = [];
  if (!hasPopulationKey(data.populasiKunci)) notes.push("Populasi kunci belum diisi");
  if (isPlaceholderPhone(data.noHpInforman)) notes.push("Nomor HP placeholder dikosongkan");
  else if (typeof data.noHpInforman === "number") notes.push("Nomor HP tersimpan sebagai angka; nol awal tidak dapat dipulihkan");
  if (
    data.workflowStage === "finalized"
    && (
      data.coordinatorReviewStatus !== "Valid"
      || typeof data.coordinatorReviewerUid !== "string" || !data.coordinatorReviewerUid.trim()
      || typeof data.coordinatorReviewerName !== "string" || !data.coordinatorReviewerName.trim()
      || typeof data.coordinatorReviewDate !== "string" || !data.coordinatorReviewDate.trim()
    )
  ) {
    notes.push("Supervisi Koordinator belum tercatat lengkap");
  }
  if (typeof data.alamat === "string" && /^Nearby Address:/i.test(data.alamat.trim())) {
    notes.push("Alamat berupa kode lokasi; verifikasi alamat lapangan");
  }
  if (hasCoordinateInput(data.koordinat) && (coordinates[0] === null || coordinates[1] === null)) {
    notes.push("Koordinat tidak dapat dipisahkan");
  }
  if (!data.visitedAt && data.createdAt) notes.push("Tanggal kunjungan memakai waktu pendataan");
  return notes.join("; ");
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
  const coordinates = parseCoordinates(data.koordinat);
  return Object.fromEntries(exportColumns.map((column) => {
    const value = column.source === "__id"
      ? id
      : column.source === "__visitDate"
        ? data.visitedAt || data.createdAt
      : column.source === "__latitude"
        ? coordinates[0]
      : column.source === "__longitude"
        ? coordinates[1]
      : column.source === "__informantPhone"
        ? isPlaceholderPhone(data.noHpInforman) ? "" : stringValue(data.noHpInforman)
      : column.source === "__address"
        ? stringValue(data.alamat).replace(/^Nearby Address:\s*/i, "").trim()
      : column.source === "__qualityNotes"
        ? qualityNotes(data, coordinates)
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
    if (column.type === "date" || column.type === "datetime") {
      return [column.key, dateIsoValue(value)];
    }
    if (column.type === "coordinate") {
      return [column.key, typeof value === "number" ? value : null];
    }
    if (column.type === "number") {
      if (value === null || value === undefined || value === "") return [column.key, null];
      const number = typeof value === "number" ? value : Number(value);
      return [column.key, Number.isFinite(number) ? number : null];
    }
    const text = stringValue(value);
    if (column.source === "populasiKunci" && !text.trim()) return [column.key, "Belum diisi"];
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

    const outputColumns = exportColumns.filter((column) =>
      !column.omitWhenEmpty || submissions.some((row) => {
        const value = row[column.key];
        return value !== null && value !== undefined && (typeof value !== "string" || value.trim() !== "");
      }),
    );
    const bytes = format === "csv"
      ? makeCsv(outputColumns, submissions)
      : format === "xlsx" ? makeXlsx(outputColumns, submissions) : makeSav(outputColumns, submissions);
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
