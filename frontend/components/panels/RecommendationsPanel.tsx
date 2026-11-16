"use client";

import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Disclosure,
  EmptyState,
  PageHeader,
  Panel,
  PanelDividerCell,
  PanelDividerGrid,
  PlayerCell,
  SectionHeader,
  Segmented,
  Stat,
} from "@/components/ui";
import type { OutlookRow, TestPredictionsResponse } from "@/lib/api";
import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";

const POSITION_ID: Record<string, string> = {
  Goalkeeper: "Kiper",
  "Centre-Back": "Bek tengah",
  "Left-Back": "Bek kiri",
  "Right-Back": "Bek kanan",
  "Defensive Midfield": "Gelandang bertahan",
  "Central Midfield": "Gelandang tengah",
  "Attacking Midfield": "Gelandang serang",
  "Left Midfield": "Gelandang kiri",
  "Right Midfield": "Gelandang kanan",
  "Left Winger": "Sayap kiri",
  "Right Winger": "Sayap kanan",
  "Second Striker": "Penyerang lubang",
  "Centre-Forward": "Penyerang tengah",
};

const BUDGETS = [
  { label: "Semua harga", max: Infinity },
  { label: "Sampai €10M", max: 10e6 },
  { label: "Sampai €25M", max: 25e6 },
  { label: "Sampai €50M", max: 50e6 },
];

const BUDGET_OPTIONS = BUDGETS.map((b, i) => ({
  value: String(i),
  label: b.label,
}));

const outOfTen = (p: number) => `${Math.round(p * 10)} dari 10`;
const pct0 = (x: number) => `${Math.round(x * 100)}%`;

/** Turn the model's top reasons into a short phrase a reader can check against the player. */
function reasonText(r: OutlookRow, tone: "buy" | "risk"): string {
  const phrases: string[] = [];
  for (const reason of r.reasons ?? []) {
    const v = reason.key_value;
    let text = "";
    if (reason.group === "age") text = tone === "buy" ? `masih ${r.age} tahun` : `usianya sudah ${r.age} tahun`;
    else if (reason.group === "momentum")
      text = typeof v === "number" && v < 0 ? "harganya sedang turun" : tone === "buy" ? "harganya sedang naik" : "kenaikannya sudah berhenti";
    else if (reason.group === "price_level") text = tone === "buy" ? "harganya masih rendah" : "harganya sudah sangat tinggi";
    else if (reason.group === "career_length") text = tone === "buy" ? "baru sebentar di level atas" : "sudah lama di level atas";
    else if (reason.group === "league") text = `bermain di ${r.league_name}`;
    else if (reason.group === "drawdown") text = tone === "buy" ? "sedang di harga tertingginya" : "sudah turun dari harga tertingginya";
    else if (reason.group === "position" && POSITION_ID[r.position]) text = `posisinya ${POSITION_ID[r.position].toLowerCase()}`;
    if (text && !phrases.includes(text)) phrases.push(text);
    if (phrases.length === 2) break;
  }
  return phrases.join(", ");
}

function PlayerList({ rows, tone }: { rows: OutlookRow[]; tone: "buy" | "risk" }) {
  if (!rows.length) {
    return (
      <div className="py-8 text-center">
        <p className="text-[13px] text-muted">Tidak ada pemain di rentang harga ini.</p>
      </div>
    );
  }
  return (
    <ul>
      {rows.map((r) => {
        const chance = tone === "buy" ? r.p_up : r.p_down;
        const why = reasonText(r, tone);
        return (
          <li
            key={r.player_id}
            className="flex flex-col gap-2 py-3 border-b border-rule last:border-b-0 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="min-w-0 flex-1">
              <PlayerCell
                playerId={r.player_id}
                name={r.name}
                club={r.peak_club}
                meta={`${r.age} tahun${POSITION_ID[r.position] ? ` · ${POSITION_ID[r.position]}` : ""}`}
                avatarSize={36}
              />
              {why ? (
                <p className="mt-1 pl-12 text-[13px] leading-relaxed text-muted">
                  Kenapa: {why}.
                </p>
              ) : null}
            </div>

            <div className="shrink-0 text-left sm:text-right pl-12 sm:pl-0 sm:ml-4">
              <p className="text-[13px] tabular-nums text-ink">
                {fmt.eurShort(r.current_value_eur)}{" "}
                <span className="text-muted">menjadi sekitar</span>{" "}
                <span
                  className={cn(
                    "font-semibold",
                    tone === "buy" ? "text-positive" : "text-negative"
                  )}
                >
                  {fmt.eurShort(r.expected_value_eur)}
                </span>
              </p>
              <p className="mt-0.5 text-xs text-muted tabular-nums">
                Peluang {tone === "buy" ? "naik" : "turun"}{" "}
                <span className="font-semibold text-ink">{outOfTen(chance)}</span>
              </p>
              <span className="mt-1.5 block h-1 w-28 sm:w-32 rounded-full bg-rule sm:ml-auto overflow-hidden">
                <span
                  className={cn(
                    "block h-full rounded-full transition-[width]",
                    tone === "buy" ? "bg-positive" : "bg-negative"
                  )}
                  style={{ width: `${Math.min(100, Math.max(0, chance * 100))}%` }}
                />
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function RecommendationsPanel({ preds }: { preds: TestPredictionsResponse }) {
  const outlook = preds.outlook;
  const [budget, setBudget] = useState(0);
  const [moreBuy, setMoreBuy] = useState(false);
  const [moreRisk, setMoreRisk] = useState(false);

  const buy = useMemo(
    () => (outlook?.buy ?? []).filter((r) => r.current_value_eur <= BUDGETS[budget].max),
    [outlook, budget],
  );

  if (!outlook) {
    return (
      <EmptyState
        title="Data Belum Tersedia"
        description="Data proyeksi 12 bulan belum tersedia."
      />
    );
  }
  const v = outlook.validation;
  const risk = outlook.depreciation_risk;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Kandidat Beli & Risiko Turun — Proyeksi 12 Bulan"
        subtitle={`Model memperkirakan nilai pasar tiap pemain setahun dari sekarang. Daftar di bawah hanya memuat pemain yang peluang naik atau turunnya besar: dari ${fmt.int(
          Object.values(outlook.signal_counts).reduce((a, b) => a + b, 0)
        )} pemain, ${outlook.signal_counts.Buy} diperkirakan naik dan ${
          outlook.signal_counts.DepreciationRisk
        } diperkirakan turun. Sisanya tidak cukup jelas arahnya, jadi tidak ditampilkan.`}
      />

      <Panel padding="none">
        <PanelDividerGrid cols={3}>
          <PanelDividerCell>
            <Stat
              label='Perkiraan "naik"'
              value={outOfTen(v.buy.went_up ?? 0)}
              description={`Perkiraan "naik" di masa lalu ternyata benar naik (${pct0(v.buy.went_up ?? 0)} dari ${v.buy.n} pemain).`}
            />
          </PanelDividerCell>
          <PanelDividerCell>
            <Stat
              label='Perkiraan "turun"'
              value={outOfTen(v.depreciation_risk.went_down ?? 0)}
              description={`Perkiraan "turun" di masa lalu ternyata benar turun (${pct0(v.depreciation_risk.went_down ?? 0)} dari ${v.depreciation_risk.n} pemain).`}
            />
          </PanelDividerCell>
          <PanelDividerCell>
            <Stat
              label="Pembanding acak"
              value={outOfTen(v.base_rate.up)}
              description="Pemain naik nilainya kalau dipilih acak. Itu pembandingnya."
            />
          </PanelDividerCell>
        </PanelDividerGrid>
      </Panel>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs font-medium text-muted">Batas harga</span>
        <Segmented
          options={BUDGET_OPTIONS}
          value={String(budget)}
          onChange={(val) => {
            setBudget(Number(val));
            setMoreBuy(false);
          }}
          ariaLabel="Batas harga"
          size="sm"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <Panel className="flex flex-col">
          <SectionHeader
            title="Kandidat Beli"
            subtitle="Kandidat untuk dibeli sekarang. Diurutkan dari kenaikan nilai terbesar dalam Euro."
            actions={<Badge variant="mint">{buy.length}</Badge>}
          />
          <div className="mt-3 mb-3">
            <PlayerList rows={buy.slice(0, moreBuy ? 30 : 6)} tone="buy" />
          </div>
          {buy.length > 6 ? (
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => setMoreBuy((m) => !m)}
            >
              {moreBuy ? "Tampilkan ringkas" : "Tampilkan semua"}
            </Button>
          ) : null}
        </Panel>

        <Panel className="flex flex-col">
          <SectionHeader
            title="Risiko Turun"
            subtitle="Sebaiknya tidak dibeli mahal, atau dijual selagi nilainya tinggi. Ini bukan berarti mainnya jelek: nilai pasar pemain bintang biasanya menyusut setelah usia 27 sampai 28."
            actions={<Badge variant="crimson">{risk.length}</Badge>}
          />
          <div className="mt-3 mb-3">
            <PlayerList rows={risk.slice(0, moreRisk ? 30 : 6)} tone="risk" />
          </div>
          {risk.length > 6 ? (
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => setMoreRisk((m) => !m)}
            >
              {moreRisk ? "Tampilkan ringkas" : "Tampilkan semua"}
            </Button>
          ) : null}
        </Panel>
      </div>

      <Disclosure
        title="Cara daftar ini dibuat dan batasannya"
        summary="buka"
      >
        <ul className="grid gap-x-8 gap-y-3 text-[13px] leading-relaxed text-muted md:grid-cols-2">
          <li>
            <strong className="font-semibold text-ink">Syarat masuk daftar.</strong>{" "}
            Peluang nilainya berubah lebih dari 5% dalam setahun minimal {pct0(outlook.threshold)}, dan nilai sekarang minimal {fmt.eurShort(outlook.min_value_eur)}.
          </li>
          <li>
            <strong className="font-semibold text-ink">Cara mengujinya.</strong>{" "}
            Model dilatih hanya dari data sebelum {v.cutoff}, lalu perkiraannya dicocokkan dengan harga {fmt.int(v.test_players)} pemain sesudah tanggal itu.
          </li>
          <li>
            <strong className="font-semibold text-ink">Yang diperkirakan.</strong>{" "}
            Nilai pasar versi Transfermarkt, bukan harga transfer dan bukan kualitas bermain.
          </li>
          <li>
            <strong className="font-semibold text-ink">Yang tidak diketahui model.</strong>{" "}
            Gol, menit bermain, cedera, dan kontrak. Semua itu baru terbaca setelah harganya berubah.
          </li>
          <li>
            <strong className="font-semibold text-ink">Pemain muda cenderung terlalu optimistis.</strong>{" "}
            Data hanya berisi pemain yang berhasil sampai liga top, jadi pemain muda yang gagal tidak ikut dipelajari.
          </li>
          <li>
            <strong className="font-semibold text-ink">Harga jatuh bukan tanda murah.</strong>{" "}
            Dari pemain yang harganya jatuh lebih dari 40% dalam setahun, hanya {pct0(v.fell_over_40pct_prior_12m.went_up ?? 0)} yang naik lagi.
          </li>
        </ul>
      </Disclosure>
    </div>
  );
}
