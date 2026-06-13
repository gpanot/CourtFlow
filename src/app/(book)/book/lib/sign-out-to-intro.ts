import { signOut } from "next-auth/react";

/** Sign out and return to the intro carousel (slide 1). */
export function signOutToIntro() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("intro_seen");
  }
  return signOut({ callbackUrl: "/book/intro" });
}
