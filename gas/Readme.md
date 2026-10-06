# Document Storage Apps Script

Service ini hanya menyimpan dokumen dari project Next.js `lingga` ke Google Drive.
Service ini tidak menangani login, KoboToolbox, Spreadsheet, QC, supervisi, atau dashboard.

## Script Properties

Isi dua property berikut di Apps Script:

```text
FOLDER_UTAMA=ID_FOLDER_GOOGLE_DRIVE
NEXT_UPLOAD_SECRET=secret-yang-sama-dengan-env-next
```

Dokumentasi pemetaan akan disimpan dengan struktur:

```text
FOLDER_UTAMA/
└── Enumerator/
    └── {Nama Enumerator}/
        └── {Kode Hotspot}/
            └── file dokumentasi
```

Dokumen persetujuan QC tetap berada di `FOLDER_UTAMA/Persetujuan QC/`. Saat Admin menghapus data hotspot, semua file dokumentasi dan persetujuan QC yang tercatat pada data dipindahkan ke Sampah Google Drive terlebih dahulu; data Firestore baru dihapus setelah Drive mengonfirmasi keberhasilan. File yang sudah tersimpan di lokasi lama tidak dipindahkan otomatis.

## Deploy

1. Buka project Apps Script khusus untuk folder `lingga/gas`.
2. Salin isi `code.gs` ke project tersebut.
3. Isi Script Properties di atas.
4. Deploy sebagai Web App.
5. Atur akses sesuai kebutuhan aplikasi.
6. Masukkan URL deployment ke `.env.local` project `lingga`:

```env
GAS_UPLOAD_URL=https://script.google.com/macros/s/DEPLOYMENT_ID/exec
GAS_UPLOAD_SECRET=secret-yang-sama-dengan-script-properties
```

Request yang diterima `doPost` berbentuk JSON dengan `fileData` base64, `fileName`, `fileMime`, dan `secret`. Response mengembalikan `fileId`, `fileName`, dan `fileUrl`.

Deploy setiap perubahan pada `gas/code.gs` sebagai deployment Web App baru, lalu pastikan deployment aktif tersebut digunakan pada `GAS_UPLOAD_URL`. Ini diperlukan untuk struktur folder dokumentasi dan penghapusan file Drive oleh Admin. Deploy juga aplikasi Next.js agar alur hapus memakai endpoint Admin yang baru.
