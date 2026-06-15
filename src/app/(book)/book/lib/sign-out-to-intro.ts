import { signOut } from "next-auth/react";
import { clearPlayerToken, getPlayerToken } from "@/lib/player-token";

/** Sign out from either auth path and return to the intro carousel. */
export function signOutToIntro() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("intro_seen");
  }
  // If using credentials token, just clear it and navigate
  if (getPlayerToken()) {
    clearPlayerToken();
    if (typeof window !== "undefined") {
      window.location.href = "/book/intro";
    }
    return Promise.resolve();
  }
  // OAuth: use NextAuth signOut
  return signOut({ redirectTo: "/book/intro" });
}
