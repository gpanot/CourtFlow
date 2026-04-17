import { NextResponse } from "next/server";

const serverStartedAtIso = new Date().toISOString();

function getCommitSha() {
  return (
    process.env.NEXT_PUBLIC_GIT_COMMIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    null
  );
}

function getBuildTimestamp() {
  return (
    process.env.NEXT_PUBLIC_BUILD_TIME ||
    process.env.VERCEL_GIT_COMMIT_TIMESTAMP ||
    process.env.RAILWAY_DEPLOYMENT_CREATED_AT ||
    serverStartedAtIso
  );
}

export async function GET() {
  return NextResponse.json(
    {
      commitSha: getCommitSha(),
      buildTimestamp: getBuildTimestamp(),
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
