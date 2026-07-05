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
} from "@/lib/booking";
import type { BookingConfig } from "@/lib/booking";

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
