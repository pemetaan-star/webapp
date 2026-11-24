## Catatan Migrasi

Project `lingga` adalah migrasi bertahap dari project Google Apps Script lama yang berada di folder sibling `next-app/GAS`. Project lama menjadi referensi perilaku untuk field, role, validasi, QC, dan alur supervisi.

Arsitektur migrasi saat ini:

- Next.js menangani UI, Firebase Authentication, Firestore, dashboard berdasarkan role, form Enumerator, dan workflow QC.
- Admin dapat mengaktifkan input koordinat GPS manual per akun Enumerator melalui Manajemen User; tanpa izin tersebut, koordinat hanya dapat diambil dari perangkat.
- Admin dapat mengubah sandi akun melalui form edit user; sandi hanya diperbarui di Firebase Authentication dan tidak disimpan di Firestore. Kosongkan kolom sandi baru untuk mempertahankan sandi saat ini.
- Firestore collection `user` menyimpan profil publik: `username`, `email`, `name`, dan `role`.
- Firestore collection `submissions` menyimpan data pendataan dan hasil QC.
- Folder lokal [gas](gas) hanya berisi Apps Script penyimpanan dokumen ke Google Drive. Jangan menambahkan login, KoboToolbox, Spreadsheet, QC, atau dashboard ke service tersebut.
- File lama Apps Script dipertahankan sebagai referensi migrasi, bukan sebagai backend aktif Next.js.

Catatan untuk agen AI: sebelum mengubah fitur yang sudah dimigrasikan, bandingkan implementasinya dengan project lama agar nama field dan aturan role tetap konsisten. Enumerator hanya menginput dan membaca data miliknya; Supervisor memeriksa pelaksanaan lapangan; Koordinator melakukan review; Data Analis memvalidasi dan memfinalkan data; Admin mengelola profil user.

## Konfigurasi Firebase Admin

API server membutuhkan Node.js 22.x serta `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, dan `FIREBASE_ADMIN_PRIVATE_KEY` pada `.env.local` serta environment deployment. Isi `FIREBASE_ADMIN_PRIVATE_KEY` dengan nilai `private_key` dari service account Firebase, termasuk baris `BEGIN` dan `END`; gunakan format PEM yang valid atau newline escaped (`\n`). Jangan mengisi variabel ini dengan seluruh JSON service account atau meng-commit kredensial.

## Konfigurasi upload

Salin `.env.example` menjadi `.env.local`, lalu isi konfigurasi Firebase dan:

```env
GAS_UPLOAD_URL=https://script.google.com/macros/s/DEPLOYMENT_ID/exec
GAS_UPLOAD_SECRET=secret-yang-sama-dengan-script-properties
```

Gunakan file Apps Script dari folder lokal [gas](gas), bukan folder Apps Script project lain. Tambahkan Script Property `NEXT_UPLOAD_SECRET` dengan nilai yang sama, pastikan `FOLDER_UTAMA` sudah terisi, lalu deploy `gas/code.gs` sebagai Web App. Endpoint Next.js menyimpan data survei ke Firestore collection `submissions`; file tidak disimpan di Firestore, melainkan diteruskan ke Apps Script dan disimpan ke folder `Dokumen Enumerator` di Google Drive.

Struktur minimal dokumen `submissions`:

```text
enumeratorUid, enumeratorUsername, enumeratorName
kodeHotspot, organisasi, namaHotspot, kecamatan, kelurahan, alamat, koordinat
statusHotspot, statusVerifikasi, populasiKunci, tipeLokasi, subTipeLokasi
catatan, document, qcStatus, workflowStage, createdAt
```

Tahapan `workflowStage` submission mengikuti proposal: `submitted` (menunggu supervisi Koordinator), `coordinator_review`, `awaiting_enumerator_signature`, `awaiting_coordinator_completion`, `analyst_review`, `finalized`, atau `needs_revision`. Hasil supervisi **Perlu perbaikan** langsung mengubah hotspot terpilih ke `needs_revision` dan ditampilkan sebagai tindakan **Perlu Perbaikan** bagi Enumerator; tanda tangan tidak diperlukan. **Perlu tindak lanjut** tetap di antrean Koordinator tanpa tanda tangan. Hanya kesimpulan **Lolos supervisi** yang meminta tanda tangan Koordinator dan Enumerator sebelum diteruskan ke Data Analis. Data Analis menangani pemeriksaan, pengolahan, dan analisis setelah supervisi selesai. PNG tanda tangan disimpan di Google Drive melalui Apps Script pada folder `Tanda Tangan Supervisi`; Firestore menyimpan metadata dan referensi filenya. Tahap lama `supervisor_review` dinormalisasi sebagai `coordinator_review` saat ditampilkan. Akun role `supervisor` lama harus dialihkan oleh Admin menjadi `koordinator`.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Firestore Rules

Publish file [firestore.rules](firestore.rules) ke Firebase Console → Firestore Database → Rules. Rules tersebut memvalidasi field wajib, angka, status, role, dan transisi workflow di server.

Penting: ubah ID dokumen profil menjadi UID dari Firebase Authentication. Ini wajib untuk membaca role dari Firestore Rules:

```text
user/{uid-firebase}
```

Jika profil lama masih memakai ID acak, buat dokumen baru dengan ID UID Firebase yang sama dan salin field `username`, `email`, `name`, serta `role`. Untuk role reviewer gunakan nilai persis `admin`, `koordinator`, atau `data analis`.

Jangan simpan field `sandi` atau password di Firestore. Password hanya disimpan oleh Firebase Authentication.

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null;
    }

    function myProfile() {
      return signedIn()
        ? get(/databases/$(database)/documents/user/$(request.auth.uid)).data
        : null;
    }

    function isAdmin() {
      return signedIn() && myProfile().role == 'admin';
    }

    function isReviewer() {
      return signedIn() && (
        myProfile().role == 'admin' ||
        myProfile().role == 'koordinator' ||
        myProfile().role == 'data analis' ||
        myProfile().role == 'data analyst'
      );
    }

    // Dibaca sebelum login untuk mencari email berdasarkan username.
    // Jangan menyimpan password di dokumen ini.
    match /user/{userId} {
      allow read: if true;
      allow create, update, delete: if isAdmin();
    }

    match /submissions/{submissionId} {
      allow create: if signedIn()
        && request.resource.data.enumeratorUid == request.auth.uid;

      allow read: if signedIn() && (
        isReviewer() ||
        resource.data.enumeratorUid == request.auth.uid
      );

      // Hanya reviewer yang boleh mengubah status QC.
      allow update: if isReviewer();

      allow delete: if isAdmin();
    }

    match /supervisions/{supervisionId} {
      allow create: if signedIn()
        && (myProfile().role == 'admin' || myProfile().role == 'koordinator')
        && request.resource.data.coordinatorUid == request.auth.uid;

      allow read: if isReviewer()
        || (signedIn() && (
          resource.data.coordinatorUid == request.auth.uid ||
          resource.data.supervisorUid == request.auth.uid
        ));

      allow update, delete: if isAdmin();
    }
  }
}
```

Rules di atas membuat profil `user` dapat dibaca sebelum login karena login memakai username. Pastikan dokumen user hanya berisi data profil publik seperti `username`, `email`, `name`, dan `role`.

Setelah mengubah [gas/code.gs](gas/code.gs), deploy ulang Apps Script Web App. Upload dokumen sekarang membutuhkan `idempotencyKey` dan akan mengembalikan file Drive yang sama saat request diulang.

## Yang Perlu Ditangani

Daftar ini adalah backlog, bukan klaim bahwa setiap poin merupakan bug yang sedang terjadi. Jumlah baris dapat berubah seiring perubahan kode.

### 1. Akses baca collection `user`

`firestore.rules` saat ini mengizinkan `allow read: if true` pada collection `user`, sehingga profil dapat dibaca tanpa autentikasi. Jangan sekadar mengganti aturan menjadi `signedIn()`: login username saat ini mencari profil di Firestore sebelum autentikasi. Pindahkan resolusi username ke alur server-side yang tidak membuka daftar profil, lalu batasi akses baca client sesuai kebutuhan. Perubahan ini harus mempertahankan login username dan menghindari kebocoran informasi akun.

### 2. Memecah komponen halaman utama

`src/app/page.tsx` berisi 2.526 baris pada revisi saat dokumentasi ini diperiksa, termasuk banyak state, data fetching, dan UI untuk beberapa peran. Ukuran dan tanggung jawab file menyulitkan pemeliharaan; dampak performanya perlu diukur, bukan diasumsikan. Pecah komponen berdasarkan fitur dan tanggung jawab, lalu pertimbangkan route terpisah jika memang dibutuhkan navigasi atau deep link.

### 3. Routing UI

UI utama saat ini disajikan dari route `/`; aplikasi juga memiliki route API. Karena bagian dashboard tidak memiliki URL tersendiri, halaman atau submission tertentu belum dapat dibuka melalui deep link. Tambahkan route UI hanya untuk tampilan yang perlu dibookmark, dibagikan, atau dinavigasi dengan tombol Back/Forward browser. Contoh target:

```text
/login
/dashboard
/submissions
/submissions/[id]
/supervision
/admin/users
/analytics
```

### 4. State management

Banyak state berada di komponen halaman utama. Ekstrak komponen dan letakkan state sedekat mungkin dengan fitur yang menggunakannya. Gunakan Context atau reducer hanya untuk state yang memang dibagi lintas fitur; pertahankan listener Firestore realtime yang sudah ada kecuali ada alasan terukur untuk menggantinya.

### 5. CSS global

`src/app/globals.css` berisi 664 baris. Tailwind diimpor, tetapi sebagian besar tampilan menggunakan selector CSS khusus; beberapa selector, termasuk `.login-form`, memiliki override berulang. Pecah CSS secara bertahap ke CSS Modules atau konsolidasikan aturan yang tumpang tindih. Migrasi penuh ke Tailwind bukan keharusan.

### 6. Pembacaan profil fallback saat memuat submission

`mapSubmissionSnapshot` membaca profil Firestore untuk setiap submission yang tidak memiliki `enumeratorName`. Submission baru sudah menyimpan nama tersebut, sehingga tambahan pembacaan terutama berdampak pada data lama yang belum lengkap. Pertimbangkan melengkapi data lama atau membaca setiap UID unik paling banyak sekali per batch.

### 7. Testing

Belum ada file test/spec yang ter-tracking di repository. Mulai dengan pengujian transisi workflow dan Firestore Rules, lalu tambahkan pengujian route API untuk perilaku penting.

### 8. Duplikasi label workflow

`workflowStageLabels` didefinisikan di `src/app/page.tsx` dan `src/app/components/review-modals.tsx`. Pindahkan label dan helper workflow bersama ke modul bersama yang sesuai.

### 9. Validasi dengan Zod

Zod sudah digunakan di route review AI, tetapi penggunaannya belum menjadi validasi umum untuk request API atau data eksternal. Pertimbangkan schema Zod pada batas input API yang menerima data tidak tepercaya; validasi data Firestore sesuai kebutuhan dan jangan menganggap hasil casting sudah tervalidasi.

### Urutan pengerjaan yang disarankan

1. Rancang resolusi username server-side dan batasi akses baca collection `user`; pastikan login tetap berfungsi.
2. Tambahkan pengujian untuk aturan akses, login, dan transisi workflow sebelum mengubah batas akses.
3. Kurangi pembacaan profil fallback untuk submission lama.
4. Pecah `page.tsx` per fitur; tambahkan route UI jika kebutuhan deep link sudah jelas.
5. Konsolidasikan CSS dan pindahkan label workflow ke modul bersama.
6. Tambahkan validasi schema pada request API yang sesuai.