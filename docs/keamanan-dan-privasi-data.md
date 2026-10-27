# Keamanan & Privasi Data — XORCA Talent Intelligence

Dokumen ini merangkum cara XORCA Talent Intelligence melindungi data pelamar. Isinya hanya mencantumkan
perlindungan yang **sudah berjalan** di prototipe. Hal yang masih direncanakan untuk produksi ditandai
**Rencana produksi**. Isi yang sama dapat dilihat di aplikasi pada menu **Settings → Security & privacy**.

## 1. Akses & autentikasi

- Akses ke API HR dikendalikan oleh sistem pusat: login, autentikasi, dan hak akses pengguna HR ditangani
  oleh sistem pusat, bukan oleh layanan ini.
- API ini wajib berada di belakang API gateway sistem pusat / di jaringan privat dan **tidak boleh dibuka
  langsung ke internet publik**. Browser hanya diizinkan dari asal (origin) yang terdaftar (CORS).
- Header `X-Actor-Name` (dan `X-Actor-Id`) yang diteruskan sistem pusat hanya dipakai untuk mencatat siapa
  yang melakukan aksi di log audit — bukan untuk memberi izin akses.
- Rute untuk pelamar (formulir lamaran publik dan AI interview) tetap dilindungi tersendiri: batas
  pengiriman & anti-bot untuk formulir, serta token undangan untuk interview.

## 2. Perlindungan dokumen CV

- File CV disimpan privat di server — tidak ada link publik untuk mengunduhnya.
- Isi file divalidasi: file harus benar-benar PDF atau DOCX (dicek dari isinya, bukan hanya nama file).
- Ukuran maksimal 10 MB per file.

## 3. Link AI interview

- Setiap kandidat mendapat token unik; sistem hanya menyimpan hash-nya, bukan token aslinya.
- Link berlaku 72 jam (dapat diatur per template interview) dan dapat dicabut oleh HR kapan saja.
- Token disensor di log email.
- Kamera & mikrofon tidak direkam — yang disimpan hanya transkrip teks jawaban.

## 4. Formulir lamaran

- Pelamar wajib menyetujui pemberitahuan privasi (consent) sebelum mengirim lamaran.
- Jumlah pengiriman dibatasi per jaringan (alamat IP) per jam.
- Perlindungan anti-bot (kolom jebakan yang hanya diisi oleh bot).

## 5. AI yang adil & dapat dijelaskan

- Skor CV dihitung dengan aturan yang transparan; bobot penilaian terlihat dan dapat diatur di Pengaturan.
- AI tidak pernah menolak kandidat secara otomatis — keputusan akhir selalu oleh HR.
- AI interview dilarang menanyakan usia, agama, suku, status pernikahan, dan kesehatan.
- Setiap penilaian interview wajib disertai kutipan bukti dari jawaban kandidat; penilaian tanpa bukti yang
  terverifikasi tidak diberi skor.

## 6. Jejak audit

- Aksi penting tercatat: siapa, apa, dan kapan. "Siapa" diambil dari header `X-Actor-Name` yang dikirim
  sistem pusat (bawaan: `HR` bila tidak dikirim).
- Setelah data kandidat dihapus, catatan audit hanya menyimpan jumlah data yang dihapus — tanpa data pribadi.

## 7. Hak subjek data (UU PDP)

- HR dapat menghapus kandidat secara tuntas: file CV, skor, review, transkrip interview, dan log email.
- **Retensi otomatis:** HR dapat mengaktifkan penghapusan otomatis data pelamar N bulan (1–36, bawaan 12)
  setelah lowongan ditutup, dengan pilihan tetap menyimpan data kandidat yang diterima. Proses berjalan setiap
  hari pukul 02:00 WIB. Kandidat dengan AI interview yang sedang berjalan tidak ikut dihapus. Fitur ini
  **nonaktif secara bawaan**; status terkini (aktif/nonaktif dan jumlah bulan) terlihat di aplikasi.

## 8. Keamanan server

Setiap respons API mengirim security headers:

- `Content-Security-Policy`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- `Permissions-Policy` (kamera & mikrofon hanya untuk aplikasi ini)
- `Cross-Origin-Opener-Policy`
- `Cache-Control: no-store` (data pribadi tidak disimpan di cache browser)
- `Strict-Transport-Security` (saat HTTPS)

Rahasia dan API key hanya disimpan di server, tidak pernah dikirim ke browser.

## 9. Pihak ketiga (transparan)

- Teks CV dan transkrip interview diproses oleh penyedia AI (Groq, Google Gemini).
- Suara pewawancara AI dibuat oleh layanan text-to-speech Google.
- Pengenal suara bawaan browser (Chrome) memproses audio jawaban kandidat di server Google.
- Prototipe ini memakai layanan tingkat gratis (free tier).

## 10. Rencana produksi

> Belum aktif di prototipe.

- HTTPS/TLS di semua koneksi
- Enkripsi database & file (at rest)
- Deploy di region Jakarta atau di server klien (sesuai UU PDP)
- Layanan AI enterprise tanpa pemakaian data untuk training, atau model self-hosted
- Backup terenkripsi
- Pentest & sertifikasi ISO 27001
- SSO / 2FA melalui sistem pusat
