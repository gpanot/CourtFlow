import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Prisma mock ────────────────────────────────────────────────────────────
const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    venueBillingRate: { findUnique: vi.fn() },
    billingConfig: { findUnique: vi.fn() },
    checkInRecord: { findMany: vi.fn() },
    billingInvoice: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    venue: { findUniqueOrThrow: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import {
  getWeekNumber,
  getWeekBounds,
  getPreviousWeekBounds,
  generateWeeklyInvoice,
  getCurrentWeekUsage,
} from "./billing";

// ─── Helper ─────────────────────────────────────────────────────────────────
function makeCheckIn(overrides: {
  id?: string;
  playerId?: string;
  source?: string;
  hasActiveSub?: boolean;
}): {
  id: string;
  playerId: string;
  checkedInAt: Date;
  paymentId: string | null;
  source: string;
  player: { subscriptions: { id: string; status: string }[] };
} {
  return {
    id: overrides.id ?? "ci-1",
    playerId: overrides.playerId ?? "p-1",
    checkedInAt: new Date("2026-04-14T10:00:00Z"),
    paymentId: null,
    source: overrides.source ?? "cash",
    player: {
      subscriptions: overrides.hasActiveSub
        ? [{ id: "sub-1", status: "active" }]
        : [],
    },
  };
}

const DEFAULT_RATES = {
  defaultBaseRate: 5000,
  defaultSubAddon: 1000,
  defaultSepayAddon: 1000,
};

// ─── getWeekNumber ───────────────────────────────────────────────────────────
describe("getWeekNumber", () => {
  it("returns ISO week 16 for 2026-04-14 (Monday)", () => {
    expect(getWeekNumber(new Date("2026-04-14"))).toBe(16);
  });

  it("returns ISO week 16 for 2026-04-19 (Sunday)", () => {
    // Sunday of week 16
    expect(getWeekNumber(new Date("2026-04-19"))).toBe(16);
  });

  it("returns ISO week 1 for 2026-01-01 (Thursday)", () => {
    // 2026-01-01 is a Thursday, which belongs to week 1
    expect(getWeekNumber(new Date("2026-01-01"))).toBe(1);
  });

  it("returns ISO week 53 for 2026-12-31 (Thursday)", () => {
    // 2026-12-31 is a Thursday — ISO says it's week 53 of 2026
    expect(getWeekNumber(new Date("2026-12-31"))).toBe(53);
  });
});

// ─── getWeekBounds ───────────────────────────────────────────────────────────
describe("getWeekBounds", () => {
  it("returns Monday→Sunday bounds when given a Monday", () => {
    const { weekStart, weekEnd } = getWeekBounds(new Date("2026-04-13T12:00:00"));
    expect(weekStart.getDay()).toBe(1); // Monday
    expect(weekStart.getHours()).toBe(0);
    expect(weekEnd.getDay()).toBe(0); // Sunday
    expect(weekEnd.getHours()).toBe(23);
    expect(weekEnd.getMinutes()).toBe(59);
  });

  it("returns the previous Monday when given a Sunday", () => {
    const { weekStart } = getWeekBounds(new Date("2026-04-19T15:00:00"));
    expect(weekStart.getDay()).toBe(1); // Monday
    expect(weekStart.toDateString()).toBe("Mon Apr 13 2026");
  });

  it("returns the same week for any midweek day", () => {
    const wed = getWeekBounds(new Date("2026-04-15T08:00:00")); // Wednesday
    const fri = getWeekBounds(new Date("2026-04-17T20:00:00")); // Friday
    expect(wed.weekStart.toDateString()).toBe(fri.weekStart.toDateString());
    expect(wed.weekEnd.toDateString()).toBe(fri.weekEnd.toDateString());
  });
});

// ─── getPreviousWeekBounds ───────────────────────────────────────────────────
describe("getPreviousWeekBounds", () => {
  it("returns a week that ends before this week's start", () => {
    const { weekStart: thisWeekStart } = getWeekBounds();
    const { weekEnd: prevWeekEnd } = getPreviousWeekBounds();
    expect(prevWeekEnd.getTime()).toBeLessThan(thisWeekStart.getTime());
  });

  it("spans exactly 7 days (Mon 00:00 to Sun 23:59:59)", () => {
    const { weekStart, weekEnd } = getPreviousWeekBounds();
    const ms = weekEnd.getTime() - weekStart.getTime();
    const days = ms / (1000 * 60 * 60 * 24);
    // Mon 00:00:00.000 → Sun 23:59:59.999 = ~6.9999 days, rounds to 7
    expect(Math.round(days)).toBe(7);
  });
});

// ─── generateWeeklyInvoice ───────────────────────────────────────────────────
describe("generateWeeklyInvoice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const weekStart = new Date("2026-04-13T00:00:00.000Z");
  const weekEnd = new Date("2026-04-19T23:59:59.999Z");

  function setupMocks(
    checkIns: ReturnType<typeof makeCheckIn>[],
    existingInvoice?: object | null
  ) {
    mockPrisma.billingInvoice.findUnique.mockResolvedValue(existingInvoice ?? null);
    mockPrisma.venueBillingRate.findUnique.mockResolvedValue(null);
    mockPrisma.billingConfig.findUnique.mockResolvedValue({
      id: "default",
      ...DEFAULT_RATES,
    });
    mockPrisma.checkInRecord.findMany.mockResolvedValue(checkIns);
    mockPrisma.venue.findUniqueOrThrow.mockResolvedValue({
      id: "v-1",
      name: "MM Pickleball",
    });
  }

  it("is idempotent — returns existing invoice without re-creating", async () => {
    const existingInvoice = { id: "inv-existing", status: "pending", totalAmount: 5000 };
    mockPrisma.billingInvoice.findUnique.mockResolvedValue(existingInvoice);

    const result = await generateWeeklyInvoice("v-1", weekStart, weekEnd);

    expect(result).toBe(existingInvoice);
    expect(mockPrisma.billingInvoice.create).not.toHaveBeenCalled();
  });

  it("generates correct payment ref format CF-BILL-MMPI-2026W16", async () => {
    setupMocks([makeCheckIn({ source: "cash" })]);
    const created = { id: "inv-1", status: "pending", totalAmount: 5000 };
    mockPrisma.billingInvoice.create.mockResolvedValue(created);

    await generateWeeklyInvoice("v-1", weekStart, weekEnd);

    const createCall = mockPrisma.billingInvoice.create.mock.calls[0][0];
    expect(createCall.data.paymentRef).toBe("CF-BILL-MMPI-2026W16");
  });

  it("removes spaces when generating venue short code", async () => {
    mockPrisma.billingInvoice.findUnique.mockResolvedValue(null);
    mockPrisma.venueBillingRate.findUnique.mockResolvedValue(null);
    mockPrisma.billingConfig.findUnique.mockResolvedValue({
      id: "default",
      ...DEFAULT_RATES,
    });
    mockPrisma.checkInRecord.findMany.mockResolvedValue([]);
    mockPrisma.venue.findUniqueOrThrow.mockResolvedValue({
      id: "v-2",
      name: "Saigon Padel Club",
    });
    mockPrisma.billingInvoice.create.mockResolvedValue({ id: "inv-2", status: "paid", totalAmount: 0 });

    await generateWeeklyInvoice("v-2", weekStart, weekEnd);

    const createCall = mockPrisma.billingInvoice.create.mock.calls[0][0];
    expect(createCall.data.paymentRef).toBe("CF-BILL-SAIG-2026W16");
  });

  it("sets status=paid immediately when totalAmount is zero", async () => {
    setupMocks([]); // no check-ins
    mockPrisma.billingInvoice.create.mockResolvedValue({ id: "inv-zero", status: "paid", totalAmount: 0 });

    await generateWeeklyInvoice("v-1", weekStart, weekEnd);

    const createCall = mockPrisma.billingInvoice.create.mock.calls[0][0];
    expect(createCall.data.status).toBe("paid");
    expect(createCall.data.totalAmount).toBe(0);
  });

  it("bills cash-only check-in at base rate only", async () => {
    setupMocks([makeCheckIn({ source: "cash" })]);
    mockPrisma.billingInvoice.create.mockResolvedValue({ id: "inv-cash", totalAmount: 5000 });

    await generateWeeklyInvoice("v-1", weekStart, weekEnd);

    const data = mockPrisma.billingInvoice.create.mock.calls[0][0].data;
    expect(data.totalCheckins).toBe(1);
    expect(data.subscriptionCheckins).toBe(0);
    expect(data.sepayCheckins).toBe(0);
    expect(data.baseAmount).toBe(5000);
    expect(data.subscriptionAmount).toBe(0);
    expect(data.sepayAmount).toBe(0);
    expect(data.totalAmount).toBe(5000);
  });

  it("adds sepay addon for vietqr source check-in", async () => {
    setupMocks([makeCheckIn({ source: "vietqr" })]);
    mockPrisma.billingInvoice.create.mockResolvedValue({ id: "inv-vietqr", totalAmount: 6000 });

    await generateWeeklyInvoice("v-1", weekStart, weekEnd);

    const data = mockPrisma.billingInvoice.create.mock.calls[0][0].data;
    expect(data.sepayCheckins).toBe(1);
    expect(data.sepayAmount).toBe(1000);
    expect(data.totalAmount).toBe(6000); // 5000 + 1000
  });

  it("adds subscription addon for player with active subscription", async () => {
    setupMocks([makeCheckIn({ source: "cash", hasActiveSub: true })]);
    mockPrisma.billingInvoice.create.mockResolvedValue({ id: "inv-sub", totalAmount: 6000 });

    await generateWeeklyInvoice("v-1", weekStart, weekEnd);

    const data = mockPrisma.billingInvoice.create.mock.calls[0][0].data;
    expect(data.subscriptionCheckins).toBe(1);
    expect(data.subscriptionAmount).toBe(1000);
    expect(data.totalAmount).toBe(6000); // 5000 + 1000
  });

  it("charges all three addons for vietqr + active subscription", async () => {
    setupMocks([makeCheckIn({ source: "vietqr", hasActiveSub: true })]);
    mockPrisma.billingInvoice.create.mockResolvedValue({ id: "inv-all", totalAmount: 7000 });

    await generateWeeklyInvoice("v-1", weekStart, weekEnd);

    const data = mockPrisma.billingInvoice.create.mock.calls[0][0].data;
    expect(data.totalCheckins).toBe(1);
    expect(data.subscriptionCheckins).toBe(1);
    expect(data.sepayCheckins).toBe(1);
    expect(data.totalAmount).toBe(7000); // 5000 + 1000 + 1000
  });

  it("excludes subscription_free check-ins from billing", async () => {
    // The DB query itself filters out subscription_free via source: { not: "subscription_free" }
    // We simulate by returning no records (as the DB would)
    setupMocks([]);
    mockPrisma.billingInvoice.create.mockResolvedValue({ id: "inv-free", totalAmount: 0 });

    await generateWeeklyInvoice("v-1", weekStart, weekEnd);

    const whereClause = mockPrisma.checkInRecord.findMany.mock.calls[0][0].where;
    expect(whereClause.source).toEqual({ not: "subscription_free" });
  });

  it("uses custom venue billing rates when configured", async () => {
    mockPrisma.billingInvoice.findUnique.mockResolvedValue(null);
    mockPrisma.venueBillingRate.findUnique.mockResolvedValue({
      baseRatePerCheckin: 8000,
      subscriptionAddon: 2000,
      sepayAddon: 500,
    });
    mockPrisma.checkInRecord.findMany.mockResolvedValue([
      makeCheckIn({ source: "vietqr", hasActiveSub: true }),
    ]);
    mockPrisma.venue.findUniqueOrThrow.mockResolvedValue({ id: "v-1", name: "MM Pickleball" });
    mockPrisma.billingInvoice.create.mockResolvedValue({ id: "inv-custom", totalAmount: 10500 });

    await generateWeeklyInvoice("v-1", weekStart, weekEnd);

    const data = mockPrisma.billingInvoice.create.mock.calls[0][0].data;
    // 8000 base + 2000 sub addon + 500 sepay addon = 10500
    expect(data.totalAmount).toBe(10500);
    // BillingConfig should NOT be queried when custom rates exist
    expect(mockPrisma.billingConfig.findUnique).not.toHaveBeenCalled();
  });

  it("falls back to hard-coded defaults when BillingConfig is missing", async () => {
    mockPrisma.billingInvoice.findUnique.mockResolvedValue(null);
    mockPrisma.venueBillingRate.findUnique.mockResolvedValue(null);
    mockPrisma.billingConfig.findUnique.mockResolvedValue(null); // no config in DB
    mockPrisma.checkInRecord.findMany.mockResolvedValue([makeCheckIn({ source: "cash" })]);
    mockPrisma.venue.findUniqueOrThrow.mockResolvedValue({ id: "v-1", name: "MM Pickleball" });
    mockPrisma.billingInvoice.create.mockResolvedValue({ id: "inv-fallback", totalAmount: 5000 });

    await generateWeeklyInvoice("v-1", weekStart, weekEnd);

    const data = mockPrisma.billingInvoice.create.mock.calls[0][0].data;
    expect(data.baseAmount).toBe(5000); // hard-coded default
  });
});

// ─── getCurrentWeekUsage ─────────────────────────────────────────────────────
describe("getCurrentWeekUsage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns live week totals without writing to DB", async () => {
    mockPrisma.venueBillingRate.findUnique.mockResolvedValue(null);
    mockPrisma.billingConfig.findUnique.mockResolvedValue({
      id: "default",
      ...DEFAULT_RATES,
    });
    mockPrisma.checkInRecord.findMany.mockResolvedValue([
      makeCheckIn({ source: "cash" }),
      makeCheckIn({ id: "ci-2", playerId: "p-2", source: "vietqr", hasActiveSub: true }),
    ]);

    const result = await getCurrentWeekUsage("v-1");

    expect(result.totalCheckins).toBe(2);
    expect(result.subscriptionCheckins).toBe(1);
    expect(result.sepayCheckins).toBe(1);
    // 5000 (cash) + 7000 (vietqr+sub) = 12000
    expect(result.estimatedTotal).toBe(12000);
    expect(result.rates).toEqual({
      baseRate: 5000,
      subAddon: 1000,
      sepayAddon: 1000,
    });

    // No create/update DB calls
    expect(mockPrisma.billingInvoice.create).not.toHaveBeenCalled();
  });
});
