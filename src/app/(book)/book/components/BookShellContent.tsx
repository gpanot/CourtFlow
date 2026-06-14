"use client";

import { PlayerPaymentApprovedToasts } from "./PlayerPaymentApprovedToasts";

export function BookShellContent({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex-1 pb-20">
      <PlayerPaymentApprovedToasts />
      {children}
    </main>
  );
}
