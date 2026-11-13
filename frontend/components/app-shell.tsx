"use client";

import { Menu, Moon, Sun, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { Slide } from "@/components/ui/slide";
import { switchTheme } from "@/lib/theme-transition";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Ringkasan" },
  { href: "/evaluasi", label: "Evaluasi" },
  { href: "/kesalahan", label: "Kesalahan" },
  { href: "/data", label: "Pemain" },
  { href: "/simulator", label: "Simulator" },
  { href: "/rekomendasi", label: "Rekomendasi" },
];

const PAD = "px-[clamp(16px,4vw,48px)]";

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const dark = mounted && resolvedTheme === "dark";
  return (
    <Button
      variant="outline"
      size="icon"
      aria-label={dark ? "Ganti ke mode terang" : "Ganti ke mode gelap"}
      title={dark ? "Ganti ke mode terang" : "Ganti ke mode gelap"}
      onClick={(e) => {
        const b = e.currentTarget.getBoundingClientRect();
        switchTheme(dark ? "light" : "dark", setTheme, {
          x: b.left + b.width / 2,
          y: b.top + b.height / 2,
        });
      }}
    >
      <span key={dark ? "dark" : "light"} className="ua-theme-glyph">
        {dark ? (
          <Sun aria-hidden className="size-[18px]" />
        ) : (
          <Moon aria-hidden className="size-[18px]" />
        )}
      </span>
    </Button>
  );
}

/** Logo geometris lintasan kurva nilai pasar & lapangan. */
function LogoMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2" y="3" width="20" height="18" rx="3" stroke="var(--text)" strokeWidth="2" />
      <path
        d="M5 16L9.5 11.5L13 14L19 7"
        stroke="var(--series-1)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="19" cy="7" r="2" fill="var(--series-2)" />
    </svg>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === pathname;

  const links = NAV.map((n) => {
    const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
    return (
      <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}>
        {n.label}
      </Link>
    );
  });

  return (
    <>
      <a href="#konten" className="ua-skip">
        Lewati ke konten
      </a>
      <header>
        <div className="ua-nav-bar">
          <Link href="/" className="ua-brand mr-auto">
            <LogoMark />
            Sport Louvre
          </Link>
          <Slide as="nav" aria-label="Navigasi utama" className="ua-nav hidden lg:flex">
            {links}
          </Slide>
          <ThemeToggle />
          <Button
            variant="outline"
            size="icon"
            className="lg:hidden"
            aria-expanded={open}
            aria-controls="nav-mobile"
            aria-label={open ? "Tutup menu" : "Buka menu"}
            onClick={() => setOpenFor(open ? null : pathname)}
          >
            {open ? (
              <X aria-hidden className="size-[18px]" />
            ) : (
              <Menu aria-hidden className="size-[18px]" />
            )}
          </Button>
        </div>
        {open ? (
          <Slide
            as="nav"
            id="nav-mobile"
            aria-label="Navigasi utama"
            className={cn("ua-nav mx-auto grid max-w-[1240px] gap-0 pb-3 lg:hidden", PAD)}
          >
            {links}
          </Slide>
        ) : null}
      </header>
      <main
        id="konten"
        className={cn("mx-auto flex max-w-[1240px] flex-col gap-[72px] pt-6 pb-[72px]", PAD)}
      >
        {children}
      </main>
      <footer className={cn("mx-auto max-w-[1240px] pb-10", PAD)}>
        <div className="ua-footer flex flex-wrap items-start gap-x-12 gap-y-4 pt-6 text-[14px] leading-[1.6] text-ink-3">
          <p className="m-0 max-w-[66ch] flex-[999_1_420px]">
            <strong className="font-bold text-ink-2">Sumber data:</strong> Transfermarkt Market Value
            Trajectories (2025/2026) — 508 pemain dari 5 liga top Eropa dan 9.764 titik valuasi
            historis. Split 80:20 (406 latih, 102 uji, <code className="text-[12px]">random_state=42</code>).
          </p>
          <p className="m-0 text-[13px] text-ink-3">
            Sport Louvre · AI Case Challenge
          </p>
        </div>
      </footer>
    </>
  );
}
