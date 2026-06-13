import type { Metadata, Viewport } from "next";
import "../globals.css";
import { BookSessionProvider } from "./book/components/BookSessionProvider";
import { ThemeProvider } from "./book/components/ThemeProvider";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Book | CourtFlow",
  description: "Book courts, coaches, and packages",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0a0a0a",
  viewportFit: "cover",
};

export default function BookLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[var(--cm-bg)] text-[var(--cm-text)] antialiased min-h-dvh transition-colors">
      <BookSessionProvider>
        <ThemeProvider>{children}</ThemeProvider>
      </BookSessionProvider>
    </div>
  );
}
