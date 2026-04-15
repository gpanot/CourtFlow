import { NextResponse } from "next/server";

/** PWA manifest for staff flows — start_url opens staff login, not the player app. */
const STAFF_MANIFEST = {
  id: "/staff",
  name: "CourtFlow Staff",
  short_name: "Staff",
  description: "CourtFlow — staff court & queue management",
  start_url: "/staff",
  scope: "/",
  display: "standalone" as const,
  background_color: "#0a0a0a",
  theme_color: "#2563eb",
  orientation: "portrait" as const,
  icons: [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

export async function GET() {
  return NextResponse.json(STAFF_MANIFEST, {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "no-store",
    },
  });
}
