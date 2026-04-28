"use client";

import { useCallback, useState } from "react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { ScanFace, Loader2, Search } from "lucide-react";

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

export function PlayerDetailFaceRecognition({
  playerId,
  faceSubjectId,
  facePhotoPath,
  avatarPhotoPath,
  onUpdate,
}: {
  playerId: string;
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
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
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

  const handleEnrollFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (!f) return;
      setEnrollBusy(true);
      setEnrollError(null);
      try {
        const b64 = await fileToBase64(f);
        const res = await api.post<{
          success: boolean;
          faceSubjectId: string | null;
          facePhotoPath: string | null;
        }>(`/api/admin/players/${playerId}/face`, { imageBase64: b64 });
        onUpdate({
          faceSubjectId: res.faceSubjectId,
          facePhotoPath: res.facePhotoPath,
        });
        setEnrollOpen(false);
      } catch (err: unknown) {
        setEnrollError(
          err && typeof err === "object" && "message" in err
            ? String((err as { message: string }).message)
            : "Enrollment failed"
        );
      } finally {
        setEnrollBusy(false);
        e.target.value = "";
      }
    },
    [playerId, onUpdate]
  );

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
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-200 ring-1 ring-amber-500/35 hover:bg-amber-500/30 disabled:opacity-50"
              >
                {verifyBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                Verify in collection
              </button>
            )}
            <button
              type="button"
              onClick={handleRemove}
              disabled={removeBusy}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 ring-1 ring-red-500/25 hover:bg-red-500/20 disabled:opacity-50"
            >
              {removeBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Remove face
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
            <p className="rounded-md bg-amber-500/10 px-2 py-1.5 text-xs text-amber-200 ring-1 ring-amber-500/30">
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
          <div>
            <button
              type="button"
              onClick={() => {
                setEnrollOpen((o) => !o);
                setEnrollError(null);
              }}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-200 ring-1 ring-amber-500/30 hover:bg-amber-500/30"
            >
              Enroll face
            </button>
            {enrollOpen && (
              <div className="mt-3 space-y-2 rounded-lg border border-neutral-800 bg-black/30 p-3">
                <p className="text-[11px] text-neutral-500">Upload a clear frontal face photo (camera or file)</p>
                <input
                  type="file"
                  accept="image/*"
                  capture="user"
                  className="text-xs text-neutral-400 file:mr-2 file:rounded file:border-0 file:bg-neutral-800 file:px-2 file:py-1 file:text-white"
                  onChange={handleEnrollFile}
                  disabled={enrollBusy}
                />
                {enrollBusy && (
                  <p className="text-xs text-neutral-500">
                    <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> Enrolling…
                  </p>
                )}
                {enrollError && <p className="text-xs text-red-400">{enrollError}</p>}
                <button
                  type="button"
                  onClick={() => setEnrollOpen(false)}
                  className="text-xs text-neutral-500 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
