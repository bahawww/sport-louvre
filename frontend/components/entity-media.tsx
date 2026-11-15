"use client";

import { Shield } from "lucide-react";
import { useState, useSyncExternalStore } from "react";

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

let cachedManifest: MediaManifest = EMPTY_MANIFEST;
let fetchStarted = false;
const listeners = new Set<() => void>();

function subscribeManifest(listener: () => void) {
  listeners.add(listener);
  if (!fetchStarted && typeof window !== "undefined") {
    fetchStarted = true;
    fetch("/media/manifest.json")
      .then((res) => (res.ok ? (res.json() as Promise<MediaManifest>) : EMPTY_MANIFEST))
      .then((data) => {
        cachedManifest = data;
        listeners.forEach((l) => l());
      })
      .catch(() => {});
  }
  return () => {
    listeners.delete(listener);
  };
}

function getManifestSnapshot(): MediaManifest {
  return cachedManifest;
}

export function useMediaManifest(): MediaManifest {
  return useSyncExternalStore(subscribeManifest, getManifestSnapshot, () => EMPTY_MANIFEST);
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
  // 0 = try the small WebP thumbnail, 1 = fall back to the original PNG, 2 = show initials.
  const [stage, setStage] = useState(0);
  const original = playerId != null ? manifest.players[String(playerId)] : undefined;
  const thumb = original?.startsWith("/media/players/")
    ? original.replace("/media/players/", "/media/thumbs/players/").replace(/\.png$/i, ".webp")
    : undefined;
  const src = stage === 0 && thumb ? thumb : original;
  const failed = stage >= 2;

  return (
    <span
      style={{ width: size, height: size }}
      className={`relative inline-flex shrink-0 items-end justify-center overflow-hidden rounded-full bg-raised text-muted border border-border-subtle text-xs font-bold ${className}`}
    >
      {src && !failed ? (
        <img
          src={src}
          alt={name}
          loading="lazy"
          decoding="async"
          width={size}
          height={size}
          onError={() => setStage((s) => (s === 0 && thumb ? 1 : 2))}
          className="h-full w-full object-contain object-bottom px-[2px] pt-[3px]"
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
  const [stage, setStage] = useState(0); // 0 thumbnail, 1 original, 2 icon
  const resolvedClub =
    (playerId != null ? manifest.playerClubs[String(playerId)] : undefined) || club || "";
  const original = resolvedClub ? manifest.clubs[resolvedClub] : undefined;
  const thumb = original?.startsWith("/media/clubs/") && /\.png$/i.test(original)
    ? original.replace("/media/clubs/", "/media/thumbs/clubs/").replace(/\.png$/i, ".webp")
    : undefined;
  const src = stage === 0 && thumb ? thumb : original;
  const failed = stage >= 2;

  if (!resolvedClub) return null;

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {src && !failed ? (
        <img
          src={src}
          alt={resolvedClub}
          loading="lazy"
          style={{ width: size + 2, height: size + 2 }}
          decoding="async"
          onError={() => setStage((x) => (x === 0 && thumb ? 1 : 2))}
          className="shrink-0 object-contain"
        />
      ) : (
        <Shield style={{ width: size, height: size }} className="shrink-0 text-faint" />
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
        <img
          src={src}
          alt={league}
          loading="lazy"
          style={{ width: size + 2, height: size + 2 }}
          onError={() => setFailed(true)}
          className="shrink-0 object-contain"
        />
      ) : null}
      {showName ? <span className="truncate">{league}</span> : null}
    </span>
  );
}
