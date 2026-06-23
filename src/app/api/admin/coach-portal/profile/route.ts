/**
 * GET/PATCH /api/admin/coach-portal/profile
 * Coach reads and updates their own profile using a staff JWT.
 */
import { NextRequest } from "next/server";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  let auth;
  try { auth = requireStaff(request.headers); } catch { return error("Authentication required", 401); }

  const coach = await prisma.staffMember.findUnique({
    where: { id: auth.id, isCoach: true },
    select: {
      id: true, name: true, email: true,
      coachBio: true, coachPhoto: true, coachDupr: true,
      coachGender: true, coachLanguages: true, coachSpecialties: true,
      coachFocusLevels: true, coachYearsExperience: true, coachGroupSizes: true,
    },
  });
  if (!coach) return error("Coach not found", 404);
  return json(coach);
}

export async function PATCH(request: NextRequest) {
  let auth;
  try { auth = requireStaff(request.headers); } catch { return error("Authentication required", 401); }

  const coach = await prisma.staffMember.findUnique({ where: { id: auth.id, isCoach: true }, select: { id: true } });
  if (!coach) return error("Coach not found", 404);

  const body = await parseBody<{
    email?: string | null;
    coachBio?: string | null;
    coachPhoto?: string | null;
    coachDupr?: string | null;
    coachGender?: string | null;
    coachLanguages?: string[];
    coachSpecialties?: string[];
    coachFocusLevels?: string[];
    coachYearsExperience?: string | null;
    coachGroupSizes?: string[];
  }>(request);

  // Validate email uniqueness if changing
  if (body.email !== undefined && body.email !== null && body.email !== "") {
    const existing = await prisma.staffMember.findFirst({
      where: { email: body.email, NOT: { id: auth.id } },
      select: { id: true },
    });
    if (existing) return error("This email is already used by another account", 409);
  }

  const updated = await prisma.staffMember.update({
    where: { id: auth.id },
    data: {
      ...(body.email !== undefined && { email: body.email || null }),
      ...(body.coachBio !== undefined && { coachBio: body.coachBio }),
      ...(body.coachPhoto !== undefined && { coachPhoto: body.coachPhoto }),
      ...(body.coachDupr !== undefined && { coachDupr: body.coachDupr }),
      ...(body.coachGender !== undefined && { coachGender: body.coachGender }),
      ...(body.coachLanguages !== undefined && { coachLanguages: body.coachLanguages }),
      ...(body.coachSpecialties !== undefined && { coachSpecialties: body.coachSpecialties }),
      ...(body.coachFocusLevels !== undefined && { coachFocusLevels: body.coachFocusLevels }),
      ...(body.coachYearsExperience !== undefined && { coachYearsExperience: body.coachYearsExperience }),
      ...(body.coachGroupSizes !== undefined && { coachGroupSizes: body.coachGroupSizes }),
    },
  });

  return json({
    id: updated.id, name: updated.name, email: updated.email,
    coachBio: updated.coachBio, coachPhoto: updated.coachPhoto, coachDupr: updated.coachDupr,
    coachGender: updated.coachGender, coachLanguages: updated.coachLanguages,
    coachSpecialties: updated.coachSpecialties, coachFocusLevels: updated.coachFocusLevels,
    coachYearsExperience: updated.coachYearsExperience, coachGroupSizes: updated.coachGroupSizes,
  });
}
