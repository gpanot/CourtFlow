import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireManagerOrSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ coachId: string }> }
) {
  try {
    requireManagerOrSuperAdmin(request.headers);
    const { coachId } = await params;

    const body = await parseBody<{
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

    const coach = await prisma.staffMember.findUnique({
      where: { id: coachId, isCoach: true },
    });
    if (!coach) return error("Coach not found", 404);

    const updated = await prisma.staffMember.update({
      where: { id: coachId },
      data: {
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
      id: updated.id,
      coachBio: updated.coachBio,
      coachPhoto: updated.coachPhoto,
      coachDupr: updated.coachDupr,
      coachGender: updated.coachGender,
      coachLanguages: updated.coachLanguages,
      coachSpecialties: updated.coachSpecialties,
      coachFocusLevels: updated.coachFocusLevels,
      coachYearsExperience: updated.coachYearsExperience,
      coachGroupSizes: updated.coachGroupSizes,
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
