"use client";

import { useSessionStore } from "@/stores/session-store";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { LayoutDashboard, MapPin, Users, UserCircle, BarChart3, LogOut } from "lucide-react";

const navItems = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/venues", label: "Venues", icon: MapPin },
  { href: "/admin/staff", label: "Staff", icon: Users },
  { href: "/admin/players", label: "Players", icon: UserCircle },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { token, role, clearAuth } = useSessionStore();
  const pathname = usePathname();

  if (!token || role !== "superadmin") {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="text-center">
          <h1 className="mb-4 text-2xl font-bold text-purple-500">Super Admin</h1>
          <p className="mb-4 text-neutral-400">Please log in via the Staff portal first.</p>
          <Link href="/staff" className="text-blue-400 hover:underline">
            Go to Staff Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh bg-neutral-950 text-white">
      <aside className="w-56 shrink-0 border-r border-neutral-800 p-4">
        <div className="mb-6">
          <h1 className="text-lg font-bold text-purple-500">Admin Panel</h1>
          <p className="text-xs text-neutral-500">CourtFlow</p>
        </div>

        <nav className="space-y-1">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-purple-600/20 text-purple-400"
                    : "text-neutral-400 hover:bg-neutral-800 hover:text-white"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <button
          onClick={clearAuth}
          className="mt-8 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-white"
        >
          <LogOut className="h-4 w-4" /> Sign Out
        </button>
      </aside>

      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
