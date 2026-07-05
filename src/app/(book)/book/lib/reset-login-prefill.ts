/** One-time handoff from reset-password confirm → login (sessionStorage, cleared on read). */
const KEY = "courtpass_reset_login_prefill";

export function storeResetLoginPrefill(email: string, password: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(KEY, JSON.stringify({ email, password }));
}

export function consumeResetLoginPrefill(): { email: string; password: string } | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(KEY);
  sessionStorage.removeItem(KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as { email?: string; password?: string };
    if (data.email && data.password) {
      return { email: data.email, password: data.password };
    }
  } catch {
    /* ignore */
  }
  return null;
}
