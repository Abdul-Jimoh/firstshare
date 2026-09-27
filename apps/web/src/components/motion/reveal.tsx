"use client";

import { useRef } from "react";
import { gsap, reducedMotion, SplitText, useGSAP, whenVisible } from "./gsap";

type RevealProps = {
  children: React.ReactNode;
  className?: string;
  y?: number;
  delay?: number;
  stagger?: number;
};

export function Reveal({ children, className, y = 18, delay = 0, stagger }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    (_, contextSafe) => {
      const el = ref.current!;
      gsap.set(el, { autoAlpha: 1 });
      if (reducedMotion()) return;
      const targets = stagger ? Array.from(el.children) : [el];
      gsap.set(targets, { autoAlpha: 0, y });
      return whenVisible(
        el,
        contextSafe!(() => {
          gsap.to(targets, {
            autoAlpha: 1,
            y: 0,
            duration: 0.6,
            delay,
            stagger: stagger ?? 0,
            ease: "power3.out",
            clearProps: "transform",
          });
        }),
      );
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
    (_, contextSafe) => {
      const el = ref.current!;
      gsap.set(el, { autoAlpha: 1 });
      if (reducedMotion()) return;
      let shown = false;
      const split = SplitText.create(el, {
        type: "lines",
        mask: "lines",
        autoSplit: true,
        onSplit(self) {
          if (!shown) gsap.set(self.lines, { yPercent: 110 });
        },
      });
      return whenVisible(
        el,
        contextSafe!(() => {
          shown = true;
          gsap.to(split.lines, { yPercent: 0, duration: 0.9, ease: "power4.out", stagger: 0.08 });
        }),
      );
    },
    { scope: ref },
  );

  return (
    <Tag ref={ref} data-animate className={className}>
      {children}
    </Tag>
  );
}
