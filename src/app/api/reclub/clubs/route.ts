import { json } from "@/lib/api-helpers";
import { RECLUB_CLUBS } from "@/lib/reclub";

export const dynamic = "force-dynamic";
export async function GET() {
  const clubs = [...RECLUB_CLUBS].sort((a, b) =>
    a.name.localeCompare(b.name, "vi", { sensitivity: "base" })
  );
  return json(clubs);
}
