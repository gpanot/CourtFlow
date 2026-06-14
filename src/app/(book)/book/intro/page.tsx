"use client";
export const dynamic = "force-dynamic";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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

  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("intro_seen") === "1") {
      router.replace("/book/login");
    }
  }, [router]);

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
      className="min-h-dvh flex flex-col bg-[var(--cm-bg)] text-[var(--cm-text)] select-none overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {SLIDE_IMAGES.map((image, i) => i !== slide && (
        <link key={i} rel="preload" as="image" href={image} />
      ))}

      <div className="relative w-full flex-shrink-0" style={{ height: "55dvh" }}>
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
          className="absolute inset-x-0 bottom-0 h-24 z-10"
          style={{ background: "linear-gradient(to top, var(--cm-bg), transparent)" }}
        />

        {!isLast && (
          <button
            onClick={skip}
            className="absolute top-4 right-4 z-20 text-xs font-medium text-white/70 bg-black/30 backdrop-blur-sm px-3 py-1.5 rounded-full"
          >
            {t("intro.skip")}
          </button>
        )}
      </div>

      <div className="flex-1 flex flex-col px-7 pt-6 pb-4">
        <p className="text-xs font-semibold tracking-widest text-[var(--cm-accent)] mb-3">{s.tag}</p>
        <h1 className="text-[1.75rem] leading-tight font-extrabold mb-4 whitespace-pre-line">
          {s.title}
        </h1>
        <p className="text-sm text-[var(--cm-text-sec)] leading-relaxed">{s.body}</p>
      </div>

      <div className="px-7 pb-10 pt-4 flex flex-col gap-4 bg-[var(--cm-bg)]">
        <div className="flex items-center justify-center gap-2">
          {SLIDE_IMAGES.map((_, i) => (
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

        <button
          onClick={goNext}
          className="w-full py-4 rounded-2xl font-bold text-base bg-[var(--cm-accent)] text-black active:scale-95 transition-transform"
        >
          {s.cta}
        </button>
      </div>
    </div>
  );
}
