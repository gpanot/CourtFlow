import type { ReactNode } from "react";

export default function StickerKioskLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        margin: 0,
        padding: 0,
        overflow: "hidden",
        width: "100vw",
        height: "100dvh",
        background: "#000000",
        color: "#ffffff",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        position: "fixed",
        inset: 0,
      }}
    >
      {children}
    </div>
  );
}
