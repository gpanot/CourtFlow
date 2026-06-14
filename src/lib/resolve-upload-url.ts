/** Turn a stored upload path into a browser-loadable URL. */
export function resolveUploadUrl(url: string | null | undefined): string | null {
  if (!url || url === "pending_proof") return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const path = url.startsWith("/") ? url : `/${url}`;
  if (typeof window !== "undefined") return `${window.location.origin}${path}`;
  return path;
}
