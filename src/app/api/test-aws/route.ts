import { NextRequest } from "next/server";
import { RekognitionClient, ListCollectionsCommand } from "@aws-sdk/client-rekognition";

export async function GET(request: NextRequest) {
  try {
    // Ensure environment variables are loaded
    const region = process.env.AWS_REGION || "ap-southeast-1";
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (!accessKeyId || !secretAccessKey) {
      return Response.json({
        success: false,
        error: "AWS credentials not found in environment variables",
        keyPresent: !!accessKeyId,
        secretPresent: !!secretAccessKey,
        region,
      });
    }

    const client = new RekognitionClient({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    const result = await client.send(new ListCollectionsCommand({}));
    
    return Response.json({
      success: true,
      collections: result.CollectionIds,
      region,
      keyPresent: !!accessKeyId,
    });
  } catch (e) {
    return Response.json({
      success: false,
      error: (e as Error).message,
      keyPresent: !!process.env.AWS_ACCESS_KEY_ID,
      region: process.env.AWS_REGION,
    });
  }
}
