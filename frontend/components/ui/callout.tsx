/** Catatan singkat (maks. 3 kalimat) yang menjelaskan arti grafik atau tabel di atasnya. */
export function Callout({
  label = "Artinya:",
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="ua-callout">
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 3l9 16H3z M12 10v4 M12 17.5v.5" />
      </svg>
      <p className="m-0">
        <strong>{label}</strong> {children}
      </p>
    </div>
  );
}
