"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Plus,
  Trash2,
  Loader2,
  User,
  Sparkles,
  Check,
  AlertCircle,
  Grid2x2,
  Download,
  BookTemplate,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { useSessionStore } from "@/stores/session-store";

const DEFAULT_PROMPT =
  `Create Zalo/WhatsApp sticker-style images using the real face of the uploaded person. Black background. A total of 4 diverse expressions: • "Just joking" (meaning: Sarcastic (Negative): Sometimes this phrase is used to imply that the other person is overly sensitive, "difficult," or has no sense of humor) • "Take it and buy Ticket" (hand holding a 100 usd bill) • "Shut down and go to sleep" (hand pointing straight at the person opposite, meaning to scold the other person to turn off their phone and go to sleep) • "Why don't we go Da Nang?!" (surprised, wondering expression) Each expression should include cute English/Vietnamese… text matching the slang context (not to be interpreted literally). Move the text to the bottom, forming a unified block with the character — text and image fused together as one complete sticker. Bubble-style font, bold/eye-catching colors, cute and adorable style.`;

interface StickerTemplateOption {
  id: string;
  name: string;
  malePrompt: string;
  femalePrompt: string;
}

interface StickerPhoto {
  id: string;
  imageUrl: string;
  slotIndex: number;
}

interface StickerResult {
  id?: string;
  imageUrl: string;
  model: string;
  size: string;
  costUsd: number;
  generationTimeSeconds: number | null;
  createdAt: string;
}

interface StickerPack {
  id: string;
  sticker1Url: string | null;
  sticker2Url: string | null;
  sticker3Url: string | null;
  sticker4Url: string | null;
  createdAt?: string;
}

interface Props {
  playerId: string;
  facePhotoPath: string | null | undefined;
  playerFirstName?: string;
  playerGender?: string | null;
}

export function PlayerDetailStickersTab({ playerId, facePhotoPath, playerFirstName, playerGender }: Props) {
  const sessionToken = useSessionStore((s) => s.token);

  // ── uploaded extra photos (slots 2–4)
  const [uploadedPhotos, setUploadedPhotos] = useState<StickerPhoto[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(true);

  // ── selected photo for generation
  // "checkin" | photo id
  const [selectedPhotoId, setSelectedPhotoId] = useState<string>("checkin");

  // ── slot upload states
  const [uploadingSlot, setUploadingSlot] = useState<number | null>(null);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);

  // ── templates
  const [templates, setTemplates] = useState<StickerTemplateOption[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("custom");

  // ── prompt
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);

  // ── model
  const [model, setModel] = useState("gpt-image-2");

  // ── generation
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [result, setResult] = useState<StickerResult | null>(null);

  // ── delete result
  const [deletingResult, setDeletingResult] = useState(false);
  const [showDeleteResultConfirm, setShowDeleteResultConfirm] = useState(false);

  // ── sticker packs (multiple, accumulate over time)
  const [stickerPacks, setStickerPacks] = useState<StickerPack[]>([]);
  const [splitting, setSplitting] = useState(false);
  const [splitError, setSplitError] = useState<string | null>(null);
  const [deletingPackId, setDeletingPackId] = useState<string | null>(null);

  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([null, null, null]);

  // ── Load sticker templates
  useEffect(() => {
    void (async () => {
      try {
        const data = await api.get<StickerTemplateOption[]>("/api/admin/sticker-templates");
        setTemplates(data ?? []);
      } catch {
        // silent — templates are optional
      }
    })();
  }, []);

  // ── Load existing uploaded photos, saved result, and pack on mount
  useEffect(() => {
    let cancelled = false;
    setLoadingPhotos(true);

    Promise.all([
      api.get<StickerPhoto[]>(`/api/admin/players/${playerId}/sticker-photos`).catch(() => [] as StickerPhoto[]),
      api.get<StickerResult & { packs?: StickerPack[] }>(`/api/admin/players/${playerId}/sticker-photos/result`).catch(() => null),
    ]).then(([photos, savedResult]) => {
      if (cancelled) return;
      setUploadedPhotos(photos ?? []);
      if (savedResult) {
        setResult(savedResult);
        if (savedResult.packs) setStickerPacks(savedResult.packs);
      }
    }).finally(() => {
      if (!cancelled) setLoadingPhotos(false);
    });

    return () => { cancelled = true; };
  }, [playerId]);

  const getPhotoForSlot = useCallback(
    (slotIndex: number) => uploadedPhotos.find((p) => p.slotIndex === slotIndex) ?? null,
    [uploadedPhotos]
  );

  const handleFileChange = useCallback(
    async (slotIndex: number, file: File) => {
      if (file.size > 5 * 1024 * 1024) {
        alert("File too large. Maximum size is 5 MB.");
        return;
      }
      setUploadingSlot(slotIndex);
      try {
        const formData = new FormData();
        formData.append("photo", file);
        formData.append("slotIndex", String(slotIndex));

        const uploaded = await api.upload<StickerPhoto>(
          `/api/admin/players/${playerId}/sticker-photos`,
          formData
        );
        setUploadedPhotos((prev) => {
          const without = prev.filter((p) => p.slotIndex !== slotIndex);
          return [...without, uploaded].sort((a, b) => a.slotIndex - b.slotIndex);
        });
      } catch (e) {
        alert(`Upload failed: ${(e as Error).message}`);
      } finally {
        setUploadingSlot(null);
      }
    },
    [playerId]
  );

  const handleDeletePhoto = useCallback(
    async (photo: StickerPhoto) => {
      setDeletingPhotoId(photo.id);
      try {
        await api.delete(`/api/admin/players/${playerId}/sticker-photos/${photo.id}`);
        setUploadedPhotos((prev) => prev.filter((p) => p.id !== photo.id));
        if (selectedPhotoId === photo.id) setSelectedPhotoId("checkin");
      } catch (e) {
        alert(`Delete failed: ${(e as Error).message}`);
      } finally {
        setDeletingPhotoId(null);
      }
    },
    [playerId, selectedPhotoId]
  );

  // ── filtered templates by player gender
  const filteredTemplates = templates.filter((t) => {
    if (!playerGender || playerGender === "other") return true;
    return true; // show all templates; gender determines which prompt field is used
  });

  const handleTemplateSelect = useCallback(
    (templateId: string) => {
      setSelectedTemplateId(templateId);
      if (templateId === "custom") return;
      const tpl = templates.find((t) => t.id === templateId);
      if (!tpl) return;
      const isFemale = playerGender === "female";
      setPrompt(isFemale ? tpl.femalePrompt : tpl.malePrompt);
    },
    [templates, playerGender]
  );

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;
    setGenerating(true);
    setGenError(null);
    setSplitError(null);
    try {
      // The generate endpoint streams NDJSON heartbeats to keep the connection
      // alive during long generations (gpt-image-2 can take 60–120s).
      // We read line-by-line and use the last non-heartbeat line as the result.
      const res = await fetch(`/api/admin/players/${playerId}/sticker-photos/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo_id: selectedPhotoId, prompt, model }),
      });
      if (!res.ok || !res.body) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let lastResultLine = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          const trimmed = line.trim();
          if (trimmed) lastResultLine = trimmed;
        }
      }
      if (!lastResultLine) throw new Error("No response from server");
      const parsed = JSON.parse(lastResultLine) as { status: string; error?: string } & StickerResult;
      if (parsed.status === "error" || parsed.error) {
        throw new Error(parsed.error ?? "Generation failed");
      }
      setResult(parsed);
    } catch (e) {
      setGenError((e as Error).message ?? "Generation failed");
    } finally {
      setGenerating(false);
    }
  }, [playerId, selectedPhotoId, prompt, model]);

  const handleDeleteResult = useCallback(async () => {
    setDeletingResult(true);
    try {
      await api.delete(`/api/admin/players/${playerId}/sticker-photos/result`);
      setResult(null);
      // Keep stickerPacks intact — admin deletes packs manually
      setShowDeleteResultConfirm(false);
    } catch (e) {
      alert(`Delete failed: ${(e as Error).message}`);
    } finally {
      setDeletingResult(false);
    }
  }, [playerId]);

  const handleDeletePack = useCallback(async (packId: string) => {
    if (!confirm("Delete this sticker pack? This cannot be undone.")) return;
    setDeletingPackId(packId);
    try {
      await api.delete(`/api/admin/players/${playerId}/sticker-photos/packs/${packId}`);
      setStickerPacks((prev) => prev.filter((p) => p.id !== packId));
    } catch (e) {
      alert(`Delete failed: ${(e as Error).message}`);
    } finally {
      setDeletingPackId(null);
    }
  }, [playerId]);

  const handleSplit = useCallback(async () => {
    setSplitting(true);
    setSplitError(null);
    try {
      const data = await api.post<StickerPack>(
        `/api/admin/players/${playerId}/sticker-photos/process`,
        {}
      );
      setStickerPacks((prev) => [data, ...prev]);
    } catch (e) {
      setSplitError((e as Error).message ?? "Splitting failed");
    } finally {
      setSplitting(false);
    }
  }, [playerId]);

  const [downloading, setDownloading] = useState(false);

  const handleDownloadPack = useCallback(async () => {
    const token = sessionToken;
    console.log("[DownloadPack] token present:", !!token, "| token prefix:", token?.slice(0, 20));

    if (!token) {
      console.error("[DownloadPack] No auth token found in session store — cannot download.");
      alert("Not authenticated. Please log out and log in again.");
      return;
    }

    const url = `/api/admin/players/${playerId}/sticker-photos/download-pack?token=${encodeURIComponent(token)}`;
    console.log("[DownloadPack] Fetching:", url.replace(/token=.*/, "token=***"));

    setDownloading(true);
    try {
      const res = await fetch(url);
      console.log("[DownloadPack] Response status:", res.status, res.statusText);
      console.log("[DownloadPack] Content-Type:", res.headers.get("content-type"));

      if (!res.ok) {
        const errText = await res.text();
        console.error("[DownloadPack] Server error:", errText);
        alert(`Download failed (${res.status}): ${errText}`);
        return;
      }

      const blob = await res.blob();
      console.log("[DownloadPack] Blob size:", blob.size, "bytes, type:", blob.type);

      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `stickers_${playerFirstName ?? "player"}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
      console.log("[DownloadPack] Download triggered successfully.");
    } catch (e) {
      console.error("[DownloadPack] Fetch error:", e);
      alert(`Download error: ${(e as Error).message}`);
    } finally {
      setDownloading(false);
    }
  }, [playerId, playerFirstName, sessionToken]);

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) +
      " at " +
      d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  };

  // Render a single photo slot
  const renderSlot = (slotIndex: number, refIdx: number) => {
    const isCheckin = slotIndex === 1;
    const photo = isCheckin ? null : getPhotoForSlot(slotIndex);
    const imageSrc = isCheckin ? (facePhotoPath ?? null) : photo?.imageUrl ?? null;
    const photoId = isCheckin ? "checkin" : (photo?.id ?? null);
    const isSelected = isCheckin ? selectedPhotoId === "checkin" : photoId === selectedPhotoId;
    const isUploading = !isCheckin && uploadingSlot === slotIndex;
    const isDeleting = !isCheckin && photo && deletingPhotoId === photo.id;

    return (
      <div key={slotIndex} className="flex flex-col items-center gap-1.5">
        <div
          className="relative h-24 w-24 shrink-0 cursor-pointer"
          onClick={() => {
            if (imageSrc) {
              setSelectedPhotoId(isCheckin ? "checkin" : (photo?.id ?? "checkin"));
            } else if (!isCheckin) {
              fileInputRefs.current[refIdx]?.click();
            }
          }}
        >
          {imageSrc ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageSrc}
                alt={isCheckin ? "Check-in photo" : `Slot ${slotIndex}`}
                className="h-24 w-24 rounded-lg object-cover bg-neutral-900"
              />
              {/* Selected overlay */}
              <div
                className={`absolute inset-0 rounded-lg border-2 transition-all ${
                  isSelected
                    ? "border-purple-500 bg-purple-500/10"
                    : "border-transparent hover:border-neutral-600"
                }`}
              />
              {isSelected && (
                <div className="absolute top-1.5 left-1.5 h-5 w-5 rounded-full bg-purple-600 flex items-center justify-center shadow">
                  <Check className="h-3 w-3 text-white" />
                </div>
              )}
              {/* Delete button (uploaded slots only) */}
              {!isCheckin && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (photo) void handleDeletePhoto(photo);
                  }}
                  disabled={!!isDeleting}
                  className="absolute top-1.5 right-1.5 h-6 w-6 rounded-md bg-black/70 flex items-center justify-center text-red-400 hover:bg-red-900/80 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity [.group:hover_&]:opacity-100"
                >
                  {isDeleting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
            </>
          ) : isUploading ? (
            <div className="h-24 w-24 rounded-lg border border-dashed border-neutral-700 bg-neutral-900 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-neutral-500" />
            </div>
          ) : (
            <div className="h-24 w-24 rounded-lg border border-dashed border-neutral-700 bg-neutral-900 flex flex-col items-center justify-center gap-1 hover:border-purple-600/50 hover:bg-neutral-800 transition-colors">
              {isCheckin ? (
                <User className="h-8 w-8 text-neutral-600" />
              ) : (
                <Plus className="h-6 w-6 text-neutral-600" />
              )}
            </div>
          )}

          {/* Delete hover trigger area for uploaded photos */}
          {!isCheckin && imageSrc && (
            <div className="group absolute inset-0 rounded-lg">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (photo) void handleDeletePhoto(photo);
                }}
                disabled={!!isDeleting}
                className="absolute top-1.5 right-1.5 h-6 w-6 rounded-md bg-black/70 flex items-center justify-center text-red-400 hover:bg-red-900/80 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                {isDeleting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          )}
        </div>

        <p className="text-[10px] text-neutral-500 text-center leading-tight">
          {isCheckin ? "Check-in photo" : imageSrc ? `Slot ${slotIndex}` : "Add photo"}
        </p>

        {!isCheckin && (
          <input
            ref={(el) => { fileInputRefs.current[refIdx] = el; }}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFileChange(slotIndex, file);
              e.target.value = "";
            }}
          />
        )}
      </div>
    );
  };

  return (
    <div className="p-4 space-y-5">
      {/* ── Photo Sources ── */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
        <div className="mb-3 flex items-center gap-2">
          <User className="h-4 w-4 text-purple-400/90" />
          <p className="text-xs font-medium text-neutral-200">Photo Sources</p>
        </div>

        {loadingPhotos ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-neutral-500" />
          </div>
        ) : (
          <div className="flex gap-2 flex-wrap">
            {renderSlot(1, -1)}
            {renderSlot(2, 0)}
            {renderSlot(3, 1)}
            {renderSlot(4, 2)}
          </div>
        )}

        <p className="mt-2.5 text-[10px] text-neutral-600 leading-snug">
          Click a photo to select it for generation. Click an empty slot to upload (max 5 MB).
        </p>
      </div>

      {/* ── Prompt ── */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-400/90" />
            <p className="text-xs font-medium text-neutral-200">Prompt</p>
          </div>
          {playerGender && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${playerGender === "female" ? "bg-pink-900/40 text-pink-300" : playerGender === "male" ? "bg-blue-900/40 text-blue-300" : "bg-neutral-800 text-neutral-400"}`}>
              {playerGender}
            </span>
          )}
        </div>

        {/* Template dropdown */}
        {filteredTemplates.length > 0 && (
          <div className="mb-2">
            <label className="mb-0.5 block text-[11px] text-neutral-500">
              <BookTemplate className="inline h-3 w-3 mr-1 opacity-60" />
              Template
            </label>
            <select
              value={selectedTemplateId}
              onChange={(e) => handleTemplateSelect(e.target.value)}
              className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-xs text-white focus:border-purple-500 focus:outline-none"
            >
              <option value="custom">Custom (no template)</option>
              {filteredTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {playerGender === "female" ? "Female prompt" : "Male prompt"}
                </option>
              ))}
            </select>
          </div>
        )}

        <textarea
          value={prompt}
          onChange={(e) => { setPrompt(e.target.value); setSelectedTemplateId("custom"); }}
          rows={6}
          className="w-full resize-y rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-purple-500 focus:outline-none"
          placeholder="Describe the sticker style…"
        />
      </div>

      {/* ── Model ── */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-neutral-400/80" />
          <p className="text-xs font-medium text-neutral-200">Model</p>
        </div>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none"
        >
          <option value="gpt-image-2">gpt-image-2 — Latest, recommended</option>
          <option value="gpt-image-1.5">gpt-image-1.5 — Fast, 20% cheaper</option>
          <option value="gpt-image-1-mini">gpt-image-1-mini — Lightweight, high volume</option>
          <option value="gpt-image-1">gpt-image-1 — Legacy</option>
        </select>
      </div>

      {/* ── Generate Button ── */}
      <button
        type="button"
        onClick={() => void handleGenerate()}
        disabled={generating || !prompt.trim()}
        className="w-full flex items-center justify-center gap-2 rounded-lg bg-purple-600 py-2.5 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {generating ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating…
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            Create Stickers
          </>
        )}
      </button>

      {/* ── Inline error ── */}
      {genError && (
        <div className="flex items-start gap-2 rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2.5 text-xs text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
          <span>{genError}</span>
        </div>
      )}

      {/* ── Generation Result ── */}
      {result && (
        <div className="space-y-2">
          <div className="relative rounded-xl overflow-hidden border border-neutral-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={result.imageUrl}
              alt="Generated stickers"
              className="w-full max-h-[500px] object-contain bg-black rounded-xl"
            />
            {/* Delete result button */}
            {showDeleteResultConfirm ? (
              <div className="absolute top-2 right-2 flex items-center gap-1.5 rounded-lg bg-black/85 px-2.5 py-1.5 backdrop-blur-sm">
                <span className="text-[11px] text-neutral-300">Delete result?</span>
                <button
                  type="button"
                  onClick={() => void handleDeleteResult()}
                  disabled={deletingResult}
                  className="rounded px-2 py-0.5 text-[11px] font-medium bg-red-600 text-white hover:bg-red-500 disabled:opacity-50"
                >
                  {deletingResult ? <Loader2 className="h-3 w-3 animate-spin" /> : "Confirm"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteResultConfirm(false)}
                  className="rounded px-2 py-0.5 text-[11px] text-neutral-400 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowDeleteResultConfirm(true)}
                className="absolute top-2 right-2 h-8 w-8 rounded-lg bg-black/70 flex items-center justify-center text-red-400 hover:bg-red-900/80 hover:text-red-300 transition-colors"
                title="Delete result"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Metadata */}
          <div className="space-y-0.5 px-0.5">
            <p className="text-[11px] text-neutral-500 tabular-nums">
              Model: {result.model}&nbsp;&nbsp;|&nbsp;&nbsp;
              Size: {result.size}&nbsp;&nbsp;|&nbsp;&nbsp;
              Cost: ${result.costUsd.toFixed(2)}&nbsp;&nbsp;|&nbsp;&nbsp;
              {result.generationTimeSeconds != null
                ? `Generated in ${result.generationTimeSeconds.toFixed(1)}s`
                : ""}
            </p>
            <p className="text-[11px] text-neutral-600">
              Generated on {fmtDate(result.createdAt)}
            </p>
          </div>

          {/* ── Split Stickers Button ── */}
          <button
            type="button"
            onClick={() => void handleSplit()}
            disabled={splitting}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800 py-2.5 text-sm font-medium text-neutral-200 hover:bg-neutral-700 hover:border-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {splitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Splitting…
              </>
            ) : (
              <>
                <Grid2x2 className="h-4 w-4" />
                Split stickers
              </>
            )}
          </button>

          {/* Split error */}
          {splitError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2.5 text-xs text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
              <span>{splitError}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Sticker Packs (all accumulated — shown even after result deleted) ── */}
      {stickerPacks.length > 0 && (
        <div className="space-y-4">
          <p className="text-xs font-medium text-neutral-400">
            Sticker Packs ({stickerPacks.length})
          </p>
          {stickerPacks.map((pack, packIdx) => (
            <div key={pack.id} className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-neutral-500">
                  Pack {stickerPacks.length - packIdx}
                  {pack.createdAt ? ` — ${fmtDate(pack.createdAt)}` : ""}
                </span>
                <button
                  type="button"
                  onClick={() => void handleDeletePack(pack.id)}
                  disabled={deletingPackId === pack.id}
                  className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-red-400 hover:bg-red-950/40 hover:text-red-300 transition-colors disabled:opacity-50"
                  title="Delete this pack"
                >
                  {deletingPackId === pack.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                  Delete pack
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[pack.sticker1Url, pack.sticker2Url, pack.sticker3Url, pack.sticker4Url].map((url, i) => (
                  <div
                    key={i}
                    className="relative aspect-square rounded-lg overflow-hidden border border-neutral-800 flex items-center justify-center"
                    style={{
                      backgroundImage: "linear-gradient(45deg, #2a2a2a 25%, transparent 25%), linear-gradient(-45deg, #2a2a2a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #2a2a2a 75%), linear-gradient(-45deg, transparent 75%, #2a2a2a 75%)",
                      backgroundSize: "16px 16px",
                      backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
                    }}
                  >
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={url}
                        alt={`Sticker ${i + 1}`}
                        className="absolute inset-0 h-full w-full object-contain"
                      />
                    ) : (
                      <span className="text-neutral-600 text-[10px]">—</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Download button for this pack */}
              <button
                type="button"
                onClick={handleDownloadPack}
                disabled={downloading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600/80 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {downloading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                {downloading ? "Downloading…" : "Download (.zip)"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
