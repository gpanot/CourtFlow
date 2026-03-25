import { recoverStuckQueueStatusesForActiveGames } from "@/lib/recover-queue-status";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  recoverStuckQueueStatusesForActiveGames().catch((err) => {
    console.error("[instrumentation] recoverStuckQueueStatusesForActiveGames:", err);
  });
}
