"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";

const SLIDES = [
  {
    image: "/images/intro1.png",
    imageAlt: "Pickleball court outdoor",
    tag: "COURTFLOW",
    title: "Find your court.\nNo group chats\nrequired.",
    body: "Stop asking around. Every verified court near you — book instantly, confirmed in seconds.",
    cta: "Next",
  },
  {
    image: "/images/intro2_avatar.jpeg",
    imageAlt: "Coach on the court",
    tag: "TRUST",
    title: "Ratings you can\nactually trust.",
    body: "Every review comes from a player who completed at least 3 sessions. No fake stars. No bought reviews. Just honest feedback.",
    cta: "Next",
  },
  {
    image: "/images/intro3.jpeg",
    imageAlt: "Players on a pickleball court",
    tag: "BOOK NOW",
    title: "The best coaches\nfill up fast.",
    body: "Stop waiting for a reply that might not come. See real availability, book instantly, get confirmed in seconds.",
    cta: "Get started",
  },
] as const;

export default function IntroPage() {
  const router = useRouter();
  const [slide, setSlide] = useState(0);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("intro_seen") === "1") {
      router.replace("/book/login");
    }
  }, [router]);

  function goNext() {
    if (slide < SLIDES.length - 1) {
      setSlide((s) => s + 1);
    } else {
      localStorage.setItem("intro_seen", "1");
      router.push("/book/login");
    }
  }

  function skip() {
    localStorage.setItem("intro_seen", "1");
    router.push("/book/login");
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (diff > 50 && slide < SLIDES.length - 1) setSlide((s) => s + 1);
    if (diff < -50 && slide > 0) setSlide((s) => s - 1);
    touchStartX.current = null;
  }

  const s = SLIDES[slide];
  const isLast = slide === SLIDES.length - 1;

  return (
    <div
      className="min-h-dvh flex flex-col bg-[var(--cm-bg)] text-[var(--cm-text)] select-none overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Image — top ~55% */}
      <div className="relative w-full flex-shrink-0" style={{ height: "55dvh" }}>
        <Image
          src={s.image}
          alt={s.imageAlt}
          fill
          className="object-cover"
          priority
        />
        {/* Gradient fade to bg at bottom */}
        <div
          className="absolute inset-x-0 bottom-0 h-24"
          style={{ background: "linear-gradient(to top, var(--cm-bg), transparent)" }}
        />

        {/* Skip button top-right */}
        {!isLast && (
          <button
            onClick={skip}
            className="absolute top-4 right-4 z-10 text-xs font-medium text-white/70 bg-black/30 backdrop-blur-sm px-3 py-1.5 rounded-full"
          >
            Skip
          </button>
        )}
      </div>

      {/* Content — bottom ~45% */}
      <div className="flex-1 flex flex-col px-7 pt-6 pb-8">
        {/* Tag */}
        <p className="text-xs font-semibold tracking-widest text-[var(--cm-accent)] mb-3">{s.tag}</p>

        {/* Title */}
        <h1 className="text-[1.75rem] leading-tight font-extrabold mb-4 whitespace-pre-line">
          {s.title}
        </h1>

        {/* Body */}
        <p className="text-sm text-[var(--cm-text-sec)] leading-relaxed flex-1">{s.body}</p>

        {/* Dots + CTA */}
        <div className="mt-6 flex flex-col gap-5">
          {/* Dot pagination */}
          <div className="flex items-center justify-center gap-2">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => setSlide(i)}
                className={`rounded-full transition-all duration-300 ${
                  i === slide
                    ? "w-6 h-2 bg-[var(--cm-accent)]"
                    : "w-2 h-2 bg-[var(--cm-text-muted)]"
                }`}
              />
            ))}
          </div>

          {/* CTA */}
          <button
            onClick={goNext}
            className="w-full py-4 rounded-2xl font-bold text-base bg-[var(--cm-accent)] text-black active:scale-95 transition-transform"
          >
            {s.cta}
          </button>
        </div>
      </div>
    </div>
  );
}
