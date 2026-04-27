"use client";

import { useCallback, useState } from "react";
import { api } from "@/lib/api-client";
import { ScanFace, Upload } from "lucide-react";
import { cn } from "@/lib/cn";

interface DiagnoseResponse {
  similarity: number | null;
  productionThreshold: number;
  passedProduction: boolean;
  confidenceBreakdown: {
    sourceFaceConfidence: number | null;
    targetFacesDetected: number;
    unmatchedFacesInTarget: number;
    compareThresholdUsed: number;
    notes?: string;
  };
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

function scoreBand(similarity: number | null): "muted" | "red" | "amber" | "green" {
  if (similarity == null || Number.isNaN(similarity)) return "muted";
  if (similarity < 80) return "red";
  if (similarity < 90) return "amber";
  return "green";
}

export default function FaceRecognitionTestPage() {
  const [imageA, setImageA] = useState<string | null>(null);
  const [imageB, setImageB] = useState<string | null>(null);
  const [previewA, setPreviewA] = useState<string | null>(null);
  const [previewB, setPreviewB] = useState<string | null>(null);
  const [similarity, setSimilarity] = useState<number | null>(null);
  const [productionThreshold, setProductionThreshold] = useState<number>(85);
  const [thresholdSlider, setThresholdSlider] = useState(85);
  const [detail, setDetail] = useState<DiagnoseResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPickA = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const b64 = await fileToBase64(f);
    setImageA(b64);
    setPreviewA(URL.createObjectURL(f));
    setError(null);
  }, []);

  const onPickB = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const b64 = await fileToBase64(f);
    setImageB(b64);
    setPreviewB(URL.createObjectURL(f));
    setError(null);
  }, []);

  async function runDiagnose() {
    if (!imageA?.trim() || !imageB?.trim()) {
      setError("Choose two photos first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<DiagnoseResponse>("/api/rekognition/diagnose", {
        imageBase64A: imageA,
        imageBase64B: imageB,
      });
      setDetail(res);
      setSimilarity(res.similarity);
      setProductionThreshold(res.productionThreshold);
      setThresholdSlider(res.productionThreshold);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "Request failed";
      setError(msg);
      setDetail(null);
      setSimilarity(null);
    } finally {
      setLoading(false);
    }
  }

  const passedAtSlider =
    similarity != null && similarity >= thresholdSlider;

  const band = scoreBand(similarity);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <div className="mb-2 flex items-center gap-2 text-purple-400">
          <ScanFace className="h-6 w-6" />
          <h1 className="text-2xl font-bold text-white">Face Recognition Test</h1>
        </div>
        <p className="text-sm text-neutral-400">
          Compare two photos with AWS Rekognition{" "}
          <span className="text-neutral-500">(CompareFaces)</span>. Live check-in uses{" "}
          <span className="text-neutral-500">SearchFacesByImage</span> against your collection — scores
          differ slightly, but this helps tune similarity expectations.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <label className="block rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
          <span className="mb-2 flex items-center gap-2 text-sm font-medium text-neutral-300">
            <Upload className="h-4 w-4" /> Image A (source)
          </span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="text-sm text-neutral-400 file:mr-2 file:rounded-lg file:border-0 file:bg-neutral-800 file:px-3 file:py-1.5 file:text-white"
            onChange={onPickA}
          />
          {previewA && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewA}
              alt="Preview A"
              className="mt-3 max-h-48 w-full rounded-lg object-contain"
            />
          )}
        </label>

        <label className="block rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
          <span className="mb-2 flex items-center gap-2 text-sm font-medium text-neutral-300">
            <Upload className="h-4 w-4" /> Image B (target)
          </span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="text-sm text-neutral-400 file:mr-2 file:rounded-lg file:border-0 file:bg-neutral-800 file:px-3 file:py-1.5 file:text-white"
            onChange={onPickB}
          />
          {previewB && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewB}
              alt="Preview B"
              className="mt-3 max-h-48 w-full rounded-lg object-contain"
            />
          )}
        </label>
      </div>

      <button
        type="button"
        onClick={runDiagnose}
        disabled={loading || !imageA || !imageB}
        className="w-full rounded-xl bg-purple-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
      >
        {loading ? "Running…" : "Run comparison"}
      </button>

      {error && (
        <p className="rounded-lg border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {similarity != null && detail && (
        <div className="space-y-6 rounded-xl border border-neutral-800 bg-neutral-900/40 p-6">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-neutral-500">Similarity</p>
              <p
                className={cn(
                  "text-4xl font-bold tabular-nums",
                  band === "red" && "text-red-400",
                  band === "amber" && "text-amber-400",
                  band === "green" && "text-emerald-400",
                  band === "muted" && "text-neutral-500"
                )}
              >
                {similarity.toFixed(1)}%
              </p>
            </div>
            <div
              className={cn(
                "rounded-lg px-3 py-1 text-sm font-medium",
                band === "red" && "bg-red-950/60 text-red-300",
                band === "amber" && "bg-amber-950/60 text-amber-200",
                band === "green" && "bg-emerald-950/60 text-emerald-200",
                band === "muted" && "bg-neutral-800 text-neutral-400"
              )}
            >
              {band === "red" && "< 80 — weak"}
              {band === "amber" && "80–89 — moderate"}
              {band === "green" && "90+ — strong"}
              {band === "muted" && "—"}
            </div>
          </div>

          <div>
            <div className="mb-2 flex justify-between text-sm text-neutral-400">
              <span>Test threshold (slider)</span>
              <span className="tabular-nums text-white">{thresholdSlider}%</span>
            </div>
            <input
              type="range"
              min={70}
              max={99}
              value={thresholdSlider}
              onChange={(e) => setThresholdSlider(Number(e.target.value))}
              className="h-2 w-full cursor-pointer accent-purple-500"
            />
            <p className="mt-3 text-sm">
              <span className="text-neutral-500">At {thresholdSlider}%: </span>
              <span
                className={cn(
                  "font-semibold",
                  passedAtSlider ? "text-emerald-400" : "text-red-400"
                )}
              >
                {passedAtSlider ? "PASS" : "FAIL"}
              </span>
            </p>
          </div>

          <div className="grid gap-4 border-t border-neutral-800 pt-4 text-sm sm:grid-cols-2">
            <div>
              <p className="text-neutral-500">Production threshold (env)</p>
              <p className="font-mono text-lg text-white">{productionThreshold}%</p>
            </div>
            <div>
              <p className="text-neutral-500">Would pass production gate</p>
              <p
                className={cn(
                  "font-semibold",
                  detail.passedProduction ? "text-emerald-400" : "text-red-400"
                )}
              >
                {detail.passedProduction ? "Yes" : "No"}
              </p>
            </div>
          </div>

          <div className="border-t border-neutral-800 pt-4 text-sm text-neutral-400">
            <p className="mb-2 font-medium text-neutral-300">Confidence breakdown</p>
            <ul className="space-y-1 font-mono text-xs">
              <li>
                Source face confidence:{" "}
                {detail.confidenceBreakdown.sourceFaceConfidence?.toFixed(1) ?? "—"}
              </li>
              <li>Target faces (matched + unmatched): {detail.confidenceBreakdown.targetFacesDetected}</li>
              <li>Unmatched in target: {detail.confidenceBreakdown.unmatchedFacesInTarget}</li>
              {detail.confidenceBreakdown.notes && (
                <li className="text-amber-400/90">{detail.confidenceBreakdown.notes}</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
