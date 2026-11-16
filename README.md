# Sport Louvre

Dasbor analisis nilai pasar pemain sepak bola dari lima liga top Eropa. Proyek ini mengklasifikasikan tren harga pemain dengan **Decision Tree** dan memprediksi nilai pasar berikutnya dengan **Regresi Linear**, lalu membandingkan keduanya dengan model lain dan dengan tebakan tanpa model.

Situs: <https://sport.louvre.my.id>

## Isi dasbor

| Tab | Isi |
| --- | --- |
| Arena | Ringkasan hasil, perbandingan jenis model, dan contoh kebocoran data |
| Diagnostik | Confusion matrix, grafik aktual vs prediksi, validasi berlapis, tabel 484 pemain uji |
| Kesalahan | Sebaran dan contoh tebakan yang paling meleset |
| Tren Karir | Riwayat nilai pasar tiap pemain |
| Simulator | Prediksi harga dan tren untuk pemain pilihan |
| Rekomendasi | Kandidat beli dan risiko turun, proyeksi 12 bulan |
| Penjelasan | Alur kerja dari CSV sampai model, penjelasan model, diagram Decision Tree |
| Dataset | Dataset dan sumbernya, model dan workflow, hasil pengujian, laporan PDF |

## Data

- 2.418 pemain dan 47.903 catatan nilai pasar sejak 2004, semuanya dari Transfermarkt.
- 508 pemain dari set awal "Football Player Market Value Trajectories", sisanya dari [salimt/football-datasets](https://github.com/salimt/football-datasets).
- Posisi 508 pemain lama diperbaiki (kolomnya bergeser); 16 di antaranya diisi dari [dcaribou/transfermarkt-datasets](https://github.com/dcaribou/transfermarkt-datasets).
- Kolom ringkasan CSV seperti `peak_value_eur` tidak dipakai sebagai fitur karena memuat jawaban.

## Model dan hasil

Diuji pada 484 pemain (20%) yang tidak pernah dilihat saat melatih. Pembagian dilakukan per pemain.

**Klasifikasi tren (empat kelas: naik, stabil, menurun, jatuh tajam)**

| Model | Akurasi | Macro-F1 |
| --- | ---: | ---: |
| **Decision Tree (model utama)** | 85,1% | 0,681 |
| Gradient boosting ordinal | 85,1% | 0,716 |
| Gradient boosting | 84,5% | 0,724 |
| Random forest | 84,3% | 0,687 |
| Regresi logistik | 84,3% | 0,675 |
| Tanpa model (tren dianggap tetap) | 82,8% | 0,694 |

**Prediksi nilai pasar pada pembaruan berikutnya**

| Model | Galat median | MAE | R² log |
| --- | ---: | ---: | ---: |
| **Regresi linear (model utama)** | 13,6% | €1,85 jt | 0,970 |
| Regresi ridge | 13,8% | €1,84 jt | 0,969 |
| Gradient boosting | 11,3% | €1,65 jt | 0,972 |
| Tanpa model (harga dianggap tetap) | 12,5% | €1,63 jt | 0,961 |

Decision Tree dan Regresi Linear menjadi model utama karena ketentuan tugas, bukan karena skornya paling tinggi. Decision Tree hanya sedikit di atas tebakan tanpa model, dan Regresi Linear belum mengalahkannya. Tab Simulator memakai gradient boosting, yang diunggulkan validasi silang.

Proyeksi 12 bulan memberi hasil paling berguna: 83% perkiraan "naik" terbukti benar, dibandingkan 48% pada pemilihan acak.

## Teknologi

- **Backend**: Python 3.12, FastAPI, scikit-learn 1.6.1 (`backend/`)
- **Frontend**: Next.js 16, React 19, Tailwind CSS v4, ECharts, TanStack Query (`frontend/`)
- **Deploy**: Docker Compose (api, web, Caddy) di belakang Cloudflare Tunnel

## Menjalankan

```sh
deploy/build.sh              # build image api dan web
docker compose up -d         # dasbor di http://127.0.0.1:8310
```

Saat pertama kali jalan, API melatih model sekitar 8 menit lalu menyimpannya di volume `model_cache`. Model dilatih ulang hanya kalau data atau kode pipeline berubah.

```sh
deploy/test.sh                        # 47 tes backend di dalam image api
python3 scripts/build_report_pdf.py   # buat ulang laporan PDF dari angka API (butuh Google Chrome)
```

## Struktur

```
backend/     API, pipeline ML (features.py, ml_pipeline.py, evaluation.py), tes, laporan
frontend/    Aplikasi Next.js
data/        CSV dan parquet Transfermarkt
scripts/     Perbaikan data, pengambilan media, pembuat laporan PDF
deploy/      Skrip build, tes, dan pretrain
```

Dokumen lain: [ARCHITECTURE.md](ARCHITECTURE.md), [API_CONTRACT.md](API_CONTRACT.md).

## Batasan

- Data tidak memuat performa, cedera, maupun kontrak.
- Yang diprediksi adalah taksiran Transfermarkt, bukan harga transfer.
- Rentang harga terlalu sempit untuk pemain di atas €50 juta.
