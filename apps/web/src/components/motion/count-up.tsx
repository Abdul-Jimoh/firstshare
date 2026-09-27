"use client";

import { useRef } from "react";
import { gsap, reducedMotion, useGSAP, whenVisible } from "./gsap";

export function CountUp({ value, prefix = "", duration = 1.4 }: { value: number; prefix?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useGSAP(
    (_, contextSafe) => {
      const el = ref.current!;
      if (reducedMotion()) return;
      const counter = { n: 0 };
      el.textContent = `${prefix}0`;
      return whenVisible(
        el,
        contextSafe!(() => {
          gsap.to(counter, {
            n: value,
            duration,
            ease: "power2.out",
            onUpdate: () => {
              el.textContent = `${prefix}${Math.round(counter.n)}`;
            },
          });
        }),
      );
    },
    { scope: ref, dependencies: [value] },
  );

  return (
    <span ref={ref}>
      {prefix}
      {value}
    </span>
  );
}
