import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockPrisma, mockRequireAdmin, mockSendLessonEventEmails } = vi.hoisted(() => ({
  mockPrisma: {
    coachLesson: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  mockRequireAdmin: vi.fn(),
  mockSendLessonEventEmails: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth", () => ({ requireAdminAccess: mockRequireAdmin }));
vi.mock("@/lib/email/send", () => ({
  buildLessonEmailContext: vi.fn(),
  sendBookingEmail: vi.fn(),
  sendLessonEventEmails: mockSendLessonEventEmails,
}));
vi.mock("@/lib/invoice-number", () => ({ allocateInvoiceNumber: vi.fn() }));

import { PATCH, DELETE } from "@/app/api/admin/coach-lessons/[id]/route";

const LESSON_ID = "lesson-paid-1";

function makePaidLesson(overrides: Record<string, unknown> = {}) {
  return {
    id: LESSON_ID,
    venueId: "venue-1",
    coachId: "coach-1",
    playerId: "player-1",
    packageId: "pkg-1",
    status: "confirmed",
    priceValue: 500_000,
    paymentStatus: "paid",
    package: { id: "pkg-1", name: "Private", lessonType: "private" },
    ...overrides,
  };
}

describe("PATCH /api/admin/coach-lessons/[id] paid cancellation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue({ staffId: "admin-1" });
  });

  it("requires cancellationReason when cancelling a paid lesson", async () => {
    mockPrisma.coachLesson.findUnique.mockResolvedValue(makePaidLesson());

    const req = new NextRequest(`http://localhost/api/admin/coach-lessons/${LESSON_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "cancelled" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: LESSON_ID }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/cancellationReason is required/i);
    expect(mockPrisma.coachLesson.update).not.toHaveBeenCalled();
  });

  it("sets refunded status and cancellation reason for paid lesson", async () => {
    const existing = makePaidLesson();
    mockPrisma.coachLesson.findUnique.mockResolvedValue(existing);
    mockPrisma.coachLesson.update.mockResolvedValue({
      ...existing,
      status: "cancelled",
      paymentStatus: "refunded",
      cancellationReason: "refund",
      player: { id: "player-1", name: "Player", email: null },
      coach: { id: "coach-1", name: "Coach" },
      court: null,
      package: { id: "pkg-1", name: "Private", lessonType: "private", durationMin: 60 },
    });

    const req = new NextRequest(`http://localhost/api/admin/coach-lessons/${LESSON_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "cancelled", cancellationReason: "refund" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: LESSON_ID }) });
    expect(res.status).toBe(200);

    expect(mockPrisma.coachLesson.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: LESSON_ID },
        data: expect.objectContaining({
          status: "cancelled",
          paymentStatus: "refunded",
          cancellationReason: "refund",
        }),
      })
    );
  });

  it("allows unpaid lesson cancellation without reason", async () => {
    const existing = makePaidLesson({ paymentStatus: "pending" });
    mockPrisma.coachLesson.findUnique.mockResolvedValue(existing);
    mockPrisma.coachLesson.update.mockResolvedValue({
      ...existing,
      status: "cancelled",
      player: { id: "player-1", name: "Player", email: null },
      coach: { id: "coach-1", name: "Coach" },
      court: null,
      package: { id: "pkg-1", name: "Private", lessonType: "private", durationMin: 60 },
    });

    const req = new NextRequest(`http://localhost/api/admin/coach-lessons/${LESSON_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "cancelled" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: LESSON_ID }) });
    expect(res.status).toBe(200);

    expect(mockPrisma.coachLesson.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "cancelled",
        }),
      })
    );
    expect(mockPrisma.coachLesson.update.mock.calls[0][0].data).not.toHaveProperty("cancellationReason");
  });
});

describe("DELETE /api/admin/coach-lessons/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue({ staffId: "admin-1" });
  });

  it("blocks DELETE for paid lessons", async () => {
    mockPrisma.coachLesson.findUnique.mockResolvedValue(makePaidLesson());

    const req = new NextRequest(`http://localhost/api/admin/coach-lessons/${LESSON_ID}`, {
      method: "DELETE",
    });

    const res = await DELETE(req, { params: Promise.resolve({ id: LESSON_ID }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/cancellationReason/i);
    expect(mockPrisma.coachLesson.update).not.toHaveBeenCalled();
  });
});
