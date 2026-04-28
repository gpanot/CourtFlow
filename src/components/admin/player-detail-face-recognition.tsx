"use client";

import { useCallback, useState } from "react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { ScanFace, Loader2, Search, Download, WandSparkles } from "lucide-react";

interface SearchMatch {
  playerId: string;
  name: string;
  similarity: number;
  passedProduction: boolean;
  productionThreshold: number;
}

interface SearchResponse {
  searchFaceMatchThreshold: number;
  productionThreshold: number;
  matches: SearchMatch[];
  mock?: boolean;
  message?: string;
  noFaceInImage?: boolean;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = r.result as string;
      const b64 = s.includes(",") ? (s.split(",").pop() ?? s) : s;
      resolve(b64);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

async function fetchImageAsRawBase64(url: string): Promise<string> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Could not load image (${res.status})`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = r.result as string;
      const b64 = s.includes(",") ? (s.split(",").pop() ?? s) : s;
      resolve(b64);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function toSafeFileName(name: string): string {
  const base = name.trim() || "player";
  return base
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function downloadFromUrl(url: string, fileName: string): Promise<void> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

function downloadBase64Image(
  imageBase64: string,
  mimeType: string,
  fileName: string
): void {
  const href = `data:${mimeType};base64,${imageBase64}`;
  const a = document.createElement("a");
  a.href = href;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function PlayerDetailFaceRecognition({
  playerId,
  playerName,
  faceSubjectId,
  facePhotoPath,
  avatarPhotoPath,
  onUpdate,
}: {
  playerId: string;
  playerName: string;
  faceSubjectId: string | null | undefined;
  facePhotoPath: string | null | undefined;
  avatarPhotoPath: string | null | undefined;
  onUpdate: (patch: { faceSubjectId: string | null; facePhotoPath?: string | null }) => void;
}) {
  const enrolled = Boolean(faceSubjectId?.trim());
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollBusy, setEnrollBusy] = useState(false);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [removeBgBusy, setRemoveBgBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [removeBgPreviewBase64, setRemoveBgPreviewBase64] = useState<string | null>(null);
  const [removeBgPreviewMime, setRemoveBgPreviewMime] = useState<string>("image/png");
  const [selectedBase64, setSelectedBase64] = useState<string | null>(null);
  const [selectedMimeType, setSelectedMimeType] = useState<string>("image/png");
  const [selectedSourceLabel, setSelectedSourceLabel] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<{
    similarity: number | null;
    passedProduction: boolean | null;
    productionThreshold: number | null;
    status: "match" | "no_match" | "no_photo" | "error";
  } | null>(null);

  const handleRemove = useCallback(async () => {
    if (!confirm("Remove this face from AWS Rekognition? The player can be re-enrolled later.")) return;
    setRemoveBusy(true);
    setVerifyResult(null);
    setVerifyError(null);
    try {
      await api.delete(`/api/admin/players/${playerId}/face`);
      onUpdate({ faceSubjectId: null });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Remove failed");
    } finally {
      setRemoveBusy(false);
    }
  }, [playerId, onUpdate]);

  const handleDownloadOriginal = useCallback(async () => {
    if (!facePhotoPath) return;
    setDownloadBusy(true);
    setActionError(null);
    try {
      const fileBase = toSafeFileName(playerName);
      await downloadFromUrl(facePhotoPath, `${fileBase}-original.jpg`);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloadBusy(false);
    }
  }, [facePhotoPath, playerName]);

  const handleRemoveBackground = useCallback(async () => {
    setRemoveBgBusy(true);
    setActionError(null);
    setEnrollError(null);
    try {
      const res = await api.post<{
        success: boolean;
        imageBase64: string;
        mimeType: string;
      }>(`/api/admin/players/${playerId}/remove-bg`, {});
      const mime = res.mimeType || "image/png";
      setRemoveBgPreviewBase64(res.imageBase64);
      setRemoveBgPreviewMime(mime);
      setSelectedBase64(res.imageBase64);
      setSelectedMimeType(mime);
      setSelectedSourceLabel("Background-removed photo");
      const fileBase = toSafeFileName(playerName);
      downloadBase64Image(res.imageBase64, mime, `${fileBase}-bg-removed.png`);
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Background removal failed"
      );
    } finally {
      setRemoveBgBusy(false);
    }
  }, [playerId, playerName]);

  const handleUploadEditedPhoto = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (!f) return;
      setActionError(null);
      setEnrollError(null);
      const b64 = await fileToBase64(f);
      setSelectedBase64(b64);
      setSelectedMimeType(f.type || "image/jpeg");
      setSelectedSourceLabel("Uploaded edited photo");
      e.target.value = "";
    },
    []
  );

  const handleEnrollSelected = useCallback(async () => {
    if (!selectedBase64) return;
    setEnrollBusy(true);
    setEnrollError(null);
    try {
      if (enrolled) {
        await api.delete(`/api/admin/players/${playerId}/face`);
      }
      const res = await api.post<{
        success: boolean;
        faceSubjectId: string | null;
        facePhotoPath: string | null;
      }>(`/api/admin/players/${playerId}/face`, { imageBase64: selectedBase64 });
      onUpdate({
        faceSubjectId: res.faceSubjectId,
        facePhotoPath: res.facePhotoPath,
      });
      setEnrollOpen(false);
      setSelectedBase64(null);
      setSelectedSourceLabel(null);
    } catch (err: unknown) {
      setEnrollError(
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "Enrollment failed"
      );
    } finally {
      setEnrollBusy(false);
    }
  }, [selectedBase64, playerId, onUpdate, enrolled]);

  const selectedPreviewSrc = selectedBase64
    ? `data:${selectedMimeType};base64,${selectedBase64}`
    : null;
  const removeBgPreviewSrc = removeBgPreviewBase64
    ? `data:${removeBgPreviewMime};base64,${removeBgPreviewBase64}`
    : null;
  const canUseManualWorkflow = Boolean(facePhotoPath?.trim());
  const hasSelectedPhoto = Boolean(selectedBase64);
  const fileBaseName = toSafeFileName(playerName);
  const absoluteFacePhotoPath =
    facePhotoPath && typeof window !== "undefined"
      ? new URL(facePhotoPath, window.location.origin).href
      : facePhotoPath ?? "";

  const canInteract = !enrollBusy && !removeBgBusy && !downloadBusy;

  const handleVerify = useCallback(async () => {
    setVerifyBusy(true);
    setVerifyError(null);
    setVerifyResult(null);
    const src = facePhotoPath?.trim() || avatarPhotoPath?.trim() || "";
    if (!src) {
      setVerifyError("No photo on file. Upload a check-in or avatar photo first, or enroll a new face.");
      setVerifyBusy(false);
      setVerifyResult({
        similarity: null,
        passedProduction: null,
        productionThreshold: null,
        status: "no_photo",
      });
      return;
    }
    try {
      const absolute =
        src.startsWith("http://") || src.startsWith("https://")
          ? src
          : typeof window !== "undefined"
            ? new URL(src, window.location.origin).href
            : src;
      const b64 = await fetchImageAsRawBase64(absolute);
      const res = await api.post<SearchResponse>("/api/rekognition/search", {
        imageBase64: b64,
      });
      if (res.noFaceInImage) {
        setVerifyResult({
          similarity: null,
          passedProduction: null,
          productionThreshold: null,
          status: "error",
        });
        setVerifyError("No face detected in the stored photo.");
        return;
      }
      if (res.mock) {
        setVerifyError(
          res.message || "Rekognition is in mock mode; verification skipped."
        );
        setVerifyResult({
          similarity: null,
          passedProduction: null,
          productionThreshold: null,
          status: "error",
        });
        return;
      }
      const forPlayer = res.matches.find((m) => m.playerId === playerId);
      if (forPlayer) {
        setVerifyResult({
          similarity: forPlayer.similarity,
          passedProduction: forPlayer.passedProduction,
          productionThreshold: forPlayer.productionThreshold,
          status: "match",
        });
      } else {
        setVerifyResult({
          similarity: null,
          passedProduction: null,
          productionThreshold: res.productionThreshold,
          status: "no_match",
        });
      }
    } catch (e: unknown) {
      setVerifyError(
        e && typeof e === "object" && "message" in e
          ? String((e as { message: string }).message)
          : "Verification request failed"
      );
      setVerifyResult({
        similarity: null,
        passedProduction: null,
        productionThreshold: null,
        status: "error",
      });
    } finally {
      setVerifyBusy(false);
    }
  }, [playerId, facePhotoPath, avatarPhotoPath]);

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/80 p-3">
      <div className="mb-3 flex items-center gap-2">
        <ScanFace className="h-4 w-4 text-amber-500/90" />
        <p className="text-xs font-medium text-neutral-200">Face Recognition</p>
      </div>

      {enrolled ? (
        <div className="space-y-3">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold",
              "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
            )}
          >
            Enrolled in AWS Rekognition
          </span>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-neutral-500">AWS FaceId (stored)</p>
            <code className="mt-0.5 block break-all rounded-md bg-black/50 px-2 py-1.5 font-mono text-[11px] text-amber-100/90">
              {faceSubjectId}
            </code>
          </div>
          {facePhotoPath && (
            <div>
              <p className="mb-1.5 text-[10px] uppercase tracking-wide text-neutral-500">Face photo on file</p>
              <div className="relative h-20 w-20 overflow-hidden rounded-lg border border-neutral-700 bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={facePhotoPath}
                  alt="Face on file"
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {enrolled && (
              <button
                type="button"
                onClick={handleVerify}
                disabled={verifyBusy}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-400 bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-200 disabled:opacity-50"
              >
                {verifyBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                Verify in collection
              </button>
            )}
            <button
              type="button"
              onClick={handleRemove}
              disabled={removeBusy}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-400 bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-900 hover:bg-red-200 disabled:opacity-50"
            >
              {removeBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Remove AWS enrollment
            </button>
          </div>
          {verifyError && (
            <p className="text-xs text-red-400/90">{verifyError}</p>
          )}
          {verifyResult?.status === "match" && verifyResult.similarity != null && (
            <div className="flex flex-col gap-2 rounded-md bg-neutral-900/60 px-2 py-1.5 ring-1 ring-neutral-700/80">
              <p className="text-xs text-neutral-200">
                Top match for this player:{" "}
                <span className="font-semibold tabular-nums text-amber-100">
                  {verifyResult.similarity.toFixed(1)}%
                </span>{" "}
                (collection search, 50% minimum)
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-neutral-500">
                  vs production {verifyResult.productionThreshold ?? "—"}%:
                </span>
                <span
                  className={cn(
                    "rounded px-2 py-0.5 text-[11px] font-bold",
                    verifyResult.passedProduction
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-red-500/20 text-red-300"
                  )}
                >
                  {verifyResult.passedProduction ? "PASS" : "FAIL"}
                </span>
              </div>
            </div>
          )}
          {verifyResult?.status === "no_match" && !verifyError && (
            <p className="rounded-md border border-amber-300 bg-amber-100 px-2 py-1.5 text-xs text-amber-900">
              Top matches did not include this player at ≥50% similarity, or the stored photo does not
              match the indexed face. The DB FaceId may be stale; try re-enrolling after remove.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold",
              "bg-red-500/12 text-red-300 ring-1 ring-red-500/25"
            )}
          >
            Not enrolled
          </span>
          <p className="text-sm text-neutral-400">
            This player has no face registered in AWS Rekognition. They will be treated as a new player
            on check-in.
          </p>
        </div>
      )}

      <div className="mt-3 space-y-2">
        <button
          type="button"
          onClick={() => {
            setEnrollOpen((o) => !o);
            setActionError(null);
            setEnrollError(null);
          }}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-400 bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-200"
        >
          Manual re-enrollment tools
        </button>
        {enrollOpen && (
          <div className="space-y-3 rounded-lg border border-neutral-700 bg-white/70 p-3">
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-wide text-neutral-700">
                Step 1 — Download tools
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleDownloadOriginal}
                  disabled={!canUseManualWorkflow || !canInteract}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-400 bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-900 hover:bg-neutral-200 disabled:opacity-50"
                >
                  {downloadBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  Download photo
                </button>
                <button
                  type="button"
                  onClick={handleRemoveBackground}
                  disabled={!canUseManualWorkflow || !canInteract}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-purple-400 bg-purple-100 px-3 py-1.5 text-xs font-semibold text-purple-900 hover:bg-purple-200 disabled:opacity-50"
                >
                  {removeBgBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <WandSparkles className="h-3.5 w-3.5" />
                  )}
                  Remove background
                </button>
              </div>
              {!canUseManualWorkflow && (
                <p className="text-xs text-amber-700">
                  No stored check-in photo is available for this player.
                </p>
              )}
            </div>

            {removeBgPreviewSrc && (
              <div className="space-y-2">
                <p className="text-[11px] text-neutral-700">
                  Background-removed preview
                </p>
                <div className="relative h-24 w-24 overflow-hidden rounded-lg border border-neutral-500 bg-black">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={removeBgPreviewSrc}
                    alt="Background removed preview"
                    className="h-full w-full object-cover"
                  />
                </div>
                <p className="text-[11px] text-neutral-600">
                  Auto-downloaded as <code>{fileBaseName}-bg-removed.png</code>
                </p>
              </div>
            )}

            {removeBgPreviewSrc && (
              <div className="space-y-2">
                <p className="text-[11px] uppercase tracking-wide text-neutral-700">
                  Step 2 — Upload cleaned photo
                </p>
                <label className="block text-xs text-neutral-700">
                  Or upload your own edited photo
                </label>
                <input
                  type="file"
                  accept="image/*"
                  className="text-xs text-neutral-700 file:mr-2 file:rounded file:border file:border-neutral-400 file:bg-neutral-100 file:px-2 file:py-1 file:text-neutral-900"
                  onChange={handleUploadEditedPhoto}
                  disabled={!canInteract}
                />
                {selectedPreviewSrc && (
                  <div className="space-y-1">
                    <p className="text-[11px] text-neutral-600">
                      Selected photo: {selectedSourceLabel}
                    </p>
                    <div className="relative h-24 w-24 overflow-hidden rounded-lg border border-neutral-500 bg-black">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={selectedPreviewSrc}
                        alt="Selected photo preview"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {hasSelectedPhoto && (
              <div className="space-y-2">
                <p className="text-[11px] uppercase tracking-wide text-neutral-700">
                  Step 3 — Enroll to AWS
                </p>
                <button
                  type="button"
                  onClick={handleEnrollSelected}
                  disabled={!canInteract}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-400 bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-200 disabled:opacity-50"
                >
                  {enrollBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  {enrolled ? "Re-enroll to AWS Rekognition" : "Enroll to AWS Rekognition"}
                </button>
              </div>
            )}

            {absoluteFacePhotoPath && (
              <p className="text-[11px] text-neutral-600 break-all">
                Source photo: {absoluteFacePhotoPath}
              </p>
            )}
            {actionError && <p className="text-xs text-red-600">{actionError}</p>}
            {enrollError && <p className="text-xs text-red-600">{enrollError}</p>}
          </div>
        )}
      </div>

    </div>
  );
}
