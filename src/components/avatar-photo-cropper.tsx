"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { X, ZoomIn, ZoomOut, RotateCw, Check } from "lucide-react";
import { cn } from "@/lib/cn";

const MAX_OUTPUT_SIZE = 400;
const MAX_FILE_BYTES = 200 * 1024;

interface AvatarPhotoCropperProps {
  file: File;
  onCropped: (blob: Blob) => void;
  onCancel: () => void;
}

export function AvatarPhotoCropper({ file, onCropped, onCancel }: AvatarPhotoCropperProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setLoaded(true);
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const drawPreview = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    const size = canvas.width;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, size, size);

    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();

    ctx.translate(size / 2, size / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(zoom, zoom);

    const scale = size / Math.min(img.width, img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, -w / 2 + offset.x, -h / 2 + offset.y, w, h);
    ctx.restore();
  }, [zoom, rotation, offset]);

  useEffect(() => {
    if (loaded) drawPreview();
  }, [loaded, drawPreview]);

  const handlePointerDown = (e: React.PointerEvent) => {
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    const canvas = canvasRef.current;
    if (!canvas || !imgRef.current) return;
    const displaySize = canvas.getBoundingClientRect().width;
    const canvasSize = canvas.width;
    const scaleFactor = canvasSize / displaySize;
    setOffset({
      x: dragStart.current.ox + dx * scaleFactor / zoom,
      y: dragStart.current.oy + dy * scaleFactor / zoom,
    });
  };

  const handlePointerUp = () => setDragging(false);

  const exportCropped = async () => {
    const img = imgRef.current;
    if (!img) return;
    setProcessing(true);

    const outCanvas = document.createElement("canvas");
    outCanvas.width = MAX_OUTPUT_SIZE;
    outCanvas.height = MAX_OUTPUT_SIZE;
    const ctx = outCanvas.getContext("2d")!;

    ctx.translate(MAX_OUTPUT_SIZE / 2, MAX_OUTPUT_SIZE / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(zoom, zoom);

    const scale = MAX_OUTPUT_SIZE / Math.min(img.width, img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, -w / 2 + offset.x, -h / 2 + offset.y, w, h);

    let quality = 0.92;
    let blob: Blob | null = null;
    while (quality > 0.1) {
      blob = await new Promise<Blob | null>((res) =>
        outCanvas.toBlob(res, "image/jpeg", quality)
      );
      if (blob && blob.size <= MAX_FILE_BYTES) break;
      quality -= 0.05;
    }

    if (!blob || blob.size > MAX_FILE_BYTES) {
      const smallCanvas = document.createElement("canvas");
      const smallSize = 200;
      smallCanvas.width = smallSize;
      smallCanvas.height = smallSize;
      const sCtx = smallCanvas.getContext("2d")!;
      sCtx.drawImage(outCanvas, 0, 0, smallSize, smallSize);
      blob = await new Promise<Blob | null>((res) =>
        smallCanvas.toBlob(res, "image/jpeg", 0.8)
      );
    }

    setProcessing(false);
    if (blob) onCropped(blob);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-700 bg-neutral-900 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">Crop Avatar</h3>
          <button onClick={onCancel} className="text-neutral-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative mx-auto aspect-square w-full max-w-[280px] overflow-hidden rounded-full border-2 border-neutral-600 bg-neutral-800">
          <canvas
            ref={canvasRef}
            width={MAX_OUTPUT_SIZE}
            height={MAX_OUTPUT_SIZE}
            className="h-full w-full cursor-move touch-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          />
        </div>

        <div className="mt-4 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
            className="rounded-lg bg-neutral-800 p-2.5 text-neutral-300 hover:bg-neutral-700"
          >
            <ZoomOut className="h-5 w-5" />
          </button>
          <input
            type="range"
            min="0.5"
            max="3"
            step="0.05"
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className={cn(
              "h-1.5 w-32 cursor-pointer appearance-none rounded-full bg-neutral-700",
              "[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-green-500"
            )}
          />
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(3, z + 0.1))}
            className="rounded-lg bg-neutral-800 p-2.5 text-neutral-300 hover:bg-neutral-700"
          >
            <ZoomIn className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            className="rounded-lg bg-neutral-800 p-2.5 text-neutral-300 hover:bg-neutral-700"
          >
            <RotateCw className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-neutral-600 py-3 text-sm font-medium text-neutral-300 hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={exportCropped}
            disabled={processing || !loaded}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-600 py-3 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-50"
          >
            {processing ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <>
                <Check className="h-4 w-4" /> Save
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
