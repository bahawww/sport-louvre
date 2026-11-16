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
@page { size: A4; margin: 25mm; }
* { box-sizing: border-box; }
body { font: 12pt/1.5 "Times New Roman", "Liberation Serif", Times, serif; color: #000; margin: 0;
  text-align: justify; hyphens: auto; }
h1 { font-size: 14pt; line-height: 1.25; text-align: center; margin: 0 0 4pt; hyphens: none; }
.meta { text-align: center; font-size: 11pt; line-height: 1.3; margin: 0 0 10pt; }
h2 { font-size: 12pt; margin: 8pt 0 0; break-after: avoid; }
p { margin: 0 0 4pt; }
ol { margin: 0; padding-left: 18pt; text-align: left; }
table { width: 100%; border-collapse: collapse; margin: 0 0 6pt; font-size: 10.5pt; line-height: 1.2;
  text-align: left; break-inside: avoid; border-top: 1pt solid #000; border-bottom: 1pt solid #000; }
caption { font-size: 11pt; line-height: 1.3; text-align: center; padding: 4pt 0 3pt; }
th { font-weight: bold; border-bottom: 0.75pt solid #000; padding: 2.5pt 6pt 2.5pt 0; }
td { padding: 2pt 6pt 2pt 0; vertical-align: top; }
td.n, th.n { text-align: right; padding-right: 0; white-space: nowrap; }
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


TREE = "Decision Tree"
LINEAR = "Linear Regression (log)"


def build_html(o: dict, preds: dict) -> str:
    ds, card = o["dataset"], o["data_card"]
    rep = ds["repairs"]
    trend = o["classification"]["trend"]
    cv = trend["validation"]["group_kfold"]
    fc = o["regression"]["tasks"]["forecast"]
    reg_cv = fc["validation"]["group_kfold"]
    ov = preds["outlook"]["validation"]
    lin = o["simple_models"]["linear_regression"]
    clf = {m["name"]: m for m in trend["models"]}
    reg = {m["name"]: m for m in fc["models"]}
    tree, base = clf[TREE], clf["Persistence (last state)"]
    linear, naive, boost = reg[LINEAR], reg["Naive (last value)"], reg[fc["best_model"]]
    leak_best = max(
        (m for m in o["classification"]["leakage_mode"]["models"] if not m["name"].startswith("Persistence")),
        key=lambda m: m["accuracy"],
    )

    def dec(x: float, digits: int = 3) -> str:
        return f"{x:.{digits}f}".replace(".", ",")

    clf_rows = "".join(
        f"<tr><td>{label}</td><td class='n'>{pct(clf[key]['accuracy'])}</td>"
        f"<td class='n'>{dec(clf[key]['macro_f1'])}</td>"
        f"<td class='n'>{pct(cv[key]['accuracy_mean']) if key in cv else '-'}</td></tr>"
        for key, label in [
            (TREE, "<b>Decision Tree (model utama)</b>"),
            ("Ordinal HGB (calibrated)", "Gradient boosting ordinal"),
            ("HistGradientBoosting (calibrated)", "Gradient boosting"),
            ("Random Forest", "Random forest"),
            ("Logistic Regression", "Regresi logistik"),
            ("Persistence (last state)", "Tanpa model (tren dianggap tetap)"),
        ]
        if key in clf
    )
    reg_rows = "".join(
        f"<tr><td>{label}</td><td class='n'>{pct(reg[key]['medape'])}</td>"
        f"<td class='n'>{eur_m(reg[key]['mae'])}</td><td class='n'>{dec(reg[key]['r2_log'])}</td></tr>"
        for key, label in [
            (LINEAR, "<b>Regresi linear (model utama)</b>"),
            ("Ridge (log)", "Regresi ridge"),
            ("HistGradientBoosting (log)", "Gradient boosting"),
            ("Naive (last value)", "Tanpa model (harga dianggap tetap)"),
        ]
        if key in reg
    )

    tj = ds["trajectories"]
    class_counts = [
        ("Naik atau dekat puncak", tj["rising_star"] + tj["growing"]),
        ("Stabil", tj["stable"]),
        ("Menurun", tj["declining"]),
        ("Jatuh tajam", tj["falling_sharply"]),
    ]
    class_rows = "".join(
        f"<tr><td>{label}</td><td class='n'>{num(n)}</td><td class='n'>{pct(n / ds['total_players'])}</td></tr>"
        for label, n in class_counts
    )
    pos_id = {"Defender": "Bek", "Midfielder": "Gelandang", "Forward": "Penyerang"}
    coef_rows = "".join(
        f"<tr><td>{pos_id.get(k, k)} (terhadap kiper)</td><td class='n'>+{dec(v, 1)}%</td></tr>"
        for k, v in lin["position_premium_pct"].items()
    ) + "".join(
        f"<tr><td>{k} (terhadap {lin['league_reference']})</td><td class='n'>+{dec(v, 1)}%</td></tr>"
        for k, v in sorted(lin["league_premium_pct"].items(), key=lambda kv: -kv[1])
    )

    return f"""<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Laporan Analisis Sport Louvre</title>
<style>{CSS}</style></head><body>

<h1>Prediksi Nilai Pasar dan Klasifikasi Tren Harga Pemain Sepak Bola Menggunakan Regresi Linear dan Decision Tree</h1>
<p class="meta">Laporan Analisis Proyek Sport Louvre (sport.louvre.my.id)<br>Data Transfermarkt per {card['data_as_of']}</p>

<h2>1. Pendahuluan</h2>
<p>Nilai pasar pemain menjadi acuan klub saat membeli dan menjual pemain. Laporan ini menguji seberapa jauh riwayat nilai
pasar seorang pemain dapat dipakai untuk dua tugas: mengklasifikasikan tren harganya dengan Decision Tree, dan memprediksi
nilai pasarnya pada pembaruan berikutnya dengan regresi linear. Kedua model dibandingkan dengan beberapa model lain dan
dengan tebakan tanpa model.</p>

<h2>2. Data dan Sumber</h2>
<p>Data berisi {num(ds['total_players'])} pemain dari lima liga top Eropa dan {num(card['valuation_points'])} catatan nilai
pasar sejak {card['first_valuation'][:4]}. Seluruh nilai berasal dari Transfermarkt, yaitu taksiran komunitas dan editor,
bukan harga transfer. Sebanyak 508 pemain berasal dari set awal Football Player Market Value Trajectories, dan sisanya dari
repositori salimt/football-datasets. Dua masalah diperbaiki sebelum pemodelan. Pertama, kolom pada
{num(rep['legacy_rows_with_broken_position'])} pemain bergeser sehingga kolom posisi berisi nilai euro; posisi diisi ulang
dari dcaribou/transfermarkt-datasets. Kedua, kolom ringkasan seperti peak_value_eur dihitung dari seluruh riwayat, termasuk
harga yang hendak ditebak. Model yang diberi kolom itu mencapai akurasi {pct(leak_best['accuracy'], 0)}, angka yang tidak
mungkin diperoleh pada pemain yang harganya belum terbit, sehingga kolom tersebut tidak dipakai sebagai fitur.</p>
<table>
<caption>Tabel 1. Sebaran kelas tren pada {num(ds['total_players'])} pemain</caption>
<tr><th>Kelas tren</th><th class="n">Jumlah pemain</th><th class="n">Porsi</th></tr>
{class_rows}
</table>

<h2>3. Metode</h2>
<p>Riwayat tiap pemain dipotong menjadi soal: semua nilai sebelum suatu pembaruan menjadi masukan, dan nilai pada pembaruan
itu menjadi jawaban. Dari masukan tersebut dihitung {len(fc['features'])} fitur, antara lain harga terakhir, jarak dari
nilai puncak, arah perubahan terakhir, usia, posisi, dan liga. Sebanyak {num(ds['test_size'])} pemain (20%) disisihkan
sebagai data uji. Pembagian dilakukan per pemain supaya model tidak diuji pada pemain yang sudah dikenalnya. Untuk
klasifikasi, tren dibagi menjadi empat kelas menurut penurunan harga dari nilai puncak: naik (kurang dari 20%), stabil (20
sampai 30%), menurun (30 sampai 60%), dan jatuh tajam (lebih dari 60%). Decision Tree dibatasi sedalam lima tingkat dengan
minimal 40 pemain per daun. Regresi linear memprediksi perubahan dari harga terakhir dalam skala logaritma. Semua kandidat
dinilai dengan validasi silang lima lipatan pada data latih, lalu diuji satu kali pada data uji.</p>

<h2>4. Hasil Pengujian</h2>
<table>
<caption>Tabel 2. Klasifikasi tren empat kelas pada {num(ds['test_size'])} pemain uji</caption>
<tr><th>Model</th><th class="n">Akurasi</th><th class="n">Macro-F1</th><th class="n">Akurasi validasi silang</th></tr>
{clf_rows}
</table>
<table>
<caption>Tabel 3. Prediksi nilai pasar pada pembaruan berikutnya</caption>
<tr><th>Model</th><th class="n">Galat median</th><th class="n">MAE</th><th class="n">R² log</th></tr>
{reg_rows}
</table>
<p>Galat median adalah nilai tengah selisih relatif antara prediksi dan harga asli. Pada validasi silang, akurasi Decision
Tree {pct(cv[TREE]['accuracy_mean'])} dengan simpangan baku {dec(cv[TREE]['accuracy_std'] * 100, 1)} poin, dan R² log
regresi linear {dec(reg_cv[LINEAR]['r2_log_mean'])}.</p>

<h2>5. Pembahasan</h2>
<p>Decision Tree menebak tren dengan benar pada {pct(tree['accuracy'])} pemain uji, lebih tinggi
{dec((tree['accuracy'] - base['accuracy']) * 100, 1)} poin daripada menganggap tren tidak berubah
({pct(base['accuracy'])}). Selisih itu masih di sekitar simpangan baku validasi silang, sehingga belum dapat disebut unggul
secara meyakinkan. Batas yang dipelajari pohon hampir sama dengan definisi kelasnya sendiri, sebab tren pemain jarang
berpindah kelas dalam satu pembaruan. Akurasinya setara dengan gradient boosting, dan aturannya dapat dibaca langsung.</p>
<p>Regresi linear meleset {pct(linear['medape'])} pada galat median dengan MAE {eur_m(linear['mae'])}. Hasil itu lebih buruk
daripada menganggap harga tidak berubah ({pct(naive['medape'])} dan {eur_m(naive['mae'])}). Gradient boosting mencapai
galat median {pct(boost['medape'])}, tetapi MAE-nya juga tidak lebih baik daripada tebakan tanpa model. Artinya, harga pada
pembaruan berikutnya hampir seluruhnya sudah dijelaskan oleh harga terakhir. Regresi linear tetap berguna untuk membaca
pola: pada usia dan liga yang sama, gelandang dan penyerang dihargai sekitar tiga kali kiper, dan harga memuncak pada usia
{dec(lin['peak_age'], 1)} tahun (Tabel 4). Usia, posisi, dan liga sendiri hanya menjelaskan
{round(lin['r2_log_test'] * 100)}% keragaman harga antarpemain.</p>
<table>
<caption>Tabel 4. Selisih harga menurut regresi linear dari usia, posisi, dan liga</caption>
<tr><th>Kelompok</th><th class="n">Selisih harga</th></tr>
{coef_rows}
</table>
<p>Analisis ini memiliki tiga batasan. Data tidak memuat performa, cedera, maupun kontrak. Nilai yang diprediksi adalah
taksiran Transfermarkt, bukan harga transfer. Selain itu, model tambahan untuk arah harga dua belas bulan ke depan
memberi hasil yang lebih berguna: {pct(ov['buy']['went_up'], 0)} perkiraan naik terbukti benar, dibandingkan
{pct(ov['base_rate']['up'], 0)} pada pemilihan acak.</p>

<h2>6. Kesimpulan</h2>
<p>Decision Tree mampu mengklasifikasikan tren harga dengan akurasi {pct(tree['accuracy'])} dan aturan yang mudah
dijelaskan, tetapi keunggulannya atas tebakan tanpa model kecil. Regresi linear belum mampu mengalahkan tebakan tanpa model
untuk prediksi harga jangka pendek, sehingga lebih tepat dipakai sebagai alat penjelas daripada alat prediksi. Data, kode,
model terlatih, dan seluruh hasil pengujian tersedia di tab Dataset &amp; Unduhan.</p>

<h2>Sumber Data</h2>
<ol>
<li>Transfermarkt. Nilai pasar pemain. https://www.transfermarkt.com</li>
<li>salimt. football-datasets (salinan data Transfermarkt). https://github.com/salimt/football-datasets</li>
<li>dcaribou. transfermarkt-datasets. https://github.com/dcaribou/transfermarkt-datasets</li>
</ol>

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
