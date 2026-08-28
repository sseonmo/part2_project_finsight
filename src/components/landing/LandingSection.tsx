"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

type LandingSectionProps = {
  children: ReactNode;
  hint?: string;
  id?: string;
  label?: string;
  lead?: string;
  title: string;
};

/** 뷰포트에 처음 들어올 때 한 번만 true 가 된다. 동작 줄이기가 켜져 있으면 처음부터 true. */
function useRevealed(ref: RefObject<HTMLElement | null>): boolean {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const node = ref.current;

    if (!node || revealed) {
      return;
    }

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (reduced || typeof IntersectionObserver === "undefined") {
      setRevealed(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [ref, revealed]);

  return revealed;
}

export function LandingSection({
  children,
  hint,
  id,
  label,
  lead,
  title,
}: LandingSectionProps) {
  const ref = useRef<HTMLElement>(null);
  const revealed = useRevealed(ref);

  return (
    <section
      className={`landing-section landing-reveal${revealed ? " landing-reveal--in" : ""}`}
      id={id}
      ref={ref}
    >
      {label ? <span className="landing-section__eyebrow">{label}</span> : null}
      <h2 className="landing-section__title">{title}</h2>
      {lead ? <p className="landing-section__lead">{lead}</p> : null}
      {hint ? <p className="landing-section__hint">{hint}</p> : null}
      {children}
    </section>
  );
}
