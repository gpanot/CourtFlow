import { NextRequest } from "next/server";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { checkInToClassInstance, ClassPassError } from "@/lib/class-pass";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/class-passes/check-in
 *
 * Staff-side manual check-in of a class-pass holder to a class instance.
 * Body: { classPassId: string; classInstanceId: string }
 *
 * Returns:
 *   201  { checkInId, sessionsUsed, sessionsIncluded }
 *   400  { error, code }  — PASS_NOT_ACTIVE | SESSIONS_EXHAUSTED | CLASS_FULL |
 *                           ALREADY_CHECKED_IN | PASS_NOT_FOUND | INSTANCE_NOT_FOUND
 *   401  Unauthorized
 *   409  { error, code }  — TRANSACTION_CONFLICT (serialization failure after 1 retry)
 *   500  Unexpected error
 */
export async function POST(request: NextRequest) {
  try {
    requireStaff(request.headers);

    const body = await parseBody<{
      classPassId: string;
      classInstanceId: string;
    }>(request);

    if (!body.classPassId) return error("classPassId required", 400);
    if (!body.classInstanceId) return error("classInstanceId required", 400);

    const result = await checkInToClassInstance(body.classPassId, body.classInstanceId);
    return json(result, 201);
  } catch (e) {
    const err = e as Error & { code?: string };

    if (err.message.includes("Unauthorized") || err.message.includes("Missing")) {
      return error(err.message, 401);
    }

    if (err instanceof ClassPassError) {
      // Return both the human-readable message and the machine code so the
      // UI can branch on code without string-matching the message.
      // TRANSACTION_CONFLICT is a concurrency signal → 409; everything else → 400.
      const status = err.code === "TRANSACTION_CONFLICT" ? 409 : 400;
      return json({ error: err.message, code: err.code }, status);
    }

    console.error("[class-pass check-in]", err);
    return error("Unexpected error", 500);
  }
}
