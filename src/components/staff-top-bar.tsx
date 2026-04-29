"use client";

import type { ReactNode } from "react";
import { CourtFlowLogo } from "@/components/courtflow-logo";

interface StaffTopBarProps {
  className?: string;
  rightSlot?: ReactNode;
}

export function StaffTopBar({ className = "", rightSlot }: StaffTopBarProps) {
  return (
    <header className={`w-full border-b border-neutral-800 bg-neutral-950/95 px-4 py-3 backdrop-blur-sm ${className}`}>
      <div className="mx-auto flex w-full max-w-sm items-center justify-between gap-3">
        <CourtFlowLogo size="small" dark asLink={false} />
        {rightSlot ? <div className="flex shrink-0 items-center">{rightSlot}</div> : null}
      </div>
    </header>
  );
}
