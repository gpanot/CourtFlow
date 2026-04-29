import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { fetchReclubEvents } from "@/lib/reclub";

export async function GET(request: NextRequest) {
  const groupId = request.nextUrl.searchParams.get("groupId");
  if (!groupId) return error("groupId is required");

  const gid = parseInt(groupId, 10);
  if (Number.isNaN(gid)) return error("groupId must be a number");

  try {
    const events = await fetchReclubEvents(gid);
    return json({ events });
  } catch (e) {
    return error((e as Error).message, 502);
  }
}
