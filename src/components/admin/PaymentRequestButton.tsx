"use client";

import { useState } from "react";
import { ImageDown, Loader2 } from "lucide-react";
import { downloadFile } from "@/lib/api-client";
import { cn } from "@/lib/cn";

type PaymentRequestType = "booking" | "lesson" | "openplay" | "program";

interface PaymentRequestButtonProps {
  type: PaymentRequestType;
  entityId: string;
  /** Used as part of the downloaded filename; falls back to entityId if absent. */
  paymentRef?: string | null;
  className?: string;
}

export function PaymentRequestButton({
  type,
  entityId,
  paymentRef,
  className,
}: PaymentRequestButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    try {
      await downloadFile(
        `/api/admin/payment-request/${type}/${entityId}/image`,
        // Fallback filename — overridden by Content-Disposition from the server
        `${paymentRef ?? entityId}.png`,
        { useServerFilename: true },
      );
    } catch (err) {
      alert((err as Error).message || "Failed to generate payment image");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      title="Download payment invoice image"
      className={cn(
        "rounded-lg p-1.5 text-neutral-500 hover:bg-green-900/30 hover:text-green-400 transition-colors disabled:opacity-50",
        className,
      )}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <ImageDown className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
