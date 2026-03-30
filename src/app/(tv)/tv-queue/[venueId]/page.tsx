"use client";

import { useParams } from "next/navigation";
import { TvQueueScanner } from "@/components/tv-queue-scanner";

export default function TvQueuePage() {
  const { venueId } = useParams<{ venueId: string }>();

  return (
    <div className="flex h-dvh w-screen flex-col bg-black text-white">
      <TvQueueScanner venueId={venueId} />
    </div>
  );
}
