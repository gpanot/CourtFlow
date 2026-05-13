import { NextRequest } from "next/server";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { fetchReclubRoster } from "@/lib/reclub";

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  try {
    requireStaff(request.headers);

    const { referenceCode } = await parseBody<{ referenceCode: string }>(request);
    if (!referenceCode || typeof referenceCode !== "string") {
      return error("referenceCode is required");
    }

    const roster = await fetchReclubRoster(referenceCode);
    console.log(
      `[reclub] ✅ ${referenceCode} — ${roster.players.length} players:\n` +
      roster.players.map((p, i) =>
        `  ${String(i + 1).padStart(2)}. ${p.isAddedByFriend ? "[+1] " : "     "}${p.name}`
      ).join("\n")
    );
    return json({
      referenceCode,
      eventName: roster.eventName,
      players: roster.players,
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
