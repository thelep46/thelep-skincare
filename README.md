# THELEP FINANCE — Smart Finance Dashboard

Aplikasi finance siap deploy ke **Cloudflare Pages + Pages Functions** dengan **Google Sheets sebagai sumber data utama**. Frontend tidak menyimpan data transaksi di `localStorage`; seluruh CRUD transaksi dikirim ke backend `_worker.js`, lalu backend membaca/menulis Google Sheets.

## Struktur Project

```text
/
├── _worker.js
├── index.html
├── dashboard-unified.html
├── transaksi.html
├── saldo-akun.html
├── kas-bank.html
├── hutang.html
├── piutang.html
├── jurnal.html
├── akun.html
├── entitas.html
├── kategori.html
├── metode-pembayaran.html
├── pengaturan.html
├── assets/css/app.css
└── assets/js/
    ├── api.js
    ├── app.js
    ├── format.js
    └── utils.js
```

## Environment Variables Cloudflare

Set di Cloudflare Pages → Settings → Environment variables:

| Variable | Keterangan |
| --- | --- |
| `GOOGLE_SHEET_ID` | ID spreadsheet Google Sheets. |
| `GOOGLE_CLIENT_EMAIL` | Email service account Google Cloud. |
| `GOOGLE_PRIVATE_KEY` | Private key service account, boleh berisi `\n`. |

Jangan menaruh secret di HTML/JS frontend.

## Google Sheets Configuration

Bagikan spreadsheet ke `GOOGLE_CLIENT_EMAIL` dengan role **Editor**. Buat sheet berikut dengan header baris pertama:

### ENTITAS
`idEntitas, namaEntitas, jenisEntitas, status, keterangan`

### AKUN
`idAkun, idEntitas, kodeAkun, namaAkun, tipeAkun, subtipe, saldoAwal, tanggalSaldoAwal, status, keterangan`

### TRANSAKSI
`idTransaksi, tanggal, noTransaksi, idEntitas, tipeTransaksi, idKategori, keterangan, nominal, idMetode, akunDebit, akunKredit, pihak, jatuhTempo, status, idTransaksiTerkait, entitasTujuan, akunTujuan, referensi, catatan, createdAt, updatedAt`

### KATEGORI
`idKategori, namaKategori, tipeTransaksi, status, keterangan`

### METODE_PEMBAYARAN
`idMetode, namaMetode, status, keterangan`

### Sheet laporan opsional
Backend menghitung laporan secara realtime dari `AKUN` dan `TRANSAKSI`, tetapi sheet berikut tetap didokumentasikan untuk kompatibilitas: `JURNAL`, `HUTANG`, `PIUTANG`, `PENGATURAN`, `RINGKASAN_PERIODE`, `SALDO_AKUN`, `KAS_BANK`.

## Menjalankan Lokal

```bash
npx wrangler pages dev .
```

Pastikan environment variable tersedia saat menjalankan lokal, misalnya melalui `.dev.vars` yang tidak di-commit.

## Deployment Cloudflare Pages

1. Buat project Cloudflare Pages dari repository ini.
2. Build command: kosongkan.
3. Build output directory: `/` atau root project.
4. Tambahkan environment variables.
5. Deploy.

## API Endpoints

Semua response konsisten:

```json
{ "ok": true, "message": "OK", "data": {} }
```

atau:

```json
{ "ok": false, "message": "...", "error": "..." }
```

Endpoint tersedia:

- `GET /api/health`
- `GET /api/dashboard`
- `GET /api/transaksi`
- `POST /api/transaksi`
- `PUT /api/transaksi/:id`
- `DELETE /api/transaksi/:id`
- `GET /api/akun`
- `GET /api/entitas`
- `GET /api/kategori`
- `GET /api/metode-pembayaran`
- `GET /api/saldo-akun`
- `GET /api/kas-bank`
- `GET /api/hutang`
- `GET /api/piutang`
- `GET /api/jurnal`

Filter transaksi mendukung query `q`, `dari`, `sampai`, `idEntitas`, `tipeTransaksi`, dan `idKategori`.

## Logika Nominal dan Debit/Credit

- Backend menjalankan `normalizeAmount(value)` sebelum menyimpan nominal.
- Nilai seperti `500000`, `"500.000"`, `"Rp 500.000"`, dan `"Rp 1.500.000"` disimpan sebagai number.
- Frontend hanya memformat Rupiah untuk tampilan melalui `formatRupiah()` dan `parseNominal()`.
- Backend menghitung jurnal dari `akunDebit` dan `akunKredit`, bukan dari teks tampilan frontend.

## Cara Testing CRUD

Dengan Pages dev aktif dan kredensial Google valid:

```bash
curl http://localhost:8788/api/transaksi
curl -X POST http://localhost:8788/api/transaksi -H 'content-type: application/json' -d '{"tanggal":"2026-08-12","idEntitas":"E001","tipeTransaksi":"Pengeluaran","idKategori":"K001","nominal":"Rp 500.000","akunKredit":"A001","keterangan":"TEST CRUD THELEP FINANCE","status":"Selesai"}'
curl -X PUT http://localhost:8788/api/transaksi/TRX-YYYYMMDD-0001 -H 'content-type: application/json' -d '{"nominal":750000}'
curl -X DELETE http://localhost:8788/api/transaksi/TRX-YYYYMMDD-0001
```

Setelah POST/PUT/DELETE, frontend otomatis refresh data dari backend.

## Debugging

- Jika UI menampilkan error koneksi, cek response JSON endpoint API di browser DevTools atau `curl`.
- Jika backend menampilkan `Environment variable ... belum diatur`, periksa Cloudflare environment variables.
- Jika Google auth gagal, periksa private key, service account email, dan akses sharing spreadsheet.
- Jika nominal menjadi tidak sesuai, uji `parseNominal()` di `assets/js/format.js` dan `normalizeAmount()` di `_worker.js`.
