"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ClubBadge, PlayerAvatar, resolveClubName, useMediaManifest } from "@/components/entity-media";

export interface PlayerCellProps extends HTMLAttributes<HTMLDivElement> {
  playerId?: string | number;
  name: string;
  club?: string;
  meta?: ReactNode;
  avatarSize?: number;
  showClubLogo?: boolean;
  badge?: ReactNode;
  className?: string;
}

export function PlayerCell({
  playerId,
  name,
  club,
  meta,
  avatarSize = 36,
  showClubLogo = true,
  badge,
  className,
  ...props
}: PlayerCellProps) {
  const manifest = useMediaManifest();
  const displayClub = resolveClubName(manifest, playerId, club);

  return (
    <div
      className={cn("flex items-center gap-3 min-w-0 text-left", className)}
      {...props}
    >
      <PlayerAvatar
        playerId={playerId}
        name={name}
        size={avatarSize}
        className="shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-medium text-ink text-[13px] truncate">
            {name}
          </span>
          {badge ? <div className="shrink-0">{badge}</div> : null}
        </div>
        {displayClub || meta ? (
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted truncate">
            {showClubLogo && displayClub ? (
              <ClubBadge
                club={displayClub}
                playerId={playerId}
                size={14}
                showName={false}
                className="shrink-0 text-muted"
              />
            ) : null}
            {displayClub ? <span className="truncate">{displayClub}</span> : null}
            {displayClub && meta ? <span className="text-faint">·</span> : null}
            {meta ? <span className="truncate">{meta}</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
