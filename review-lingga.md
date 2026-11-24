Review Web App — Lingga (Dashboard Pemetaan Hotspot Malang 2026)
Ringkasan Proyek

Lingga adalah web app Next.js 16 untuk pendataan, supervisi, dan QC hotspot populasi kunci di Kota Malang. Backend menggunakan Firebase (Auth + Firestore), penyimpanan dokumen via Google Apps Script (Drive), dan AI assistant berbasis Gemini API. App ini sudah PWA-ready dengan manifest dan ikon yang siap.

✅ Hal-Hal yang Sudah Bagus
1. Domain Modeling yang Kuat

Workflow 7-stage (submitted → coordinator_review → awaiting_enumerator_signature → awaiting_coordinator_completion → analyst_review → finalized / needs_revision) sudah sangat detail dan mencerminkan proses kerja lapangan yang nyata. Ini bukan CRUD biasa — ini adalah proper business process management.

2. Keamanan Berlapis
Firestore Rules sangat granular: bukan hanya cek role, tapi memvalidasi field-level, transisi workflow yang sah, dan mencegah pengeditan field yang seharusnya immutable (enumeratorUid, createdAt).
Firebase Admin dipakai server-side untuk verifikasi token; requireAdmin() memverifikasi role langsung dari Firestore.
Secret GAS (GAS_UPLOAD_SECRET) hanya di server-side API route.
3. Role-Based Access Control Jelas

Empat role (Enumerator, Koordinator, Data Analis, Admin) punya boundary yang konsisten dari frontend sampai Firestore rules.

4. UI/UX Profesional
Design system yang cohesive: color tokens (--navy, --teal, --coral), typography pairing (DM Sans + Space Grotesk), status badges, KPI cards, dan donut charts.
Mobile responsive dengan breakpoints yang rapi (900px, 760px, 600px).
Splash screen, install prompt (PWA), dan loading state yang polished.
5. AI-Powered Features
QC AI Review: Data Analis bisa mendapat saran pemeriksaan otomatis dari Gemini.
Enumerator AI Assistant: chatbot kontekstual untuk membantu pengisian form, dengan riwayat percakapan yang persisten.
6. Leaflet Map Integration

Peta persebaran hotspot interaktif dengan custom pin markers (SVG gradients), popup detail, dan fit-to-bounds otomatis.

7. Supervision Workflow dengan Tanda Tangan Digital

Alur supervisi yang lengkap: checklist 12 poin, tanda tangan enumerator dan koordinator, sampai penyelesaian sesi.

⚠️ Masalah Utama yang Perlu Ditangani
1. page.tsx = 2.431 baris — "God Component"

CAUTION

Ini adalah masalah arsitektural paling besar.

Satu file menampung semua state management, business logic, 30+ useState, data fetching, submission handling, user management UI, supervision forms, QC modals, dan rendering. Ini menyebabkan:

Re-render cascade: Setiap perubahan state kecil me-render ulang seluruh app.
Bundle size: Seluruh client-side JS dimuat sekaligus, padahal pengguna hanya butuh fitur sesuai role.
Maintenance hell: Sulit untuk debug, test, atau refactor.

Rekomendasi: Pecah menjadi halaman per-role atau per-fitur menggunakan Next.js App Router (/dashboard/enumerator, /dashboard/koordinator, /dashboard/analyst, /admin), masing-masing dengan layout dan loading boundary sendiri.

2. Tidak Ada State Management Library

30+ useState di satu komponen tanpa context atau state manager apapun. Data dioper melalui props chains yang sangat panjang.

Rekomendasi: Gunakan React Context per-domain (auth, submissions, supervision) atau minimal useReducer. Untuk data fetching, pertimbangkan useSWR atau React Query/TanStack Query agar caching, revalidation, dan pagination lebih bersih.

3. CSS Monolith (globals.css = 664 baris, semua di satu file)

Tidak ada CSS Modules, Tailwind utility classes (meski Tailwind diimport!), atau scoping apapun. Semua selector bersifat global, beberapa selector didefinisikan ulang berulang kali (.login-form override dari baris 99 sampai 172 muncul ~5 kali).

Rekomendasi: Migrasi ke CSS Modules per-komponen, atau manfaatkan Tailwind secara konsisten (saat ini hanya diimport, hampir tidak digunakan).

4. Single-Page Architecture Tanpa Routing

Seluruh app adalah satu halaman (/). Tidak ada URL routing — pengguna tidak bisa bookmark halaman tertentu, share link ke submission spesifik, atau navigasi dengan browser back/forward.

Rekomendasi: Gunakan Next.js App Router sepenuhnya. Contoh:

/login
/dashboard          → overview + KPI
/submissions        → tabel data
/submissions/[id]   → detail hotspot
/supervision        → manajemen supervisi
/admin/users        → user management
/analytics          → dashboard analytics
5. Data Fetching pada Client Sangat Berat

mapSubmissionSnapshot membuat N+1 query: untuk setiap submission, ia meng-getDoc profil enumerator jika nama tidak ada. Dengan 25 submissions per halaman, ini berarti hingga 25 Firestore read tambahan.

Rekomendasi:

Simpan enumeratorName saat submission dibuat (denormalisasi) — sudah dilakukan sebagian, tapi fallback query masih ada.
Gunakan server-side data aggregation via API route daripada client-side Firestore listener yang berat.
🔧 Area yang Bisa Ditingkatkan
Keamanan
Temuan	Dampak	Saran
.env.local berisi private key Firebase Admin + Gemini API key	Jika commit ke repo publik, full access ke Firebase project	Pastikan .gitignore mencakupnya; rotasi key jika pernah terekspos
window.confirm() untuk operasi destruktif (hapus hotspot)	Tidak ada undo, mudah mis-click	Ganti dengan modal konfirmasi yang proper
Firestore rules: allow read: if true pada collection user	Siapa saja bisa baca seluruh daftar user	Batasi ke signedIn() minimal
Performance
Area	Masalah	Saran
Leaflet	Di-import via dynamic import("leaflet") tapi marker SVG di-generate inline per-render	Cache icon instances; gunakan useMemo untuk icons
Supervision polling	setInterval 15 detik untuk enumerator	Gunakan Firestore onSnapshot (sudah dipakai untuk non-enumerator)
Analytics	Dihitung client-side dari data yang dimuat	Pindahkan ke server-side aggregation pipeline
Code Quality
Area	Masalah
Type safety	Banyak as type assertion dan String() casting tanpa validasi — data dari Firestore tidak di-parse dengan Zod (padahal Zod sudah ada di package.json)
Error handling	Catch blocks sering kosong (catch {}) tanpa logging
Duplicated constants	workflowStageLabels didefinisikan di page.tsx DAN review-modals.tsx
Tailwind	Diimport tapi hampir tidak dipakai — semua styling manual via globals.css
Testing	Tidak ada file test (*.test.ts, *.spec.ts) sama sekali
Developer Experience
Area	Saran
Linting	Tambah eslint-plugin-react-hooks untuk tangkap dependency array issues
Type generation	Buat shared types untuk Firestore documents, bukan inline type per-file
ENV validation	Gunakan Zod schema untuk memvalidasi environment variables saat startup
📊 Statistik Codebase
Metrik	Nilai
Total file TypeScript/TSX	30
Total baris kode (src/)	~5.600+
page.tsx saja	2.431 baris (43% dari codebase)
globals.css	664 baris
API routes	13 endpoints
Komponen React	10 file
Library files	4
Test files	0
🏆 Verdict

Lingga adalah aplikasi yang fungsional dan ambisius — workflow-nya benar-benar memodelkan proses kerja lapangan yang kompleks, keamanannya berlapis, dan UI-nya sudah tingkat produksi. Integrasi AI untuk QC dan asisten enumerator menunjukkan visi yang jelas.

Namun, secara arsitektural aplikasi ini masih monolith dalam satu file — 2.400 baris di page.tsx membuat scaling, testing, dan maintenance sangat sulit. Ini wajar untuk fase prototipe/MVP, tapi akan menjadi bottleneck serius begitu tim atau fitur bertambah.

Prioritas Refactoring

TIP

Jika ingin mulai refactoring bertahap, langkah pertama yang paling berdampak adalah memecah page.tsx menjadi route segments terpisah dengan lazy loading per role. Ini bisa dilakukan tanpa mengubah fungsionalitas, hanya memindahkan kode.