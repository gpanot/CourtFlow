import { prisma } from "@/lib/db";

export async function GET() {
  const { faceRecognitionService } = await import("@/lib/face-recognition");

  const healthy = await faceRecognitionService.checkHealth();

  const { RekognitionClient, ListFacesCommand } = await import(
    "@aws-sdk/client-rekognition"
  );

  const client = new RekognitionClient({
    region: process.env.AWS_REGION || "ap-southeast-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });

  const collectionId =
    process.env.AWS_REKOGNITION_COLLECTION || "courtflow-players";

  const playersWithFaces = await prisma.player.findMany({
    where: { faceSubjectId: { not: null } },
    select: { id: true, name: true, faceSubjectId: true },
  });

  const recentFaceRecognitionLogs = await prisma.faceRecognitionLog.findMany({
    take: 20,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      venueId: true,
      playerId: true,
      staffId: true,
      similarityScore: true,
      threshold: true,
      passed: true,
      createdAt: true,
    },
  });

  try {
    const faces = await client.send(
      new ListFacesCommand({
        CollectionId: collectionId,
      })
    );

    return Response.json({
      healthy,
      enrolledFaceCount: faces.Faces?.length ?? 0,
      awsFaces: faces.Faces?.map((f) => ({
        faceId: f.FaceId,
        externalImageId: f.ExternalImageId,
        confidence: f.Confidence,
      })),
      dbPlayersWithFaces: playersWithFaces,
      recentFaceRecognitionLogs,
    });
  } catch (e) {
    return Response.json({
      healthy,
      enrolledFaceCount: 0,
      awsFaces: [],
      dbPlayersWithFaces: playersWithFaces,
      recentFaceRecognitionLogs,
      error: (e as Error).message,
    });
  }
}
