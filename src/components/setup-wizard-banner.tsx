"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { Building2, Users, Link2, Check, ChevronDown, ChevronUp, PartyPopper } from "lucide-react";

interface SetupStatus {
  hasVenue: boolean;
  hasStaff: boolean;
  staffAssignedToVenue: boolean;
  hasSession: boolean;
  venueName: string | null;
}

const SETUP_STEPS = [
  {
    key: "hasVenue" as const,
    label: "Add venue",
    icon: Building2,
    href: "/admin/venues",
    description: "Create your venue and courts",
  },
  {
    key: "hasStaff" as const,
    label: "Add Staff",
    icon: Users,
    href: "/admin/staff",
    description: "Create staff accounts",
  },
  {
    key: "staffAssignedToVenue" as const,
    label: "Assign to venue",
    icon: Link2,
    href: "/admin/staff",
    description: "Link staff to your venue",
  },
];

const DISMISSED_KEY = "courtflow:setup-banner-dismissed";

export function SetupWizardBanner() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(DISMISSED_KEY) === "true";
  });
  const [collapsed, setCollapsed] = useState(false);

  const fetchStatus = useCallback(() => {
    api
      .get<SetupStatus>("/api/admin/setup-status")
      .then(setStatus)
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10_000);
    const onFocus = () => fetchStatus();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchStatus]);

  if (!status || dismissed) return null;

  const stepsComplete = SETUP_STEPS.filter((s) => status[s.key]).length;
  const allSetupDone = stepsComplete === SETUP_STEPS.length;
  const currentStepIndex = SETUP_STEPS.findIndex((s) => !status[s.key]);

  return (
    <div
      className={cn(
        "mb-4 rounded-xl border md:mb-6",
        allSetupDone
          ? "border-green-500/30 bg-green-950/40"
          : "border-green-500/20 bg-green-950/30"
      )}
    >
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-green-400">
            {allSetupDone ? "Setup complete" : "How to start"}
          </span>
          <span className="rounded-full bg-green-600/20 px-2 py-0.5 text-[10px] font-medium text-green-400">
            {stepsComplete}/{SETUP_STEPS.length}
          </span>
        </div>
        {collapsed ? (
          <ChevronDown className="h-4 w-4 text-green-400" />
        ) : (
          <ChevronUp className="h-4 w-4 text-green-400" />
        )}
      </button>

      {!collapsed && (
        <div className="px-4 pb-4">
          {/* Desktop: horizontal steps */}
          <div className="hidden md:flex items-center gap-1">
            {SETUP_STEPS.map((step, i) => {
              const done = status[step.key];
              const isCurrent = i === currentStepIndex;
              const StepIcon = step.icon;

              const content = (
                <div
                  className={cn(
                    "flex flex-1 items-center gap-2 rounded-lg px-3 py-2.5 transition-colors",
                    done
                      ? "bg-green-600/10"
                      : isCurrent
                        ? "bg-neutral-800/80 ring-1 ring-green-500/40"
                        : "bg-neutral-800/40 opacity-50"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                      done
                        ? "bg-green-600 text-white"
                        : isCurrent
                          ? "bg-green-600/20 text-green-400"
                          : "bg-neutral-700 text-neutral-500"
                    )}
                  >
                    {done ? <Check className="h-3.5 w-3.5" /> : <StepIcon className="h-3.5 w-3.5" />}
                  </div>
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "text-xs font-medium truncate",
                        done ? "text-green-400" : isCurrent ? "text-white" : "text-neutral-500"
                      )}
                    >
                      {step.label}
                    </p>
                  </div>
                </div>
              );

              return (
                <div key={step.key} className="flex flex-1 items-center gap-1">
                  {step.href && isCurrent ? (
                    <Link href={step.href} className="flex-1">
                      {content}
                    </Link>
                  ) : (
                    <div className="flex-1">{content}</div>
                  )}
                  {i < SETUP_STEPS.length - 1 && (
                    <div
                      className={cn(
                        "h-0.5 w-4 shrink-0 rounded",
                        done ? "bg-green-600" : "bg-neutral-700"
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Mobile: vertical list */}
          <div className="space-y-2 md:hidden">
            {SETUP_STEPS.map((step, i) => {
              const done = status[step.key];
              const isCurrent = i === currentStepIndex;
              const StepIcon = step.icon;

              const content = (
                <div
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
                    done
                      ? "bg-green-600/10"
                      : isCurrent
                        ? "bg-neutral-800/80 ring-1 ring-green-500/40"
                        : "bg-neutral-800/40 opacity-50"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                      done
                        ? "bg-green-600 text-white"
                        : isCurrent
                          ? "bg-green-600/20 text-green-400"
                          : "bg-neutral-700 text-neutral-500"
                    )}
                  >
                    {done ? <Check className="h-3.5 w-3.5" /> : <StepIcon className="h-3.5 w-3.5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-sm font-medium",
                        done ? "text-green-400" : isCurrent ? "text-white" : "text-neutral-500"
                      )}
                    >
                      {step.label}
                    </p>
                    {isCurrent && (
                      <p className="text-xs text-neutral-400">{step.description}</p>
                    )}
                  </div>
                </div>
              );

              return step.href && isCurrent ? (
                <Link key={step.key} href={step.href}>
                  {content}
                </Link>
              ) : (
                <div key={step.key}>{content}</div>
              );
            })}
          </div>

          {/* Success message when all setup steps are done */}
          {allSetupDone && (
            <div className="mt-3 flex items-center gap-3 rounded-lg bg-green-600/15 px-4 py-3">
              <PartyPopper className="h-5 w-5 shrink-0 text-green-400" />
              <p className="text-sm font-medium text-green-300">
                You are all set. Your staff or yourself can run events!
              </p>
            </div>
          )}

          {/* Dismiss */}
          <div className="mt-3 flex justify-end">
            <button
              onClick={() => {
                if (allSetupDone) {
                  localStorage.setItem(DISMISSED_KEY, "true");
                }
                setDismissed(true);
              }}
              className="text-[11px] text-neutral-600 hover:text-neutral-400"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
