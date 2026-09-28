"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Magnetic } from "./motion/magnetic";
import { Arrow } from "./stock";
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
  const pill = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const slideTo = (el: HTMLElement) => {
    gsap.to(pill.current, { x: el.offsetLeft, width: el.offsetWidth, autoAlpha: 1, duration: 0.45, ease: "power3.out" });
  };

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onResize = () => window.innerWidth >= 640 && setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  useGSAP(
    () => {
      const el = panel.current!;
      const items = el.querySelectorAll("[data-menu-item]");
      if (reducedMotion()) {
        gsap.set(el, { height: open ? "auto" : 0 });
        return;
      }
      if (open) {
        gsap.to(el, { height: "auto", duration: 0.5, ease: "power4.out" });
        gsap.fromTo(
          items,
          { yPercent: 100, autoAlpha: 0 },
          { yPercent: 0, autoAlpha: 1, duration: 0.5, stagger: 0.05, ease: "power3.out", delay: 0.05 },
        );
      } else {
        gsap.to(el, { height: 0, duration: 0.35, ease: "power3.inOut" });
      }
    },
    { dependencies: [open] },
  );

  return (
    <header className="sticky top-0 z-40 bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8 sm:py-5">
        <Link href="/" className="group flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
          <span className="transition duration-500 group-hover:rotate-90">
            <Mark animate />
          </span>
          firstshare
        </Link>
        <nav
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
        <Magnetic className="hidden sm:inline-block">
          <Link href="/stocks" className="block rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition hover:bg-ink/85">
            Start with $1
          </Link>
        </Magnetic>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          className="relative flex size-11 items-center justify-center rounded-full border border-line bg-surface sm:hidden"
        >
          <span className={`absolute h-0.5 w-4.5 rounded-full bg-ink transition duration-300 ${open ? "rotate-45" : "-translate-y-1"}`} />
          <span className={`absolute h-0.5 w-4.5 rounded-full bg-ink transition duration-300 ${open ? "-rotate-45" : "translate-y-1"}`} />
        </button>
      </div>
      <div id="mobile-menu" ref={panel} inert={!open} className="h-0 overflow-hidden sm:hidden">
        <nav className="flex flex-col gap-1 border-t border-line px-5 pb-6 pt-4">
          {NAV.map((item) => (
            <div key={item.href} className="overflow-hidden">
              <Link
                data-menu-item
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex items-center justify-between py-3 text-3xl font-medium tracking-tight"
              >
                {item.label}
                <Arrow className="size-5 text-muted" />
              </Link>
            </div>
          ))}
          <div className="mt-4 overflow-hidden">
            <Link
              data-menu-item
              href="/stocks"
              onClick={() => setOpen(false)}
              className="block rounded-full bg-ink px-5 py-4 text-center text-sm font-medium text-white"
            >
              Start with $1
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mx-auto mt-20 max-w-7xl border-t sm:mt-24 border-line px-5 py-10 text-sm text-muted sm:px-8">
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
