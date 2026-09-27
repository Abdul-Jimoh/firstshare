"use client";

import { useRef } from "react";
import { gsap, reducedMotion, SplitText, useGSAP } from "./gsap";

type RevealProps = {
  children: React.ReactNode;
  className?: string;
  y?: number;
  delay?: number;
  stagger?: number;
};

export function Reveal({ children, className, y = 28, delay = 0, stagger }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = ref.current!;
      if (reducedMotion()) return;
      const targets = stagger ? Array.from(el.children) : el;
      gsap.set(el, { autoAlpha: 1 });
      gsap.from(targets, {
        y,
        autoAlpha: 0,
        duration: 0.9,
        delay,
        stagger: stagger ?? 0,
        ease: "power3.out",
        scrollTrigger: { trigger: el, start: "top 88%", once: true },
      });
    },
    { scope: ref },
  );

  return (
    <div ref={ref} data-animate className={className}>
      {children}
    </div>
  );
}

export function SplitHeading({ children, className, as: Tag = "h2" }: { children: React.ReactNode; className?: string; as?: "h1" | "h2" }) {
  const ref = useRef<HTMLHeadingElement>(null);

  useGSAP(
    () => {
      const el = ref.current!;
      if (reducedMotion()) return;
      SplitText.create(el, {
        type: "lines",
        mask: "lines",
        autoSplit: true,
        onSplit(self) {
          gsap.set(el, { autoAlpha: 1 });
          return gsap.from(self.lines, {
            yPercent: 110,
            duration: 1.1,
            ease: "power4.out",
            stagger: 0.09,
            scrollTrigger: { trigger: el, start: "top 88%", once: true },
          });
        },
      });
    },
    { scope: ref },
  );

  return (
    <Tag ref={ref} data-animate className={className}>
      {children}
    </Tag>
  );
}
