/** `relative` agar elemen sr-only (absolute) di dalam tabel terpotong di sini, bukan melebarkan halaman.
 *  Wadah tabel/grafik lebar yang bisa digulir horizontal; fokusable agar bisa digulir dengan keyboard (WCAG). */
export function ScrollX({ label = "Tabel data", children }: { label?: string; children: React.ReactNode }) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className="relative overflow-x-auto rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {children}
    </div>
  );
}
