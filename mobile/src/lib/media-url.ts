import { ENV } from "../config/env";

/** Turn stored paths like `/uploads/players/x.jpg` into absolute URLs for `<Image />`. */
export function resolveMediaUrl(path: string | null | undefined): string | null {
  if (!path?.trim()) return null;
  const p = path.trim();
  if (p.startsWith("http://") || p.startsWith("https://")) return p;
  const base = ENV.API_BASE_URL.replace(/\/+$/, "");
  const rel = p.startsWith("/") ? p : `/${p}`;
  return `${base}${rel}`;
}
