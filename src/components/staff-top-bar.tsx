"use client";

import { CourtFlowLogo } from "@/components/courtflow-logo";

interface StaffTopBarProps {
  className?: string;
}

export function StaffTopBar({ className = "" }: StaffTopBarProps) {
  return (
    <header className={`w-full border-b border-neutral-800 bg-neutral-950/95 px-4 py-3 backdrop-blur-sm ${className}`}>
      <div className="mx-auto flex w-full max-w-sm items-center">
        <CourtFlowLogo size="small" dark asLink={false} />
      </div>
    </header>
  );
}
