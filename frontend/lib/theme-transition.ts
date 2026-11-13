import { flushSync } from "react-dom";

/**
 * Ganti tema dengan View Transition: tema baru tumbuh sebagai lingkaran dari tombol, tepinya lembut
 * (gaya dan keyframes ada di app/ua-extras.css, bagian "Ganti tema"). Tanpa dukungan atau dengan
 * kurangi gerakan, warna hanya memudar silang sebentar.
 */
type Doc = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> };
};

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const canTransition = () =>
  typeof (document as Doc).startViewTransition === "function" && !reduced();

/** Dinaikkan tiap transisi, supaya yang selesai lebih dulu tidak menghapus penanda yang baru. */
let current = 0;

export function switchTheme(
  next: "light" | "dark",
  setTheme: (t: "light" | "dark") => void,
  origin?: { x: number; y: number },
) {
  const root = document.documentElement;
  // Atribut dipasang langsung: transisi memotret DOM begitu update selesai, sebelum efek next-themes jalan.
  const apply = () => {
    root.setAttribute("data-theme", next);
    root.style.colorScheme = next;
    setTheme(next);
  };

  if (!canTransition()) {
    if (reduced()) return apply();
    root.classList.add("theme-switching");
    window.setTimeout(() => root.classList.remove("theme-switching"), 380);
    return apply();
  }

  const x = origin?.x ?? window.innerWidth - 40;
  const y = origin?.y ?? 28;
  const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const mine = ++current;
  root.dataset.vt = "theme";
  root.style.setProperty("--vt-x", `${x}px`);
  root.style.setProperty("--vt-y", `${y}px`);
  root.style.setProperty("--vt-r", `${r}px`);
  const vt = (document as Doc).startViewTransition!(() => flushSync(apply));
  void vt.finished.finally(() => {
    if (current !== mine) return;
    delete root.dataset.vt;
    for (const n of ["--vt-x", "--vt-y", "--vt-r"]) root.style.removeProperty(n);
  });
}
