import { describe, expect, it } from "vitest";
import {
  getCancellationReasonLabel,
  getNetBookingPrice,
  isBookingCancellationReason,
  isBookingWrittenOff,
} from "../booking-cancellation";

describe("booking-cancellation", () => {
  describe("isBookingCancellationReason", () => {
    it("accepts valid reasons", () => {
      expect(isBookingCancellationReason("refund")).toBe(true);
      expect(isBookingCancellationReason("free_pass")).toBe(true);
      expect(isBookingCancellationReason("staff_mistake")).toBe(true);
    });

    it("rejects invalid values", () => {
      expect(isBookingCancellationReason(null)).toBe(false);
      expect(isBookingCancellationReason("Refunded")).toBe(false);
    });
  });

  describe("isBookingWrittenOff", () => {
    it("returns true for cancelled booking with cancellation reason", () => {
      expect(
        isBookingWrittenOff({
          status: "cancelled",
          paymentStatus: "refunded",
          cancellationReason: "refund",
        })
      ).toBe(true);
    });

    it("returns true for cancelled booking with refunded payment status only", () => {
      expect(
        isBookingWrittenOff({
          status: "cancelled",
          paymentStatus: "refunded",
          cancellationReason: null,
        })
      ).toBe(true);
    });

    it("returns false for confirmed paid booking", () => {
      expect(
        isBookingWrittenOff({
          status: "confirmed",
          paymentStatus: "paid",
          cancellationReason: null,
        })
      ).toBe(false);
    });

    it("returns false for unpaid cancelled booking", () => {
      expect(
        isBookingWrittenOff({
          status: "cancelled",
          paymentStatus: "pending",
          cancellationReason: null,
        })
      ).toBe(false);
    });
  });

  describe("getNetBookingPrice", () => {
    it("returns 0 for written-off cancellation", () => {
      expect(
        getNetBookingPrice(600_000, {
          status: "cancelled",
          paymentStatus: "refunded",
          cancellationReason: "refund",
        })
      ).toBe(0);
    });

    it("returns original price for active paid booking", () => {
      expect(
        getNetBookingPrice(712_500, {
          status: "confirmed",
          paymentStatus: "paid",
          cancellationReason: null,
        })
      ).toBe(712_500);
    });

    it("returns original price for unpaid cancelled booking", () => {
      expect(
        getNetBookingPrice(990_000, {
          status: "cancelled",
          paymentStatus: "pending",
          cancellationReason: null,
        })
      ).toBe(990_000);
    });
  });

  describe("getCancellationReasonLabel", () => {
    it("maps reason codes to display labels", () => {
      expect(getCancellationReasonLabel("refund")).toBe("Refund");
      expect(getCancellationReasonLabel("free_pass")).toBe("Free Pass");
      expect(getCancellationReasonLabel("staff_mistake")).toBe("Staff Mistake");
      expect(getCancellationReasonLabel(null)).toBeNull();
    });
  });
});
