import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "CourtFlow TV",
  description: "Pickleball Court Display",
  manifest: "/manifest-tv.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black",
    title: "PB TV",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#000000",
};

export default function TVLayout({ children }: { children: React.ReactNode }) {
  return <div className="h-dvh overflow-hidden bg-black">{children}</div>;
}
