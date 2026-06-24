import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { createCredentialsPlayer, SignupValidationError } from "@/lib/player-signup";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, password } = body as {
      name?: string;
      email?: string;
      password?: string;
    };

    console.log("[signup API] received — email:", email, "name:", name, "DATABASE_URL set:", !!process.env.DATABASE_URL);

    const { playerId } = await createCredentialsPlayer(name ?? "", email ?? "", password ?? "");

    return json({ playerId }, 201);
  } catch (e) {
    console.error("[signup API] error:", (e as Error).message, (e as Error).stack?.slice(0, 300));
    if (e instanceof SignupValidationError) return error(e.message, e.statusCode);
    return error((e as Error).message, 500);
  }
}
