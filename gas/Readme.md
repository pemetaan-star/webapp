# Document Storage Apps Script

Service ini hanya menyimpan dokumen dari project Next.js `lingga` ke Google Drive.
Service ini tidak menangani login, KoboToolbox, Spreadsheet, QC, supervisi, atau dashboard.

## Script Properties

Isi dua property berikut di Apps Script:

```text
FOLDER_UTAMA=ID_FOLDER_GOOGLE_DRIVE
NEXT_UPLOAD_SECRET=secret-yang-sama-dengan-env-next
```

File akan disimpan di subfolder:

```text
FOLDER_UTAMA/Dokumen Enumerator/
```

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
