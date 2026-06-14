"use client";
export const dynamic = "force-dynamic";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import Image from "next/image";
import { useTranslation } from "react-i18next";

const SLIDE_IMAGES = ["/images/intro1.png", "/images/intro2_avatar.jpeg", "/images/intro3.jpeg"] as const;

export default function IntroPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [slide, setSlide] = useState(0);
  const touchStartX = useRef<number | null>(null);

  const slides = t("intro.slides", { returnObjects: true }) as {
    imageAlt: string;
    tag: string;
    title: string;
    body: string;
    cta: string;
  }[];

  function goNext() {
    if (slide < SLIDE_IMAGES.length - 1) {
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
    if (diff > 50 && slide < SLIDE_IMAGES.length - 1) setSlide((s) => s + 1);
    if (diff < -50 && slide > 0) setSlide((s) => s - 1);
    touchStartX.current = null;
  }

  const s = slides[slide] ?? slides[0];
  const isLast = slide === SLIDE_IMAGES.length - 1;

  return (
    <div
      className="h-dvh flex flex-col bg-[var(--cm-bg)] text-[var(--cm-text)] select-none overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {SLIDE_IMAGES.map((image, i) => i !== slide && (
        <link key={i} rel="preload" as="image" href={image} />
      ))}

      <div className="relative w-full flex-shrink-0" style={{ height: "51dvh" }}>
        {SLIDE_IMAGES.map((image, i) => (
          <Image
            key={image}
            src={image}
            alt={slides[i]?.imageAlt ?? ""}
            fill
            className={`object-cover transition-opacity duration-300 ${i === slide ? "opacity-100" : "opacity-0 pointer-events-none"}`}
            priority={i === 0}
          />
        ))}
        <div
          className="absolute inset-x-0 bottom-0 h-16 z-10"
          style={{ background: "linear-gradient(to top, var(--cm-bg), transparent)" }}
        />

        {!isLast && (
          <button
            onClick={skip}
            className="absolute top-[calc(1rem+env(safe-area-inset-top))] right-4 z-20 text-xs font-medium text-white/70 bg-black/30 backdrop-blur-sm px-3 py-1.5 rounded-full"
          >
            {t("intro.skip")}
          </button>
        )}
      </div>

      <div className="flex flex-1 min-h-0 flex-col px-7 pt-3">
        <div className="flex-shrink-0">
          <p className="text-xs font-semibold tracking-widest text-[var(--cm-accent)] mb-2">{s.tag}</p>
          <h1 className="text-[1.5rem] leading-tight font-extrabold mb-3 whitespace-pre-line">
            {s.title}
          </h1>
          <p className="text-sm text-[var(--cm-text-sec)] leading-relaxed">{s.body}</p>
        </div>

        <div className="mt-auto flex-shrink-0 flex flex-col gap-4 pt-[0.7rem] pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-center gap-2">
            {SLIDE_IMAGES.map((_, i) => (
              <button
                key={i}
                onClick={() => setSlide(i)}
                aria-label={`Slide ${i + 1}`}
                className={`rounded-full transition-all duration-300 ${
                  i === slide
                    ? "w-6 h-2 bg-[var(--cm-accent)]"
                    : "w-2 h-2 bg-[var(--cm-text-muted)]"
                }`}
              />
            ))}
          </div>

          <button
            onClick={goNext}
            className="w-full py-3.5 rounded-2xl font-bold text-base bg-[var(--cm-accent)] text-black active:scale-95 transition-transform"
          >
            {s.cta}
          </button>
        </div>
      </div>
    </div>
  );
}
