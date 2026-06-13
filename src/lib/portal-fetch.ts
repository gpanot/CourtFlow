"use client";

import { getPlayerToken } from "@/lib/player-token";

/**
 * Authenticated fetch for the player portal.
 * Automatically attaches the Bearer token if the user is logged in
 * via the credentials (email/password) path.
 * For OAuth users the NextAuth session cookie is used automatically by the browser.
 */
export function portalFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = getPlayerToken();
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return fetch(url, { ...init, headers });
}
