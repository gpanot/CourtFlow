import { clearPlayerToken, getPlayerToken } from "@/lib/player-token";

/** Sign out from either auth path and return to the intro carousel. */
export async function signOutToIntro() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("intro_seen");
  }
  clearPlayerToken();
  // Clear the httpOnly player_token cookie via the session DELETE endpoint
  await fetch("/api/auth/player/session", { method: "DELETE", credentials: "include" }).catch(() => {});
  if (typeof window !== "undefined") {
    window.location.href = "/book/intro";
  }
}
