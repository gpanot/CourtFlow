const STORAGE_KEY = "player_token";

export function getPlayerToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

export function setPlayerToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, token);
}

export function clearPlayerToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

/** Decode JWT payload without verifying signature (client-side only). */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const base64 = token.split(".")[1];
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

export interface PlayerTokenData {
  playerId: string;
  email: string;
  type: string;
  exp: number;
}

export function getPlayerFromToken(): PlayerTokenData | null {
  const token = getPlayerToken();
  if (!token) return null;
  const payload = decodeJwtPayload(token) as PlayerTokenData | null;
  if (!payload || payload.type !== "player_credentials") return null;
  // Check expiry
  if (payload.exp && payload.exp * 1000 < Date.now()) {
    clearPlayerToken();
    return null;
  }
  return payload;
}

export function isCredentialsPlayer(): boolean {
  return getPlayerFromToken() !== null;
}
