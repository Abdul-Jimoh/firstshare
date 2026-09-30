"use client";

import { useRef } from "react";
import { gsap, reducedMotion, useGSAP } from "./motion/gsap";

const WORDS = ["Apple", "Nvidia", "Tesla", "the S&P 500", "Netflix", "Amazon"];

export function HeroHeadline() {
  const root = useRef<HTMLHeadingElement>(null);

  useGSAP(
    () => {
      const words = gsap.utils.toArray<HTMLElement>(".hero-word");
      gsap.set(root.current, { autoAlpha: 1 });
      if (reducedMotion()) return;
      gsap.set(words, { yPercent: (i: number) => (i ? 115 : 0), visibility: "visible" });

      gsap.from(".hero-line", { yPercent: 115, duration: 1.2, ease: "power4.out", stagger: 0.12, delay: 0.1 });

      let current = 0;
      let call: gsap.core.Tween;
      const step = () => {
        const next = (current + 1) % words.length;
        gsap.to(words[current]!, { yPercent: -115, duration: 0.75, ease: "power3.inOut", overwrite: true });
        gsap.fromTo(words[next]!, { yPercent: 115 }, { yPercent: 0, duration: 0.75, ease: "power3.inOut", overwrite: true });
        current = next;
        call = gsap.delayedCall(2.4, step);
      };
      call = gsap.delayedCall(2.2, step);
      return () => call.kill();
    },
    { scope: root },
  );

  return (
    <h1
      ref={root}
      data-animate
      aria-label="Own a piece of Apple, Nvidia, Tesla or the S&P 500 from $1"
      className="mx-auto max-w-5xl text-display"
    >
      <span aria-hidden className="block overflow-hidden pb-[0.1em]">
        <span className="hero-line block whitespace-nowrap">Own a piece of</span>
      </span>
      <span aria-hidden className="block overflow-hidden pb-[0.1em]">
        <span className="hero-line relative block h-[1.12em]">
          {WORDS.map((w, i) => (
            <span key={w} className={`hero-word absolute inset-x-0 top-0 whitespace-nowrap ${i ? "invisible" : ""}`}>
              <span className="inline-block rounded-[0.14em] bg-accent px-[0.16em] pb-[0.06em] leading-[1.06]">{w}</span>
            </span>
          ))}
        </span>
      </span>
      <span aria-hidden className="block overflow-hidden pb-[0.1em]">
        <span className="hero-line block text-muted">from $1.</span>
      </span>
    </h1>
  );
}
