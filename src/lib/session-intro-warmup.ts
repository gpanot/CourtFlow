import { prisma } from "@/lib/db";

/** Set once when the session leaves the intro warm-up phase (first real play). Idempotent. */
export async function markSessionIntroWarmupComplete(sessionId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { id: sessionId, introWarmupComplete: false },
    data: { introWarmupComplete: true },
  });
}
