/**
 * Tests for src/lib/program-run.ts
 *
 * Critical paths covered:
 * - generateRunSchedule: session count, idempotency guard, NO_COACHES_ASSIGNED, NO_RECURRENCE_DEFINED
 * - enrollInRun: RUN_FULL, ALREADY_ENROLLED, successful enrollment
 * - updateRunCapacity: CAPACITY_BELOW_ENROLLED, successful update
 * - checkProgramBlockConflict: no-conflict (null block), conflict with block info
 *
 * Prisma is mocked via vi.hoisted() + vi.mock("@/lib/db") — same pattern as
 * src/modules/courtpay/lib/check-in.test.ts.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mock setup ──────────────────────────────────────────────────────────────

const {
  mockProgramRun,
  mockClassInstance,
  mockCourtBlock,
  mockCourtBlockCoach,
  mockProgramPass,
  mockProgramPassPayment,
  mockPrisma,
} = vi.hoisted(() => {
  const mockProgramRun = {
    findUnique: vi.fn(),
    update: vi.fn(),
  };
  const mockClassInstance = {
    findFirst: vi.fn(),
    count: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  };
  const mockCourtBlock = {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  };
  const mockCourtBlockCoach = {
    createMany: vi.fn(),
  };
  const mockProgramPass = {
    count: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
  };
  const mockProgramPassPayment = {
    create: vi.fn(),
  };

  const mockPrisma = {
    programRun: mockProgramRun,
    classInstance: mockClassInstance,
    courtBlock: mockCourtBlock,
    courtBlockCoach: mockCourtBlockCoach,
    programPass: mockProgramPass,
    programPassPayment: mockProgramPassPayment,
    $transaction: vi.fn(),
  };

  return {
    mockProgramRun,
    mockClassInstance,
    mockCourtBlock,
    mockCourtBlockCoach,
    mockProgramPass,
    mockProgramPassPayment,
    mockPrisma,
  };
});

vi.mock("@/lib/db", () => ({
  prisma: mockPrisma,
}));

import {
  generateRunSchedule,
  enrollInRun,
  updateRunCapacity,
  checkProgramBlockConflict,
  ProgramRunError,
} from "./program-run";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal ProgramRun record for testing. */
function makeRun(overrides: Partial<{
  id: string;
  venueId: string;
  passTypeId: string;
  courtId: string | null;
  name: string;
  status: string;
  startDate: Date;
  recurrenceStartHour: number;
  recurrenceDurationMin: number;
  recurrenceCount: number | null;
  recurrenceEndDate: Date | null;
  maxCapacity: number;
  createdBy: string | null;
  coaches: { coachId: string }[];
  passType: { linkedCoachId: string | null };
}> = {}) {
  return {
    id: "run-1",
    venueId: "venue-1",
    passTypeId: "pt-1",
    courtId: "court-1",
    name: "Test Run",
    status: "upcoming",
    // 2026-08-01 at noon UTC+7 = 2026-08-01T05:00:00Z — stored DATE value "2026-08-01"
    startDate: new Date("2026-08-01T05:00:00.000Z"),
    recurrenceStartHour: 9,
    recurrenceDurationMin: 60,
    recurrenceCount: 4,
    recurrenceEndDate: null,
    maxCapacity: 12,
    createdBy: "staff-1",
    coaches: [{ coachId: "coach-1" }],
    passType: { linkedCoachId: null },
    ...overrides,
  };
}

// Make $transaction pass through to the callback using the mock prisma
function setupTransaction() {
  mockPrisma.$transaction.mockImplementation(
    async (fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma)
  );
}

// ─── generateRunSchedule ──────────────────────────────────────────────────────

describe("generateRunSchedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupTransaction();
    // No existing instances by default (idempotency guard returns "no instances")
    mockClassInstance.findFirst.mockResolvedValue(null);
    mockClassInstance.create.mockResolvedValue({ id: "inst-1" });
    mockCourtBlock.create.mockImplementation(async ({ data }: { data: { date: Date; startTime: Date } }) => ({
      id: `block-${data.date.toISOString().slice(0, 10)}`,
    }));
    mockCourtBlockCoach.createMany.mockResolvedValue({ count: 1 });
  });

  it("creates exactly recurrenceCount sessions", async () => {
    mockProgramRun.findUnique.mockResolvedValue(makeRun({ recurrenceCount: 4 }));

    const result = await generateRunSchedule("run-1");

    expect(result.instanceCount).toBe(4);
    expect(mockClassInstance.create).toHaveBeenCalledTimes(4);
    expect(mockCourtBlock.create).toHaveBeenCalledTimes(4);
  });

  it("sessions fall on the same day of week as startDate (weekly recurrence)", async () => {
    // 2026-08-01 is a Saturday (day 6)
    mockProgramRun.findUnique.mockResolvedValue(makeRun({ recurrenceCount: 3 }));

    await generateRunSchedule("run-1");

    const blockCalls = mockCourtBlock.create.mock.calls;
    // Extract startTime dates from block creation calls
    const dayOfWeeks = blockCalls.map((call: { data: { startTime: Date } }[]) =>
      call[0].data.startTime.getDay()
    );
    expect(dayOfWeeks).toEqual([6, 6, 6]); // all Saturdays
  });

  it("uses recurrenceEndDate when recurrenceCount is null", async () => {
    // startDate 2026-08-01, end 2026-09-01: 5 Saturdays (Aug 1, 8, 15, 22, 29)
    mockProgramRun.findUnique.mockResolvedValue(makeRun({
      recurrenceCount: null,
      recurrenceEndDate: new Date("2026-09-01T05:00:00.000Z"),
    }));

    const result = await generateRunSchedule("run-1");

    expect(result.instanceCount).toBe(5);
  });

  it("is idempotent — returns existing count without creating new rows", async () => {
    mockProgramRun.findUnique.mockResolvedValue(makeRun({ recurrenceCount: 4 }));
    // Idempotency guard: existing instance found
    mockClassInstance.findFirst.mockResolvedValue({ id: "existing-1" });
    mockClassInstance.count.mockResolvedValue(4);
    mockClassInstance.findMany.mockResolvedValue([
      { courtBlockId: "b1" }, { courtBlockId: "b2" },
      { courtBlockId: "b3" }, { courtBlockId: "b4" },
    ]);

    const result = await generateRunSchedule("run-1");

    expect(result.instanceCount).toBe(4);
    // Must NOT have created any new rows
    expect(mockClassInstance.create).not.toHaveBeenCalled();
    expect(mockCourtBlock.create).not.toHaveBeenCalled();
  });

  it("throws RUN_NOT_FOUND when the run does not exist", async () => {
    mockProgramRun.findUnique.mockResolvedValue(null);

    await expect(generateRunSchedule("run-missing")).rejects.toMatchObject({
      code: "RUN_NOT_FOUND",
    });
  });

  it("throws NO_RECURRENCE_DEFINED when neither recurrenceCount nor recurrenceEndDate is set", async () => {
    mockProgramRun.findUnique.mockResolvedValue(
      makeRun({ recurrenceCount: null, recurrenceEndDate: null })
    );

    await expect(generateRunSchedule("run-1")).rejects.toMatchObject({
      code: "NO_RECURRENCE_DEFINED",
    });
  });

  it("throws NO_COACHES_ASSIGNED when run has no coaches and passType has no linkedCoachId", async () => {
    mockProgramRun.findUnique.mockResolvedValue(makeRun({
      coaches: [],
      passType: { linkedCoachId: null },
      createdBy: null,
    }));

    await expect(generateRunSchedule("run-1")).rejects.toMatchObject({
      code: "NO_COACHES_ASSIGNED",
    });
  });

  it("falls back to passType.linkedCoachId when run has no coaches", async () => {
    mockProgramRun.findUnique.mockResolvedValue(makeRun({
      coaches: [],
      passType: { linkedCoachId: "fallback-coach" },
    }));

    await generateRunSchedule("run-1");

    // Each classInstance.create call should use the fallback coach
    const createCalls = mockClassInstance.create.mock.calls;
    expect(createCalls.length).toBeGreaterThan(0);
    createCalls.forEach((call: { data: { coachId: string } }[]) => {
      expect(call[0].data.coachId).toBe("fallback-coach");
    });
  });

  it("writes CourtBlock dates with noon-local pattern, not midnight", async () => {
    mockProgramRun.findUnique.mockResolvedValue(makeRun({ recurrenceCount: 1 }));

    await generateRunSchedule("run-1");

    const blockDate: Date = mockCourtBlock.create.mock.calls[0][0].data.date;
    // Noon UTC+7 = 05:00 UTC — hour in ISO string must be 05
    const isoHour = parseInt(blockDate.toISOString().slice(11, 13), 10);
    // Must NOT be 17 (midnight UTC+7 = 17:00 UTC of the previous day)
    expect(isoHour).toBe(5);
  });

  it("assigns per-block coaches matching the run's coach list", async () => {
    mockProgramRun.findUnique.mockResolvedValue(
      makeRun({ recurrenceCount: 1, coaches: [{ coachId: "c1" }, { coachId: "c2" }] })
    );

    await generateRunSchedule("run-1");

    expect(mockCourtBlockCoach.createMany).toHaveBeenCalledWith({
      data: [
        { courtBlockId: expect.any(String), coachId: "c1" },
        { courtBlockId: expect.any(String), coachId: "c2" },
      ],
    });
  });
});

// ─── enrollInRun ──────────────────────────────────────────────────────────────

describe("enrollInRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupTransaction();
    mockProgramPass.create.mockResolvedValue({ id: "pp-1" });
    mockProgramPassPayment.create.mockResolvedValue({ id: "pay-1" });
  });

  it("throws RUN_NOT_FOUND when run does not exist", async () => {
    mockProgramRun.findUnique.mockResolvedValue(null);

    await expect(
      enrollInRun({ runId: "r1", playerId: "p1", venueId: "v1", amountValue: 1000 })
    ).rejects.toMatchObject({ code: "RUN_NOT_FOUND" });
  });

  it("throws RUN_NOT_UPCOMING when run status is cancelled", async () => {
    mockProgramRun.findUnique.mockResolvedValue({
      id: "r1", passTypeId: "pt-1", maxCapacity: 10, status: "cancelled",
    });

    await expect(
      enrollInRun({ runId: "r1", playerId: "p1", venueId: "v1", amountValue: 1000 })
    ).rejects.toMatchObject({ code: "RUN_NOT_UPCOMING" });
  });

  it("throws RUN_FULL when enrolled count equals maxCapacity", async () => {
    mockProgramRun.findUnique.mockResolvedValue({
      id: "r1", passTypeId: "pt-1", maxCapacity: 5, status: "upcoming",
    });
    mockProgramPass.count.mockResolvedValue(5); // already full

    await expect(
      enrollInRun({ runId: "r1", playerId: "p1", venueId: "v1", amountValue: 1000 })
    ).rejects.toMatchObject({ code: "RUN_FULL" });
  });

  it("throws ALREADY_ENROLLED when player is already in the run", async () => {
    mockProgramRun.findUnique.mockResolvedValue({
      id: "r1", passTypeId: "pt-1", maxCapacity: 10, status: "upcoming",
    });
    mockProgramPass.count.mockResolvedValue(3);
    mockProgramPass.findFirst.mockResolvedValue({ id: "existing-pp" });

    await expect(
      enrollInRun({ runId: "r1", playerId: "p1", venueId: "v1", amountValue: 1000 })
    ).rejects.toMatchObject({ code: "ALREADY_ENROLLED" });
  });

  it("creates ProgramPass and payment on successful enrollment", async () => {
    mockProgramRun.findUnique.mockResolvedValue({
      id: "r1", passTypeId: "pt-1", maxCapacity: 10, status: "upcoming",
    });
    mockProgramPass.count.mockResolvedValue(2);
    mockProgramPass.findFirst.mockResolvedValue(null);
    mockProgramPass.create.mockResolvedValue({ id: "pp-new" });

    const result = await enrollInRun({
      runId: "r1", playerId: "p1", venueId: "v1", amountValue: 500000,
    });

    expect(result.programPassId).toBe("pp-new");
    expect(result.enrolledCount).toBe(3);
    expect(result.maxCapacity).toBe(10);
    expect(mockProgramPassPayment.create).toHaveBeenCalledOnce();
  });

  it("skips payment record when amountValue is 0 (free pass)", async () => {
    mockProgramRun.findUnique.mockResolvedValue({
      id: "r1", passTypeId: "pt-1", maxCapacity: 10, status: "upcoming",
    });
    mockProgramPass.count.mockResolvedValue(0);
    mockProgramPass.findFirst.mockResolvedValue(null);
    mockProgramPass.create.mockResolvedValue({ id: "pp-free" });

    await enrollInRun({ runId: "r1", playerId: "p1", venueId: "v1", amountValue: 0 });

    expect(mockProgramPassPayment.create).not.toHaveBeenCalled();
  });
});

// ─── updateRunCapacity ────────────────────────────────────────────────────────

describe("updateRunCapacity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupTransaction();
    mockProgramRun.update.mockResolvedValue({ id: "r1", maxCapacity: 15 });
  });

  it("throws RUN_NOT_FOUND when run does not exist", async () => {
    mockProgramRun.findUnique.mockResolvedValue(null);

    await expect(updateRunCapacity("r1", 15)).rejects.toMatchObject({
      code: "RUN_NOT_FOUND",
    });
  });

  it("throws CAPACITY_BELOW_ENROLLED when newMax < enrolledCount", async () => {
    mockProgramRun.findUnique.mockResolvedValue({ id: "r1" });
    mockProgramPass.count.mockResolvedValue(8);

    await expect(updateRunCapacity("r1", 6)).rejects.toMatchObject({
      code: "CAPACITY_BELOW_ENROLLED",
    });
  });

  it("updates capacity when newMax equals enrolled count (boundary — allowed)", async () => {
    mockProgramRun.findUnique.mockResolvedValue({ id: "r1" });
    mockProgramPass.count.mockResolvedValue(8);

    // newMax === enrolledCount (8 === 8) — should be allowed (not below)
    const result = await updateRunCapacity("r1", 8);

    expect(mockProgramRun.update).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { maxCapacity: 8 },
    });
    expect(result.maxCapacity).toBe(8);
    expect(result.enrolledCount).toBe(8);
  });

  it("raises capacity successfully", async () => {
    mockProgramRun.findUnique.mockResolvedValue({ id: "r1" });
    mockProgramPass.count.mockResolvedValue(5);

    await updateRunCapacity("r1", 20);

    expect(mockProgramRun.update).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { maxCapacity: 20 },
    });
  });
});

// ─── checkProgramBlockConflict ────────────────────────────────────────────────

describe("checkProgramBlockConflict", () => {
  beforeEach(() => vi.clearAllMocks());

  const baseDate = new Date("2026-08-01T05:00:00.000Z"); // noon UTC+7
  const start = new Date("2026-08-01T01:00:00.000Z");    // 08:00 UTC+7
  const end   = new Date("2026-08-01T02:00:00.000Z");    // 09:00 UTC+7

  it("returns hasConflict:false when no overlapping block exists", async () => {
    mockCourtBlock.findFirst.mockResolvedValue(null);

    const result = await checkProgramBlockConflict("coach-1", baseDate, start, end);

    expect(result.hasConflict).toBe(false);
    expect(result.blockInfo).toBeUndefined();
  });

  it("returns hasConflict:true with block info when a block is found", async () => {
    const block = {
      id: "bl-1",
      programRunId: "run-1",
      title: "Program Coebra Lv1",
      date: baseDate,
      startTime: start,
      endTime: end,
    };
    mockCourtBlock.findFirst.mockResolvedValue(block);

    const result = await checkProgramBlockConflict("coach-1", baseDate, start, end);

    expect(result.hasConflict).toBe(true);
    expect(result.blockInfo?.programRunId).toBe("run-1");
    expect(result.blockInfo?.title).toBe("Program Coebra Lv1");
  });

  it("passes the correct WHERE shape to Prisma (type + date + time overlap + coachId)", async () => {
    mockCourtBlock.findFirst.mockResolvedValue(null);

    await checkProgramBlockConflict("coach-99", baseDate, start, end);

    expect(mockCourtBlock.findFirst).toHaveBeenCalledWith({
      where: {
        type: "program_class",
        date: baseDate,
        startTime: { lt: end },
        endTime: { gt: start },
        courtBlockCoaches: { some: { coachId: "coach-99" } },
      },
      select: expect.any(Object),
    });
  });
});
