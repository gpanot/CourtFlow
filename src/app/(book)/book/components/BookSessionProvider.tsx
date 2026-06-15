"use client";

// No longer wraps next-auth SessionProvider — raw OAuth flow uses cookies directly.
export function BookSessionProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
