"""Build backend/reports/laporan_analisis.pdf, the three-page analysis report.

Every figure is read from the running API, so the report cannot drift from the site.
Needs Google Chrome for the HTML -> PDF step and nothing outside the standard library.

Usage: python3 scripts/build_report_pdf.py [--api http://127.0.0.1:8310]
"""

from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "backend" / "reports" / "laporan_analisis.pdf"

CSS = """
@page { size: A4; margin: 17mm 18mm 16mm; }
* { box-sizing: border-box; }
body { font: 10.2pt/1.5 "Helvetica Neue", Helvetica, Arial, sans-serif; color: #111; margin: 0; }
h1 { font-size: 19pt; line-height: 1.2; margin: 0 0 3pt; letter-spacing: -0.01em; }
h2 { font-size: 12.5pt; margin: 15pt 0 5pt; break-after: avoid; }
p { margin: 0 0 6pt; }
ul { margin: 0 0 6pt; padding-left: 14pt; }
li { margin-bottom: 2.5pt; }
.meta { color: #555; font-size: 9.2pt; margin-bottom: 10pt; }
table { width: 100%; border-collapse: collapse; margin: 4pt 0 8pt; font-size: 9.6pt; break-inside: avoid; }
th { text-align: left; font-weight: 600; color: #444; border-bottom: 1pt solid #111; padding: 3pt 6pt 3pt 0; }
td { border-bottom: 0.5pt solid #d8d8d8; padding: 3.5pt 6pt 3.5pt 0; vertical-align: top; }
td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; padding-right: 0; white-space: nowrap; }
.lead { font-size: 10.8pt; }
.note { color: #555; font-size: 9pt; }
.good { color: #1b7a45; font-weight: 600; }
.flat { color: #555; }
"""


def get(api: str, path: str) -> dict:
    with urllib.request.urlopen(f"{api}/api/{path}", timeout=120) as res:
        return json.load(res)


def pct(x: float, digits: int = 1) -> str:
    return f"{x * 100:.{digits}f}".replace(".", ",") + "%"


def num(x: float) -> str:
    return f"{round(x):,}".replace(",", ".")


def eur_m(x: float) -> str:
    return "€" + f"{x / 1e6:.2f}".replace(".", ",") + " jt"


def build_html(o: dict, preds: dict) -> str:
    ds, card, mc = o["dataset"], o["data_card"], o["model_card"]
    rep = ds["repairs"]
    trend = o["classification"]["trend"]
    th = trend["headline"]
    cv = trend["validation"]["group_kfold"]
    best_clf = trend["best_model"]
    fc = o["regression"]["tasks"]["forecast"]
    fund = o["regression"]["tasks"]["fundamental"]
    fm, naive = fc["headline"]["metrics"], fc["headline"]["naive_last_value"]
    oot = o["out_of_time"]
    oot_set = oot["sets"]["unseen_players_future"]
    oot_trend = oot_set["classification"][best_clf]["trend"]
    oot_base = oot_set["classification"]["Persistence (last state)"]["trend"]
    ov = preds["outlook"]["validation"]
    counts = preds["outlook"]["signal_counts"]
    simple = o["simple_models"]
    lin, tree = simple["linear_regression"], simple["decision_tree"]
    by_name = {m["name"]: m for m in trend["models"]}
    reg_by_name = {m["name"]: m for m in fc["models"]}
    leak_best = max(
        (m for m in o["classification"]["leakage_mode"]["models"] if not m["name"].startswith("Persistence")),
        key=lambda m: m["accuracy"],
    )

    clf_rows = "".join(
        f"<tr><td>{label}</td><td class='n'>{pct(by_name[key]['accuracy'])}</td></tr>"
        for key, label in [
            ("Ordinal HGB (calibrated)", "Gradient boosting berurutan (dipakai)"),
            ("Decision Tree", "Pohon keputusan"),
            ("HistGradientBoosting (calibrated)", "Gradient boosting biasa"),
            ("Logistic Regression", "Regresi logistik"),
            ("Random Forest", "Random forest"),
            ("Persistence (last state)", "Tanpa model: tren dianggap tidak berubah"),
        ]
        if key in by_name
    )
    reg_rows = "".join(
        f"<tr><td>{label}</td><td class='n'>{pct(reg_by_name[key]['medape'])}</td>"
        f"<td class='n'>{reg_by_name[key]['r2_log']:.3f}".replace(".", ",") + "</td></tr>"
        for key, label in [
            ("HistGradientBoosting (log)", "Gradient boosting (dipakai)"),
            ("Linear Regression (log)", "Regresi linear"),
            ("Ridge (log)", "Regresi ridge"),
            ("Naive (last value)", "Tanpa model: harga dianggap tidak berubah"),
        ]
        if key in reg_by_name
    )

    return f"""<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Laporan analisis Sport Louvre</title>
<style>{CSS}</style></head><body>

<h1>Menebak nilai pasar pemain sepak bola dari riwayat harganya</h1>
<p class="meta">Laporan analisis Sport Louvre · sport.louvre.my.id · model versi {mc['version'][:7]}, dilatih {mc['trained_at'][:10]} ·
data per {card['data_as_of']}</p>

<p class="lead">Laporan ini menjawab satu pertanyaan: seberapa jauh riwayat nilai pasar seorang pemain bisa dipakai untuk menebak
nilainya nanti. Jawabannya: untuk satu update harga ke depan, model hampir tidak lebih baik daripada menganggap harga tetap.
Untuk arah harga setahun ke depan, model jelas berguna: {round(ov['buy']['went_up'] * 10)} dari 10 perkiraan "naik" terbukti
benar, lawan {round(ov['base_rate']['up'] * 10)} dari 10 kalau memilih acak.</p>

<h2>1. Data dan sumbernya</h2>
<p>Data berisi {num(ds['total_players'])} pemain yang aktif di lima liga top Eropa ({", ".join(ds['leagues'])}) dan
{num(card['valuation_points'])} valuasi sejak {card['first_valuation'][:4]}. Semua nilai berasal dari Transfermarkt. Nilai itu
taksiran komunitas dan editor, bukan harga transfer.</p>
<table>
<tr><th>Berkas</th><th>Isi</th><th class="n">Baris</th></tr>
<tr><td>transfermarkt_player_values.csv</td><td>Satu baris per pemain, 36 kolom profil dan ringkasan karier</td><td class="n">{num(ds['total_players'])}</td></tr>
<tr><td>transfermarkt_value_history.csv</td><td>Satu baris per valuasi: tanggal, nilai, klub, usia</td><td class="n">{num(ds['history_rows'])}</td></tr>
</table>
<p>Sumber: 508 pemain dari set awal "Football Player Market Value Trajectories", sisanya dari salimt/football-datasets
(salinan data Transfermarkt di GitHub). Posisi 16 pemain diambil dari dcaribou/transfermarkt-datasets.</p>
<p>Dua masalah data ditemukan dan diperbaiki sebelum melatih:</p>
<ul>
<li><b>Kolom bergeser pada {num(rep['legacy_rows_with_broken_position'])} pemain lama.</b> Kolom posisi berisi nilai euro dan
kolom klub berisi negara. Posisi diisi ulang dari dua sumber di atas, klub dan usia dari valuasi terakhir.
{num(rep['history_rows_dropped_nonpositive'])} valuasi bernilai nol dibuang.</li>
<li><b>Kolom ringkasan membocorkan jawaban.</b> Kolom seperti peak_value_eur dihitung dari seluruh riwayat, termasuk harga yang
sedang ditebak. Model yang diberi kolom itu tampak benar {pct(leak_best['accuracy'], 0)}, angka yang tidak mungkin dicapai untuk
pemain yang harganya belum keluar. Karena itu tidak ada kolom ringkasan yang dipakai sebagai fitur.</li>
</ul>

<h2>2. Metode</h2>
<p>Riwayat tiap pemain dipotong menjadi soal: semua valuasi sebelum suatu update menjadi bahan, harga di update itu menjadi
jawaban. Cara ini menghasilkan {num(ds['panel_rows'])} soal, dan {num(ds['train_rows'])} di antaranya (update sejak 2021 milik
pemain latih) dipakai melatih. Dari bahan itu dihitung {len(fc['features'])} fitur, misalnya harga terakhir, jarak dari nilai
puncak, arah perubahan terakhir, usia, posisi, dan liga.</p>
<ul>
<li><b>Pembagian data.</b> {num(ds['test_size'])} pemain (20%) disisihkan sebagai pemain uji. Pembagian dilakukan per pemain,
bukan per baris, supaya model tidak diuji pada pemain yang sudah dikenalnya.</li>
<li><b>Klasifikasi tren.</b> Tiap pemain masuk satu dari empat kelompok menurut jarak harganya dari nilai puncak: naik atau
dekat puncak (turun kurang dari 20%), stabil (20 sampai 30%), menurun (30 sampai 60%), jatuh tajam (lebih dari 60%).</li>
<li><b>Prediksi harga.</b> Model menebak pergeseran dari harga terakhir dalam skala log, lalu memberi rentang yang dikoreksi
supaya 8 dari 10 harga asli masuk di dalamnya.</li>
<li><b>Proyeksi 12 bulan.</b> Model terpisah menebak peluang harga naik atau turun lebih dari 5% setahun kemudian. Pemain
hanya ditandai kalau peluangnya minimal 70%.</li>
<li><b>Pemilihan model.</b> Kandidat dibandingkan lewat validasi silang 5 lipatan di pemain latih. Data uji tidak dipakai
untuk memilih.</li>
</ul>

<h2>3. Hasil pengujian</h2>
<p>Semua angka di bawah dihitung pada {num(ds['test_size'])} pemain uji, masing-masing di update harga terakhirnya.</p>
<table>
<tr><th>Klasifikasi tren (empat kelompok)</th><th class="n">Tebakan benar</th></tr>
{clf_rows}
</table>
<table>
<tr><th>Prediksi harga berikutnya</th><th class="n">Meleset tengah</th><th class="n">R² log</th></tr>
{reg_rows}
</table>
<p class="note">Meleset tengah: separuh tebakan meleset kurang dari angka itu. Makin kecil makin baik.</p>
<table>
<tr><th>Pemeriksaan lain</th><th class="n">Model</th><th class="n">Pembanding</th></tr>
<tr><td>Tren, validasi silang 5 lipatan (rata-rata)</td><td class="n">{pct(cv[best_clf]['accuracy_mean'])} ± {f"{cv[best_clf]['accuracy_std'] * 100:.1f}".replace('.', ',')}</td><td class="n">{pct(cv['Persistence (last state)']['accuracy_mean'])}</td></tr>
<tr><td>Tren, uji ke masa depan ({num(oot_set['rows'])} update sejak {oot['cutoff']})</td><td class="n">{pct(oot_trend['accuracy'])}</td><td class="n">{pct(oot_base['accuracy'])}</td></tr>
<tr><td>Harga, galat rata-rata dalam euro</td><td class="n">{eur_m(fm['mae'])}</td><td class="n">{eur_m(naive['mae'])}</td></tr>
<tr><td>Rentang harga 80%: porsi harga asli yang masuk</td><td class="n">{pct(fc['intervals']['holdout']['coverage'])}</td><td class="n">target 80%</td></tr>
<tr><td>Proyeksi 12 bulan: perkiraan "naik" yang benar ({ov['buy']['n']} pemain)</td><td class="n">{pct(ov['buy']['went_up'])}</td><td class="n">{pct(ov['base_rate']['up'])}</td></tr>
<tr><td>Proyeksi 12 bulan: perkiraan "turun" yang benar ({ov['depreciation_risk']['n']} pemain)</td><td class="n">{pct(ov['depreciation_risk']['went_down'])}</td><td class="n">{pct(ov['base_rate']['down'])}</td></tr>
</table>
<p class="note">Proyeksi 12 bulan diuji pada {num(ov['test_rows'])} soal sejak {ov['cutoff']}, dengan model yang hanya dilatih
pada data sebelum tanggal itu.</p>

<h2>4. Temuan</h2>
<ul>
<li><b>Tren hampir tidak berubah dalam satu update.</b> Menganggap tren tetap sudah benar {pct(th['persistence']['accuracy'])}.
Model menambah {th['gain_vs_persistence']['accuracy_pp']:.1f} poin, selisih yang masih di sekitar batas kebetulan. Pohon keputusan
tiga tingkat mencapai {pct(tree['accuracy_test'])} hanya dengan menemukan ulang batas kelompoknya sendiri.</li>
<li><b>Harga berikutnya sulit dikalahkan.</b> Gradient boosting meleset tengah {pct(fm['medape'])}, lawan {pct(naive['medape'])}
tanpa model. Dalam euro model malah sedikit kalah ({eur_m(fm['mae'])} lawan {eur_m(naive['mae'])}), terutama pada pemain di atas
€50 juta. Regresi linear dan ridge kalah dari tebakan tanpa model.</li>
<li><b>Nilai model ada di arah setahun ke depan.</b> Perkiraan "naik" benar {pct(ov['buy']['went_up'], 0)} dan "turun" benar
{pct(ov['depreciation_risk']['went_down'], 0)}, kira-kira dua kali tebakan acak. Dari {num(ds['total_players'])} pemain, model
menandai {counts['Buy']} sebagai kandidat naik dan {counts['DepreciationRisk']} sebagai risiko turun. Sisanya tidak cukup jelas.</li>
<li><b>Posisi dan liga terbaca di harga.</b> Regresi linear dari usia, posisi, dan liga menunjukkan gelandang dan penyerang
dihargai sekitar tiga kali kiper pada usia dan liga yang sama, dan harga memuncak di usia {str(lin['peak_age']).replace('.', ',')}
tahun. Tiga hal itu hanya menjelaskan {round(lin['r2_log_test'] * 100)}% perbedaan harga antar pemain.</li>
</ul>

<h2>5. Batasan</h2>
<ul>
<li>Tidak ada data performa. Model hanya melihat riwayat harga, usia, posisi, dan liga. Gol, menit bermain, cedera, dan sisa
kontrak tidak ada di data. Data semacam itu sudah dicoba dari sumber lain dan tidak menaikkan akurasi di atas batas kebetulan.</li>
<li>Yang ditebak adalah taksiran Transfermarkt, bukan harga transfer sungguhan.</li>
<li>Rentang harga terlalu sempit untuk pemain di atas €50 juta: harga aslinya lebih sering jatuh di luar rentang.</li>
<li>Riwayat klub hanya benar untuk 508 pemain lama, jadi skenario pindah klub tidak ditawarkan.</li>
</ul>

<h2>6. Kesimpulan</h2>
<p>Riwayat harga cukup untuk menyaring pemain yang nilainya kemungkinan besar naik atau turun dalam setahun, dan itulah yang
layak dipakai dari model ini: sebagai daftar pendek untuk ditinjau pemandu bakat. Untuk menebak angka harga di update
berikutnya, model belum memberi nilai tambah nyata dibanding menganggap harga tidak berubah. Data, kode, model terlatih, dan
semua angka pengujian bisa diunduh di tab Dataset &amp; Unduhan.</p>

</body></html>"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default="http://127.0.0.1:8310")
    args = parser.parse_args()
    html = build_html(get(args.api, "overview"), get(args.api, "test-predictions"))
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "laporan.html"
        src.write_text(html, encoding="utf-8")
        subprocess.run(
            [
                "google-chrome", "--headless=new", "--no-sandbox", "--disable-gpu",
                "--no-pdf-header-footer", f"--print-to-pdf={OUT}", src.as_uri(),
            ],
            check=True,
            capture_output=True,
        )
    pages = OUT.read_bytes().count(b"/Type /Page") - OUT.read_bytes().count(b"/Type /Pages")
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes, {pages} pages)")
    if pages > 3:
        raise SystemExit("report is longer than 3 pages")


if __name__ == "__main__":
    main()
