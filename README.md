# EduTrack Backend (Express + PostgreSQL)

Implementasi backend MVP EduTrack (EDU-2026-001) sesuai `PRD.md`, `01-ERD.md`, `03-API-CONTRACT.md`.

## Menjalankan lokal

```bash
cp .env.example .env      # isi DATABASE_URL, JWT_SECRET, dst.
npm install
npm run migrate           # menjalankan src/db/schema.sql ke PostgreSQL
npm run harden:security   # wajib untuk project Supabase existing
npm run audit:db          # audit struktur, relasi data, privilege, RLS, dan indeks
npm run seed:admin -- admin@sekolah.id "katasandi-awal" "Nama Admin"
npm run smoke             # uji health, CORS, auth guard, dan baca database via API
npm run dev                # http://localhost:4000
```

Untuk project Supabase existing/hasil duplikasi, **jangan** jalankan `migrate`
atau `seed:admin`. Gunakan urutan berikut agar data lama dipertahankan:

```bash
npm run reconcile:schema
npm run migrate:assessment-topics
npm run harden:security
npm run audit:db
npm run smoke
npm run smoke:assessment-topics
npm run dev
```

Cek server hidup: `GET /health` → `{ "status": "ok" }`.

## Struktur folder

```
src/
  app.js, server.js        entry point Express
  config/env.js             baca .env
  db/
    schema.sql              DDL (identik dengan dokumen 02-schema.sql)
    pool.js                 pg Pool + helper transaksi
    migrate.js               jalankan schema.sql
    reconcile.js             selaraskan tipe/default/constraint database legacy
    reconcile-legacy-schema.sql migrasi idempoten tanpa menghapus data
    audit.js                 audit read-only struktur, data, dan keamanan database
    addAssessmentTopics.js   migrasi idempoten tabel topik untuk database existing
    harden.js                tutup Data API, aktifkan RLS, verifikasi keamanan
    security-hardening.sql   hardening idempotent untuk database existing
  middleware/
    auth.js                  verifikasi JWT -> req.user
    roleGuard.js              requireRole(), requireHomeroomOf()
    upload.js                 multer (memory storage)
    errorHandler.js
  utils/
    AppError.js, response.js, jwt.js, password.js, asyncHandler.js
  services/                  logika bisnis lintas modul
    grades.service.js
    assessmentTopics.service.js validasi dan simpan topik per kelas/mapel/komponen
    attendance.service.js
    completeness.service.js  cek kelengkapan nilai per mapel (dipakai homeroom + finalisasi)
    reportCardLock.service.js kunci nilai/presensi setelah rapor Final (§9)
    aiInsight.service.js      panggil Gemini API untuk tombol Suggestion (§8.5)
  modules/
    auth/        POST /api/auth/login
    admin/        seluruh /api/admin/*
    teacher/       seluruh /api/teacher/*
    homeroom/      seluruh /api/homeroom/* (Guru dengan status Wali Kelas)
    student/       seluruh /api/student/*
scripts/seed-admin.js   buat akun Administrator pertama (tidak ada endpoint signup)
```

## Keputusan implementasi penting (selaras dengan PRD)

- **Role Wali Kelas bukan akun terpisah.** Saat login, backend mengecek
  `classes.homeroom_teacher_id`; hasilnya masuk klaim JWT `isHomeroomOf: [classId, ...]`.
  Endpoint `/api/homeroom/*` memvalidasi klaim ini (lihat `middleware/roleGuard.js` dan
  `homeroom.controller.js`), Administrator selalu boleh menembus.
- **Nilai kosong disimpan sebagai `NULL`, bukan 0** (`grades.score`). Endpoint kelengkapan
  (`GET /homeroom/classes/:classId/completeness`) menghitung baris `NULL` sebagai belum lengkap.
- **Sesi presensi selalu lengkap sejak dibuka** — `attendance.service.js#createSession`
  membungkus insert sesi + insert status `Alpa` untuk seluruh siswa kelas dalam satu transaksi.
- **Kunci setelah finalisasi** — `reportCardLock.service.js` dipanggil di setiap endpoint
  simpan nilai/presensi milik Guru & Wali Kelas; ditolak (403) jika `report_cards.status`
  kelas tsb bukan `Draft`. Endpoint Admin (`/api/admin/grades`, dst.) tidak dibatasi ini.
- **AI Insight tidak pernah ditulis ke DB** — `aiInsight.service.js` murni baca data lalu
  panggil Gemini API; kegagalan (timeout/API error) dikembalikan sebagai `503`, tidak
  melempar 500 supaya jelas ini bukan bug backend (§8.6 poin 7).
- **Templat komponen nilai (T1-T3, U1-U3, UTS, UAS) sudah di-seed lewat `schema.sql`**
  (lihat `INSERT INTO assessment_components`) — tidak ada endpoint untuk mengubahnya di MVP.
- **Topik penilaian disimpan per kelas dan mata pelajaran.** Guru pengampu membaca/menyimpan
  seluruh 8 topik melalui `GET/PUT /api/teacher/classes/:classId/assessment-topics`.
  Siswa membaca topik mapelnya melalui `GET /api/student/assessment-topics`; kolom `topic`
  juga ikut pada `GET /api/student/grades` dan menjadi konteks baca AI Insight.

## Yang belum diimplementasikan (di luar cakupan MVP / perlu keputusan lanjutan)

- Generate PDF rapor sungguhan — endpoint download saat ini mengirim ringkasan teks polos
  sebagai placeholder (lihat catatan di `00-RINGKASAN-MEETING.md`, perlu desain layout dulu).
- Rate limiting endpoint login (disebut di `04-ENV.md` tapi belum dipasang sebagai middleware;
  tambahkan `express-rate-limit` bila diperlukan sebelum production).
