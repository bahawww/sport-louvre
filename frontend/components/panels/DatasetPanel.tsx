"use client";

import { Download } from "lucide-react";
import { useMemo, useState } from "react";

import { ClubBadge, LeagueBadge, PlayerAvatar } from "@/components/entity-media";
import { TrajectoryBadge } from "@/components/trajectory-badge";
import { useApi, type DatasetsResponse } from "@/lib/api";
import { fmt } from "@/lib/format";

function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function DatasetPanel() {
  const res = useApi<DatasetsResponse>("/datasets");
  const [search, setSearch] = useState("");
  const [league, setLeague] = useState("ALL");

  const filtered = useMemo(() => {
    if (!res.data) return [];
    const q = search.trim().toLowerCase();
    return res.data.players.filter((p) => {
      if (league !== "ALL" && p.league_name !== league) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.peak_club.toLowerCase().includes(q) ||
        p.nationality.toLowerCase().includes(q)
      );
    });
  }, [res.data, search, league]);

  if (res.isLoading) {
    return (
      <div className="rounded-xl border border-[#243244] bg-[#121A24] p-8 text-center text-sm text-[#94A3B8]">
        Memuat katalog dataset lengkap...
      </div>
    );
  }

  if (res.isError || !res.data) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-[#121A24] p-6 text-sm text-rose-400">
        Gagal memuat daftar dataset.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {res.data.files.map((f) => (
          <div
            key={f.filename}
            className="flex flex-col justify-between rounded-xl border border-[#243244] bg-[#121A24] p-5"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="rounded bg-[#182230] px-2 py-0.5 text-[11px] font-bold text-[#10B981]">
                  {f.format}
                </span>
                <span className="text-xs text-[#94A3B8]">{formatBytes(f.size_bytes)}</span>
              </div>
              <h3 className="mt-3 text-sm font-bold text-[#F1F5F9]">{f.label}</h3>
              <p className="mt-1 text-xs leading-relaxed text-[#94A3B8]">{f.description}</p>
              <p className="mt-2 text-[11px] text-[#64748B]">
                {fmt.int(f.rows)} baris · {f.columns} kolom
              </p>
            </div>
            <a
              href={f.download_url}
              download={f.filename}
              className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-[#10B981] px-3 py-2 text-xs font-bold text-[#0B1117] transition hover:bg-[#059669]"
            >
              <Download className="size-3.5" />
              Unduh {f.format}
            </a>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-[#243244] bg-[#121A24] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-[#F1F5F9]">
              Dataset Total Pemain ({filtered.length} / {res.data.total_players})
            </h3>
            <p className="mt-0.5 text-xs text-[#94A3B8]">
              Seluruh {fmt.int(res.data.total_players)} pemain Transfermarkt 2025/2026 dari 5 liga top Eropa.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama, klub, atau negara..."
              className="w-56 rounded-lg border border-[#243244] bg-[#0B1117] px-3 py-1.5 text-xs text-[#F1F5F9] placeholder-[#64748B]"
            />
            <select
              value={league}
              onChange={(e) => setLeague(e.target.value)}
              className="rounded-lg border border-[#243244] bg-[#0B1117] px-3 py-1.5 text-xs text-[#F1F5F9]"
            >
              <option value="ALL">Semua Liga</option>
              <option value="Premier League">Premier League</option>
              <option value="La Liga">La Liga</option>
              <option value="Serie A">Serie A</option>
              <option value="Bundesliga">Bundesliga</option>
              <option value="Ligue 1">Ligue 1</option>
            </select>
          </div>
        </div>

        <div className="mt-4 max-h-[460px] overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-20 border-b border-[#243244] bg-[#121A24] text-[#94A3B8]">
              <tr>
                <th className="py-2 pr-3">#</th>
                <th className="py-2 pr-3">Pemain</th>
                <th className="py-2 px-3">Liga</th>
                <th className="py-2 px-3">Trajectory</th>
                <th className="py-2 px-3 text-right">Usia</th>
                <th className="py-2 px-3 text-right">Current Value</th>
                <th className="py-2 px-3 text-right">Peak Value</th>
                <th className="py-2 pl-3 text-right">Titik</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E293B]">
              {filtered.map((p, idx) => (
                <tr key={p.player_id} className="hover:bg-[#182230]/60">
                  <td className="py-2 pr-3 text-[#64748B]">{idx + 1}</td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2.5">
                      <PlayerAvatar playerId={p.player_id} name={p.name} size={30} />
                      <div className="min-w-0">
                        <span className="block truncate font-semibold text-[#F1F5F9]">{p.name}</span>
                        <span className="mt-0.5 flex items-center gap-1 text-[11px] text-[#94A3B8]">
                          <ClubBadge playerId={p.player_id} club={p.peak_club} size={12} />
                          <span>· {p.nationality}</span>
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="py-2 px-3 text-[#94A3B8]">
                    <LeagueBadge league={p.league_name} size={14} />
                  </td>
                  <td className="py-2 px-3">
                    <TrajectoryBadge value={p.trajectory} />
                  </td>
                  <td className="py-2 px-3 text-right text-[#94A3B8]">{p.age ?? "—"}</td>
                  <td className="py-2 px-3 text-right font-bold text-[#10B981]">
                    {fmt.eur(p.current_value_eur)}
                  </td>
                  <td className="py-2 px-3 text-right text-[#F59E0B]">
                    {fmt.eur(p.peak_value_eur)}
                  </td>
                  <td className="py-2 pl-3 text-right text-[#94A3B8]">{p.num_valuation_points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
