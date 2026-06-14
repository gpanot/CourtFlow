"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { usePlayerSession } from "./usePlayerSession";
import { useState, useEffect } from "react";

const HIDDEN_PATHS = ["/book/login", "/book/intro", "/book/onboarding"];

const tabs = [
  { labelKey: "nav.book", href: "/book", icon: BookIcon, requiresAuth: false },
  { labelKey: "nav.coaches", href: "/book/coaches", icon: CoachIcon, requiresAuth: false },
  { labelKey: "nav.bookings", href: "/book/bookings", icon: BookingsIcon, requiresAuth: true },
  { labelKey: "nav.profile", href: "/book/account", icon: ProfileIcon, requiresAuth: true },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const { status } = usePlayerSession();
  const router = useRouter();
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const visible = mounted && status === "authenticated" && !HIDDEN_PATHS.includes(pathname);

  function isActive(href: string) {
    if (href === "/book") return pathname === "/book";
    return pathname.startsWith(href);
  }

  function handleClick(e: React.MouseEvent, tab: (typeof tabs)[number]) {
    if (tab.requiresAuth && status !== "authenticated") {
      e.preventDefault();
      router.push(`/book/login?callbackUrl=${encodeURIComponent(tab.href)}`);
    }
  }

  if (!visible) return null;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--cm-bg-card)] border-t border-[var(--cm-border)] pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex max-w-lg mx-auto">
        {tabs.map((tab) => {
          const active = isActive(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              onClick={(e) => handleClick(e, tab)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-xs transition-colors ${
                active ? "text-[var(--cm-accent)]" : "text-[var(--cm-text-muted)]"
              }`}
            >
              <tab.icon filled={active} />
              <span className="font-medium">{t(tab.labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function BookIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={filled ? 2.5 : 1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 2v4" />
      <path d="M16 2v4" />
    </svg>
  );
}

function CoachIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={filled ? 2.5 : 1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}

function BookingsIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={filled ? 2.5 : 1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 14l2 2 4-4" />
    </svg>
  );
}

function ProfileIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={filled ? 2.5 : 1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
