"use client";

import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { downloadFile } from "@/lib/api-client";
import { cn } from "@/lib/cn";

type InvoiceType = "booking" | "openplay" | "lesson";

interface InvoiceDownloadButtonProps {
  type: InvoiceType;
  entityId: string;
  invoiceNumber: string;
  className?: string;
}

export function InvoiceDownloadButton({
  type,
  entityId,
  invoiceNumber,
  className,
}: InvoiceDownloadButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleDownload(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    try {
      await downloadFile(
        `/api/admin/invoices/${type}/${entityId}/pdf`,
        `${invoiceNumber}.pdf`
      );
    } catch (err) {
      alert((err as Error).message || "Failed to download invoice");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={loading}
      title={`Download invoice ${invoiceNumber}`}
      className={cn(
        "rounded-lg p-1.5 text-neutral-500 hover:bg-green-900/30 hover:text-green-400 transition-colors disabled:opacity-50",
        className
      )}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <FileDown className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
