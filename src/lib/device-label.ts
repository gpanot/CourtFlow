/**
 * Returns a human-readable device label from navigator.userAgent.
 * Examples: "Chrome on iPhone", "Safari on iPad", "Chrome on Samsung SM-N960F", "Firefox on Windows"
 * Returns undefined when called outside a browser context (SSR).
 */
export function getDeviceLabel(): string | undefined {
  if (typeof navigator === "undefined") return undefined;
  const ua = navigator.userAgent;

  // --- OS / device detection ---
  let device = "Unknown";

  // Android: often includes exact model e.g. "Android 13; SM-N960F"
  const androidModel = ua.match(/Android[^;]*;\s*([^)]+)\)/);
  if (androidModel) {
    device = androidModel[1].trim();
  } else if (/iPad/.test(ua)) {
    device = "iPad";
  } else if (/iPhone/.test(ua)) {
    device = "iPhone";
  } else if (/Macintosh/.test(ua)) {
    device = "Mac";
  } else if (/Windows/.test(ua)) {
    device = "Windows";
  } else if (/Linux/.test(ua)) {
    device = "Linux";
  }

  // --- Browser detection ---
  let browser = "Browser";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/.test(ua)) browser = "Opera";
  else if (/SamsungBrowser/.test(ua)) browser = "Samsung";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua)) browser = "Safari";

  return `${browser} on ${device} (PWA)`;
}
