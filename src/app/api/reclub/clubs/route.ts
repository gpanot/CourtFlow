import { json } from "@/lib/api-helpers";
import { RECLUB_CLUBS } from "@/lib/reclub";

export async function GET() {
  return json(RECLUB_CLUBS);
}
