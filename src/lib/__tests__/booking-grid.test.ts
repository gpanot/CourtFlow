/**
 * Unit tests for 30-minute booking grid helpers in src/lib/booking.ts
 *
 * These tests exercise pure functions — no DB, no network.
 * Run: npx vitest run src/lib/__tests__/booking-grid.test.ts
 */

import { describe, it, expect } from "vitest";
import {
  GRID_GRANULARITY_MINUTES,
  DEFAULT_BOOKING_CONFIG,
  resolveBookingPrice,
  intervalsOverlap,
  isValidGridStartTime,
  validateBookingDuration,
  resolveSlotPrice,
  parsePricingMatrix,
  resolveCourtPricingMatrix,
  resolveCourtBookingPrice,
  generateTimeSlotsForMatrix,
} from "@/lib/booking";
import type { BookingConfig, PricingMatrix } from "@/lib/booking";

const TZ = "Asia/Saigon";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Build a Date in the Asia/Saigon timezone for a specific local time. */
function vn(year: number, month: number, day: number, hour: number, minute = 0): Date {
  // ISO string with explicit offset (+07:00) so JS parses as UTC correctly
  const hh = hour.toString().padStart(2, "0");
  const mm = minute.toString().padStart(2, "0");
  return new Date(`${year}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}T${hh}:${mm}:00+07:00`);
}

const BASE_CFG: BookingConfig = {
  ...DEFAULT_BOOKING_CONFIG,
  defaultPriceValue: 100_000,
  pricingRules: [
    // Friday evening: 200k/h from 18:00–22:00
    { dayOfWeek: 5, startHour: 18, endHour: 22, priceValue: 200_000 },
    // Weekday daytime: 100k/h from 8:00–18:00 (all days)
    { dayOfWeek: 5, startHour: 8, endHour: 18, priceValue: 100_000 },
  ],
};

// ─── GRID_GRANULARITY_MINUTES ────────────────────────────────────────────────

describe("GRID_GRANULARITY_MINUTES", () => {
  it("is 30", () => {
    expect(GRID_GRANULARITY_MINUTES).toBe(30);
  });
});

// ─── resolveSlotPrice ────────────────────────────────────────────────────────

describe("resolveSlotPrice", () => {
  it("returns the matching rule priceValue", () => {
    expect(resolveSlotPrice(BASE_CFG, 5, 18)).toBe(200_000);
    expect(resolveSlotPrice(BASE_CFG, 5, 10)).toBe(100_000);
  });

  it("falls back to defaultPriceValue when no rule matches", () => {
    expect(resolveSlotPrice(BASE_CFG, 0, 18)).toBe(100_000); // Sunday, no matching rule
  });
});

// ─── resolveBookingPrice ─────────────────────────────────────────────────────

describe("resolveBookingPrice", () => {
  it("1h30 booking from 18:00–19:30 on Friday: 200k + 0.5×200k = 300k... wait: rule says 200k@18-22 → 200k×1 + 100k×0.5 = nope, same rule: 200k for 18:00 and 200k for 19:00 cell → 100k + 100k + 100k = 300k", () => {
    // Friday 18:00 start, 90 min = 3 cells
    // Cell 18:00→18:30: price = 0.5 × 200k = 100k
    // Cell 18:30→19:00: hour bucket 18 → 0.5 × 200k = 100k
    // Cell 19:00→19:30: hour bucket 19 → 0.5 × 200k = 100k
    // Total: 300k
    const start = vn(2026, 7, 3, 18, 0); // Friday July 3, 2026
    expect(resolveBookingPrice(BASE_CFG, start, 90, TZ)).toBe(300_000);
  });

  it("example from user spec: 6-7pm=100k, 7-8pm=200k, 1h30 from 18:00 = 1×100k + 0.5×200k = 200k", () => {
    const cfg: BookingConfig = {
      ...DEFAULT_BOOKING_CONFIG,
      defaultPriceValue: 0,
      pricingRules: [
        { dayOfWeek: 5, startHour: 18, endHour: 19, priceValue: 100_000 },
        { dayOfWeek: 5, startHour: 19, endHour: 22, priceValue: 200_000 },
      ],
    };
    const start = vn(2026, 7, 3, 18, 0); // Friday
    // Cell 18:00: 0.5×100k = 50k
    // Cell 18:30: hour 18 → 0.5×100k = 50k
    // Cell 19:00: hour 19 → 0.5×200k = 100k
    // Total: 200k ✓
    expect(resolveBookingPrice(cfg, start, 90, TZ)).toBe(200_000);
  });

  it("1h booking at flat rate: 2 cells × 0.5 × 100k = 100k", () => {
    const start = vn(2026, 7, 3, 10, 0); // Friday 10:00
    expect(resolveBookingPrice(BASE_CFG, start, 60, TZ)).toBe(100_000);
  });

  it("30-min booking at flat rate: 1 cell × 0.5 × 100k = 50k", () => {
    const start = vn(2026, 7, 3, 10, 0); // Friday 10:00
    expect(resolveBookingPrice(BASE_CFG, start, 30, TZ)).toBe(50_000);
  });

  it("rounds the result to nearest integer", () => {
    const cfg: BookingConfig = {
      ...DEFAULT_BOOKING_CONFIG,
      defaultPriceValue: 75_001,
      pricingRules: [],
    };
    const start = vn(2026, 7, 3, 10, 0);
    // 1 cell × 0.5 × 75_001 = 37_500.5 → rounds to 37_501
    const result = resolveBookingPrice(cfg, start, 30, TZ);
    expect(Number.isInteger(result)).toBe(true);
    expect(result).toBe(37501);
  });
});

// ─── intervalsOverlap ────────────────────────────────────────────────────────

describe("intervalsOverlap", () => {
  it("non-overlapping before", () => {
    expect(intervalsOverlap(0, 30, 30, 60)).toBe(false);
  });

  it("non-overlapping after", () => {
    expect(intervalsOverlap(30, 60, 0, 30)).toBe(false);
  });

  it("adjacent at boundary — no overlap", () => {
    expect(intervalsOverlap(0, 60, 60, 90)).toBe(false);
  });

  it("partial overlap", () => {
    expect(intervalsOverlap(0, 60, 30, 90)).toBe(true);
  });

  it("B contains A", () => {
    expect(intervalsOverlap(30, 60, 0, 90)).toBe(true);
  });

  it("A contains B", () => {
    expect(intervalsOverlap(0, 90, 30, 60)).toBe(true);
  });

  it("exact same interval", () => {
    expect(intervalsOverlap(0, 60, 0, 60)).toBe(true);
  });
});

// ─── isValidGridStartTime ─────────────────────────────────────────────────────

describe("isValidGridStartTime", () => {
  it("accepts :00 minutes", () => {
    expect(isValidGridStartTime(vn(2026, 7, 3, 10, 0), TZ)).toBe(true);
  });

  it("accepts :30 minutes", () => {
    expect(isValidGridStartTime(vn(2026, 7, 3, 10, 30), TZ)).toBe(true);
  });

  it("rejects :15 minutes", () => {
    expect(isValidGridStartTime(vn(2026, 7, 3, 10, 15), TZ)).toBe(false);
  });

  it("rejects :45 minutes", () => {
    expect(isValidGridStartTime(vn(2026, 7, 3, 10, 45), TZ)).toBe(false);
  });

  it("rejects :01 minutes", () => {
    expect(isValidGridStartTime(vn(2026, 7, 3, 10, 1), TZ)).toBe(false);
  });
});

// ─── validateBookingDuration ──────────────────────────────────────────────────

describe("validateBookingDuration", () => {
  const cfg = { ...DEFAULT_BOOKING_CONFIG, maxDurationMinutes: 480 }; // 16 cells max

  describe("player context (allow30Min = false)", () => {
    it("rejects 1 cell (30 min)", () => {
      const r = validateBookingDuration(cfg, 1, "player");
      expect(r.valid).toBe(false);
      expect(r.error).toMatch(/60 minutes/);
    });

    it("accepts 2 cells (60 min)", () => {
      expect(validateBookingDuration(cfg, 2, "player").valid).toBe(true);
    });

    it("accepts 3 cells (90 min)", () => {
      expect(validateBookingDuration(cfg, 3, "player").valid).toBe(true);
    });

    it("accepts 16 cells (480 min = max)", () => {
      expect(validateBookingDuration(cfg, 16, "player").valid).toBe(true);
    });

    it("rejects 17 cells (> max)", () => {
      const r = validateBookingDuration(cfg, 17, "player");
      expect(r.valid).toBe(false);
      expect(r.error).toMatch(/480 minutes/);
    });
  });

  describe("player context (allow30Min = true)", () => {
    const cfg30 = { ...cfg, allow30MinBookings: true };

    it("accepts 1 cell (30 min)", () => {
      expect(validateBookingDuration(cfg30, 1, "player").valid).toBe(true);
    });

    it("rejects 0 cells", () => {
      expect(validateBookingDuration(cfg30, 0, "player").valid).toBe(false);
    });
  });

  describe("staff context", () => {
    it("accepts 1 cell (30 min)", () => {
      expect(validateBookingDuration(cfg, 1, "staff").valid).toBe(true);
    });

    it("accepts 2 cells", () => {
      expect(validateBookingDuration(cfg, 2, "staff").valid).toBe(true);
    });

    it("rejects over max", () => {
      const r = validateBookingDuration(cfg, 20, "staff");
      expect(r.valid).toBe(false);
    });
  });
});

// ─── parsePricingMatrix ───────────────────────────────────────────────────────

describe("parsePricingMatrix", () => {
  it("parses standard keys", () => {
    const raw = {
      defaultPriceValue: 100_000,
      pricingRules: [{ dayOfWeek: 5, startHour: 18, endHour: 22, priceValue: 200_000 }],
    };
    const m = parsePricingMatrix(raw);
    expect(m.defaultPriceValue).toBe(100_000);
    expect(m.pricingRules).toHaveLength(1);
    expect(m.pricingRules[0].priceValue).toBe(200_000);
  });

  it("handles legacy priceInCents alias in rules", () => {
    const raw = {
      defaultPriceValue: 50_000,
      pricingRules: [{ dayOfWeek: 0, startHour: 8, endHour: 12, priceInCents: 120_000 }],
    };
    const m = parsePricingMatrix(raw as Record<string, unknown>);
    expect(m.pricingRules[0].priceValue).toBe(120_000);
  });

  it("handles legacy defaultPriceInCents key", () => {
    const raw = {
      defaultPriceInCents: 80_000,
      pricingRules: [],
    };
    const m = parsePricingMatrix(raw as Record<string, unknown>);
    expect(m.defaultPriceValue).toBe(80_000);
  });

  it("returns zero price and empty rules when both are missing", () => {
    const m = parsePricingMatrix({});
    expect(m.defaultPriceValue).toBe(0);
    expect(m.pricingRules).toHaveLength(0);
  });
});

// ─── resolveCourtPricingMatrix ────────────────────────────────────────────────

describe("resolveCourtPricingMatrix", () => {
  const groupA = {
    id: "g1",
    name: "Standard",
    isDefault: true,
    defaultPriceValue: 100_000,
    pricingRules: [],
  };
  const groupB = {
    id: "g2",
    name: "Premium",
    isDefault: false,
    defaultPriceValue: 200_000,
    pricingRules: [],
  };
  const groups = [groupA, groupB];

  it("priority 1: override wins over everything", () => {
    const court = {
      pricingGroupId: "g2",
      priceOverride: { defaultPriceValue: 300_000, pricingRules: [] },
    };
    const result = resolveCourtPricingMatrix(court, groups);
    expect(result.source).toBe("override");
    expect(result.matrix.defaultPriceValue).toBe(300_000);
  });

  it("priority 2: assigned group wins when no override", () => {
    const court = { pricingGroupId: "g2", priceOverride: null };
    const result = resolveCourtPricingMatrix(court, groups);
    expect(result.source).toBe("group");
    expect(result.matrix.defaultPriceValue).toBe(200_000);
    expect(result.groupId).toBe("g2");
    expect(result.groupName).toBe("Premium");
  });

  it("priority 3: default group when no assignment or override", () => {
    const court = { pricingGroupId: null, priceOverride: null };
    const result = resolveCourtPricingMatrix(court, groups);
    expect(result.source).toBe("default_group");
    expect(result.matrix.defaultPriceValue).toBe(100_000);
    expect(result.groupId).toBe("g1");
  });

  it("priority 4: legacy fallback when no groups at all", () => {
    const court = { pricingGroupId: null, priceOverride: null };
    const legacy = { defaultPriceValue: 75_000, pricingRules: [] };
    const result = resolveCourtPricingMatrix(court, [], legacy);
    expect(result.source).toBe("legacy");
    expect(result.matrix.defaultPriceValue).toBe(75_000);
  });

  it("returns zero matrix as last resort (no groups, no legacy)", () => {
    const court = { pricingGroupId: null, priceOverride: null };
    const result = resolveCourtPricingMatrix(court, []);
    expect(result.source).toBe("legacy");
    expect(result.matrix.defaultPriceValue).toBe(0);
  });

  it("ignores group assignment when override is set (frozen snapshot behaviour)", () => {
    const court = {
      pricingGroupId: "g1",
      priceOverride: { defaultPriceValue: 999_000, pricingRules: [] },
    };
    const result = resolveCourtPricingMatrix(court, groups);
    expect(result.source).toBe("override");
    expect(result.matrix.defaultPriceValue).toBe(999_000);
  });

  it("assigned group resolves as default_group when the group has isDefault=true", () => {
    const court = { pricingGroupId: "g1", priceOverride: null };
    const result = resolveCourtPricingMatrix(court, groups);
    expect(result.source).toBe("default_group");
    expect(result.groupId).toBe("g1");
  });
});

// ─── resolveCourtBookingPrice ─────────────────────────────────────────────────

describe("resolveCourtBookingPrice", () => {
  it("flat rate: 1h = defaultPriceValue", () => {
    const matrix: PricingMatrix = { defaultPriceValue: 100_000, pricingRules: [] };
    const start = vn(2026, 7, 3, 10, 0);
    expect(resolveCourtBookingPrice(matrix, start, 60, TZ)).toBe(100_000);
  });

  it("applies pricing rules correctly", () => {
    const matrix: PricingMatrix = {
      defaultPriceValue: 100_000,
      pricingRules: [{ dayOfWeek: 5, startHour: 18, endHour: 22, priceValue: 200_000 }],
    };
    const start = vn(2026, 7, 3, 18, 0); // Friday 18:00
    // 2 cells × 0.5 × 200k = 200k
    expect(resolveCourtBookingPrice(matrix, start, 60, TZ)).toBe(200_000);
  });

  it("produces same result as resolveBookingPrice for equivalent BookingConfig", () => {
    const matrix: PricingMatrix = {
      defaultPriceValue: 100_000,
      pricingRules: [{ dayOfWeek: 5, startHour: 18, endHour: 22, priceValue: 200_000 }],
    };
    const start = vn(2026, 7, 3, 18, 0);
    const resultMatrix = resolveCourtBookingPrice(matrix, start, 90, TZ);
    const resultLegacy = resolveBookingPrice(
      { ...DEFAULT_BOOKING_CONFIG, defaultPriceValue: 100_000, pricingRules: matrix.pricingRules },
      start,
      90,
      TZ,
    );
    expect(resultMatrix).toBe(resultLegacy);
  });
});

// ─── generateTimeSlotsForMatrix ───────────────────────────────────────────────

describe("generateTimeSlotsForMatrix", () => {
  const venueHours = { bookingStartHour: 8, bookingEndHour: 22 };

  it("generates slots from 8:00 to 22:00 (28 slots total)", () => {
    const matrix: PricingMatrix = { defaultPriceValue: 100_000, pricingRules: [] };
    const midnight = vn(2026, 7, 3, 0, 0);
    const slots = generateTimeSlotsForMatrix(midnight, matrix, venueHours, TZ);
    // (22 - 8) × 2 = 28 half-hour slots
    expect(slots).toHaveLength(28);
  });

  it("first slot starts at 8:00 local, last ends at 22:00 local", () => {
    const matrix: PricingMatrix = { defaultPriceValue: 100_000, pricingRules: [] };
    const midnight = vn(2026, 7, 3, 0, 0);
    const slots = generateTimeSlotsForMatrix(midnight, matrix, venueHours, TZ);
    const firstStart = new Date(slots[0].startTime).toLocaleTimeString("en-US", {
      hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ,
    });
    const lastEnd = new Date(slots[slots.length - 1].endTime).toLocaleTimeString("en-US", {
      hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ,
    });
    expect(firstStart).toBe("08:00");
    expect(lastEnd).toBe("22:00");
  });

  it("slot priceValue reflects the pricing rule", () => {
    const matrix: PricingMatrix = {
      defaultPriceValue: 100_000,
      pricingRules: [{ dayOfWeek: 5, startHour: 18, endHour: 22, priceValue: 200_000 }],
    };
    const midnight = vn(2026, 7, 3, 0, 0); // Friday
    const slots = generateTimeSlotsForMatrix(midnight, matrix, venueHours, TZ);
    // Find slot at 18:00
    const slot18 = slots.find((s) => s.hour === 18);
    expect(slot18).toBeDefined();
    expect(slot18!.priceValue).toBe(100_000); // 0.5 × 200k
    // Find slot at 10:00 (default)
    const slot10 = slots.find((s) => s.hour === 10);
    expect(slot10!.priceValue).toBe(50_000); // 0.5 × 100k
  });

  it("two courts with different matrices produce different slot priceValues in same hour", () => {
    const matrixA: PricingMatrix = { defaultPriceValue: 100_000, pricingRules: [] };
    const matrixB: PricingMatrix = { defaultPriceValue: 200_000, pricingRules: [] };
    const midnight = vn(2026, 7, 3, 0, 0);
    const slotsA = generateTimeSlotsForMatrix(midnight, matrixA, venueHours, TZ);
    const slotsB = generateTimeSlotsForMatrix(midnight, matrixB, venueHours, TZ);
    expect(slotsA[0].priceValue).toBe(50_000);
    expect(slotsB[0].priceValue).toBe(100_000);
  });
});
