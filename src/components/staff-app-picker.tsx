"use client";

import { clientConfigs } from "@/config/clients";
import type { StaffAppAccessKind } from "@/lib/staff-app-access";
import { CourtFlowLogo } from "@/components/courtflow-logo";

export function StaffAppPicker({
  venueName,
  appAccess,
  onSelect,
  onBack,
}: {
  venueName: string;
  appAccess: StaffAppAccessKind[];
  onSelect: (app: StaffAppAccessKind) => void;
  onBack?: () => void;
}) {
  const cf = clientConfigs.courtflow_default;
  const cp = clientConfigs.courtpay_client2;

  return (
    <div className="flex min-h-dvh flex-col bg-neutral-950 px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[calc(1.5rem+env(safe-area-inset-top))]">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center space-y-8">
        <div className="flex flex-col items-center gap-4">
          <CourtFlowLogo size="large" dark asLink={false} />
          <div className="text-center">
            <h1 className="text-xl font-semibold text-white">Which app would you like to open?</h1>
            <p className="mt-1 text-sm text-neutral-400">{venueName}</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {appAccess.includes("courtflow") && (
            <button
              type="button"
              onClick={() => onSelect("courtflow")}
              className="flex flex-col items-center gap-3 rounded-2xl border-2 bg-neutral-900/80 p-8 text-center transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ borderColor: cf.primaryColor }}
            >
              <span
                className="text-lg font-bold"
                style={{ color: cf.primaryColor }}
              >
                {cf.name}
              </span>
              <span className="text-xs text-neutral-500">Staff dashboard</span>
            </button>
          )}
          {appAccess.includes("courtpay") && (
            <button
              type="button"
              onClick={() => onSelect("courtpay")}
              className="flex flex-col items-center gap-3 rounded-2xl border-2 bg-neutral-900/80 p-8 text-center transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ borderColor: cp.primaryColor }}
            >
              <span
                className="text-lg font-bold"
                style={{ color: cp.primaryColor }}
              >
                {cp.name}
              </span>
              <span className="text-xs text-neutral-500">Staff dashboard</span>
            </button>
          )}
        </div>

        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="mx-auto text-sm text-neutral-500 transition-colors hover:text-neutral-300"
          >
            Back
          </button>
        ) : null}
      </div>
    </div>
  );
}
