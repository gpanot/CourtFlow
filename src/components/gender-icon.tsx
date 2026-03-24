"use client";

import { User, Mars, Venus } from "lucide-react";
import { cn } from "@/lib/cn";

export function GenderIcon({ gender, className }: { gender?: string; className?: string }) {
  const cls = cn("shrink-0 opacity-50", className);
  if (gender === "female") {
    return <Venus className={cn(cls, "text-pink-400")} aria-hidden />;
  }
  if (gender === "male") {
    return <Mars className={cn(cls, "text-sky-400")} aria-hidden />;
  }
  return <User className={cn(cls, "text-neutral-500")} aria-hidden />;
}
