"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { Magnetic } from "./motion/magnetic";
import { gsap, reducedMotion, useGSAP } from "./motion/gsap";

const SLICE = 2 * Math.PI * 7;

export function Mark({ className = "size-7", animate = false }: { className?: string; animate?: boolean }) {
  const slice = useRef<SVGCircleElement>(null);

  useGSAP(() => {
    if (!animate || reducedMotion()) return;
    gsap.fromTo(
      slice.current,
      { strokeDashoffset: SLICE },
      { strokeDashoffset: SLICE * 0.75, duration: 1.4, ease: "power3.inOut", delay: 0.2 },
    );
  });

  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <circle
        ref={slice}
        cx="16"
        cy="16"
        r="7"
        fill="none"
        stroke="currentColor"
        strokeWidth="14"
        strokeDasharray={SLICE}
        strokeDashoffset={SLICE * 0.75}
        transform="rotate(-90 16 16)"
      />
    </svg>
  );
}

const NAV = [
  { href: "/stocks", label: "Explore" },
  { href: "/#how", label: "How it works" },
  { href: "/#trust", label: "Is it safe?" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const nav = useRef<HTMLElement>(null);
  const pill = useRef<HTMLSpanElement>(null);

  const slideTo = (el: HTMLElement) => {
    gsap.to(pill.current, { x: el.offsetLeft, width: el.offsetWidth, autoAlpha: 1, duration: 0.45, ease: "power3.out" });
  };

  return (
    <header className="sticky top-0 z-40 bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" className="group flex items-center gap-2 text-xl font-semibold sm:text-2xl tracking-tight">
          <span className="transition duration-500 group-hover:rotate-90">
            <Mark animate />
          </span>
          firstshare
        </Link>
        <nav
          ref={nav}
          onMouseLeave={() => gsap.to(pill.current, { autoAlpha: 0, duration: 0.3 })}
          className="relative hidden items-center rounded-full border border-line bg-surface p-1 text-sm sm:flex"
        >
          <span ref={pill} aria-hidden className="invisible absolute inset-y-1 left-0 w-0 rounded-full bg-bg" />
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onMouseEnter={(e) => slideTo(e.currentTarget)}
              className={`relative rounded-full px-4 py-2 transition-colors hover:text-ink ${pathname.startsWith(item.href) && item.href !== "/" ? "text-ink" : "text-muted"}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <Magnetic>
          <Link href="/stocks" className="block rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition hover:bg-ink/85">
            Start with $1
          </Link>
        </Magnetic>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mx-auto mt-24 max-w-6xl border-t border-line px-5 py-10 text-sm text-muted sm:px-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row">
        <p className="flex items-center gap-2">
          <Mark className="size-4" />
          Tokenized stocks on BNB Smart Chain. You hold them in your own wallet.
        </p>
        <p>Not investment advice. Prices move, and you can lose money.</p>
      </div>
    </footer>
  );
}
