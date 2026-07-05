/**
 * Unit tests for multi-court booking helpers in src/lib/booking.ts
 *
 * Exercises pure functions — no DB, no network.
 * Run: npx vitest run src/lib/__tests__/booking-multi-court.test.ts
 */

import { describe, it, expect } from "vitest";
import {
  validateMultiCourtBooking,
  resolveGroupBookingPrice,
  DEFAULT_BOOKING_CONFIG,
} from "@/lib/booking";
import type { BookingConfig, MultiCourtEntry } from "@/lib/booking";

const TZ = "Asia/Saigon";
const START = "2026-07-05T08:00:00+07:00"; // 8am local

const cfg: BookingConfig = {
  ...DEFAULT_BOOKING_CONFIG,
  allowMultiCourtBookings: true,
  maxCourtsPerBooking: 4,
  defaultPriceValue: 100_000,
};

// ─── validateMultiCourtBooking ────────────────────────────────────────────────

describe("validateMultiCourtBooking", () => {
  it("rejects fewer than 2 courts", () => {
    const courts: MultiCourtEntry[] = [{ courtId: "c1", startTime: START, slotCount: 4 }];
    const r = validateMultiCourtBooking(courts, cfg, "staff");
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/at least 2/);
  });

  it("rejects duplicate courtIds", () => {
    const courts: MultiCourtEntry[] = [
      { courtId: "c1", startTime: START, slotCount: 4 },
      { courtId: "c1", startTime: START, slotCount: 4 },
    ];
    const r = validateMultiCourtBooking(courts, cfg, "staff");
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/Duplicate/);
  });

  it("rejects courts with different start times", () => {
    const courts: MultiCourtEntry[] = [
      { courtId: "c1", startTime: START, slotCount: 4 },
      { courtId: "c2", startTime: "2026-07-05T09:00:00+07:00", slotCount: 4 },
    ];
    const r = validateMultiCourtBooking(courts, cfg, "staff");
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/same start time/);
  });

  it("rejects courts with different slot counts", () => {
    const courts: MultiCourtEntry[] = [
      { courtId: "c1", startTime: START, slotCount: 4 },
      { courtId: "c2", startTime: START, slotCount: 6 },
    ];
    const r = validateMultiCourtBooking(courts, cfg, "staff");
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/same duration/);
  });

  it("rejects exceeding maxCourtsPerBooking", () => {
    const courts: MultiCourtEntry[] = [
      { courtId: "c1", startTime: START, slotCount: 4 },
      { courtId: "c2", startTime: START, slotCount: 4 },
      { courtId: "c3", startTime: START, slotCount: 4 },
      { courtId: "c4", startTime: START, slotCount: 4 },
      { courtId: "c5", startTime: START, slotCount: 4 },
    ];
    const r = validateMultiCourtBooking(courts, cfg, "staff");
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/Maximum 4/);
  });

  it("accepts 2 valid courts with same window (staff)", () => {
    const courts: MultiCourtEntry[] = [
      { courtId: "c1", startTime: START, slotCount: 6 },
      { courtId: "c2", startTime: START, slotCount: 6 },
    ];
    const r = validateMultiCourtBooking(courts, cfg, "staff");
    expect(r.valid).toBe(true);
  });

  it("accepts 2 valid courts (player context, 2 cells = 60 min)", () => {
    const courts: MultiCourtEntry[] = [
      { courtId: "c1", startTime: START, slotCount: 2 },
      { courtId: "c2", startTime: START, slotCount: 2 },
    ];
    const r = validateMultiCourtBooking(courts, cfg, "player");
    expect(r.valid).toBe(true);
  });

  it("rejects player context with 1 cell when allow30Min is false", () => {
    const courts: MultiCourtEntry[] = [
      { courtId: "c1", startTime: START, slotCount: 1 },
      { courtId: "c2", startTime: START, slotCount: 1 },
    ];
    const r = validateMultiCourtBooking(courts, cfg, "player");
    expect(r.valid).toBe(false);
  });
});

// ─── resolveGroupBookingPrice ─────────────────────────────────────────────────

describe("resolveGroupBookingPrice", () => {
  it("returns correct total for 2 courts at default price", () => {
    const courts: MultiCourtEntry[] = [
      { courtId: "c1", startTime: START, slotCount: 2 },
      { courtId: "c2", startTime: START, slotCount: 2 },
    ];
    const result = resolveGroupBookingPrice(cfg, courts, TZ);
    // 2 slots × 30 min = 60 min → 1 unit × 100000 VND × 2 courts
    expect(result.total).toBe(result.perCourt[0].priceValue + result.perCourt[1].priceValue);
    expect(result.perCourt).toHaveLength(2);
    expect(result.perCourt[0].courtId).toBe("c1");
    expect(result.perCourt[1].courtId).toBe("c2");
  });

  it("returns separate per-court pricing", () => {
    const courts: MultiCourtEntry[] = [
      { courtId: "c1", startTime: START, slotCount: 4 },
      { courtId: "c2", startTime: START, slotCount: 4 },
    ];
    const result = resolveGroupBookingPrice(cfg, courts, TZ);
    expect(result.total).toBeGreaterThan(0);
    for (const p of result.perCourt) {
      expect(p.priceValue).toBeGreaterThanOrEqual(0);
    }
  });

  it("respects pricing rules for each court independently", () => {
    // July 5, 2026 is a Sunday (getDay() === 0)
    const peakCfg: BookingConfig = {
      ...cfg,
      defaultPriceValue: 100_000,
      pricingRules: [
        { dayOfWeek: 0, startHour: 8, endHour: 12, priceValue: 200_000 }, // Sunday morning peak
      ],
    };
    // START is Sunday 8am — should match the peak rule
    const courts: MultiCourtEntry[] = [
      { courtId: "c1", startTime: START, slotCount: 2 },
      { courtId: "c2", startTime: START, slotCount: 2 },
    ];
    const result = resolveGroupBookingPrice(peakCfg, courts, TZ);
    // Each court at peak price (200000 per 60 min = 200000 per 2 slots)
    expect(result.perCourt[0].priceValue).toBe(200_000);
    expect(result.perCourt[1].priceValue).toBe(200_000);
    expect(result.total).toBe(400_000);
  });
});
