"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { i18n as I18nInstance } from "i18next";
import { Camera, Loader2, Search, X } from "lucide-react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { filterQueueEntriesByStaffSearch } from "@/lib/staff-queue-search";
import {
  QueuePanel,
  type CourtInfo,
  type QueueEntryData,
  type StaffQueueCourtGroup,
} from "@/components/queue-panel";

type StaffIdentifyResponse =
  | {
      success: true;
      resultType: "matched";
      playerId: string;
      displayName?: string;
      queueNumber?: number;
      queuePosition?: number;
      queueEntryStatus?: string;
      inQueue?: boolean;
    }
  | { success: true; resultType: string; displayName?: string }
  | { success: false; resultType: string; error?: string };

type StaffPlayerSearchOverlayProps = {
  venueId: string;
  hasSession: boolean;
  queue: QueueEntryData[];
  translationI18n: I18nInstance;
  assignableCourts?: CourtInfo[];
  staffQueueCourtGroups: StaffQueueCourtGroup[];
  isWarmupManual: boolean;
  onPlayerAction: (
    playerId: string,
    playerName: string,
    action:
      | "remove_from_queue"
      | "back_to_queue"
      | "end_session"
      | "change_level"
      | "assign_to_court"
      | "edit_player",
    data?: Record<string, unknown>
  ) => void | Promise<void>;
  onCreateGroup?: () => void;
  onDissolveGroup?: (groupId: string) => void;
  onClose: () => void;
  onRefresh: () => void | Promise<unknown>;
};

const PROCESSING_TIMEOUT_MS = 12000;

export function StaffPlayerSearchOverlay({
  venueId,
  hasSession,
  queue,
  translationI18n,
  assignableCourts,
  staffQueueCourtGroups,
  isWarmupManual,
  onPlayerAction,
  onCreateGroup,
  onDissolveGroup,
  onClose,
  onRefresh,
}: StaffPlayerSearchOverlayProps) {
  const { t } = useTranslation("translation", { i18n: translationI18n });
  const [query, setQuery] = useState("");
  const [identifyNote, setIdentifyNote] = useState<string | null>(null);
  const [faceOpen, setFaceOpen] = useState(false);
  const [faceBusy, setFaceBusy] = useState(false);
  const [faceErr, setFaceErr] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filteredQueue = useMemo(() => filterQueueEntriesByStaffSearch(queue, query), [queue, query]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startCamera = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (!videoRef.current) {
        stream.getTracks().forEach((tr) => tr.stop());
        return false;
      }
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      return true;
    } catch {
      setFaceErr(t("staff.dashboard.playerSearch.cameraDenied"));
      return false;
    }
  }, [t]);

  const captureB64 = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx || video.videoWidth === 0) return null;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.85).split(",")[1] ?? null;
  }, []);

  const runIdentify = useCallback(
    async (imageBase64: string) => {
      setFaceBusy(true);
      setFaceErr("");
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setFaceErr(t("staff.dashboard.playerSearch.faceTimeout"));
        setFaceBusy(false);
        stopCamera();
        setFaceOpen(false);
      }, PROCESSING_TIMEOUT_MS);

      try {
        const res = await api.post<StaffIdentifyResponse>("/api/kiosk/staff-identify-face", {
          venueId,
          imageBase64,
        });
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }

        if (!res.success) {
          setFaceErr(res.error ?? t("staff.dashboard.playerSearch.faceFailed"));
          return;
        }

        if (res.resultType === "matched" && "playerId" in res) {
          const num = res.queueNumber;
          if (num != null && num > 0) {
            setQuery(String(num));
          } else if (res.displayName?.trim()) {
            setQuery(res.displayName.trim());
          }
          setIdentifyNote(
            res.inQueue === false
              ? t("staff.dashboard.playerSearch.notInQueue", {
                  name: res.displayName?.trim() || t("staff.dashboard.playerSearch.thisPlayer"),
                })
              : null
          );
          await onRefresh();
          setFaceOpen(false);
          stopCamera();
          return;
        }

        if (res.resultType === "new_player") {
          setFaceErr(t("staff.dashboard.playerSearch.faceNoMatch"));
          return;
        }

        setFaceErr(t("staff.dashboard.playerSearch.faceUnhandled"));
      } catch (e) {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        setFaceErr(e instanceof Error ? e.message : t("staff.dashboard.playerSearch.faceFailed"));
      } finally {
        setFaceBusy(false);
      }
    },
    [venueId, onRefresh, stopCamera, t]
  );

  const openFaceSheet = useCallback(async () => {
    if (!hasSession) return;
    setFaceErr("");
    setFaceOpen(true);
    const ok = await startCamera();
    if (!ok) setFaceOpen(false);
  }, [hasSession, startCamera]);

  const closeFaceSheet = useCallback(() => {
    stopCamera();
    setFaceOpen(false);
    setFaceErr("");
    setFaceBusy(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, [stopCamera]);

  const onCaptureFace = useCallback(async () => {
    const b64 = captureB64();
    if (!b64) {
      setFaceErr(t("staff.dashboard.playerSearch.noFrame"));
      return;
    }
    stopCamera();
    await runIdentify(b64);
  }, [captureB64, runIdentify, stopCamera, t]);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-neutral-950">
      <div className="flex items-center gap-3 border-b border-neutral-800 px-4 py-3 shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
          aria-label={t("staff.dashboard.playerSearch.closeAria")}
        >
          <X className="h-5 w-5" />
        </button>
        <h2 className="flex-1 text-lg font-semibold text-white">{t("staff.dashboard.playerSearch.title")}</h2>
      </div>

      <div className="shrink-0 space-y-3 border-b border-neutral-800 p-4">
        {!hasSession ? (
          <p className="text-sm text-neutral-500">{t("staff.dashboard.playerSearch.needSession")}</p>
        ) : (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setIdentifyNote(null);
                }}
                placeholder={t("staff.dashboard.playerSearch.placeholder")}
                className="w-full rounded-xl border border-neutral-700 bg-neutral-900 py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-neutral-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                autoComplete="off"
                enterKeyHint="search"
              />
            </div>
            <button
              type="button"
              onClick={openFaceSheet}
              disabled={faceBusy}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-600 bg-neutral-800/80 py-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {faceBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              {t("staff.dashboard.playerSearch.scanFace")}
            </button>
            {identifyNote ? (
              <p className="text-sm text-amber-400/95">{identifyNote}</p>
            ) : null}
          </>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {hasSession && query.trim() && filteredQueue.length === 0 && (
          <p className="mb-3 text-sm text-neutral-500">{t("staff.dashboard.playerSearch.noResults")}</p>
        )}
        {hasSession && (
          <QueuePanel
            entries={filteredQueue}
            staffQueuePositionSourceEntries={queue}
            variant="staff"
            maxDisplay={80}
            translationI18n={translationI18n}
            onPlayerAction={onPlayerAction}
            onCreateGroup={onCreateGroup}
            onDissolveGroup={onDissolveGroup}
            isWarmupManual={isWarmupManual}
            courts={assignableCourts}
            queueCourtGroups={staffQueueCourtGroups}
          />
        )}
      </div>

      {faceOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-4"
          onClick={() => !faceBusy && closeFaceSheet()}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-900 p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-3 text-center text-sm font-medium text-white">
              {t("staff.dashboard.playerSearch.faceSheetTitle")}
            </p>
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-black">
              <video ref={videoRef} className="h-full w-full object-cover" playsInline muted autoPlay />
              <canvas ref={canvasRef} className="hidden" />
            </div>
            {faceErr ? <p className="mt-2 text-center text-sm text-amber-400">{faceErr}</p> : null}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={closeFaceSheet}
                disabled={faceBusy}
                className="flex-1 rounded-xl border border-neutral-600 py-3 text-sm font-medium text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
              >
                {t("staff.dashboard.playerSearch.cancel")}
              </button>
              <button
                type="button"
                onClick={onCaptureFace}
                disabled={faceBusy}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium text-white",
                  faceBusy ? "bg-blue-800/50" : "bg-blue-600 hover:bg-blue-500"
                )}
              >
                {faceBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                {t("staff.dashboard.playerSearch.capture")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
