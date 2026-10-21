# Tower-Defense

Game tower defense yang kini hadir dalam **versi web modern** (folder [`web/`](web/)), selain proyek Unity 2018 aslinya.

## Versi Web (baru) — TypeScript + Vite + HTML5 Canvas

Bisa dimainkan langsung di browser (desktop & mobile), bisa dipasang sebagai aplikasi (PWA), dan tetap bisa dimainkan offline.

### Fitur

- **4 jenis tower** dengan 3 level upgrade:
  - **Blaster**: tembakan cepat, target tunggal
  - **Frost**: memperlambat musuh dalam area
  - **Sniper**: jangkauan jauh dan menembus armor
  - **Rocket**: ledakan area
- **Upgrade & jual tower**, dengan panel info yang menampilkan perubahan statistik.
- **Mode target**: Terdepan / Terbelakang / Terkuat / Terdekat.
- **20 gelombang** yang makin sulit, dengan 4 jenis musuh (Scout, Swarm, Tank berarmor, dan Boss setiap 5 gelombang), lalu **mode Endless** setelah menang.
- **Ekonomi emas**: hadiah per musuh, bonus akhir gelombang, dan bonus kalau memanggil gelombang lebih awal.
- **Preview gelombang berikutnya** dan opsi **auto-wave**.
- Kecepatan **1× / 2× / 3×**, jeda, dan jeda otomatis saat tab tidak aktif.
- Penempatan tower dengan **klik/ketuk** atau **drag & drop** seperti versi asli, lengkap dengan preview jangkauan.
- Efek visual: partikel, angka damage melayang, ledakan, dan guncangan layar (otomatis dikurangi kalau sistem memakai *reduced motion*).
- Audio Web Audio API: SFX asli ditambah efek suara sintetis, dengan tombol mute.
- Rekor skor dan pengaturan disimpan di `localStorage`.
- UI responsif bergaya glassmorphism, render tajam di layar HiDPI, dan dukungan sentuh.

### Kontrol

| Tombol | Aksi |
| --- | --- |
| `1`–`4` | Pilih tower |
| Klik / ketuk | Pasang tower / pilih tower (tahan `Shift` untuk memasang beberapa sekaligus) |
| Klik kanan / `Esc` | Batal / menu |
| `Spasi` | Jeda |
| `F` | Ganti kecepatan |
| `N` | Gelombang berikutnya |
| `U` / `S` / `T` | Upgrade / jual / ganti mode target tower terpilih |
| `G` | Tampilkan grid |
| `M` | Mute |
| `R` | Mulai ulang |

### Menjalankan

```bash
cd web
npm install
npm run dev      # server pengembangan
npm test         # unit test (Vitest)
npm run build    # build produksi ke web/dist
```

Workflow `.github/workflows/deploy-web.yml` menjalankan test, build, lalu deploy ke **GitHub Pages** setiap kali ada push ke `main`. Aktifkan di *Settings → Pages → Source: GitHub Actions*.

## Versi Unity (lama)

Proyek Unity 2018.4 asli masih ada di folder `Assets/`, dan build Windows-nya di `Build/`.

Cara bermain:

1. Tarik tower ke tempat yang sudah disediakan.
2. Tunggu sampai musuh mati.
3. Tower ketiga lebih kuat dan punya kekuatan lebih.
