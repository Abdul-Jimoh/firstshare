"use client";

import gsap from "gsap";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(SplitText, useGSAP);

export { gsap, SplitText, useGSAP };

export function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// IntersectionObserver instead of ScrollTrigger: positions can't go stale when images or fonts shift the layout.
export function whenVisible(el: Element, run: () => void) {
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting || e.boundingClientRect.top < 0)) {
        io.disconnect();
        run();
      }
    },
    { rootMargin: "0px 0px -6% 0px" },
  );
  io.observe(el);
  return () => io.disconnect();
}
