import { NextRequest, NextResponse } from "next/server";
import { signToken } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { error, parseBody } from "@/lib/api-helpers";
import { setPlayerAuthCookieOnResponse } from "@/lib/player-auth-cookie";
import type { SkillLevel, Gender } from "@prisma/client";
import { initialRankingScoreForSkillLevel } from "@/lib/ranking";

interface RegisterBody {
  phone: string;
  name: string;
  gender: Gender;
  skillLevel: SkillLevel;
}

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody<RegisterBody>(request);
    if (!body.phone || !body.name || !body.gender || !body.skillLevel) {
      return error("All fields are required");
    }

    const existing = await prisma.player.findUnique({ where: { phone: body.phone } });
    if (existing) return error("Player already registered", 409);

    const player = await prisma.player.create({
      data: {
        phone: body.phone,
        name: body.name,
        gender: body.gender,
        skillLevel: body.skillLevel,
        rankingScore: initialRankingScoreForSkillLevel(body.skillLevel),
        registrationAt: new Date(),
      },
    });

    const token = signToken({ id: player.id, role: "player" });
    const res = NextResponse.json({ token, player }, { status: 201 });
    setPlayerAuthCookieOnResponse(res, token);
    return res;
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
