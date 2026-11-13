"use client";

import { useQuery } from "@tanstack/react-query";
import { Shield } from "lucide-react";
import { useState } from "react";

export interface MediaManifest {
  leagues: Record<string, string>;
  clubs: Record<string, string>;
  players: Record<string, string>;
  playerClubs: Record<string, string>;
}

const EMPTY_MANIFEST: MediaManifest = {
  leagues: {},
  clubs: {},
  players: {},
  playerClubs: {},
};

export function useMediaManifest(): MediaManifest {
  const { data } = useQuery<MediaManifest>({
    queryKey: ["media-manifest"],
    queryFn: async () => {
      const res = await fetch("/media/manifest.json");
      if (!res.ok) return EMPTY_MANIFEST;
      return (await res.json()) as MediaManifest;
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return data ?? EMPTY_MANIFEST;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function PlayerAvatar({
  playerId,
  name,
  size = 32,
  className = "",
}: {
  playerId?: string | number;
  name: string;
  size?: number;
  className?: string;
}) {
  const manifest = useMediaManifest();
  const [failed, setFailed] = useState(false);
  const src = playerId != null ? manifest.players[String(playerId)] : undefined;

  return (
    <span
      style={{ width: size, height: size }}
      className={`relative inline-flex shrink-0 items-end justify-center overflow-hidden rounded-lg bg-gradient-to-b from-[#243244] via-[#182230] to-[#0B1117] text-[10px] font-bold text-[#94A3B8] ring-1 ring-white/15 shadow-sm ${className}`}
    >
      {src && !failed ? (
        <img
          src={src}
          alt={name}
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-contain object-bottom pt-0.5 drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]"
        />
      ) : (
        <span className="self-center">{getInitials(name)}</span>
      )}
    </span>
  );
}

export function ClubBadge({
  club,
  playerId,
  size = 16,
  showName = true,
  className = "",
}: {
  club?: string;
  playerId?: string | number;
  size?: number;
  showName?: boolean;
  className?: string;
}) {
  const manifest = useMediaManifest();
  const [failed, setFailed] = useState(false);
  const resolvedClub =
    (playerId != null ? manifest.playerClubs[String(playerId)] : undefined) || club || "";
  const src = resolvedClub ? manifest.clubs[resolvedClub] : undefined;

  if (!resolvedClub) return null;

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {src && !failed ? (
        <img
          src={src}
          alt={resolvedClub}
          loading="lazy"
          style={{ width: size + 2, height: size + 2 }}
          onError={() => setFailed(true)}
          className="shrink-0 object-contain drop-shadow-[0_0_1.5px_rgba(255,255,255,0.35)]"
        />
      ) : (
        <Shield style={{ width: size, height: size }} className="shrink-0 text-[#64748B]" />
      )}
      {showName ? <span className="truncate">{resolvedClub}</span> : null}
    </span>
  );
}

export function LeagueBadge({
  league,
  size = 16,
  showName = true,
  className = "",
}: {
  league?: string;
  size?: number;
  showName?: boolean;
  className?: string;
}) {
  const manifest = useMediaManifest();
  const [failed, setFailed] = useState(false);
  const src = league ? manifest.leagues[league] : undefined;

  if (!league) return null;

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {src && !failed ? (
        <span
          style={{ width: size + 4, height: size + 4 }}
          className="inline-flex shrink-0 items-center justify-center rounded-sm bg-white/90 p-[1.5px]"
        >
          <img
            src={src}
            alt={league}
            loading="lazy"
            onError={() => setFailed(true)}
            className="h-full w-full object-contain"
          />
        </span>
      ) : null}
      {showName ? <span className="truncate">{league}</span> : null}
    </span>
  );
}
