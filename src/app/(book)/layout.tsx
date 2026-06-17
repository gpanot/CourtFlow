import type { Metadata, Viewport } from "next";
import "../globals.css";
import { BookSessionProvider } from "./book/components/BookSessionProvider";
import { BookI18nProvider } from "./book/components/BookI18nProvider";
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
  // White address bar on Android Chrome and Safari — keeps the UI feeling light.
  themeColor: "#ffffff",
  viewportFit: "cover",
};

export default function BookLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[var(--cm-bg)] text-[var(--cm-text)] antialiased min-h-dvh transition-colors">
      <BookI18nProvider>
        <BookSessionProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </BookSessionProvider>
      </BookI18nProvider>
    </div>
  );
}
