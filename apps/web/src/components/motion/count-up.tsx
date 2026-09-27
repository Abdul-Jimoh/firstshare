"use client";

import { useRef } from "react";
import { gsap, reducedMotion, useGSAP } from "./gsap";

export function CountUp({ value, prefix = "", duration = 1.6 }: { value: number; prefix?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      const el = ref.current!;
      if (reducedMotion()) return;
      const counter = { n: 0 };
      gsap.to(counter, {
        n: value,
        duration,
        ease: "power2.out",
        scrollTrigger: { trigger: el, start: "top 92%", once: true },
        onUpdate: () => {
          el.textContent = `${prefix}${Math.round(counter.n)}`;
        },
      });
      el.textContent = `${prefix}0`;
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
