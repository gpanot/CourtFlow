import { Prisma } from "@prisma/client";
import { prisma } from "./db";

// ─── Typed error codes ────────────────────────────────────────────────────────
// Callers catch these to display distinct UI messages.

export class ClassPassError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "PASS_NOT_ACTIVE"
      | "SESSIONS_EXHAUSTED"
      | "CLASS_FULL"        // Phase 2 waitlist hook point — keep distinct
      | "ALREADY_CHECKED_IN"
      | "PASS_NOT_FOUND"
      | "INSTANCE_NOT_FOUND"
      | "TRANSACTION_CONFLICT"
  ) {
    super(message);
    this.name = "ClassPassError";
  }
}

/**
 * Record a staff-initiated check-in for a class-pass holder attending a class
 * instance.
 *
 * All six steps run inside a single serialisable Prisma transaction so that
 * the capacity count and the row creation cannot race under concurrent
 * requests (same pattern as createOpenPlayRegistration).
 *
 * Throws ClassPassError with a distinct `code` for each failure path so the
 * caller can surface the right UI message without string-matching.
 */
export async function checkInToClassInstance(
  classPassId: string,
  classInstanceId: string
): Promise<{ checkInId: string; sessionsUsed: number; sessionsIncluded: number }> {
  try {
    return await runTransaction(classPassId, classInstanceId);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      // P2002 — unique constraint: the DB-level dedup caught a race that slipped
      // past the application-level findUnique check. Map to the same typed code.
      if (
        err.code === "P2002" &&
        Array.isArray(err.meta?.target) &&
        (err.meta.target as string[]).includes("class_pass_id") &&
        (err.meta.target as string[]).includes("class_instance_id")
      ) {
        throw new ClassPassError(
          "This player is already checked in to this class",
          "ALREADY_CHECKED_IN"
        );
      }

      // P2034 — serialization failure: retry once, then give up with a distinct code.
      if (err.code === "P2034") {
        try {
          return await runTransaction(classPassId, classInstanceId);
        } catch (retryErr) {
          if (
            retryErr instanceof Prisma.PrismaClientKnownRequestError &&
            retryErr.code === "P2034"
          ) {
            throw new ClassPassError("Please try again", "TRANSACTION_CONFLICT");
          }
          throw retryErr;
        }
      }
    }
    throw err;
  }
}

/** Inner transaction — extracted so the wrapper can call it for the retry. */
function runTransaction(
  classPassId: string,
  classInstanceId: string
): Promise<{ checkInId: string; sessionsUsed: number; sessionsIncluded: number }> {
  return prisma.$transaction(
    async (tx) => {
      // ── Step 1: load the pass and confirm it is active ───────────────────
      const pass = await tx.classPass.findUnique({
        where: { id: classPassId },
        include: {
          passType: {
            select: { sessionsIncluded: true },
          },
        },
      });

      if (!pass) {
        throw new ClassPassError("Class pass not found", "PASS_NOT_FOUND");
      }

      if (pass.status !== "active") {
        throw new ClassPassError(
          `Class pass is ${pass.status} — only active passes can be used`,
          "PASS_NOT_ACTIVE"
        );
      }

      // ── Step 2: confirm the pass still has sessions remaining ────────────
      const sessionsIncluded = pass.passType.sessionsIncluded;
      if (pass.sessionsUsed >= sessionsIncluded) {
        throw new ClassPassError(
          "Sessions used up this month — no sessions remaining on this pass",
          "SESSIONS_EXHAUSTED"
        );
      }

      // ── Step 3: load the instance and check capacity ─────────────────────
      const instance = await tx.classInstance.findUnique({
        where: { id: classInstanceId },
        select: { id: true, maxPlayers: true },
      });

      if (!instance) {
        throw new ClassPassError("Class instance not found", "INSTANCE_NOT_FOUND");
      }

      // Count inside the transaction to prevent race conditions
      const checkedInCount = await tx.classCheckIn.count({
        where: { classInstanceId },
      });

      if (checkedInCount >= instance.maxPlayers) {
        // Distinct code so Phase 2 waitlist logic can hook in here
        throw new ClassPassError(
          "Class is full — maximum players already checked in",
          "CLASS_FULL"
        );
      }

      // ── Step 4: dedup — no existing check-in for this pass + instance ────
      const existing = await tx.classCheckIn.findUnique({
        where: {
          classPassId_classInstanceId: { classPassId, classInstanceId },
        },
      });

      if (existing) {
        throw new ClassPassError(
          "Already checked in — this pass was already used for this class",
          "ALREADY_CHECKED_IN"
        );
      }

      // ── Step 5: create the ClassCheckIn row ──────────────────────────────
      const checkIn = await tx.classCheckIn.create({
        data: { classPassId, classInstanceId },
      });

      // ── Step 6: increment sessionsUsed on the pass ───────────────────────
      const updatedPass = await tx.classPass.update({
        where: { id: classPassId },
        data: { sessionsUsed: { increment: 1 } },
        select: { sessionsUsed: true },
      });

      return {
        checkInId: checkIn.id,
        sessionsUsed: updatedPass.sessionsUsed,
        sessionsIncluded,
      };
    },
    // Serializable isolation so the count check and row creation are atomic
    { isolationLevel: "Serializable" }
  );
}
