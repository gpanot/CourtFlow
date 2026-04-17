const trimTrailingSlash = (s: string) => s.replace(/\/+$/, "");

const PRODUCTION_API_DEFAULT = "https://courtflow-production-0441.up.railway.app";

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * True for hosts that must not ship in release builds (LAN, loopback, link-local).
 * Set EXPO_PUBLIC_ALLOW_PRIVATE_API_IN_RELEASE=true to opt out (internal QA only).
 */
function isPrivateOrLocalApiHost(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "[::1]" ||
      host === "0.0.0.0"
    ) {
      return true;
    }
    if (/^10\.\d+\.\d+\.\d+$/.test(host)) return true;
    if (/^192\.168\.\d+\.\d+$/.test(host)) return true;
    const m = /^172\.(\d+)\.\d+\.\d+$/.exec(host);
    if (m) {
      const second = parseInt(m[1], 10);
      if (second >= 16 && second <= 31) return true;
    }
    if (/^169\.254\.\d+\.\d+$/.test(host)) return true;
    if (host.endsWith(".local")) return true;
    return false;
  } catch {
    return false;
  }
}

function allowPrivateApiInRelease(): boolean {
  return (
    isNonEmptyString(process.env.EXPO_PUBLIC_ALLOW_PRIVATE_API_IN_RELEASE) &&
    process.env.EXPO_PUBLIC_ALLOW_PRIVATE_API_IN_RELEASE.trim().toLowerCase() ===
      "true"
  );
}

function shouldStripPrivateHostsInRelease(): boolean {
  return (
    typeof __DEV__ !== "undefined" &&
    !__DEV__ &&
    !allowPrivateApiInRelease()
  );
}

function resolveApiBase(): string {
  const fromEnv = isNonEmptyString(process.env.EXPO_PUBLIC_API_BASE_URL)
    ? trimTrailingSlash(process.env.EXPO_PUBLIC_API_BASE_URL.trim())
    : PRODUCTION_API_DEFAULT;

  if (!shouldStripPrivateHostsInRelease()) return fromEnv;
  if (isPrivateOrLocalApiHost(fromEnv)) return PRODUCTION_API_DEFAULT;
  return fromEnv;
}

const apiBase = resolveApiBase();

function resolveSocketUrl(): string {
  const fromEnv = isNonEmptyString(process.env.EXPO_PUBLIC_SOCKET_URL)
    ? trimTrailingSlash(process.env.EXPO_PUBLIC_SOCKET_URL.trim())
    : apiBase;

  if (!shouldStripPrivateHostsInRelease()) return fromEnv;
  if (isPrivateOrLocalApiHost(fromEnv)) return apiBase;
  return fromEnv;
}

function resolveAdminWeb(): string {
  const fromEnv = isNonEmptyString(process.env.EXPO_PUBLIC_ADMIN_WEB_URL)
    ? trimTrailingSlash(process.env.EXPO_PUBLIC_ADMIN_WEB_URL.trim())
    : `${apiBase}/admin`;

  if (!shouldStripPrivateHostsInRelease()) return fromEnv;
  if (isPrivateOrLocalApiHost(fromEnv)) return `${apiBase}/admin`;
  return fromEnv;
}

export const ENV = {
  API_BASE_URL: apiBase,
  SOCKET_URL: resolveSocketUrl(),
  ADMIN_WEB_URL: resolveAdminWeb(),
};
