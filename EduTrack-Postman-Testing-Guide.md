# EduTrack Backend — Panduan Testing dengan Postman

Base URL (default): `http://localhost:4000` (sesuaikan `APP_BASE_URL` kamu di Supabase/hosting).
Semua endpoint (kecuali `/health` dan `/api/auth/login`) butuh header:

```
Authorization: Bearer <token>
```

Response format selalu: `{ success, message, data }` (atau `{ success:false, message, errors }` saat gagal).

---

## 0. Kenapa tabel admin/guru/siswa kosong setelah migrasi?

Ini **bukan bug**. Kamu lihat di `schema.sql`:

- `npm run migrate` cuma menjalankan `schema.sql` → itu hanya membuat **struktur tabel** (DDL), bukan mengisi data.
- Aplikasi ini **sengaja tidak punya endpoint signup**. Satu-satunya cara membuat akun Administrator pertama adalah lewat script CLI `scripts/seed-admin.js`.
- Setelah ada 1 admin, akun Guru & Siswa baru bisa dibuat lewat endpoint `/api/admin/teachers` dan `/api/admin/students` (yang butuh login admin).

Jadi urutan wajibnya:

```bash
# di root project, .env sudah diarahkan ke DATABASE_URL Supabase kamu
npm run seed:admin -- admin@sekolah.id "katasandi-awal" "Nama Admin"
```

Kalau kamu jalankan ini langsung ke Supabase, pastikan `DATABASE_URL` di `.env` sudah pakai connection string Supabase (bukan localhost lagi), lalu jalankan dari komputer yang bisa akses (atau lewat Supabase SQL editor kalau connection pooling bermasalah — lihat catatan di bagian bawah).

Setelah itu baru tabel `administrators` terisi 1 baris, dan kamu bisa login → dari situ buat guru & siswa via API.

---

## 1. Setup Environment di Postman

Buat Postman Environment dengan variable:

| Variable | Contoh nilai |
|---|---|
| `base_url` | `http://localhost:4000` |
| `admin_token` | (diisi otomatis setelah login) |
| `teacher_token` | (diisi otomatis setelah login) |
| `student_token` | (diisi otomatis setelah login) |

Tips: di tab **Tests** pada request login, tambahkan script supaya token otomatis tersimpan:

```javascript
const body = pm.response.json();
pm.environment.set("admin_token", body.data.token);
```

(ganti `admin_token` sesuai role yang login)

---

## 2. Health Check

**GET** `{{base_url}}/health`
Tanpa auth.

Expected: `200` → `{ "status": "ok" }`

---

## 3. Auth

### 3.1 Login
**POST** `{{base_url}}/api/auth/login`
Body (JSON):
```json
{
  "identifier": "admin@sekolah.id",
  "password": "katasandi-awal"
}
```
- `identifier` = email (Admin) / NIP (Guru) / NIS (Siswa) — backend cek ketiganya berurutan.
- Response berisi `data.token`, `data.role`, `data.profile`. Simpan token ini.

Test dengan 3 akun berbeda nanti (admin, guru, siswa) setelah masing-masing dibuat.

---

## 4. Modul Admin (`/api/admin/*`)
Semua butuh `Authorization: Bearer {{admin_token}}`.

### 4.1 Tahun Ajaran & Semester
- **GET** `/api/admin/academic-years`
- **POST** `/api/admin/academic-years`
  ```json
  { "name": "2026/2027" }
  ```
- **GET** `/api/admin/semesters?academicYearId=<uuid>`
- **POST** `/api/admin/semesters`
  ```json
  { "academicYearId": "<uuid dari academic-years>", "name": "Ganjil" }
  ```
  (`name` cuma boleh `"Ganjil"` atau `"Genap"`)

### 4.2 Akun Guru
- **POST** `/api/admin/teachers`
  ```json
  { "nip": "198501012024011001", "name": "Budi Santoso" }
  ```
  Response `data.initialPassword` — password awal dibuat sistem, catat untuk login guru.
- **GET** `/api/admin/teachers?query=budi` (query opsional, search nama/NIP)
- **POST** `/api/admin/teachers/import` — `form-data`, key `file` (type: File), upload CSV kolom `Nama,NIP`
- **PATCH** `/api/admin/teachers/:id/reset-password` — tanpa body, response `data.newPassword`

### 4.3 Akun Siswa
- **POST** `/api/admin/students`
  ```json
  { "nis": "2026100123", "name": "Siti Aminah" }
  ```
- **GET** `/api/admin/students?query=siti`
- **POST** `/api/admin/students/import` — `form-data`, key `file`, CSV kolom `Nama,NIS`
- **PATCH** `/api/admin/students/:id/reset-password`

### 4.4 Template unduhan (untuk cek format import)
- **GET** `/api/admin/templates/teachers-csv`
- **GET** `/api/admin/templates/students-csv`
- **GET** `/api/admin/templates/class-students-xlsx`

### 4.5 Mata Pelajaran
- **POST** `/api/admin/subjects`
  ```json
  { "name": "Biologi", "gradeLevel": "X", "kkm": 75, "teacherId": "<uuid guru>" }
  ```
  `gradeLevel`: `X` | `XI` | `XII`. Satu guru hanya boleh 1 mapel — request kedua dengan `teacherId` sama akan `409 Conflict`.
- **GET** `/api/admin/subjects?gradeLevel=X`
- **PATCH** `/api/admin/subjects/:id`
  ```json
  { "kkm": 78 }
  ```
  atau `{ "teacherId": "<uuid guru lain>" }`

### 4.6 Kelas
- **POST** `/api/admin/classes`
  ```json
  { "name": "X IPA 3", "gradeLevel": "X", "semesterId": "<uuid semester aktif>" }
  ```
- **POST** `/api/admin/classes/:id/students/import` — `form-data`, key `file`, Excel `.xlsx` kolom `NIS` (siswa harus sudah punya akun lebih dulu, dicocokkan by NIS)
- **POST** `/api/admin/classes/:id/subjects`
  ```json
  { "subjectId": "<uuid subject>" }
  ```
  Jenjang kelas dan mapel harus sama, kalau beda → `400`.
- **PATCH** `/api/admin/classes/:id/homeroom-teacher`
  ```json
  { "teacherId": "<uuid guru>" }
  ```
- **GET** `/api/admin/classes/:id` — detail kelas + daftar siswa + daftar mapel

### 4.7 Nilai & Presensi (akses penuh admin)
- **PUT** `/api/admin/grades`
  ```json
  {
    "classId": "<uuid>",
    "subjectId": "<uuid>",
    "entries": [
      { "studentId": "<uuid siswa>", "componentCode": "T1", "score": 85 },
      { "studentId": "<uuid siswa>", "componentCode": "UTS", "score": 90 }
    ]
  }
  ```
  `componentCode` valid: `T1,T2,T3,U1,U2,U3,UTS,UAS`. `score` boleh `null` (belum ada nilai), 0-100.
- **PUT** `/api/admin/attendance-sessions/:id/records`
  ```json
  {
    "records": [
      { "studentId": "<uuid siswa>", "status": "Hadir" },
      { "studentId": "<uuid siswa>", "status": "Alpa" }
    ]
  }
  ```
  `status`: `Hadir | Izin | Sakit | Alpa`. (Session id didapat dari endpoint teacher, lihat bawah — admin belum punya endpoint buat sesi baru, hanya update.)

---

## 5. Modul Guru (`/api/teacher/*`)
Butuh `Authorization: Bearer {{teacher_token}}` (login pakai NIP).

### 5.1 Kelas saya
- **GET** `/api/teacher/classes`
- **GET** `/api/teacher/classes/:classId/students`

### 5.2 Nilai
- **GET** `/api/teacher/classes/:classId/grades` — grid siswa × 8 komponen (null kalau belum diisi)
- **PUT** `/api/teacher/classes/:classId/grades`
  ```json
  { "entries": [ { "studentId": "<uuid>", "componentCode": "T1", "score": 88 } ] }
  ```
  Ditolak `403` jika rapor kelas sudah `Finalized`/`Distributed` (lihat bagian homeroom).

### 5.3 Presensi
- **GET** `/api/teacher/classes/:classId/attendance-sessions`
- **POST** `/api/teacher/classes/:classId/attendance-sessions`
  ```json
  { "date": "2026-08-06" }
  ```
  Otomatis insert status `Alpa` untuk semua siswa di kelas itu.
- **GET** `/api/teacher/attendance-sessions/:id`
- **PUT** `/api/teacher/attendance-sessions/:id/records`
  ```json
  { "records": [ { "studentId": "<uuid>", "status": "Hadir" } ] }
  ```
- **POST** `/api/teacher/attendance-sessions/:id/mark-all-present` — tanpa body
- **DELETE** `/api/teacher/attendance-sessions/:id` — tanpa body

---

## 6. Modul Wali Kelas / Homeroom (`/api/homeroom/*`)
Guru dengan `isHomeroomOf` (dicek otomatis dari JWT saat login) ATAU admin.

- **GET** `/api/homeroom/classes/:classId/overview`
- **GET** `/api/homeroom/classes/:classId/completeness`
- **GET** `/api/homeroom/report-cards/:studentId`
- **PATCH** `/api/homeroom/report-cards/:studentId/note`
  ```json
  { "note": "Perlu bimbingan tambahan di Matematika." }
  ```
- **POST** `/api/homeroom/classes/:classId/finalize` — tanpa body, ditolak `422` kalau ada mapel belum lengkap
- **POST** `/api/homeroom/classes/:classId/distribute` — tanpa body, hanya proses yang sudah `Finalized`
- **GET** `/api/homeroom/report-cards/:studentId/download` — response file `.txt` (placeholder, belum PDF asli)

---

## 7. Modul Siswa (`/api/student/*`)
Butuh `Authorization: Bearer {{student_token}}` (login pakai NIS).

- **GET** `/api/student/grades`
- **GET** `/api/student/attendance`
- **POST** `/api/student/ai-insight` — tanpa body. Butuh `ANTHROPIC_API_KEY` terisi di `.env`; kalau gagal/timeout, response `503` (bukan bug).
- **GET** `/api/student/report-card` — kalau status rapor belum `Distributed`, hanya balikin status
- **GET** `/api/student/report-card/download` — hanya bisa kalau sudah `Distributed`, kalau belum → `403`

---

## 8. Urutan testing end-to-end yang disarankan (Postman Collection Runner)

1. `npm run seed:admin` di CLI → dapat 1 admin.
2. **Login admin** → simpan `admin_token`.
3. Admin: buat academic-year → buat semester (Ganjil) → set aktif kalau perlu dicek manual di DB (`is_active` belum ada endpoint update-nya di controller ini, hanya insert).
4. Admin: buat 1-2 akun guru → catat `initialPassword`.
5. Admin: buat beberapa akun siswa → catat `initialPassword`.
6. Admin: buat subject (assign ke guru) → buat class → hubungkan subject ke class → set homeroom teacher → import siswa ke class (via NIS).
7. **Login guru** (pakai NIP + initialPassword) → simpan `teacher_token`.
8. Guru: cek `/classes`, isi nilai, buka sesi presensi, isi presensi.
9. **Login lagi sebagai guru yang sama** (karena dia wali kelas) → cek endpoint `/homeroom/*` pakai token yang sama → cek completeness → finalize → distribute.
10. **Login siswa** (pakai NIS + initialPassword) → simpan `student_token` → cek grades, attendance, report-card, download.

---

## 9. Catatan koneksi ke Supabase

Beberapa hal yang sering bikin "tabel ada tapi query gagal / kosong terus" saat pindah ke Supabase:

- Pastikan `DATABASE_URL` di `.env` pakai **connection string dari Supabase** (Project Settings → Database), bukan bekas localhost.
- Supabase connection pooler (port `6543`, mode `pgbouncer`) kadang butuh `?pgbouncer=true` atau pakai port `5432` (direct connection) tergantung driver `pg` yang dipakai project ini. Kalau `npm run migrate` / `npm run seed:admin` gagal connect, coba pakai **direct connection string** (port 5432) dulu untuk migrasi & seeding.
- Cek juga apakah `schema.sql` benar-benar sukses jalan tanpa error (table ada ≠ pasti semua trigger/extension `pgcrypto` sukses ke-create). Kalau `pgcrypto` gagal, insert dengan `gen_random_uuid()` akan error saat kamu coba `POST`.
- Kalau mau cepat ngecek isi tabel tanpa CLI, bisa langsung lihat/insert manual lewat **Supabase Table Editor** atau **SQL Editor** — tapi untuk password admin tetap harus lewat script (karena passwordnya di-hash pakai `hashPassword()` di kode, bukan plaintext).

---

## 10. Ringkasan Postman Collection (urutan folder yang disarankan)

```
EduTrack/
├── Auth
│   └── Login (Admin / Guru / Siswa)
├── Admin
│   ├── Academic Periods
│   ├── Accounts (Teachers/Students)
│   ├── Subjects
│   ├── Classes
│   └── Grades & Attendance
├── Teacher
│   ├── Classes
│   ├── Grades
│   └── Attendance
├── Homeroom
└── Student
```

Kalau mau, saya bisa langsung buatkan file **Postman Collection JSON** (tinggal import) supaya nggak perlu bikin request satu-satu manual — tinggal bilang saja.
