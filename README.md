## Catatan Migrasi

Project `lingga` adalah migrasi bertahap dari project Google Apps Script lama yang berada di folder sibling `next-app/GAS`. Project lama menjadi referensi perilaku untuk field, role, validasi, QC, dan alur supervisi.

Arsitektur migrasi saat ini:

- Next.js menangani UI, Firebase Authentication, Firestore, dashboard berdasarkan role, form Enumerator, dan workflow QC.
- Firestore collection `user` menyimpan profil publik: `username`, `email`, `nama`, dan `role`.
- Firestore collection `submissions` menyimpan data pendataan dan hasil QC.
- Folder lokal [gas](gas) hanya berisi Apps Script penyimpanan dokumen ke Google Drive. Jangan menambahkan login, KoboToolbox, Spreadsheet, QC, atau dashboard ke service tersebut.
- File lama Apps Script dipertahankan sebagai referensi migrasi, bukan sebagai backend aktif Next.js.

Catatan untuk agen AI: sebelum mengubah fitur yang sudah dimigrasikan, bandingkan implementasinya dengan project lama agar nama field dan aturan role tetap konsisten. Enumerator hanya menginput dan membaca data miliknya; Koordinator/Data Analis/Admin melakukan QC; Admin mengelola profil user.

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
organisasi, namaHotspot, kecamatan, kelurahan, alamat, koordinat
statusHotspot, populasiKunci, catatan, document, qcStatus, createdAt
```

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

Salin rules berikut ke Firebase Console → Firestore Database → Rules → Publish.

Penting: ubah ID dokumen profil menjadi UID dari Firebase Authentication. Ini wajib untuk membaca role dari Firestore Rules:

```text
user/{uid-firebase}
```

Jika profil lama masih memakai ID acak, buat dokumen baru dengan ID UID Firebase yang sama dan salin field `username`, `email`, `nama`, serta `role`. Untuk role reviewer gunakan nilai persis `admin`, `koordinator`, atau `data analis`.

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
        myProfile().role == 'supervisor' ||
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
      allow create: if isReviewer()
        && request.resource.data.supervisorUid == request.auth.uid;

      allow read: if isReviewer()
        || (signedIn() && resource.data.supervisorUid == request.auth.uid);

      allow update, delete: if isAdmin();
    }
  }
}
```

Rules di atas membuat profil `user` dapat dibaca sebelum login karena login memakai username. Pastikan dokumen user hanya berisi data profil publik seperti `username`, `email`, `nama`, dan `role`.