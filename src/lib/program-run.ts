/**
 * Domain functions for ProgramRun (cohort scheduling).
 *
 * Plain async functions — no React, no Next.js imports.
 * All timezone math uses local methods (getDay, setHours, getDate+N)
 * per the workspace timezone-handling rule. Prisma DATE writes use the
 * T12:00:00+07:00 noon-local pattern.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "./db";

// ─── Constants ────────────────────────────────────────────────────────────────

const LOCAL_TZ_OFFSET = "+07:00"; // Asia/Saigon — server's local timezone

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert a plain date key ("YYYY-MM-DD") to a local-noon Date that Prisma
 * can safely write to a @db.Date column without drifting to the prior day.
 */
function dateKeyToPrismaDate(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00${LOCAL_TZ_OFFSET}`);
}

/**
 * Convert a local midnight Date to its "YYYY-MM-DD" string.
 * Uses local methods so the key matches the venue's calendar date.
 */
function dateTodateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Advance a Date by `weeks` weeks using local-time arithmetic.
 */
function addWeeks(d: Date, weeks: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + weeks * 7);
  return result;
}

// ─── Typed errors ─────────────────────────────────────────────────────────────

export class ProgramRunError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "RUN_NOT_FOUND"
      | "RUN_FULL"
      | "ALREADY_ENROLLED"
      | "RUN_NOT_UPCOMING"
      | "SCHEDULE_ALREADY_GENERATED"
      | "NO_RECURRENCE_DEFINED"
      | "NO_COACHES_ASSIGNED"
      | "CAPACITY_BELOW_ENROLLED"
      | "INSTANCE_NOT_FOUND"
      | "INSTANCE_HAS_CHECKINS"
      | "TRANSACTION_CONFLICT"
  ) {
    super(message);
    this.name = "ProgramRunError";
  }
}

// ─── generateRunSchedule ──────────────────────────────────────────────────────

/**
 * Generate all CourtBlock + ClassInstance rows for a ProgramRun.
 *
 * Idempotent: if ClassInstances already exist for this run, returns the
 * existing count without creating duplicates.
 *
 * Runs inside a serializable transaction to prevent concurrent calls from
 * double-generating. Uses local day-of-week derived from startDate — never
 * stored redundantly on the run.
 */
export async function generateRunSchedule(
  runId: string,
  tx?: Prisma.TransactionClient
): Promise<{ instanceCount: number; blockIds: string[] }> {
  const execute = async (db: Prisma.TransactionClient | typeof prisma) => {
    const run = await db.programRun.findUnique({
      where: { id: runId },
      include: {
        coaches: true,
        passType: { select: { linkedCoachId: true } },
      },
    });

    if (!run) throw new ProgramRunError("Program run not found", "RUN_NOT_FOUND");

    // Idempotency guard
    const existing = await db.classInstance.findFirst({
      where: { programRunId: runId },
      select: { id: true },
    });
    if (existing) {
      const count = await db.classInstance.count({ where: { programRunId: runId } });
      const blockIds = (
        await db.classInstance.findMany({
          where: { programRunId: runId },
          select: { courtBlockId: true },
        })
      )
        .map((i) => i.courtBlockId)
        .filter((id): id is string => id !== null);
      return { instanceCount: count, blockIds };
    }

    if (!run.recurrenceCount && !run.recurrenceEndDate) {
      throw new ProgramRunError(
        "Either recurrenceCount or recurrenceEndDate must be set",
        "NO_RECURRENCE_DEFINED"
      );
    }

    // Derive the start date as a local midnight Date for arithmetic
    // (startDate is stored as DATE at local noon — parse as local midnight for iteration)
    const startDateKey = dateTodateKey(run.startDate);
    let currentDate = new Date(`${startDateKey}T00:00:00${LOCAL_TZ_OFFSET}`);

    // End boundary
    const endDate = run.recurrenceEndDate
      ? new Date(dateTodateKey(run.recurrenceEndDate) + `T23:59:59${LOCAL_TZ_OFFSET}`)
      : null;
    const maxCount = run.recurrenceCount ?? Infinity;

    const blockIds: string[] = [];
    let instanceCount = 0;

    while (instanceCount < maxCount) {
      if (endDate && currentDate > endDate) break;

      const dateKey = dateTodateKey(currentDate);
      const prismaDate = dateKeyToPrismaDate(dateKey);

      // Build start/end timestamps using local hour methods
      const startTime = new Date(currentDate);
      startTime.setHours(run.recurrenceStartHour, 0, 0, 0);

      const endTime = new Date(currentDate);
      endTime.setHours(
        run.recurrenceStartHour,
        run.recurrenceDurationMin,
        0,
        0
      );

      // Create CourtBlock (type: program_class)
      const courtBlock = await db.courtBlock.create({
        data: {
          venueId: run.venueId,
          type: "program_class",
          title: run.name,
          courtIds: run.courtIds,
          date: prismaDate,
          startTime,
          endTime,
          programRunId: run.id,
          createdBy: run.createdBy ?? undefined,
        },
      });

      blockIds.push(courtBlock.id);

      // Copy run-level coaches → per-block coaches
      if (run.coaches.length > 0) {
        await db.courtBlockCoach.createMany({
          data: run.coaches.map((rc) => ({
            courtBlockId: courtBlock.id,
            coachId: rc.coachId,
          })),
        });
      }

      // Create ClassInstance linked to this CourtBlock.
      // coachId is NOT NULL in the schema. Resolve priority:
      //   1. first coach explicitly assigned to this run
      //   2. the pass type's linked coach (if configured)
      // Throw a clear error if neither is set — caller must assign a coach first.
      const defaultCoachId =
        run.coaches[0]?.coachId ?? run.passType?.linkedCoachId ?? null;
      if (!defaultCoachId) {
        throw new ProgramRunError(
          "Cannot generate schedule: no coaches assigned to this run and the pass type has no linked coach. Assign at least one coach to the run before generating.",
          "NO_COACHES_ASSIGNED"
        );
      }

      await db.classInstance.create({
        data: {
          venueId: run.venueId,
          coachId: defaultCoachId,
          passTypeId: run.passTypeId,
          startAt: startTime,
          endAt: endTime,
          maxPlayers: run.maxCapacity,
          programRunId: run.id,
          courtBlockId: courtBlock.id,
        },
      });

      instanceCount++;
      currentDate = addWeeks(currentDate, 1);
    }

    return { instanceCount, blockIds };
  };

  if (tx) return execute(tx);

  return prisma.$transaction(
    (txInner) => execute(txInner),
    { isolationLevel: "Serializable" }
  );
}

// ─── checkProgramBlockConflict ────────────────────────────────────────────────

export interface ProgramBlockConflict {
  hasConflict: boolean;
  blockInfo?: {
    programRunId: string;
    title: string | null;
    date: Date;
    startTime: Date;
    endTime: Date;
  };
}

/**
 * Check whether a coach is assigned to a program_class CourtBlock that
 * overlaps with the given date/time window.
 *
 * Does NOT reject — returns a result the caller uses to decide whether to
 * issue a soft warning. Hard rejection of court-level conflicts is handled
 * separately by the existing booking availability logic.
 */
export async function checkProgramBlockConflict(
  coachId: string,
  date: Date,
  startTime: Date,
  endTime: Date
): Promise<ProgramBlockConflict> {
  // Find program_class blocks on this date where this coach is assigned
  // and the time overlaps: block.startTime < endTime && block.endTime > startTime
  const conflictingBlock = await prisma.courtBlock.findFirst({
    where: {
      type: "program_class",
      date,
      startTime: { lt: endTime },
      endTime: { gt: startTime },
      courtBlockCoaches: {
        some: { coachId },
      },
    },
    select: {
      id: true,
      programRunId: true,
      title: true,
      date: true,
      startTime: true,
      endTime: true,
    },
  });

  if (!conflictingBlock) return { hasConflict: false };

  return {
    hasConflict: true,
    blockInfo: {
      programRunId: conflictingBlock.programRunId ?? "",
      title: conflictingBlock.title,
      date: conflictingBlock.date,
      startTime: conflictingBlock.startTime,
      endTime: conflictingBlock.endTime,
    },
  };
}

// ─── enrollInRun ──────────────────────────────────────────────────────────────

export interface EnrollResult {
  programPassId: string;
  paymentId: string | null;
  paymentRef: string | null;
  enrolledCount: number;
  maxCapacity: number;
}

/**
 * Enroll a player in a specific ProgramRun and record payment.
 *
 * Serializable transaction — enrollment count and row creation are atomic.
 *
 * paymentStatus defaults to "UNPAID" (CourtPass self-serve flow — player pays
 * after enrollment via VietQR). Pass "PAID" for the admin/staff flow where
 * payment is collected up front.
 */
export async function enrollInRun(params: {
  runId: string;
  playerId: string;
  venueId: string;
  amountValue: number;
  paymentMethod?: string;
  paymentStatus?: "PAID" | "UNPAID";
  paymentRef?: string;
  note?: string;
}): Promise<EnrollResult> {
  const { runId, playerId, venueId, amountValue, paymentMethod, paymentStatus = "UNPAID", paymentRef, note } = params;

  try {
    return await prisma.$transaction(
      async (tx) => {
        const run = await tx.programRun.findUnique({
          where: { id: runId },
          select: { id: true, passTypeId: true, maxCapacity: true, status: true },
        });

        if (!run) throw new ProgramRunError("Program run not found", "RUN_NOT_FOUND");
        if (run.status !== "upcoming" && run.status !== "in_progress") {
          throw new ProgramRunError(
            `Cannot enroll in a run with status "${run.status}"`,
            "RUN_NOT_UPCOMING"
          );
        }

        // Live count — never a stored counter
        const enrolledCount = await tx.programPass.count({
          where: { programRunId: runId },
        });

        if (enrolledCount >= run.maxCapacity) {
          throw new ProgramRunError(
            "This program run is at capacity",
            "RUN_FULL"
          );
        }

        // Dedup check
        const existing = await tx.programPass.findFirst({
          where: { programRunId: runId, playerId },
          select: { id: true },
        });
        if (existing) {
          throw new ProgramRunError(
            "Player is already enrolled in this run",
            "ALREADY_ENROLLED"
          );
        }

        // Create the ProgramPass
        const now = new Date();
        const cycleEnd = new Date(now);
        cycleEnd.setFullYear(cycleEnd.getFullYear() + 1); // placeholder — exact cycle managed by run dates

        const programPass = await tx.programPass.create({
          data: {
            playerId,
            venueId,
            passTypeId: run.passTypeId,
            programRunId: runId,
            status: "active",
            cycleStart: now,
            cycleEnd,
          },
        });

        // Record payment
        let paymentId: string | null = null;
        if (amountValue > 0) {
          const isPaid = paymentStatus === "PAID";
          const payment = await tx.programPassPayment.create({
            data: {
              programPassId: programPass.id,
              periodStart: now,
              periodEnd: cycleEnd,
              amountValue,
              status: paymentStatus,
              paymentMethod: paymentMethod ?? (isPaid ? "cash" : null),
              paidAt: isPaid ? now : null,
              paymentRef: paymentRef ?? null,
              note: note ?? null,
            },
          });
          paymentId = payment.id;
        }

        return {
          programPassId: programPass.id,
          paymentId,
          paymentRef: paymentRef ?? null,
          enrolledCount: enrolledCount + 1,
          maxCapacity: run.maxCapacity,
        };
      },
      { isolationLevel: "Serializable" }
    );
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") {
      throw new ProgramRunError("Please try again", "TRANSACTION_CONFLICT");
    }
    throw err;
  }
}

// ─── updateRunCapacity ────────────────────────────────────────────────────────

/**
 * Change the max capacity of a run. Rejects if the new value is below the
 * current live enrollment count.
 */
export async function updateRunCapacity(
  runId: string,
  newMax: number
): Promise<{ maxCapacity: number; enrolledCount: number }> {
  return prisma.$transaction(async (tx) => {
    const run = await tx.programRun.findUnique({
      where: { id: runId },
      select: { id: true },
    });
    if (!run) throw new ProgramRunError("Program run not found", "RUN_NOT_FOUND");

    const enrolledCount = await tx.programPass.count({
      where: { programRunId: runId },
    });

    if (newMax < enrolledCount) {
      throw new ProgramRunError(
        `Cannot lower capacity to ${newMax} — ${enrolledCount} players are already enrolled`,
        "CAPACITY_BELOW_ENROLLED"
      );
    }

    await tx.programRun.update({
      where: { id: runId },
      data: { maxCapacity: newMax },
    });

    return { maxCapacity: newMax, enrolledCount };
  });
}

// ─── rescheduleInstance ───────────────────────────────────────────────────────

/**
 * Reschedule a single ClassInstance (and its linked CourtBlock) to a new date
 * and time window. Does NOT affect any sibling instances in the same run.
 */
export async function rescheduleInstance(
  instanceId: string,
  newDateKey: string,
  newStartTime: Date,
  newEndTime: Date
): Promise<{ instanceId: string; courtBlockId: string }> {
  const prismaDate = dateKeyToPrismaDate(newDateKey);

  return prisma.$transaction(async (tx) => {
    const instance = await tx.classInstance.findUnique({
      where: { id: instanceId },
      select: { id: true, courtBlockId: true },
    });

    if (!instance) {
      throw new ProgramRunError("Class instance not found", "INSTANCE_NOT_FOUND");
    }

    // Update the ClassInstance timestamps
    await tx.classInstance.update({
      where: { id: instanceId },
      data: {
        startAt: newStartTime,
        endAt: newEndTime,
      },
    });

    // Update the linked CourtBlock if it exists
    if (instance.courtBlockId) {
      await tx.courtBlock.update({
        where: { id: instance.courtBlockId },
        data: {
          date: prismaDate,
          startTime: newStartTime,
          endTime: newEndTime,
        },
      });
    }

    return {
      instanceId: instance.id,
      courtBlockId: instance.courtBlockId ?? "",
    };
  });
}

// ─── deleteAndReplaceInstance ─────────────────────────────────────────────────

export interface DeleteAndReplaceResult {
  deletedInstanceId: string;
  newInstanceId: string;
  newCourtBlockId: string;
  newDate: string;
}

/**
 * Delete a single ClassInstance (and its linked CourtBlock) and append a
 * replacement at the end of the run — one week after the current last session.
 *
 * Rules:
 * - Blocked if the instance has any check-ins (INSTANCE_HAS_CHECKINS).
 * - The replacement inherits the run's recurrenceStartHour and
 *   recurrenceDurationMin, and the run's current coach list.
 * - Uses a serializable transaction so concurrent deletes can't produce
 *   duplicate replacement dates.
 */
export async function deleteAndReplaceInstance(
  instanceId: string
): Promise<DeleteAndReplaceResult> {
  return prisma.$transaction(
    async (tx) => {
      // 1. Load the instance and verify it exists
      const instance = await tx.classInstance.findUnique({
        where: { id: instanceId },
        select: {
          id: true,
          programRunId: true,
          courtBlockId: true,
          _count: { select: { checkIns: true } },
        },
      });
      if (!instance) {
        throw new ProgramRunError("Class instance not found", "INSTANCE_NOT_FOUND");
      }
      if (instance._count.checkIns > 0) {
        throw new ProgramRunError(
          `Cannot delete session — ${instance._count.checkIns} player(s) have already checked in. Reschedule it instead.`,
          "INSTANCE_HAS_CHECKINS"
        );
      }
      if (!instance.programRunId) {
        throw new ProgramRunError("Instance is not linked to a program run", "RUN_NOT_FOUND");
      }

      // 2. Load the run for recurrence params and coach list
      const run = await tx.programRun.findUnique({
        where: { id: instance.programRunId },
        include: {
          coaches: true,
          passType: { select: { linkedCoachId: true } },
        },
      });
      if (!run) throw new ProgramRunError("Program run not found", "RUN_NOT_FOUND");

      // 3. Determine the replacement date: last existing instance's date + 1 week
      const lastInstance = await tx.classInstance.findFirst({
        where: { programRunId: run.id, id: { not: instanceId } },
        orderBy: { startAt: "desc" },
        select: { startAt: true },
      });

      const baseDate = lastInstance
        ? new Date(lastInstance.startAt)
        : new Date(run.startDate);

      // Advance to one week after the last session (or run start if none left)
      const newDay = new Date(baseDate);
      newDay.setDate(newDay.getDate() + 7);
      newDay.setHours(0, 0, 0, 0); // local midnight — safe for arithmetic only

      const newDateKey = dateTodateKey(newDay);
      const prismaDate = dateKeyToPrismaDate(newDateKey);

      const startTime = new Date(newDay);
      startTime.setHours(run.recurrenceStartHour, 0, 0, 0);

      const endTime = new Date(newDay);
      endTime.setHours(run.recurrenceStartHour, run.recurrenceDurationMin, 0, 0);

      // 4. Delete the instance (CourtBlock coaches cascade via FK; block deleted next)
      await tx.classInstance.delete({ where: { id: instanceId } });
      if (instance.courtBlockId) {
        await tx.courtBlock.delete({ where: { id: instance.courtBlockId } });
      }

      // 5. Create replacement CourtBlock
      const newBlock = await tx.courtBlock.create({
        data: {
          venueId: run.venueId,
          type: "program_class",
          title: run.name,
          courtIds: run.courtIds,
          date: prismaDate,
          startTime,
          endTime,
          programRunId: run.id,
          createdBy: run.createdBy ?? undefined,
        },
      });

      // Assign run coaches to new block
      if (run.coaches.length > 0) {
        await tx.courtBlockCoach.createMany({
          data: run.coaches.map((rc) => ({
            courtBlockId: newBlock.id,
            coachId: rc.coachId,
          })),
        });
      }

      // 6. Create replacement ClassInstance
      const defaultCoachId =
        run.coaches[0]?.coachId ?? run.passType?.linkedCoachId ?? null;
      if (!defaultCoachId) {
        throw new ProgramRunError(
          "Cannot create replacement session: no coaches assigned to this run.",
          "NO_COACHES_ASSIGNED"
        );
      }

      const newInstance = await tx.classInstance.create({
        data: {
          venueId: run.venueId,
          coachId: defaultCoachId,
          passTypeId: run.passTypeId,
          startAt: startTime,
          endAt: endTime,
          maxPlayers: run.maxCapacity,
          programRunId: run.id,
          courtBlockId: newBlock.id,
        },
      });

      return {
        deletedInstanceId: instanceId,
        newInstanceId: newInstance.id,
        newCourtBlockId: newBlock.id,
        newDate: newDateKey,
      };
    },
    { isolationLevel: "Serializable" }
  );
}
