"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Pembungkus tab atau menu dengan garis bawah yang meluncur ke item aktif (gerak pegas design system).
 * Item aktif dikenali dari `aria-pressed="true"` (tab) atau `aria-current="page"` (menu). Posisinya
 * diukur dan dipasang sebagai variabel CSS (`--bar-x/-y/-w`); animasinya di app/ua-extras.css.
 * Tanpa item aktif (mis. halaman Admin) garisnya memudar.
 */
export function Slide({
  as = "div",
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement> & { as?: "div" | "nav" }) {
  const [box, setBox] = useState<HTMLElement | null>(null);
  const [ready, setReady] = useState(false);

  const measure = () => {
    const el = box?.querySelector<HTMLElement>('[aria-pressed="true"], [aria-current="page"]');
    if (!box) return;
    if (!el) return void box.style.setProperty("--bar-o", "0");
    box.style.setProperty("--bar-x", `${el.offsetLeft}px`);
    box.style.setProperty("--bar-y", `${el.offsetTop + el.offsetHeight}px`);
    box.style.setProperty("--bar-w", `${el.offsetWidth}px`);
    box.style.setProperty("--bar-o", "1");
  };

  // Item aktif berganti saat render: ukur lagi (murah: tiga pembacaan offset).
  useLayoutEffect(measure);

  // Pengamat ukuran dan font dibuat sekali per elemen, bukan tiap render.
  const latest = useRef(measure);
  useLayoutEffect(() => {
    latest.current = measure;
  });
  useEffect(() => {
    if (!box) return;
    // Transisi baru dinyalakan setelah ukuran pertama terpasang, supaya garis tidak meluncur dari kiri-atas.
    const raf = requestAnimationFrame(() => setReady(true));
    const ro = new ResizeObserver(() => latest.current());
    ro.observe(box);
    void document.fonts?.ready.then(() => latest.current());
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [box]);

  const Tag = as as "div";
  return (
    <Tag ref={setBox} className={cn("ua-slide", ready && "is-ready", className)} {...props}>
      {children}
      <span className="ua-slide__bar" aria-hidden />
    </Tag>
  );
}
