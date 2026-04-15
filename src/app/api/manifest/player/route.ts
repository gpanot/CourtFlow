import { NextRequest, NextResponse } from "next/server";

const BASE_MANIFEST = {
  id: "/player",
  name: "CourtFlow",
  short_name: "CourtFlow",
  description: "Pickleball Court Management System",
  scope: "/",
  display: "standalone" as const,
  background_color: "#0a0a0a",
  theme_color: "#16a34a",
  orientation: "portrait" as const,
  icons: [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  const startUrl = token ? `/player?reauth=${encodeURIComponent(token)}` : "/player";

  return NextResponse.json(
    { ...BASE_MANIFEST, start_url: startUrl },
    {
      headers: {
        "Content-Type": "application/manifest+json",
        "Cache-Control": "no-store",
      },
    }
  );
}
