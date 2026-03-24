"use client";

import { Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { cn } from "@/lib/cn";
import { IOSInstallBanner } from "./ios-install-banner";

const cardClassName =
  "flex w-full items-start gap-3 rounded-xl border border-green-800/50 bg-green-950/40 p-3 text-left select-none touch-manipulation [-webkit-touch-callout:none]";

export function InstallCard() {
  const { t } = useTranslation();
  const { showBanner, isIos, promptInstall, canPrompt } = usePwaInstall();

  if (!showBanner) return null;

  if (isIos && !canPrompt) {
    return <IOSInstallBanner />;
  }

  const body = (
    <>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-600/20 text-green-400">
        <Download className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-green-400">{t("installCard.title")}</p>
        {canPrompt ? (
          <>
            <p className="mt-0.5 text-xs text-neutral-400">
              {t("installCard.bodyPrompt")}
            </p>
            <p className="mt-2 text-xs font-semibold text-green-500/90">{t("installCard.tapToInstall")}</p>
          </>
        ) : (
          <p className="mt-0.5 text-xs text-neutral-400">
            {t("installCard.bodyNoPrompt")}
          </p>
        )}
      </div>
    </>
  );

  if (canPrompt) {
    return (
      <button
        type="button"
        onClick={() => void promptInstall()}
        className={cn(
          cardClassName,
          "cursor-pointer transition-colors hover:bg-green-950/55 active:bg-green-900/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
        )}
      >
        {body}
      </button>
    );
  }

  return <div className={cardClassName}>{body}</div>;
}
