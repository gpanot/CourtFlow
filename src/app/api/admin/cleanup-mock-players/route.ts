import { prisma } from "@/lib/db";

export async function POST() {
  await prisma.faceAttempt.updateMany({
    where: {
      matchedPlayer: {
        faceSubjectId: { startsWith: "mock_" },
      },
    },
    data: { matchedPlayerId: null },
  });

  await prisma.queueEntry.deleteMany({
    where: {
      player: {
        faceSubjectId: { startsWith: "mock_" },
      },
    },
  });

  const deleted = await prisma.player.deleteMany({
    where: {
      faceSubjectId: { startsWith: "mock_" },
    },
  });

  return Response.json({
    deleted: deleted.count,
    message: "Mock players cleaned up",
  });
}
