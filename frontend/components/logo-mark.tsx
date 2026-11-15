export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2" y="3" width="20" height="18" rx="3" stroke="var(--text)" strokeWidth="2" />
      <path
        d="M5 16L9.5 11.5L13 14L19 7"
        stroke="var(--accent)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="19" cy="7" r="2" fill="var(--warning)" />
    </svg>
  );
}
