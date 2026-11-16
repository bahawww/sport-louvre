"use client";

export function PitchBanner() {
  return (
    <div className="sp-banner" aria-hidden="true">
      <svg
        viewBox="0 0 1120 184"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto block"
      >
        <defs>
          <radialGradient id="sp-glow-g" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="sp-glow-a" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--warning)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--warning)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Stadium roof & tiered stands silhouette */}
        <path
          d="M60 118 L150 62 L390 46 L730 46 L970 62 L1060 118"
          stroke="var(--border)"
          strokeWidth="1"
        />
        <path
          d="M110 118 L180 76 L395 62 L725 62 L940 76 L1010 118"
          stroke="var(--border)"
          strokeWidth="1"
          opacity="0.7"
        />
        <path
          d="M170 118 L225 90 L405 78 L715 78 L895 90 L950 118"
          stroke="var(--border)"
          strokeWidth="1"
          opacity="0.45"
        />

        {/* Floodlight towers */}
        <g stroke="var(--control)" strokeWidth="1" opacity="0.75">
          <path d="M168 60 L152 24 M152 24 L178 24 M148 30 L182 30" />
          <path d="M952 60 L968 24 M942 24 L968 24 M938 30 L972 30" />
        </g>
        <circle cx="165" cy="27" r="24" fill="url(#sp-glow-a)" />
        <circle cx="955" cy="27" r="24" fill="url(#sp-glow-a)" />

        {/* Perspective football pitch */}
        <g stroke="var(--control)" strokeWidth="1.1">
          {/* Outer touchline */}
          <polygon points="150,118 970,118 1065,172 55,172" />
          {/* Halfway line */}
          <line x1="560" y1="118" x2="560" y2="172" />
          {/* Center circle (perspective ellipse) */}
          <ellipse cx="560" cy="145" rx="64" ry="15" />
          {/* Left penalty area & goal */}
          <polygon points="150,127 258,127 224,162 96,162" />
          <polyline points="124,137 104,137 88,153 112,153" opacity="0.8" />
          {/* Right penalty area & goal */}
          <polygon points="970,127 862,127 896,162 1024,162" />
          <polyline points="996,137 1016,137 1032,153 1008,153" opacity="0.8" />
        </g>

        {/* Tactical passing / market value trajectory */}
        <path
          d="M235 148 Q350 96 472 132 T735 122 Q815 104 888 136"
          stroke="var(--accent)"
          strokeWidth="1.5"
          strokeDasharray="4 5"
          className="sp-pass"
        />

        {/* Animated ball gliding along the trajectory */}
        <circle r="4" fill="var(--accent)" className="sp-ball">
          <animateMotion
            dur="7s"
            repeatCount="indefinite"
            path="M235 148 Q350 96 472 132 T735 122 Q815 104 888 136"
          />
        </circle>

        {/* Player / data nodes on the pitch */}
        <g>
          <circle cx="235" cy="148" r="3" fill="var(--muted)" />
          <circle cx="472" cy="132" r="3" fill="var(--muted)" />
          <circle cx="628" cy="150" r="3" fill="var(--warning)" />
          <circle cx="735" cy="122" r="3.5" fill="var(--accent)" />
          <circle cx="888" cy="136" r="18" fill="url(#sp-glow-g)" />
          <circle cx="888" cy="136" r="4" fill="var(--accent)" className="sp-pulse" />
        </g>

        {/* Minimal callout annotations */}
        <g fill="var(--faint)" fontSize="11" fontFamily="var(--font-geist), sans-serif">
          <line x1="560" y1="118" x2="560" y2="90" stroke="var(--border)" strokeWidth="1" />
          <text x="560" y="83" textAnchor="middle">5 Liga Top Eropa</text>

          <line x1="235" y1="148" x2="235" y2="100" stroke="var(--border)" strokeWidth="1" />
          <text x="235" y="93" textAnchor="middle">2.418 Pemain</text>

          <line x1="888" y1="136" x2="888" y2="96" stroke="var(--border)" strokeWidth="1" />
          <text x="888" y="89" textAnchor="middle" fill="var(--accent)">Proyeksi 12 Bln</text>
        </g>
      </svg>
    </div>
  );
}
