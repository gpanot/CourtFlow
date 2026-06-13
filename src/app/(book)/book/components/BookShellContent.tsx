"use client";

import { usePathname } from "next/navigation";
import { usePlayerSession } from "./usePlayerSession";

const NO_NAV_PATHS = ["/book/login", "/book/intro", "/book/onboarding"];

export function BookShellContent({ children }: { children: React.ReactNode }) {
  const { status } = usePlayerSession();
  const pathname = usePathname();
  const showNav = status === "authenticated" && !NO_NAV_PATHS.includes(pathname);

  return <main className={`flex-1 ${showNav ? "pb-20" : ""}`}>{children}</main>;
}
